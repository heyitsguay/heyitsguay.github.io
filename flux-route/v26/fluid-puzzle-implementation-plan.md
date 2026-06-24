# FLUX ROUTE — Implementation Plan
## A WebGL2 fluid-routing puzzle game with an embodied actor

**Audience:** Claude Opus 4.8, implementing this end to end.
**Author's role:** This document fully specifies the architecture, all numerically
sensitive GPU code (the fluid solver, boundary handling, SDF generation, actor
coupling, scoring reduction), and the readback machinery. These parts are written
out in full because they are where subtle bugs live. Everything else (scaffolding,
UI, level content, polish) is specified to the level of contracts and acceptance
criteria; you are expected to fill in the implementation details and you have
latitude there. Section 16 states exactly what is an invariant and what is yours
to decide.

---

## 1. Project summary

A single-page WebGL2 game, styled after old-school
web games. A 2D incompressible fluid simulation (stable-fluids / Dobryakov
"WebGL Fluid Simulation" lineage: semi-Lagrangian advection, Jacobi pressure
projection, vorticity confinement, high-res dye advected through a low-res
velocity field, bloom on top) is the **entire game world**. Nothing is faked:
every game element reads from and writes to the simulated fields.

**The game:** each level is a tank with source emitters that pour colored dye,
a sink region, and solid geometry. The player must deliver a target fraction of
dye into the sink. Tools: a limited budget of placeable/rotatable **fans**
(velocity splats) and an embodied **player circle** that the player steers
directly. The circle is a moving no-slip boundary in the solve — it displaces
fluid, sheds a wake, and can physically nudge an almost-correct stream into the
sink. Score = cumulative dye absorbed by the sink (flux accounting, not
snapshot coverage).

**Why the architecture is the way it is:** all world state lives in GPU
textures; the CPU sends input and orchestrates passes but never reads state
synchronously. Game-relevant state returns to the CPU only through a small
async PBO readback channel with ~2 frames of latency, used solely for HUD,
win detection, and audio triggers. This is a deliberate "falling-sand purist"
constraint and it must be preserved: **no `gl.readPixels` without a fence, no
`gl.finish()`, no synchronous GPU→CPU dependency in the frame loop, ever.**

This MVP is explicitly the foundation for two follow-on games (an updraft
platformer and a 1v1 wake-combat game). Several design choices below exist to
serve that future; do not simplify them away (Section 16).

## 2. Hard constraints and non-goals

Constraints:
- WebGL2, vanilla TypeScript, no engine, no framework for the game itself.
  A bundler (Vite) is fine. DOM/CSS for HUD and menus is fine and preferred.
- Fixed logical window 1280×720, letterboxed, with a retro chrome frame.
- Required GPU capability: `EXT_color_buffer_float` (render to + blend into
  RGBA16F). See Section 6 for the full capability matrix and fallbacks.
- Fixed simulation timestep (Section 4). Behavior must be identical on a
  machine that renders at 60 fps and one at 144 fps.
- Target: solid 60 fps on a 2020 integrated GPU (e.g. Intel Iris Xe) at the
  default quality settings in Section 14.

Non-goals (do not build):
- Networked play, replays, cross-machine determinism.
- GPU-initiated entity spawning (entities deciding to spawn other entities
  based on field state). All spawning is CPU-initiated or follows the
  spawn-relative-to-entity protocol in Section 9.5.

## 3. Architecture overview

One frame at the top level:

```
accumulate wall time
repeat N = clamp(floor(acc/DT), 0, MAX_SUBSTEPS) times:        // sim substep
    1. actor update            (ping-pong actor texture, fragment shader)
    2. dynamic field rebuild   (clear dyn-mask; instanced actor splats →
                                dyn-mask, velocity forces, dye injection)
    3. advect velocity         (semi-Lagrangian)
    4. curl                    (vorticity magnitude)
    5. vorticity confinement   (+ any global forces)
    6. divergence              (mask-aware: solid neighbors use boundary vel)
    7. pressure Jacobi × ITERS (mask-aware Neumann)
    8. subtract gradient       (mask-aware; then stamp boundary vel in solids)
    9. advect dye              (display res; SDF edge clamp; solid decay)
   10. sink absorb             (remove dye in sink, write new dye)
   11. accumulate score        (ping-pong accumulator += absorbed)
once per rendered frame:
   12. telemetry gather        (score reduction chain → 1×1; pack with actor
                                rows into a 66×1 telemetry texture)
   13. async readback kick     (readPixels into PBO + fenceSync; poll old ones)
   14. render                  (dye → tonemap/bloom → composite obstacles,
                                actor, regions → present)
```

Passes are expressed through a thin abstraction (Section 12.1): a pass is
`{ program, inputs, output, uniforms }`, and a tiny scheduler owns ping-pong
bookkeeping and viewport setup. The scheduler must assert that no pass samples
the texture it is rendering to.

## 4. Units, conventions, coordinate systems

Get these right once; every shader below assumes them.

- **UV space**: all positions are stored in UV coordinates `[0,1]²` over the
  tank. The tank is a variable-sized window with fixed 16:9 or 9:16 aspect ratio. Sim grid and dye
  grid share this UV space, so a position is meaningful against any texture.
- **Field velocity units**: the velocity field stores **sim texels per
  second**. To convert to UV/sec multiply by `uSimTexel` (= `1/simRes`).
  Rationale: advection then reads `coord = vUv - dt * vel * uSimTexel`, which
  is resolution-independent and matches the reference implementations.
- **Actor velocity units**: actor velocities are stored in **UV per second**
  (integration `pos += vel * dt` stays trivial). Convert at the two coupling
  points only: actor reads field → multiply field sample by `uSimTexel`;
  actor splats its velocity into the field / dyn-mask → divide by `uSimTexel`.
  These two conversions are the most common unit bug; they are called out
  inline in the shaders.
- **SDF units**: signed distance is in **sim texels**, positive in fluid,
  negative inside solids. Gradient (stored alongside) is normalized and points
  from solid toward fluid (direction of increasing distance).
- **Timestep**: `DT = 1/120 s`, `MAX_SUBSTEPS = 4` per rendered frame. If the
  accumulator exceeds `MAX_SUBSTEPS*DT`, drop the remainder (slow machine →
  slow-motion, never spiral). All dissipation/decay rates are per-second and
  applied as `exp(-rate*DT)` so substep count never changes behavior.
- **Texture sampling**: float16 textures use LINEAR filtering (core in WebGL2
  with `EXT_color_buffer_float` present for rendering; 16F is filterable).
  The actor texture and telemetry texture are RGBA32F and are only ever read
  with `texelFetch` (no filtering needed — avoids the `OES_texture_float_linear`
  dependency). All textures CLAMP_TO_EDGE.
- **Fullscreen passes** draw a single triangle (3 verts, positions
  `(-1,-1) (3,-1) (-1,3)`); `vUv = position*0.5+0.5` works unchanged.

## 5. Texture inventory

| Name        | Format   | Size        | Ping-pong | Contents |
|-------------|----------|-------------|-----------|----------|
| velocity    | RG16F    | 320×180     | yes       | field velocity, sim texels/sec |
| pressure    | R16F     | 320×180     | yes       | Jacobi iterate |
| divergence  | R16F     | 320×180     | no        | per-substep scratch |
| curl        | R16F     | 320×180     | no        | per-substep scratch |
| dye         | RGBA16F  | 1280×720    | yes       | RGB = up to 3 dye species, A unused (reserve: hazard) |
| level       | RGBA16F  | 320×180     | no        | R = SDF (texels), GB = normalized outward gradient, A = free |
| regions     | RGBA8    | 320×180     | no        | R = sink mask, G = hazard mask, B,A reserved. From level PNG. |
| dynMask     | RGBA16F  | 320×180     | no (cleared per substep) | RG = coverage-weighted boundary velocity (texels/sec), B free, A = coverage |
| actors      | RGBA32F  | 64×4        | yes       | Section 9.1 schema. texelFetch only. |
| scoreAcc    | RGBA32F  | 320×180     | yes       | R = dye delivered (species 1), G = species 2, BA free |
| reduce[i]   | RGBA32F  | halving →1×1| no        | reduction chain scratch |
| telemetry   | RGBA32F  | 66×1        | no        | px0 = score totals, px1 = reserved, px2..65 = actors row 0 |
| dyeBloom[i] | RGBA16F  | pyramid     | no        | render-only |

Notes:
- Sim res 320×180 matches the window's 16:9, so sim texels are square on
  screen and **no aspect-ratio corrections are needed anywhere**. Distances
  computed in "sim texel" units are isotropic. Keep it this way.
- `scoreAcc` is spatial (per-cell delivered dye) rather than a single scalar so
  the reduction framework stays generic (any mask × any field), and so a debug
  view can show *where* dye was delivered.
- `dynMask` is fully cleared and re-splatted every substep. It is the moving
  boundary; never persist it.

## 6. Capability detection and fallbacks

At init, in order:

1. `WebGL2RenderingContext` — required; else show a static "needs WebGL2" card.
2. `EXT_color_buffer_float` — required for the primary path: makes 16F and 32F
   color-renderable, and 16F **blendable** (32F blending additionally needs
   `EXT_float_blend`, which we avoid needing: every 32F target — actors,
   scoreAcc, telemetry, reduce — is written by full overwrite or ping-pong
   accumulation, never via blending. Keep that invariant.)
3. If (2) is missing: try `EXT_color_buffer_half_float`. Fallback mode = all
   32F tables drop to 16F. Consequences to accept: actor positions quantize to
   ~1/2048 UV (sub-pixel at 1280 wide — acceptable); score accumulator
   saturates sooner (rescale: store delivered dye × 1/64). Gate this mode
   behind a console warning; it is best-effort.
4. `OES_texture_float_linear` — NOT required (see Section 4). Do not add a
   dependency on it.
5. Record `MAX_TEXTURE_SIZE`, fail gracefully under 2048.

There is deliberately no float-blend requirement and no half-float-linear
requirement. If you find yourself needing one, the design has drifted; stop
and reconsider.

## 7. Simulation core — full GLSL

This section is normative. Shader interfaces (uniform names, texture meanings,
output semantics) must not change; internals may be optimized only with a
correctness argument. All fragment shaders share this vertex shader:

```glsl
#version 300 es
// fullscreen.vert — single-triangle fullscreen pass
layout(location = 0) in vec2 aPosition;   // (-1,-1) (3,-1) (-1,3)
out vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
```

### 7.1 Shared solid-boundary helper (`solid.glsl`)

Prepended (string-concatenated at compile) to divergence, Jacobi, gradient
subtraction, and dye-decay shaders. This is the single source of truth for
"what is solid and how fast is it moving" — the static level SDF, the dynamic
actor mask, and the domain walls, combined.

```glsl
// requires: uniform sampler2D uLevel;    // R = SDF texels, GB = outward normal
//           uniform sampler2D uDynMask;  // RG = cov-weighted vel (texels/s), A = coverage
struct Solid { bool isSolid; vec2 vel; };  // vel in sim texels/sec

Solid solidAt(vec2 uv) {
    Solid s; s.isSolid = false; s.vel = vec2(0.0);
    // Domain walls: closed box with zero velocity.
    if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) {
        s.isSolid = true; return s;
    }
    // Static level geometry (no-slip, zero velocity).
    if (texture(uLevel, uv).r <= 0.0) {
        s.isSolid = true; return s;
    }
    // Dynamic actors (moving no-slip boundary).
    vec4 m = texture(uDynMask, uv);
    if (m.a > 0.5) {
        s.isSolid = true;
        s.vel = m.rg / max(m.a, 1e-4);   // un-weight the coverage average
    }
    return s;
}
```

### 7.2 Advection (velocity and dye share this shader)

```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uVelocity;   // sim res, texels/sec
uniform sampler2D uSource;     // field being advected (sim- or dye-res)
uniform vec2  uSimTexel;       // 1/simRes — NOTE: sim texel even when
                               // advecting dye; it converts texels/s → uv/s
uniform float uDt;
uniform float uDissipation;    // per-second rate
void main() {
    vec2 vel   = texture(uVelocity, vUv).xy;
    vec2 coord = vUv - uDt * vel * uSimTexel;     // backtrace in UV space
    vec4 result = texture(uSource, coord);        // CLAMP_TO_EDGE handles OOB
    fragColor = result * exp(-uDissipation * uDt);
}
```

Backtraces that land inside a solid sample whatever was stamped there; the
gradient-subtract pass (7.6) stamps boundary velocity into solid cells every
substep, so this is well-defined and produces correct entrainment near moving
bodies. Do not add special-casing here.

Optional upgrade (post-MVP, behind a quality flag): MacCormack/BFECC — advect
forward, advect the result backward, correct by half the error, clamp the
correction to the min/max of the 4 neighbors of the backtraced point. Sharper
dye for ~2× advection cost. Do not implement until M6.

### 7.3 Curl

```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uVelocity;
uniform vec2 uSimTexel;
void main() {
    float L = texture(uVelocity, vUv - vec2(uSimTexel.x, 0.0)).y;
    float R = texture(uVelocity, vUv + vec2(uSimTexel.x, 0.0)).y;
    float B = texture(uVelocity, vUv - vec2(0.0, uSimTexel.y)).x;
    float T = texture(uVelocity, vUv + vec2(0.0, uSimTexel.y)).x;
    fragColor = vec4(R - L - T + B, 0.0, 0.0, 1.0);  // 2*curl; constant folds into strength
}
```

### 7.4 Vorticity confinement

Sign conventions and the `force.y *= -1` follow the reference (Dobryakov)
implementation, which is known-good; do not "fix" them.

```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2  uSimTexel;
uniform float uCurlStrength;   // ~25, see tuning table
uniform float uDt;
void main() {
    float L = texture(uCurl, vUv - vec2(uSimTexel.x, 0.0)).x;
    float R = texture(uCurl, vUv + vec2(uSimTexel.x, 0.0)).x;
    float B = texture(uCurl, vUv - vec2(0.0, uSimTexel.y)).x;
    float T = texture(uCurl, vUv + vec2(0.0, uSimTexel.y)).x;
    float C = texture(uCurl, vUv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 1e-4;
    force *= uCurlStrength * C;
    force.y *= -1.0;

    vec2 vel = texture(uVelocity, vUv).xy;
    vel += force * uDt;
    fragColor = vec4(clamp(vel, vec2(-1000.0), vec2(1000.0)), 0.0, 1.0);
}
```

### 7.5 Divergence (mask-aware)

The first of the three boundary-condition shaders. The rule: when a *neighbor*
cell is solid, use the **solid's velocity** for that face — this is what makes
a moving circle push fluid. A common bug is substituting zero (static-wall
thinking), which kills displacement and wakes.

```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uLevel;
uniform sampler2D uDynMask;
uniform vec2 uSimTexel;
// + solid.glsl prepended
void main() {
    vec2 uvL = vUv - vec2(uSimTexel.x, 0.0), uvR = vUv + vec2(uSimTexel.x, 0.0);
    vec2 uvB = vUv - vec2(0.0, uSimTexel.y), uvT = vUv + vec2(0.0, uSimTexel.y);

    vec2 vL = texture(uVelocity, uvL).xy;
    vec2 vR = texture(uVelocity, uvR).xy;
    vec2 vB = texture(uVelocity, uvB).xy;
    vec2 vT = texture(uVelocity, uvT).xy;

    Solid sL = solidAt(uvL); if (sL.isSolid) vL = sL.vel;
    Solid sR = solidAt(uvR); if (sR.isSolid) vR = sR.vel;
    Solid sB = solidAt(uvB); if (sB.isSolid) vB = sB.vel;
    Solid sT = solidAt(uvT); if (sT.isSolid) vT = sT.vel;

    float div = 0.5 * ((vR.x - vL.x) + (vT.y - vB.y));
    fragColor = vec4(div, 0.0, 0.0, 1.0);
}
```

### 7.6 Pressure solve (Jacobi, Neumann at solids) and gradient subtraction

Jacobi iteration — when a neighbor is solid, substitute the **center cell's
pressure** (homogeneous Neumann, ∂p/∂n = 0):

```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform sampler2D uLevel;
uniform sampler2D uDynMask;
uniform vec2 uSimTexel;
// + solid.glsl prepended
void main() {
    vec2 uvL = vUv - vec2(uSimTexel.x, 0.0), uvR = vUv + vec2(uSimTexel.x, 0.0);
    vec2 uvB = vUv - vec2(0.0, uSimTexel.y), uvT = vUv + vec2(0.0, uSimTexel.y);

    float pC = texture(uPressure, vUv).x;
    float pL = solidAt(uvL).isSolid ? pC : texture(uPressure, uvL).x;
    float pR = solidAt(uvR).isSolid ? pC : texture(uPressure, uvR).x;
    float pB = solidAt(uvB).isSolid ? pC : texture(uPressure, uvB).x;
    float pT = solidAt(uvT).isSolid ? pC : texture(uPressure, uvT).x;

    float div = texture(uDivergence, vUv).x;
    fragColor = vec4((pL + pR + pB + pT - div) * 0.25, 0.0, 0.0, 1.0);
}
```

Run `PRESSURE_ITERS` (=30) ping-pong iterations. Initialize the pressure
texture each substep by multiplying the previous substep's pressure by
`uPressureWarmStart` (=0.8) in a copy pass — warm-starting roughly halves the
iterations needed for visually converged results. (Clearing to zero also
works; keep the warm-start factor as a uniform so it can be A/B'd.)

Gradient subtraction — same Neumann substitution, then **stamp boundary
velocity into solid cells** as the final step. The stamp is what advection
(7.2) relies on, and it must be the last write to velocity in the substep:

```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform sampler2D uLevel;
uniform sampler2D uDynMask;
uniform vec2 uSimTexel;
// + solid.glsl prepended
void main() {
    Solid sC = solidAt(vUv);
    if (sC.isSolid) {                       // stamp: solid cells carry their
        fragColor = vec4(sC.vel, 0.0, 1.0); // own velocity (0 for walls)
        return;
    }
    vec2 uvL = vUv - vec2(uSimTexel.x, 0.0), uvR = vUv + vec2(uSimTexel.x, 0.0);
    vec2 uvB = vUv - vec2(0.0, uSimTexel.y), uvT = vUv + vec2(0.0, uSimTexel.y);

    float pC = texture(uPressure, vUv).x;
    float pL = solidAt(uvL).isSolid ? pC : texture(uPressure, uvL).x;
    float pR = solidAt(uvR).isSolid ? pC : texture(uPressure, uvR).x;
    float pB = solidAt(uvB).isSolid ? pC : texture(uPressure, uvB).x;
    float pT = solidAt(uvT).isSolid ? pC : texture(uPressure, uvT).x;

    vec2 vel = texture(uVelocity, vUv).xy;
    vel -= 0.5 * vec2(pR - pL, pT - pB);
    fragColor = vec4(vel, 0.0, 1.0);
}
```

**Known gotchas, in the order you will hit them:**
1. *Circle doesn't push fluid* → divergence pass is substituting 0 instead of
   `sL.vel` for solid neighbors, or the dynMask splat is writing actor
   velocity in UV/sec instead of texels/sec (Section 9.3).
2. *Fluid leaks through thin walls* → wall thinner than ~2 sim texels in the
   level PNG. Enforce a 2-texel minimum feature size in level authoring
   (Section 8), don't try to fix it in the solver.
3. *Checkerboard pressure noise around the moving circle* → dynMask coverage
   threshold flickering; make the splat's edge a 1-texel smoothstep (9.3) so
   coverage crosses 0.5 cleanly, and keep the circle radius ≥ 4 sim texels.
4. *Persistent drift/swirl with everything idle* → 16F velocity quantization;
   this is normal at small magnitudes and invisible once dissipation is on.
   Do not chase it.

### 7.7 Dye post-pass: solid decay + sink absorption

Runs at dye res after dye advection. Note it both decays dye trapped in solids
(the moving circle smears dye into its own footprint; this cleans it up) and
performs sink absorption. Absorption is recomputed identically in 7.8 — the
two passes must use the exact same formula; factor it into a shared snippet.

```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uDye;        // dye after advection, dye res
uniform sampler2D uRegions;    // R = sink mask (sim res, bilinear is fine)
uniform sampler2D uLevel;
uniform sampler2D uDynMask;
uniform float uAbsorbRate;     // per-second, inside sink
uniform float uSolidDecay;     // per-second, inside solids (fast, ~8/s)
uniform float uDt;
// + solid.glsl prepended
vec3 absorbedAmount(vec3 dye, vec2 uv) {
    float sink = texture(uRegions, uv).r;
    float k = 1.0 - exp(-uAbsorbRate * sink * uDt);
    return dye * k;
}
void main() {
    vec4 dye = texture(uDye, vUv);
    dye.rgb -= absorbedAmount(dye.rgb, vUv);
    if (solidAt(vUv).isSolid) dye.rgb *= exp(-uSolidDecay * uDt);
    fragColor = dye;
}
```

### 7.8 Score accumulation

Ping-pong (no blending — keeps us off `EXT_float_blend`, Section 6). Reads the
*pre-absorption* dye (the same texture 7.7 read), recomputes `absorbedAmount`,
adds to the running per-cell total. Runs at scoreAcc res (sim res) — sampling
dye bilinearly from dye res down to sim res slightly low-passes the absorbed
amount; this is fine because the win threshold is tuned against the same
pipeline.

```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uScoreAcc;   // previous accumulator
uniform sampler2D uDye;        // PRE-absorption dye (same input as 7.7)
uniform sampler2D uRegions;
uniform float uAbsorbRate;
uniform float uDt;
uniform float uActive;         // 1.0 only in RUN state; 0.0 freezes scoring
vec3 absorbedAmount(vec3 dye, vec2 uv) {
    float sink = texture(uRegions, uv).r;
    float k = 1.0 - exp(-uAbsorbRate * sink * uDt);
    return dye * k;
}
void main() {
    vec4 acc = texture(uScoreAcc, vUv);
    acc.rgb += absorbedAmount(texture(uDye, vUv).rgb, vUv) * uActive;
    fragColor = acc;
}
```

### 7.9 Sum reduction chain

Generic sum-reduce used for scoring (and reusable for any mask×field metric).
Repeated passes, each halving dimensions (ceil), summing 2×2 blocks with
bounds checks. From 320×180: 160×90 → 80×45 → 40×23 → ... → 1×1 (~9 passes,
negligible cost). The 1×1 result is the total delivered dye per channel.

```glsl
#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform ivec2 uSrcSize;
void main() {
    ivec2 base = ivec2(gl_FragCoord.xy) * 2;
    vec4 s = vec4(0.0);
    for (int dy = 0; dy < 2; dy++)
    for (int dx = 0; dx < 2; dx++) {
        ivec2 c = base + ivec2(dx, dy);
        if (c.x < uSrcSize.x && c.y < uSrcSize.y) s += texelFetch(uSrc, c, 0);
    }
    fragColor = s;
}
```

## 8. Level pipeline: PNG + JSON, and SDF generation

### 8.1 Level format

A level is two files:

`levelN.png` — 320×180 RGBA8, channels:
- **R**: solid geometry (≥128 = solid). Minimum feature size 2 texels
  (walls thinner than 2 texels leak; see 7.6 gotcha #2).
- **G**: sink region (≥128 = sink).
- **B**: reserved (future: hazard regions).
- **A**: 255 everywhere (avoid premultiply surprises in image tooling).

`levelN.json`:
```json
{
  "name": "First pour",
  "winFraction": 0.6,
  "timeLimitSec": 0,
  "emitRate": 1.0,
  "fanBudget": 3,
  "allowNudge": true,
  "playerStart": [0.1, 0.5],
  "actors": [
    { "type": "emitter", "pos": [0.08, 0.85], "dir": [1, 0],
      "radiusTexels": 5, "strength": 120, "dyeColor": [1.0, 0.25, 0.1] },
    { "type": "fan", "pos": [0.5, 0.2], "dir": [0, 1],
      "radiusTexels": 6, "strength": 200, "locked": true }
  ]
}
```
`winFraction` is relative to total dye emitted so far (both are sums the
telemetry channel returns; emitted total is tracked CPU-side as
`emitRate × strength-derived constant × elapsed RUN time` — define one
emission constant and keep it consistent). `locked` actors can't be moved or
deleted by the player. `allowNudge: false` despawns the player circle once
the RUN state starts (the "hands-off engineering" level variant).

Levels are literally paintable in any image editor; keep it that way.

### 8.2 SDF generation (jump flooding, at level load)

Three small shader programs, run once per level load, all at sim res, into
RG16F ping-pong scratch ("seed textures" hold the UV of the nearest seed).
Run the whole JFA **twice**: once seeding solid texels (gives distance *to*
solids, valid outside), once seeding empty texels (valid inside). Combine into
the signed field, then a final pass computes the gradient.

Seed init (`uInvert` = 0 for solid-seeded run, 1 for empty-seeded run):
```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uLevelPng;   // the raw RGBA8 PNG
uniform float uInvert;
void main() {
    float solid = step(0.5, texture(uLevelPng, vUv).r);
    float isSeed = mix(solid, 1.0 - solid, uInvert);
    fragColor = isSeed > 0.5 ? vec4(vUv, 1.0, 1.0)      // store own UV
                             : vec4(-1.0, -1.0, 0.0, 1.0); // sentinel
}
```

JFA step (run with `uStep` = simRes/2, simRes/4, ..., 1, in texels):
```glsl
#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uSeeds;
uniform vec2 uSimTexel;
uniform float uStep;           // jump distance in texels
void main() {
    vec4 best = texture(uSeeds, vUv);
    float bestD = best.z > 0.5 ? distance(vUv, best.xy) : 1e9;
    for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
        vec2 nUv = vUv + vec2(float(dx), float(dy)) * uStep * uSimTexel;
        vec4 cand = texture(uSeeds, clamp(nUv, vec2(0.0), vec2(1.0)));
        if (cand.z > 0.5) {
            float d = distance(vUv, cand.xy);
            if (d < bestD) { bestD = d; best = cand; }
        }
    }
    fragColor = best;
}
```

Combine + gradient (two passes; the first writes signed distance in texels,
the second writes gradient via central differences of the signed field):
```glsl
// combine: out.r = solid? -dist(emptySeeds) : +dist(solidSeeds), converted
//          to texel units via * simRes (distances above are in UV)
// gradient: g = normalize(vec2(d(x+1)-d(x-1), d(y+1)-d(y-1))); out = (d, g.x, g.y, 0)
//           guard: if length < 1e-5 output (d, 0, 1, 0)
```
(Write these two trivial shaders yourself; the contract is the `level`
texture layout in Section 5: R = signed texel distance, GB = normalized
outward gradient.)

Also at load: blit the PNG's G channel into `regions.r` (sink) and B into
`regions.g` (hazard). Despite JFA being approximate (±1 texel), it is exact
enough for collision and edge rendering; do not substitute a CPU-side exact
transform — load time and code size both get worse.

## 9. Actor system

### 9.1 Actor texture schema (64×4 RGBA32F, ping-pong, texelFetch only)

Column = slot (0..63). Slot 0 is always the player. Rows:

| Row | x | y | z | w |
|-----|---|---|---|---|
| 0 | pos.x (UV) | pos.y (UV) | vel.x (UV/s) | vel.y (UV/s) |
| 1 | type | radiusTexels | strength | param (fan/emitter angle, radians) |
| 2 | ttl (s, <0 = immortal) | flags bitfield | dyeR | dyeG |
| 3 | dyeB | spare | spare | spare |

Types: `0 = empty, 1 = player, 2 = fan, 3 = emitter` (reserve 4+ for the
follow-on games: projectile, hazard-emitter). Type 0 slots are skipped
everywhere. Flags: bit0 = locked.

CPU writes (placement, level load, despawn) go through `texSubImage2D` into
**both** ping-pong copies (or the write is lost on the next flip — classic
bug). Maintain the free-slot list CPU-side; the CPU initiated every spawn, so
it always knows occupancy.

### 9.2 Actor update pass

Fragment shader over the 64×4 ping-pong target. Each fragment computes the
full new state of its slot's actor, then outputs only its own row. Player
physics: thrust + fluid drag + damping + SDF collision. Fans/emitters are
static in the MVP (passthrough), but they flow through the same shader — that
is the point of the exercise.

```glsl
#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uActors;     // previous state
uniform sampler2D uVelocity;   // field, texels/sec
uniform sampler2D uLevel;      // SDF + gradient
uniform vec2  uSimTexel;
uniform float uDt;
uniform vec4  uInput;          // xy = thrust direction (unit or zero), z = action, w = unused
uniform float uThrust;         // UV/s^2
uniform float uDragK;          // 1/s   — the puzzle→platformer dial
uniform float uLinDamp;        // 1/s
uniform vec4  uSpawn;          // x = target slot (-1 = none), y = type,
                               //   zw = offset from player (UV)
uniform vec4  uSpawnParams;    // radiusTexels, strength, angle, ttl

const int TYPE_EMPTY = 0; const int TYPE_PLAYER = 1;
const int TYPE_FAN = 2;   const int TYPE_EMITTER = 3;

void main() {
    int slot = int(gl_FragCoord.x);
    int row  = int(gl_FragCoord.y);
    vec4 r0 = texelFetch(uActors, ivec2(slot, 0), 0);
    vec4 r1 = texelFetch(uActors, ivec2(slot, 1), 0);
    vec4 r2 = texelFetch(uActors, ivec2(slot, 2), 0);
    vec4 r3 = texelFetch(uActors, ivec2(slot, 3), 0);
    int type = int(r1.x);

    // --- GPU-side spawn-at-player (Section 9.5) ---
    if (slot == int(uSpawn.x) && uSpawn.x >= 0.0) {
        vec4 player = texelFetch(uActors, ivec2(0, 0), 0);
        r0 = vec4(player.xy + uSpawn.zw, 0.0, 0.0);
        r1 = vec4(uSpawn.y, uSpawnParams.xyz);
        r2 = vec4(uSpawnParams.w, 0.0, 1.0, 1.0);
        r3 = vec4(1.0, 0.0, 0.0, 0.0);
        type = int(uSpawn.y);
    }

    // --- player physics ---
    if (type == TYPE_PLAYER) {
        vec2 pos = r0.xy, vel = r0.zw;
        vec2 fluidUv = texture(uVelocity, pos).xy * uSimTexel; // texels/s -> UV/s
        vel += (uInput.xy * uThrust + uDragK * (fluidUv - vel)) * uDt;
        vel *= exp(-uLinDamp * uDt);
        pos += vel * uDt;

        // SDF collision: push out along stored gradient, kill inward velocity
        vec4 lv = texture(uLevel, pos);
        float pen = lv.r - r1.y;            // signed dist minus radius, texels
        if (pen < 0.0) {
            vec2 n = lv.gb;                  // outward normal
            pos += -pen * n * uSimTexel.x;   // texels -> UV (isotropic texels, 5.)
            float vn = dot(vel, n);
            if (vn < 0.0) vel -= vn * n;     // slide, don't bounce
        }
        float rUv = r1.y * uSimTexel.x;
        pos = clamp(pos, vec2(rUv), vec2(1.0) - vec2(rUv));
        r0 = vec4(pos, vel);
    }

    // --- TTL (immortal if r2.x < 0) ---
    if (type != TYPE_EMPTY && r2.x >= 0.0) {
        r2.x -= uDt;
        if (r2.x <= 0.0) { r1.x = 0.0; }     // expire to TYPE_EMPTY
    }

    fragColor = (row == 0) ? r0 : (row == 1) ? r1 : (row == 2) ? r2 : r3;
}
```

`uDragK` defaults small-but-nonzero (the player feels currents but can fight
them); cranking it up and lowering thrust turns this exact shader into the
updraft-platformer actor. Keep it a uniform, not a constant.

### 9.3 Actor splat pass — one code path for everything that touches a field

One instanced draw per **target field** (3 draws per substep), same vertex
shader, different fragment shaders. The vertex shader culls instances whose
type doesn't write the current target by emitting off-screen positions.

```glsl
#version 300 es
// splat.vert
layout(location = 0) in vec2 aCorner;   // unit quad corners, -1..1
uniform sampler2D uActors;
uniform int   uTarget;        // 0 = velocity force, 1 = dye, 2 = dynMask
uniform vec2  uSimTexel;
uniform float uExtentMul;     // 3.0 for gaussian targets, 1.1 for dynMask
flat out vec4 vR0; flat out vec4 vR1; flat out vec4 vR2; flat out vec4 vR3;
out vec2 vLocal;

bool writesTarget(int type, int target) {
    if (target == 0) return type == 2 || type == 3;   // fan, emitter push fluid
    if (target == 1) return type == 3;                // emitter injects dye
    if (target == 2) return type == 1;                // player is a boundary
    return false;
}
void main() {
    int slot = gl_InstanceID;
    vR0 = texelFetch(uActors, ivec2(slot, 0), 0);
    vR1 = texelFetch(uActors, ivec2(slot, 1), 0);
    vR2 = texelFetch(uActors, ivec2(slot, 2), 0);
    vR3 = texelFetch(uActors, ivec2(slot, 3), 0);
    if (!writesTarget(int(vR1.x), uTarget)) {
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);     // cull whole quad
        return;
    }
    vLocal = aCorner;
    vec2 extent = vR1.y * uExtentMul * uSimTexel;     // radius texels -> UV
    vec2 pos = vR0.xy + aCorner * extent;
    gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
```

Fragment, target 0 (velocity force; **additive blending**, ONE/ONE):
```glsl
#version 300 es
precision highp float;
in vec2 vLocal; flat in vec4 vR0; flat in vec4 vR1;
flat in vec4 vR2; flat in vec4 vR3;
out vec4 fragColor;
uniform float uDt;
void main() {
    float g = exp(-dot(vLocal, vLocal) * 4.5);        // gaussian over the 3r quad
    vec2 dir = vec2(cos(vR1.w), sin(vR1.w));
    fragColor = vec4(dir * vR1.z * g * uDt, 0.0, 0.0); // strength in texels/s^2
}
```

Fragment, target 1 (dye injection; additive; runs at dye res — same quad math
works because everything is UV):
```glsl
    float g = exp(-dot(vLocal, vLocal) * 4.5);
    fragColor = vec4(vec3(vR2.z, vR2.w, vR3.x) * vR1.z * uEmitScale * g * uDt, 0.0);
```

Fragment, target 2 (dynMask; additive into a texture cleared to 0 each
substep; hard edge with a 1-texel smoothstep — see 7.6 gotcha #3):
```glsl
#version 300 es
precision highp float;
in vec2 vLocal; flat in vec4 vR0; flat in vec4 vR1;
flat in vec4 vR2; flat in vec4 vR3;
out vec4 fragColor;
uniform vec2 uSimTexel;
void main() {
    float rTex = vR1.y;                                // radius in texels
    float dTex = length(vLocal) * rTex * 1.1;          // matches uExtentMul=1.1
    float cov  = 1.0 - smoothstep(rTex - 1.0, rTex, dTex);
    vec2 velTexels = vR0.zw / uSimTexel.x;             // UV/s -> texels/s  (!!)
    fragColor = vec4(velTexels * cov, 0.0, cov);
}
```
The marked conversion is the unit bug called out in Section 4: the dynMask
must carry **texels/sec** because `solidAt` feeds it straight into the solve.

All three draws: `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, 64)`. 64 instances
of a tiny quad is free; do not add CPU-side culling.

### 9.4 Why the splat route (and the analytic escape hatch)

The dynMask could be computed analytically (circle SDF from the actor texture,
evaluated inline in `solidAt`). We deliberately rasterize instead, because the
splat path is the shared infrastructure the follow-on games scale through.
**However**: implement the analytic version too, behind a debug flag
(`?dynmask=analytic`). When boundary artifacts appear, flipping the flag tells
you in one reload whether the bug is in the splat or in the solve. Budget an
hour; it will repay itself the first week.

### 9.5 Spawn protocol (CPU → GPU, and at-player placement)

Two spawn paths, both CPU-initiated:
- **Absolute** (level load, editor-style placement at mouse): CPU writes the
  full actor record via `texSubImage2D` into both ping-pong copies.
- **At-player** (the embodied mechanic: drop a fan where I am): CPU picks a
  free slot, sets `uSpawn`/`uSpawnParams` for exactly one substep, then clears
  them. The update shader initializes the slot from the player's *current
  GPU-side* position — no readback, no staleness. This is also exactly the
  wake-war projectile-spawn mechanism; build it well.

The CPU's mirror of the actor table (positions ~2 frames stale via telemetry,
occupancy exact) is used only for UI affordances and the free-slot list.

## 10. Telemetry and async readback

### 10.1 Telemetry gather pass

Once per rendered frame, a fragment pass over the 66×1 RGBA32F telemetry
texture packs everything the CPU is allowed to know:
- pixel 0: the 1×1 reduction result (delivered dye totals per channel)
- pixel 1: reserved (future: per-frame max |velocity| for adaptive substeps)
- pixels 2..65: row 0 of each actor slot (pos+vel), for UI affordances/audio

```glsl
#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uReduced;    // 1x1
uniform sampler2D uActors;
void main() {
    int x = int(gl_FragCoord.x);
    if      (x == 0) fragColor = texelFetch(uReduced, ivec2(0, 0), 0);
    else if (x == 1) fragColor = vec4(0.0);
    else             fragColor = texelFetch(uActors, ivec2(x - 2, 0), 0);
}
```

### 10.2 PBO readback channel (the only GPU→CPU path in the game)

```ts
class ReadbackChannel {
  // Ring of 3 in-flight reads. Each: PBO + fence + age.
  private slots: { pbo: WebGLBuffer; fence: WebGLSync | null }[];
  private latest = new Float32Array(66 * 4);

  kick(gl: WebGL2RenderingContext, fbo: WebGLFramebuffer) {
    const s = this.slots[this.cursor];
    if (s.fence) return;               // ring full; skip this frame (fine)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);   // telemetry FBO
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo);
    gl.readPixels(0, 0, 66, 1, gl.RGBA, gl.FLOAT, 0); // into PBO: NO stall
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    s.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    this.cursor = (this.cursor + 1) % this.slots.length;
  }

  poll(gl: WebGL2RenderingContext): Float32Array {
    for (const s of this.slots) {
      if (!s.fence) continue;
      const st = gl.getSyncParameter(s.fence, gl.SYNC_STATUS);
      if (st === gl.SIGNALED) {
        gl.deleteSync(s.fence); s.fence = null;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.latest);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      }
    }
    return this.latest;                // always returns most recent completed
  }
}
```

Rules: `kick()` after the telemetry pass, `poll()` at the top of the next
frame. Never `clientWaitSync` with a nonzero timeout, never `gl.finish()`.
The HUD, win check, and audio consume `latest` and must tolerate it being up
to ~3 frames old (they cannot tell, and that's the point).

Win check (CPU): `delivered / emitted >= winFraction`, where `delivered`
comes from telemetry pixel 0 and `emitted` from the CPU-side emission model
(8.1). Require the condition to hold for 30 consecutive polls (~0.5 s) to
de-glitch the readback latency, then transition to WIN.

## 11. Rendering and presentation (yours to design, contract below)

The render pass consumes: dye (the star), level SDF, regions, actor texture,
dynMask. Required elements, with latitude on aesthetics:

- **Dye**: tonemapped (the accumulating 16F dye exceeds 1.0 near emitters;
  a simple `1 - exp(-k*dye)` works). Bloom: bright-pass threshold ~0.6, 4-level
  half-res blur pyramid (separable 5-tap), additive recombine at ~0.3. Optional
  "sunrays" radial occlusion pass if time permits (M6 only). The reference
  look is Dobryakov's repo (MIT) — match its *quality bar*, not its code.
- **Obstacles**: render from the SDF, not the PNG — `smoothstep(0.0, 1.5, -d)`
  gives clean anti-aliased edges at any zoom. Flat retro palette; a 1-texel
  bright rim where `|d| < 1` reads well against glowing dye.
- **Sink/source regions**: subtle animated outlines (dashed marching or slow
  pulse). Must be visible over any dye color.
- **Player**: a flat circle with a direction tick; draw at the actor texture's
  position via a tiny instanced pass (vertex shader fetches slot 0 directly —
  the rendered position is GPU-fresh even though the CPU's copy is stale).
- **Fans**: visible arrows/turbine glyphs at their positions+angles (same
  instanced approach over all slots), plus a range ring while placing.
- **Chrome**: DOM, not GL. 1280×720 canvas centered in a frame styled like a
  2003-era Flash portal page. Have taste; pixel fonts and a beveled border go
  a long way. HUD (score bar, fan budget, timer) is DOM positioned over the
  canvas, fed from telemetry at poll rate.
- **Debug views** (build these in M1, they are not optional — they are how
  every later milestone gets verified): a keyboard-cycled overlay rendering
  velocity (as hue/magnitude), pressure, divergence (should be ~0 after
  projection!), curl, level SDF, dynMask coverage, scoreAcc. Plus a
  stats line: fps, substeps/frame, readback age in frames.

## 12. Code organization and game loop

### 12.1 Pass abstraction (normative interface, ~150 lines, write it well)

```ts
interface Pass {
  program: WebGLProgram;
  output: RenderTarget | PingPong;     // PingPong.write() / .read() / .flip()
  inputs: Record<string, Texture | (() => Texture)>;  // lazy for ping-pong reads
  uniforms: Record<string, number | number[] | (() => number | number[])>;
  blend?: "none" | "additive";
  instanced?: { count: number; geometry: "quad" };
}
```
The scheduler: binds FBO, sets viewport to output size, binds inputs to units,
uploads uniforms, draws (fullscreen triangle unless `instanced`), flips
ping-pongs. It must throw if any resolved input texture === the output's
write texture. Shader compilation: one helper with `#include`-style string
prepending for `solid.glsl`, and a compile-error reporter that prints the
numbered source (you will thank yourself).

Suggested module layout (yours to adjust): `gl/` (context, caps, Pass,
PingPong, shaders as template strings), `sim/` (pass graph construction,
constants), `level/` (PNG/JSON loader, JFA), `game/` (states, input, win
logic, CPU actor mirror), `ui/` (DOM chrome, HUD, debug overlay), `main.ts`.

### 12.2 Game states

`EDIT` — sim runs (the tank should feel alive), emitters off, scoring frozen
(`uActive=0`). Player places/rotates/deletes fans (mouse; budget-limited;
`locked` actors immutable). The player circle is steerable here too.
`RUN` — emitters on, scoring active, timer running if `timeLimitSec > 0`.
Fans locked unless the level says otherwise; nudging allowed unless
`allowNudge: false` (which despawns the circle).
`WIN` — banner, stats (time, fans used vs. par), next-level button.
`RESET` (transition, not a state) — reload level textures, zero scoreAcc and
dynMask, rewrite the actor table, back to EDIT. Must be instant.

Input: WASD/arrows → `uInput.xy` (normalized); E or click-with-tool →
placement; R → reset; Tab → debug overlay cycle; 1..9 → debug view select.

## 13. Milestones and acceptance criteria

Each milestone ends with the listed checks passing. Do not start the next
milestone with a prior check failing — later symptoms of earlier bugs are
much harder to localize in this codebase than in most, because everything
feeds back through the field.

**M0 — Scaffold.** Vite+TS, context+caps detection (Section 6), Pass/PingPong
framework, fullscreen triangle, a test-pattern shader on screen, fixed-step
loop with substep counter in a stats line.
✓ 60 fps; substeps/frame reads 2 at 60 Hz, 1 at 120 Hz displays.

**M1 — Open-tank fluid + debug views.** Passes 3–8 of Section 3 with no
level geometry (domain walls only, from `solidAt`). A temporary mouse-drag
splat (reuse the force-splat fragment with a uniform-driven position) for
poking the fluid. All debug views.
✓ Mouse drag produces a dye-free velocity swirl visible in the velocity view;
a vortex pair persists ≥ 2 s at curl strength 25.
✓ Divergence view is ~uniform gray (near zero) after projection while stirring.
✓ No fps drop with 30 Jacobi iterations.

**M2 — Levels.** PNG/JSON loader, JFA SDF, regions, static obstacles in the
solve, dye at 1280×720 advected through 320×180 velocity, emitters as actors
(splat path, types fan/emitter, static — actor update is passthrough here).
✓ Dye streams visibly deflect around painted obstacles; no leakage through
2-texel walls; SDF debug view shows smooth signed bands.
✓ Dye edges against obstacles are crisp (solid-decay term active), not mushy.

**M3 — The circle.** Full actor update shader, dynMask splat, moving-boundary
coupling, SDF collision, fluid drag on the player.
✓ Steering through still dye leaves a visible entrained wake.
✓ Parking in a jet visibly splits the stream; pressure debug view shows a
stagnation bright spot on the upstream face.
✓ Circle cannot tunnel through walls at max thrust (hold a wall for 10 s).
✓ Flip `?dynmask=analytic`: behavior is indistinguishable.
**M3 is the go/no-go gate for game feel. Stop here and tune (Section 14)
until pushing fluid around feels *good* before writing any game logic.**

**M4 — Placement and budget.** EDIT-state fan placement/rotation/deletion at
the mouse, at-player placement via the spawn protocol (9.5), budget UI,
locked actors.
✓ Place a fan via at-player protocol while moving fast: it appears at the
circle's true position, not a stale one (visually verifiable at speed).

**M5 — Scoring and win.** Sink absorb, accumulator, reduction, telemetry,
ReadbackChannel, emission model, win check, EDIT/RUN/WIN flow, HUD.
✓ Score bar moves only in RUN; reset zeroes it instantly.
✓ Block the sink with the circle: delivery rate visibly drops (flux
accounting working).
✓ Readback age stat reads 2–3 frames; frame time unchanged with readback on.

**M6 — Content and polish.** Bloom, chrome, sounds if cheap, and five levels:
(1) straight shot, one fan, teaches placement; (2) corner turn, two fans;
(3) "the leak" — near-complete piping where nudging is the intended finisher;
(4) split flow, two dye colors to two sinks (uses dye channels + per-channel
win); (5) `allowNudge: false` engineering level.
✓ A new player clears level 1 in under 2 minutes; level 3's intended nudge
solution works and a pure-fan solution also exists at +1 fan over par.

## 14. Tuning table (starting values, all live-adjustable in a debug panel)

| Constant | Value | Notes |
|---|---|---|
| DT | 1/120 s | fixed; never tune |
| PRESSURE_ITERS | 30 | 20 acceptable on weak GPUs (quality flag) |
| uPressureWarmStart | 0.8 | 0 = off |
| uCurlStrength | 25 | the "aliveness" knob |
| velocity dissipation | 0.15 /s | |
| dye dissipation | 0.35 /s | lower = prettier, harder to score |
| uSolidDecay | 8 /s | |
| uAbsorbRate | 6 /s | |
| fan strength | 200 texels/s² | over gaussian, dt-scaled |
| emitter strength | 120 | + dye uEmitScale 0.04 |
| player radiusTexels | 5 | ≥4 or pressure noise (7.6 #3) |
| uThrust | 0.55 UV/s² | |
| uDragK | 1.2 /s | the puzzle↔platformer dial |
| uLinDamp | 2.5 /s | |
| bloom threshold / strength | 0.6 / 0.3 | |

The debug panel (dat.gui-style, hand-rolled is fine) is an M1 deliverable;
tuning the M3 feel gate without it is misery.

## 15. Risks and debugging guidance

- **Black screen after a sim pass**: NaN injection. Usual sources: normalize
  of a zero vector (vorticity force — guarded), division by coverage
  (guarded), or an uninitialized texture (clear every texture at creation).
  Add a debug "NaN detector" view: `isnan(x) ? magenta : value`.
- **Everything works but feels dead**: dissipation too high, curl too low,
  or sim res accidentally square (anisotropy bugs masquerade as damping).
- **Pressure solve diverges (white-out)**: divergence pass and Jacobi
  disagree about which cells are solid — almost always a `solid.glsl`
  prepend missing from one shader, or dynMask sampled with stale viewport.
- **Wake looks gridded/stair-stepped**: dye res not actually 1280×720
  (check FBO sizes in the stats line), or LINEAR filtering lost on a
  reallocated texture.
- **Score creeps in EDIT**: `uActive` not plumbed, or accumulator pass reads
  post-absorption dye (must read the same pre-absorption texture as 7.7).
- **Heisenbugs that change with window focus**: you have a synchronous
  readback somewhere. Audit for `readPixels` without a PBO. This is the one
  architectural sin; treat it as a build-breaker.
- Performance budget at defaults: ~37 sim-res passes + 2 dye-res passes per
  substep × 2 substeps, + render. If a 2020 iGPU misses 60 fps, the quality
  flag drops PRESSURE_ITERS to 20 and dye to 960×540 — implement the flag,
  don't pre-optimize anything else.

## 16. Notes to the implementing model

**Invariants — do not change without flagging the change and its reason in
your summary:**
1. No synchronous GPU→CPU reads, anywhere, ever (Section 10.2 rules).
2. Shader interfaces and texture schemas of Sections 5, 7, 9 are normative.
3. Units and conventions of Section 4 — especially the two marked UV/s ↔
   texels/s conversion points.
4. Fixed timestep semantics; all rates per-second via `exp(-rate*dt)`.
5. The single actor path: anything that influences a field does it via the
   actor texture + splat pass. No special-case "just this once" field writes.
   (The temporary M1 mouse splat is the sanctioned exception; delete it in M4.)
6. The capability matrix in Section 6: no new extension dependencies.

**Yours to decide:** module structure beyond 12.1's sketch, all DOM/UI/visual
design within 11's contract, the two trivial JFA combine/gradient shaders,
level visuals and palette, sounds, the exact emission-total model (document
whatever you choose), TypeScript niceties throughout.

**Where the dragons are**, in case prioritizing under time pressure: 7.5/7.6
boundary handling (most bug-hours), 9.3's unit conversion (most confusing
single line), 10.2's discipline (most tempting to violate), and the M3 feel
gate (most important to the project — everything after it is decoration).

**When stuck on physics-looking bugs**: cycle the debug views in pass order
(velocity → divergence → pressure → post-projection divergence) and find the
first image that looks wrong; the bug is in the pass that produced it. The
analytic dynMask flag (9.4) bisects actor-coupling bugs the same way.

---
---

# PART II — The Live World update (v0.3 plan)

**Status of the codebase this plan extends.** Part I (§1–16) specified the MVP;
it was then implemented and iterated to v0.2 as a single self-contained
`flux-route.html`: one `<script>` defining a global `GLSL` object (all shader
sources as template strings, composed from `FRAG_HEADER` / `SOLID` / `ZONES`
shared snippets), and one IIFE containing the engine. Implemented and working:
the full Part I sim core at SIM 480×270 / DYE 1920×1080, JFA SDFs (texel-space
metric), the 64×4 actor table with player / fan / emitter / kinematic-piston
types (0/1/2/3/5), gentle player-vs-actor collision, drains and trigger-gates
(zone encoding below), sink heat/pulse reactivity driven by telemetry deltas,
the PBO readback channel, debug views, and a live tuning panel. A fresh session
should skim §3–5, §9–10, and §16 of Part I before touching anything; the
invariants there still bind, with the amendments in §29.

**Current encodings a new session must know** (these supersede Part I tables):
- Zones (`regions` RGBA8, from level-canvas colors): R=sink (green), G=drain
  (blue — voids dye unscored), B=trigger (cyan — fills a lock), A=free
  (claimed by §23 for sensors).
- Actor types: 0 empty, 1 player, 2 fan, 3 emitter, 5 kinematic piston
  (r1.z=amplitude UV, r1.w=axis, r2.z=ω, r2.w=phase, r3.yz=path center).
  4, 6, 7 are reserved and claimed below.
- Telemetry (66×1): px0 = scoreAcc reduction (rgb=delivered, a=trigger bank),
  px1 = reserved (claimed by §23), px2..65 = actor row 0.
- Game flow: EDIT→RUN→WIN states; win = cumulative delivered/emitted ≥
  `winFraction`, held 30 polls. §18 replaces this model.

This Part II is organized so sections can be implemented by **separate
sessions**: §19 is the prerequisite for §20/§21/§23; §18 is the prerequisite
for §22/§24; §25 and §26 are independent of everything. §28 gives the
milestone ordering and parallelization map.

## 17. Design intent of this phase

v0.2 plays as: stop the world, build, press go, watch. This phase makes the
tank a *continuously running place* that the player modifies from inside, and
gives the fluid more ways to be the gameplay: matter that precipitates out of
it (gel), creatures that live in it (predators), circuits made of it (flux
switches, dye-driven jets), and regional physics (media zones). Every addition
must keep the falling-sand-purist contract: state lives in fields and the
actor table; the CPU orchestrates and reads only through telemetry.

## 18. Live-world mode (replaces EDIT/RUN)

**States become `PLAY` and `WIN`.** Emitters run from level load. There is no
build phase: fans are placed, rotated, and deleted while everything flows.
`uEmittersOn` plumbing is kept (it becomes a pause affordance later) but is
always 1 in normal play.

**Win model: sustained capture.** Cumulative delivered/emitted punishes the
time spent experimenting, which is the whole activity now. Replace it:
- `captureEMA` = EMA (τ=0.5 s) of instantaneous capture fraction
  (per-poll delivered delta ÷ poll dt ÷ emitRate — already computed for the
  sink pulse in v0.2 as `fluxEMA`; promote it from cosmetic to authoritative).
- Win when `captureEMA ≥ winFraction` continuously for `winHoldSec` (default
  4 s; per-level override). The HUD bar shows captureEMA against the target
  with a hold-progress tick; cumulative % remains as a secondary readout.
- Telemetry latency (~2–3 frames) is absorbed by the EMA; no change needed.

**Control scheme rework** (forced by §24 claiming U/O):
- WASD/arrows: steer. U/O: player spin (§24). F: drop fan at player.
- Mouse hover within pick radius (0.05 UV, from telemetry positions) selects
  the nearest *adjustable* actor — fans AND emitters, excluding `locked` and
  pistons. Selection is shown by a brightened ring (pass a `uSelected` slot
  uniform to the glyph pass).
- Wheel: rotates the selection if any, else the placement ghost. Rotation of
  an existing actor = CPU rewrites the full record from `cpuActors` (the CPU
  is the source of truth for static actor params) via `writeActor` — which
  already writes both ping-pong copies; never write just one.
- Left click: place fan (budget permitting, not inside solid). Right click:
  delete selection (refund budget). R: reset level. 1–9: level select.
- **Rotatable emitters** are exactly this selection mechanism applied to
  type 3 — the angle already drives the force splat; no shader work. Levels
  may mark emitters `locked` to forbid it where rotation trivializes the
  puzzle.

Acceptance: rotate a live emitter and watch the plume re-aim within ~1 s; place
and delete fans mid-flow with no hitch; win triggers only after visibly
holding a steady capture, and a deliberately pulsed solution (capture, lose
it, capture) does not win.

## 19. Composed obstacle field (prerequisite refactor — do this first)

**Problem.** `solidAt()` samples `uLevel` and `uDynMask` and is called for
4–5 neighbors in divergence, 30× Jacobi, gradient-subtract, and dye-post:
~120+ calls/cell/substep, 2 fetches each. Gel (§20) would add a third fetch
to every call. **Fix:** compose all solidity into one texture, once per
substep, immediately after the dynMask splat and gel update:

```glsl
// obstacleComposeFS -> RGBA16F sim res:  rg = boundary vel (texels/s),
//                                        b  = solid flag,  a = porous drag 0..1
uniform sampler2D uLevel;     // SDF
uniform sampler2D uDynMask;
uniform sampler2D uGel;       // §20; bind a 1x1 zero texture until gel exists
uniform float uGelSolid;      // gel >= this  =>  solid (default 0.6)
void main(){
  vec2 vel = vec2(0.0); float solid = 0.0;
  if(texture(uLevel,vUv).r <= 0.0) solid = 1.0;
  vec4 m = texture(uDynMask,vUv);
  if(m.a > 0.5){ solid = 1.0; vel = m.rg/max(m.a,1e-4); }
  float gel = texture(uGel,vUv).r;
  if(gel >= uGelSolid) solid = 1.0;               // set gel: static, vel 0 wins below
  float drag = clamp(gel/uGelSolid, 0.0, 1.0)*(1.0-solid);
  fragColor = vec4(vel, solid, drag);
}
```

`SOLID` becomes one fetch (domain-wall branch unchanged):

```glsl
uniform sampler2D uObstacle;
Solid solidAt(vec2 uv){
  Solid s; s.isSolid=false; s.vel=vec2(0.0);
  if(uv.x<=0.0||uv.x>=1.0||uv.y<=0.0||uv.y>=1.0){ s.isSolid=true; return s; }
  vec4 o = texture(uObstacle,uv);
  s.isSolid = o.b>0.5; s.vel = o.rg;
  return s;
}
```

Porous drag is consumed in gradient-subtract's non-solid branch (the last
velocity write of the substep): `vel *= exp(-uGelDrag*o.a*uDt);`.
All consumers (divergence, jacobi, gradientSubtract, dyePost) swap their
`uLevel`+`uDynMask` bindings for `uObstacle`; `uLevel` stays bound where the
SDF itself is needed (actor collision, rendering). Net effect at 30 Jacobi
iterations is a measurable *speedup*; this refactor funds everything below.
Acceptance: pixel-identical behavior to v0.2 (gel input zeroed), confirmed by
the divergence/pressure debug views, at equal or better frame time.

## 20. Reactive gel

**Concept.** Where the red and blue dye species overlap, a gel field
precipitates: a translucent solid that dams flow, dissolves slowly, and erodes
under fast current. Players build temporary walls out of colliding streams —
and clog their own ducts if careless. Gel does NOT advect; precipitation
sticking in place is the mechanic.

Texture: `gel` R16F sim res, ping-pong. Update pass, once per substep, before
obstacle compose:

```glsl
uniform sampler2D uGel;
uniform sampler2D uDye;        // bilinear down-sample of dye res is fine
uniform sampler2D uVelocity;
uniform float uReactRate;      // ~3.0 /s per unit (r·b)
uniform float uDissolve;       // ~0.05 /s
uniform float uErode;          // ~0.01 per texel/s of speed
uniform float uDt;
void main(){
  float gel = texture(uGel,vUv).r;
  vec3  d   = texture(uDye,vUv).rgb;
  float spd = length(texture(uVelocity,vUv).xy);
  gel += uReactRate*d.r*d.b*uDt;
  gel -= gel*(uDissolve + uErode*spd)*uDt;
  fragColor = vec4(clamp(gel,0.0,2.0),0.0,0.0,1.0);
}
```

Reactant consumption (optional, default on): in dyePost, recompute the local
reaction and deplete: `float rx = uReactRate*dye.r*dye.b; dye.rb *= exp(-uConsume*rx*uDt);`
— keeps runaway gel growth self-limiting. Also clamp `dye.rgb = max(dye.rgb, 0.0)`
at the end of dyePost (needed by §22's negative-dye eating too).

Rendering: in composite, sample gel; below `uGelSolid` draw as a translucent
membrane (`mix(col, gelColor, smoothstep(0.15,0.6,gel)*0.5)` with a slight
refraction fake: offset the dye sample by gel gradient × 1 texel); above
threshold it is inside the obstacle render path already (it's solid).

Sub-threshold gel is *porous*: §19's drag term slows flow through it, so a
forming wall visibly strangles a jet before sealing — a readable tell.

Tuning entries: reactRate, dissolve, erode, gelDrag (~6/s), gelSolid, consume.
Acceptance: cross a red and a blue jet → a gel bar forms at the intersection
within ~2 s, upstream pressure visibly rises (debug view 2), flow reroutes;
stop one jet → the bar dissolves; sustained max-thrust player wake erodes a
channel through sub-threshold gel.

## 21. Media texture: spatially varying physics + dye-driven jets

One new static texture answers both "regions where the sim behaves
differently" and the refined siphon idea.

`media` RGBA16F sim res, painted at level load from a SECOND level canvas
(same pxRect tooling, its own color constants), default value (1,1,1,0)+(0,0):
wait — two vec2-worth of payloads are needed, so use TWO textures or pack:

- `media` RGBA16F: r = curl multiplier (0..4, default 1), g = velocity-
  dissipation multiplier, b = dye-dissipation multiplier, a = free.
- `ampField` RG16F: dye-driven jet vector — direction × gain, in
  texels/s² per unit dye luminance, default (0,0). Authored per-level as
  rect zones `{rect, angle, gain}` rasterized CPU-side into a Float32 array
  at load (no canvas needed; it is data, not art).

Consumption — three one-line edits and one new pass:
- vorticity: `force *= uCurlStrength * texture(uMedia,vUv).r * C;`
- advect (velocity): `exp(-uDissipation*texture(uMedia,vUv).g*uDt)`;
  advect (dye): same with `.b` — selected by the existing per-call uniform
  pattern (add `uniform float uMediaChan;` and a `mix`).
- New `ampForceFS` pass after vorticity, before divergence:

```glsl
uniform sampler2D uVelocity;
uniform sampler2D uAmp;
uniform sampler2D uDye;
uniform float uDt;
void main(){
  vec2 vel = texture(uVelocity,vUv).xy;
  float luma = dot(texture(uDye,vUv).rgb, vec3(1.0));
  vel += texture(uAmp,vUv).rg * min(luma,4.0) * uDt;
  fragColor = vec4(vel,0.0,1.0);
}
```

**Why amp zones are interesting:** the force is proportional to the dye that
is *currently there*, so a jet that receives dye throws it harder — feedback.
Aim one at your sink and it is an accelerator you must feed; aim one against
your flow and it is a self-arming repulsor that gets angrier the more you leak
into it. Two amp zones facing each other oscillate. This is the siphon idea
with the teleport replaced by honest momentum.

Cost: +1 fetch in two passes, +1 sim-res pass ≈ 2–3% of substep. Media zones
render as faint tinted field hatching in composite (sample `uMedia`, deviate
from (1,1,1) → tint) so physics regions are legible.

Acceptance: a curl×3 zone visibly shreds a laminar stream into eddies that
persist; a high-dye-dissipation zone acts as fog that thins passing dye; an
amp zone is inert until fed, then visibly kicks.

## 22. Predators and nests

**Predator (actor type 6):** an autonomous eddy-creature that swims up the dye
gradient and disperses what it reaches. It is a moving no-slip boundary (so it
physically shreds streams via its wake) and it actively eats dye. It is born
with a battery: thrust scales with remaining life, so it winds down like a
dying toy, drifts with the current it can no longer fight, and vanishes —
the existing TTL machinery (`r2.x`) already handles expiry.

Actor row usage for type 6: r1.y radius (~6), r1.z thrust scale, r2.x ttl
(set at spawn, e.g. 14 s), r2.w wander phase, r3.w = ttl0 (for life fraction).

Update-shader block (actorUpdate gains `uniform sampler2D uDye;`):

```glsl
if(type==6){
  vec2 pos = r0.xy, vel = r0.zw;
  float life = clamp(r2.x / max(r3.w,1e-3), 0.0, 1.0);
  vec2 h = 2.0*uSimTexel;                       /* gradient stencil: 2 texels */
  float dR = dot(texture(uDye,pos+vec2(h.x,0.0)).rgb, vec3(1.0));
  float dL = dot(texture(uDye,pos-vec2(h.x,0.0)).rgb, vec3(1.0));
  float dT = dot(texture(uDye,pos+vec2(0.0,h.y)).rgb, vec3(1.0));
  float dB = dot(texture(uDye,pos-vec2(0.0,h.y)).rgb, vec3(1.0));
  vec2 g = vec2(dR-dL, dT-dB);
  r2.w += 0.9*uDt;                              /* lazy wander when no scent */
  vec2 dir = length(g)>2e-3 ? normalize(g) : vec2(cos(r2.w), sin(r2.w));
  vec2 fluidUv = texture(uVelocity,pos).xy*uSimTexel;
  vel += (dir*uPredThrust*life + uDragK*(fluidUv-vel))*uDt;
  vel *= exp(-uLinDamp*uDt);
  pos += vel*uDt;
  /* wall resolution: same push-out block as the player (factor it into a
     GLSL function resolveWalls(inout pos, inout vel, radius) used by both) */
  r0 = vec4(pos,vel);
}
```

Eating: predators join splat target 1 (`writesTarget`: `type==6` for target 1)
and the dye-splat fragment branches: for type 6 output a NEGATIVE gaussian,
`vec4(vec3(-uEatRate*g*uDt*life), 0.0)`. dyePost's `max(dye,0)` clamp (§20)
makes this safe. Predators also join target 2 (boundary) so their wake is real.
They do not collide with the player (passing through a soft body reads fine);
revisit if playtests want body-blocking.

**Nest (actor type 7):** a static spawner glyph. Per Part I §2, GPU-initiated
spawning is out of scope — spawn timing is CPU-side, which is fine because
nests are static and the CPU knows their positions exactly. Level def:
`{type:7, pos, period, jitter, predTtl, predThrust}`. Per frame the CPU
decrements each nest timer; on expiry it writes a full predator record at the
nest position (absolute spawn path, both ping-pong copies) and re-arms
`timer = period*(1 + jitter*(rng()*2-1))` with a per-level-seed mulberry32 so
R-resets reproduce exactly. Nests render as a pulsing iris that contracts as
the timer approaches zero (CPU passes per-nest fraction via the existing
`cpuActors` → no new GPU state; a `uNestPulse` uniform per draw is acceptable
since nests are few — or simpler, encode timer fraction into the nest's r2.w
on each re-arm write and let the glyph read it; choose one and note it).

Tuning: predThrust (~0.45 UV/s²), eatRate (~3), predator count is implicitly
capped by the 64-slot table — nests skip spawning when freeSlots is empty.
Acceptance: a predator beelines to the densest stream, gouges a visible gap,
slows over its last ~4 s, drifts, vanishes; two predators do not stack
oscillating (the wander fallback decorrelates them); reset reproduces spawn
times.

## 23. Flux switches and generalized gates

**Sensor zones** claim the last regions channel: A = sensor (painted magenta
`#ff00ff` → R+B in the level canvas; extend the exclusive swizzle: r&&b →
sensor; note solid-R conflict is avoided because solids are pure red and the
swizzle keys on exact channel pairs — document the final color→zone table in
code).

**Metric:** instantaneous dye-flux through sensors, not cumulative:
one sim-res pass `sensorFS` → R32F scratch:

```glsl
uniform sampler2D uDye; uniform sampler2D uVelocity; uniform sampler2D uRegions;
void main(){
  float sensor = texture(uRegions,vUv).a;
  float luma = dot(texture(uDye,vUv).rgb, vec3(1.0));
  float spd  = length(texture(uVelocity,vUv).xy);
  fragColor = vec4(sensor*luma*spd, 0.0, 0.0, 1.0);
}
```

Reduction-chain scheduling (the chain is shared scratch): per frame run
(1) scoreAcc reduction → copy the 1×1 result into a dedicated `scoreOne` RT
(copy pass), (2) sensor reduction, (3) telemetry pass reads `uScoreOne` for
pixel 0 and the chain's 1×1 for pixel 1. Telemetry pixel 1 is hereby assigned:
**px1.r = sensor flux** (px1.gba reserved). CPU normalizes by emitRate, EMAs
(τ≈0.4 s), and drives gate logic.

**Generalized gates.** Replace the single `gatePhase` int with a named map:
level defines `gates:[{id, when:{kind:'trigger'|'sensor', threshold, releaseBelow?, holdSec?}}]`
and `paint(gateState)` receives `{id:boolean}`. CPU evaluates per frame with
hysteresis (`releaseBelow` defaults to 0.6×threshold) and a 0.5 s minimum
dwell to prevent thrash; any state change → `refreshLevelTextures()` (JFA
re-run is ~20 tiny passes; per-toggle is fine, but a closing wall stamps solid
over live fluid — already well-defined: dye decays inside, velocity stamps to
zero; verify no pressure pop in debug view 3).

Why this sings: sensor gates measure *throughput*, so a player can hold a door
open with their own wake while a fan does the real work elsewhere — or a level
can demand splitting one stream to feed a sensor AND a sink simultaneously.
Trigger gates (fill once, stays open) and flux gates (open only while fed)
compose into multi-stage locks.

Acceptance: a flux gate opens ~0.5 s after a stream crosses its sensor, shuts
(with dwell) when the stream is cut; the player circling fast through a sensor
alone can hold it open; a trigger+flux two-stage lock level is solvable.

## 24. Player spin (U/O) with emergent Magnus

State: r2.z = angular velocity ω (rad/s), r2.w = accumulated angle θ (for the
glyph). Both rows are free for the player. Input: U/O held →
`uSpinInput ∈ {-1,0,1}` uniform; in the player block:
`ω += uSpinInput*uSpinAccel*uDt; ω *= exp(-uSpinDamp*uDt); θ += ω*uDt;`
(uSpinAccel ~12 rad/s², uSpinDamp ~1.2 /s.)

**The real effect costs three lines in splatMask** — add rim velocity:

```glsl
  vec2 tang = length(vLocal)>1e-3 ? vec2(-vLocal.y,vLocal.x)/length(vLocal) : vec2(0.0);
  vec2 spinTex = tang * vR2.z * dTex;        /* ω · r  =  texels/s, CCW for ω>0 */
  fragColor = vec4((velTexels + spinTex)*cov, 0.0, cov);
```

Because the boundary now carries tangential velocity, the pressure solve
produces a real asymmetric field: a spinning player parked in a stream
*curves it* and feels lateral lift — Magnus, emergent, no force hack. This is
the showcase of the whole moving-boundary architecture; check it first in the
pressure debug view (asymmetric lobes), then by feel.

**Collision spin bias** (the requested fake, since actors are not rigid
bodies): in the player-vs-actor bounce, after the normal impulse add
`vT += uSpinKick * r2.z * rr * vec2(-nn.y, nn.x);` with uSpinKick ~0.04 and
sign chosen so CCW spin (ω>0) deflects the bounce clockwise around the
contact — verify sign empirically against the user's stated expectation and
expose uSpinKick (signed) in tuning. Optionally bleed ω by 20% per bounce.

Glyph: replace the single velocity tick with three radial ticks rotated by θ
so spin is visible at a glance; brighten with |ω|.

Acceptance: spin-up against a jet → measurable sideways drift; spinning
through still dye drags a visible rotational wake; bounces off a fan deflect
consistently with spin direction; zero-spin behavior is bit-identical to v0.2.

## 25. Rendering: dye-weighted curl tint + ambient schlieren

The v0.2 curl tint is applied uniformly; split it into two effects keyed on
dye luminance `L = dot(tonemappedDye, vec3(0.333))`:

- **Dye shimmer** (where dye IS): per-pixel hue rotation of the dye color by
  `uCurlTint * curl * k1 * smoothstep(0.05,0.4,L)` plus the existing additive
  highlight scaled by L — swirling dye iridesces; still dye does not.
- **Ambient schlieren** (where dye ISN'T): the medium itself made visible the
  way schlieren photography does — render
  `s = curl * (1.0 - smoothstep(0.0,0.25,L))`, mapped to a faint signed
  blue-grey shading (`col += vec3(0.10,0.13,0.18)*s*k2` for s>0, slightly
  warmer for s<0), optionally modulated by a subtle 2-texel directional
  derivative of speed for streaky structure. Result: invisible currents leave
  ghost-glass smears across the dark tank; dye arriving "develops" them into
  color. Both factors share the `uCurlTint` slider plus a new `uSchlieren`
  slider; both are composite-only (zero sim cost).

Acceptance: with dye fully dissipated, stirring with the player produces
visible glassy swirls; a dyed vortex visibly color-shifts across its arms;
setting both sliders to 0 reproduces v0.2-minus-tint exactly.

## 26. Configuration and quality management

**Config = named snapshot** `{name, ver:1, params:{...}, quality:"high"}`.
- Persistence: `localStorage["fluxroute.configs"]` (this is a standalone local
  HTML file, not a hosted artifact; localStorage is appropriate here).
- Panel additions: config dropdown, Save / Save-as / Delete, and Export /
  Import via a textarea holding JSON (clipboard-friendly; no file APIs
  needed). Unknown keys on import are ignored with a console note; missing
  keys take defaults (forward compatibility).
- **Per-level configs:** levels gain optional `config:{...}` partial
  overrides. Precedence at `loadLevel`: defaults → level.config → the user's
  active config *only for keys the user has explicitly touched this session*
  (track a `dirtyKeys` set; this lets a level demand high drag for a
  challenge while respecting the user's deliberate slider work). A "revert to
  level config" button clears dirtyKeys. Document this precedence in a panel
  tooltip; it is the only subtle part.

**Quality presets** (menu in the panel header): 
low = SIM 320×180 / DYE 960×540 / 20 Jacobi / 2 blur passes / gel off;
medium = 480×270 / 1440×810 / 24 / 4 / gel on;
high (default) = 480×270 / 1920×1080 / 30 / 4 / gel on;
ultra = 640×360 / 1920×1080 / 30 / 4 / gel on.
Changing quality requires reallocating every texture: refactor resource
creation into `createResources(q)` returning the texture/RT/chain bundle,
destroy the old bundle (`gl.deleteTexture/Framebuffer`), rebuild, then
`loadLevel(levelIdx)` (a full reset on quality change is acceptable and
honest). SIM/DYE must remain same-aspect with DYE = 3–4× SIM; assert the
ratio and derive the emission constant from it instead of the hardcoded 6.25
(it is `0.694·(3·ratio)²/ratio²·…` — derive once, comment the algebra).

## 27. Performance budget

Baseline v0.2 substep ≈ 37 sim-res passes (30 Jacobi) + 3 dye-res passes.
Deltas, at high preset:

| Change | Cost | Note |
|---|---|---|
| §19 obstacle compose | **−10–20% solve time** | 1 fetch vs 2 in ~120 solidAt calls; +1 tiny pass |
| §20 gel | +1 sim pass, +1 fetch in compose | net ≈ +3%, mostly repaid by §19 |
| §21 media + amp | +1 sim pass, +2 single fetches | ≈ +2–3% |
| §22 predators | actor-path only | ~0 (64 instances regardless) |
| §23 sensor + 2nd reduction | +1 sim pass + ~10 tiny passes + 1 copy | ≈ +2% |
| §24 spin | 3 lines in existing splat | 0 |
| §25 render fx | composite-only fetches | ~0 |

Aggregate ≈ net-neutral vs v0.2. Measure, don't trust: the stats line gains a
GPU frame-time estimate via `EXT_disjoint_timer_query_webgl2` **if present**
(optional — never required, never synchronous; fall back to rAF deltas).
If medium preset misses 60 fps on a 2020 iGPU, the knobs are Jacobi iters and
dye res, already preset-controlled.

## 28. Milestones (P2) and parallelization map

Dependencies: **P2-M0 → {M3,M4,M5}**, **P2-M1 → {M6}**, M2 independent.
A session should take one milestone; each lists its sections.

- **P2-M0** Foundation (§19, §26): obstacle compose; quality presets +
  resource rebuild; config save/load. ✓ pixel-identical sim (debug views) at
  ≥ v0.2 frame rate; quality switch round-trips; configs survive reload.
- **P2-M1** Live world (§18): states, controls, selection/rotation incl.
  emitters, sustained-capture win. ✓ acceptance list of §18.
- **P2-M2** Render fx (§25): split curl tint, schlieren. Independent — safe
  first task for a parallel session. ✓ acceptance list of §25.
- **P2-M3** Media + amp zones (§21) + one level using each. ✓ §21 list.
- **P2-M4** Gel (§20) + a level designed around damming ("Confluence").
  ✓ §20 list; frame-time delta ≤ +5%.
- **P2-M5** Sensors + gates (§23) + a two-stage lock level. ✓ §23 list.
- **P2-M6** Creatures + spin (§22, §24) + a nest-defense level. ✓ lists.
- **P2-M7** Content & balance: rework all levels for live-mode win
  thresholds (sustained-capture targets are NOT comparable to cumulative
  ones — re-tune every level), per-level configs as difficulty, ordering.
  ✓ a new player clears L1 < 2 min; every level solvable by author.

## 29. Invariant amendments (supersedes parts of §16)

1. All Part I invariants stand, with: zone color→channel table now
   green=sink, blue=drain, cyan=trigger, magenta=sensor (exclusive swizzle);
   telemetry px1.r = sensor flux; actor types 6 (predator) and 7 (nest)
   claimed; player r2.zw = spin ω/θ.
2. `solidAt` consumers must use the composed obstacle texture (§19); binding
   uLevel+uDynMask directly in a solve shader is now a defect.
3. Predator/nest spawning is CPU-timed (seeded RNG) through the existing
   spawn paths — GPU-initiated spawning remains out of scope.
4. dyePost must clamp dye non-negative (negative-splat eating depends on it).
5. The win signal is captureEMA from telemetry; no new readback paths. The
   readback rules of §10.2 remain absolute.

---
---

# PART III — Ludology: catalog, grammar, progression (v0.4 plan)

The engine is feature-complete enough that the bottleneck is now design.
This part works at the verbal/conceptual level first (§30–§33), then specs the
presentation and physics features that the progression requires (§34–§36).
Level *design* (geometry, tuning) deliberately does not happen here.

## 30. The catalog: nouns and verbs

**Substances.** RED cargo (the only thing that scores; only the level emits it
— red is the level's gift and the player's responsibility). BLUE builder
(R+B → gel: walls you grow). GREEN reagent (R+G → blast: walls you refuse).
B+G remains unassigned — a held note for a mid-game reveal.
GEL: porous→solid, dissolves, erodes under flow. The player's only way to add
matter to the world, and it's made *of* their cargo.

**Player verbs.** Swim (wake as tool); spin (Magnus steering, gel erosion,
sensor-feeding — now metered by a spin budget §36); place / rotate / delete
fans and B/G emitters; collect pickups (§32); destabilize-style pulses when a
level grants them.

**World nouns.** Sinks (score), drains (void), trigger gates (latch open),
flux gates (held open by throughput), sensors, pistons (now springy bodies
§36), predators (now suction bodies §36) + nests, media zones (storm / fog),
amp zones (red-powered jets), fixed hostile emitters (a locked blue jet across
a corridor is a wall that only exists when you're careless).

**Hidden verbs the systems already imply** — these are the design budget:
gel-then-erode (temporary valves); blast-steering (green as a thrown bend);
self-priming amps (feed a jet to arm it); starving a predator (cut the red it
hunts and it wanders off); wake-keying (spin in a sensor to hold a gate);
sacrificial red (triggers consume cargo — every lock has a price).

## 31. The grammar: how pieces compose into puzzles

A good level is a sentence: one *subject* (the new idea), one *verb* (what the
player must do with it), and at most one *complication* (a known idea
re-contextualized). Three escalation patterns cover nearly everything:

1. **Tool → Obstacle → Resource.** Introduce a thing as the player's tool;
   later make it the enemy; finally make it scarce. Gel: build a dam → a fixed
   blue jet gels YOUR stream → only one blue emitter and two gaps.
2. **Static → Conditional → Hostile.** A mechanism first sits still, then
   responds to the player, then acts on its own. Gates: open wall → flux gate
   you must feed → a gate a *predator's* suction keeps slamming shut.
3. **Single → Chain → Loop.** One mechanism; a causal chain (the maze example:
   fan → red onto a trigger → gate opens → REACH a green-emitter pickup →
   place it at the source → blast carries red home); then a feedback loop
   (amp zone feeds a sensor that opens the gate that feeds the amp zone).

**Narrative spine** (light-touch, told in overlay text, never cutscenes): you
are a maintenance organism in a derelict fluidics computer. The red flux is
its lifeblood; sinks are starving organs. Acts: I "Circulation" (move/place),
II "Chemistry" (B/G, gel, blast), III "Signals" (triggers, sensors, amps —
the machine starts responding), IV "Infestation" (predators, hostile
emitters, scarcity, pickups deep in danger), V "The Core" (everything, plus
the B+G reveal). The attract level is the machine dreaming.

## 32. Pickups (new actor type 8)

A static, non-colliding item the player touches to collect: grants +N to a
tool budget (fan/blue/green). Diamond glyph in the species' display color.
CPU detects overlap via telemetry (player pos vs known static pickup pos) and
retires the slot — no new GPU paths. Pickups are the progression's currency:
they let a level *withhold* a tool until a sub-puzzle is solved, which is what
makes causal-chain levels (§31.3) possible. Later variants (same machinery):
spin-budget refills, pulse charges.

## 33. Progression concepts (verbal only — design happens later)

Act I — L01 "First Light": red, sink, open water; swim it home. L02 "Lean on
the Wall": one bend; first fan. L03 "Headwind": fan placement vs a drain's
pull; teach rotation. L04 "Three Hands": fan budget < problem size; teach
delete/refund.
Act II — L05 "Mortar": first blue; dam a leak. L06 "The Allergy": fixed blue
jet across the duct; route around what gels you. L07 "Kick": first green;
throw red around a corner. L08 "Controlled Burn": green placed too close
wastes cargo; teach standoff distance (exoConsume as tax).
Act III — L09 "Toll Gate": trigger gate; sacrifice red to proceed. L10 "Keep
Talking": flux gate; split your stream to hold it open. L11 "Self-Starter":
amp zone you must prime. L12 "The Long Hall" (the maze, §31.3): trigger →
gate → green pickup → blast home.
Act IV — L13 "Mouths": first nest; predator suction steals your stream;
starve or outrun it. L14 "Shepherd": two nests, spin budget matters; body-
check predators (mass collisions) off your line. L15 "Quartermaster": almost
no starting tools; pickups guarded by pistons.
Act V — L16+ : combination finals; B+G unveiled (design TBD — candidates: a
catalyst that locally multiplies amp gain, or an anti-gel solvent).
Each concept ships with its one-sentence overlay texts before any geometry
is drawn. Capture targets stay generous through Act II (≥ teaching, < testing).

## 34. Presentation layer

**Attract mode** = a level with no zones, no player, no HUD: opposed red
jets colliding in a curl-storm, green rising into the melee (sparkle), blue
wisps gelling and eroding, one lazy nest. Start menu overlay: title, PLAY,
OPTIONS. **Options menu**: quality preset (reload semantics), link to the
tuning panel (kept, as the dev/debug surface). ESC returns to the menu from
play. **Text overlays**: per-level `messages:[{t,dur,text}]` on the sim
clock, plus transient toasts (pickups, etc.). All DOM — zero GPU cost, easy
to localize, easy to author at the verbal stage (§33 texts drop straight in).

## 35. Physics upgrade specs

**Mass-based collisions.** Player, pistons, predators are dynamic bodies with
per-type masses (tunable); fans/emitters are immovable (effective mass 1e5).
Each dynamic actor resolves against all others in its own update thread with
mass-weighted separation and the standard restitution impulse
j = −(1+e)·rel/(1/mA+1/mB); both parties compute the same contact from the
same pre-update table, so impulses are symmetric without communication.
Player keeps its spin-kick term on top.

**Spring pistons.** Pistons stop teleporting along their path: the path point
becomes a *target*; the piston is a body with velocity, pulled by a damped
spring (k, c tunable), so it can be deflected, shoves the player with real
momentum, and recovers. Mask splat already consumes its true velocity.

**Predator suction.** Predators join the force splat with a radial inward
field (∝ life, reach 3× radius): roving velocity sinks that bend streams into
their mouths before eating the dye — and now body-check the player.

## 36. Spin budget — SUPERSEDED by §46 (spin tiers); do not implement

Per-level metered spin: seconds of applied spin input (default generous, 30 s;
`level.spinBudget` overrides; slider-tunable). Consumed only while U/O is held;
HUD shows remaining. Rationale: spin is the most powerful free verb (Magnus,
erosion, sensor-feeding); a soft meter turns it from an exploit into a spend.

## 37. Species-dependent physics: how "dye color dependency" is realized

This is an abstraction layered over the physics, and it must be legible to any
session (human or LLM) touching the sim. The contract:

1. **The dye texture's channels ARE the species concentration fields**:
   r = cargo (red), g = reagent (green), b = builder (blue). Pure unit
   vectors at emission; display colors exist only in `speciesToDisplay()`.
2. **A "color-dependent" physical property = a per-species coefficient
   vector** (`uniform vec3`, in channel order r,g,b) combined at a physics
   touchpoint via the shared `speciesMix` function:
   `w = d/Σd; coeff = mix(1.0, dot(w, coeffVec), saturate(2·Σd))` —
   neutral in clear water, fully composition-weighted in dense dye, linearly
   blended between (so a faint wisp barely changes physics).
3. **Current touchpoints** (each samples dye once): velocity-advection
   dissipation × `uViscMul` (the viscosity analog: blue < red < green) and
   vorticity gain × `uCurlMul` (syrupy green also resists swirling).
4. **To add a new species-dependent property**: pick the consuming shader,
   add a vec3 uniform + one `speciesMix` line; add the JS param triplet
   (`fooRed/fooGreen/fooBlue`), uniform set, sliders, tooltips. Never branch
   on "color" anywhere else; never let display constants into physics.

## 38. Dynamic walls

A second solid source besides the SDF: `walls` (R16F ping-pong, sim res).
Sources: per-level `removableWalls` rect seeds (loaded once, NOT re-stamped on
gate repaints, so player edits survive), plus player painting — timed budgets
(`wallAdd`/`wallErase` seconds) granted by pickups, spent while holding F with
the wall tool selected (keys 4/5), brush at the ghost arm. Consumers:
obstacleCompose (fluid sees walls; body velocities may still override),
`resolveDynamic` in the actor shader (4-probe normal estimate + restitution
bounce — deliberately simple; ALSO treats solid-threshold gel as collidable),
and composite (panelled slate + cyan seam = the removable affordance;
immutable SDF walls stay dark with the blue rim). Erasure only touches this
field — immutable geometry cannot be dissolved by construction.

## 39. The exothermic curve (stagnation detonation)

Raw product P = R·G is multiplied by a stagnation factor
`stag = 1 + stagBoost·exp(−(spd/stagSpeed)²)` — mixing streams that SLOW
become hot — and the force follows the gradient of the saturating curve
`f = log(1 + exoKnee·P·stag)/exoKnee`: steep at low concentration (visible
onset), logarithmic above (no screen-wide blowup). Consumption uses the
stagnation-boosted product linearly, so the BAM also burns the reagents.

## 40. Wake couplings

The predator wake field now modifies: velocity dissipation (+`wakeDiss`·w,
velocity advection only), vorticity gain (×(1 + `wakeCurl`·w): haunted,
churning dead water), and the composite murk. Decay stays knee-gated
(plateau `wakeSlow` above `wakeKnee`, fast `wakeFast` below).


---

# ADDENDUM v0.5 — Signals, Demolition, and Tiers
*(sections 41–49; written as-built. Supersedes: §36 entirely; amends §32, §34.)*

## 41. Switch system (replaces gates wholesale)

The legacy trigger/sensor gates and their painted TRIG/SENSOR zones are gone
from levels; the zone colors retain their dyePost semantics but nothing
paints them. Switches are the single conditional-logic primitive.

**Schema:** `switches: [{ id, rect:[x0,y0,x1,y1], kind:"volume"|"flow"|"pressure",
latch:"static"|"dynamic" (flow only), threshold, holdSec, mask:[r,g,b],
inhibit:bool, targets:[{id, invert}], wires:[[[u,v],...],...] }]`, max 8.

**GPU sensing (`switchSenseFS`, 8×1 RGBA16F ping-pong `swState`):** one
fragment per slot; state = (x: bank/instant, y: hold timer, z: latched,
w: instant flux). Per frame (uDtF = steps·DT), each slot samples a 12×8 grid
over its rect:
- *volume* (mask.w=0): bank += mean(dot(dye.rgb, mask))·dt; latches at
  threshold.
- *flow* (mask.w=1): timer += dt while mean ≥ threshold, decays at 2× below
  0.8·threshold (hysteresis); static latch sets z when timer ≥ holdSec.
- *pressure* (mask.w=2): frame MAX of |pressure| over the grid → x; latches
  at threshold. Max, not sum/min: a blast front touches only part of a
  boundary at peak. |p| catches compression and suction lobes both.

**Readback:** telemetry PBO widened to (TELEM_W+8)·16 bytes; `kick()` issues
a second `readPixels` from `swState.read.fbo` at byte offset TELEM_W·16.
`lastTelem[(TELEM_W+i)*4 ..]` carries each slot.

**CPU (`evalSwitches`):** on = latched ∨ (volume/pressure: bank ≥ threshold;
flow: timer ≥ holdSec). Flips fire `switch:ID:on|off` events, call
`setTargetEnabled` per target, and trigger `refreshLevelTextures()` so
`paint(state)` re-rasterizes doors (existing gate machinery, state keyed by
switch id). `sw.inhibit && on` ⇒ `winInhibited`: win timer gated, HUD shows
"⚠ FLOW FAULT". Targets resolve by actor `id` (cpuActors spread preserves
level fields): type 7 → `dormant` flag (updateNests skips), types 2/3 →
strength stashed in `_orig`, written 0/restored.

## 42. Wires & gauges overlay

DOM 2D canvas `#ovc` styled identically to `#gl` including the portrait
rotation, so its local coordinate frame is always the landscape sim frame.
Redrawn per frame: per switch a ring gauge at rect center (fill = bank/thr
or timer/holdSec, tinted by mask; outer ring solid = latching, dashed =
dynamic/forgets) and wire polylines (authored point lists, rendered only):
dim slate OFF; ON cyan with marching dash (lineDashOffset = −simTime·30);
inhibitor wires amber. **Settled switches** (`_latched`: any permanent latch)
draw at 22% alpha in gray and their wires vanish — the eye is released once
a fact stops being able to change.

## 43. Events & callouts

`events: [{ on, once, do:[{pulse},{setParams},{callout}] }]`. Conditions:
`time>=N`, `capture>=X`, `switch:ID:on|off` (string-matched; compiled at
loadLevel). `pulse` rides the existing fluxPulse machinery; `setParams`
mutates params + syncs sliders (level reload rebuilds from defaults, so the
change is level-scoped for free); `paint`-primitive actions remain SPEC.

Callouts (`callouts: [{t|on, dur, text, textTouch, at:[u,v], size}]`) render
in a fixed DOM layer: banner style when unanchored, anchored chips tracked
per frame through `uvToScreen` (letterbox + portrait aware — the inverse of
the input mapping). Legacy `messages` path still works in parallel.

## 44. Dynamite (B+G v2; supersedes the bead experiment)

History: gradient-compaction "beads" + ternary exo boost shipped, played,
underwhelmed, removed. Current system:

**Field:** `dyn` (SIM-res R16F ping-pong). Per frame:
`dyn += dynForm·smoothstep(0.06,0.30,min(g,b))·dt − dynBurn·dyn·trig·dt`,
trig = smoothstep(0.55·dynTrigger, dynTrigger, r), clamped [0, 1.5].
Conversion consumes g and b in dyePost (0.6·form·dt each).

**Detonation:** reactForce adds `−0.5·∇(dyn·trig)·dynForce·dt` (4-tap
gradient, same stencil as exo). **Chains:** a burning charge *releases* red:
`dye.r += dynBurn·dyn·trig·(dynRed − 0.35)·dt` — net-positive by default, so
the blast advects fresh trigger into adjacent charges. dynRed is chain gain,
dynBurn chain speed, dynForce the gap a chain can jump. Self-limiting: the
charge field is the fuel.

**Solidity:** `hardAt` (body collision) treats dyn > 0.6 as wall. KNOWN GAP:
the flow itself does not see charges (no porous drag, no obstacle-compose
contribution); the blast dominates perception, but damming gameplay needs
the obstacle pass extended.

**Visuals:** composite renders packed amber grain above 0.04, white-hot
additive flash ∝ dyn·trig while firing.

## 45. Blast-destructible walls

Not a new system: a `kind:"pressure"` switch (§41) wired to a wall segment
in `paint()` — `if (!gs.D) pxRect(SOLID_C, ...)`. The threshold is the
wall's armor rating; the gauge ring is a diegetic pressure dial that blips
on near misses (the calibration instrument). Permanent latch ⇒ rubble stays
rubble and the gauge fades per §42. Demo: T7 bottom-passage plug, threshold
60 (UNCALIBRATED — pressure magnitude depends on dynForce and RES_SCALE).

## 46. Spin tiers (supersedes §36 spin budget)

Budget machinery deleted (param, level fields, HUD seconds, depletion).
Physics: ω' += input·spinAccel·dt; ω·= exp(−D·dt) ⇒ terminal ω_max =
spinAccel/D. Effective D = spinDamp · SPIN_TIER_DAMP[tier], table [8,4,2,1]:
the old default damp is now the tier-III motor; base spin is ¼ of it.
Pickups `gives:"spin1".."spin3"` raise the tier monotonically per level
(reset on load). Pickup glyphs carry tier in record f[6] (vR1.z): tier > 0
throbs (radius + red flush, amplitude and frequency scale with tier). HUD:
`spin base|I|II|III`.

## 47. Placeable amp zones — REMOVED in v0.6 (see §52); amps are level fixtures only

`TOOLS` gains `{key:"amp", type:11}`; pickups `gives:"amp"` feed
`budget.amp`. Amp rasterization extracted to `refreshAmps()` which rasters
`level.ampZones ⊕ placedAmps` (runtime list, reset on load). Desktop: press
places a 0.13×0.10-UV zone (gain 800) and live-aims while dragging (angle =
atan2 to cursor; texture re-uploaded every 4th frame), release commits.
Touch currently places at angle 0 — drag-aim on touch is an open TODO.

## 48. Tunable emitters

Schema: `tunable: true, minStrength, maxStrength` (defaults 80/1500), valid
alongside `locked`/`rotatable`. Desktop: hovering a selected tunable actor,
wheel multiplies strength ×1.08/0.926 within bounds. Touch aim mode: finger
distance maps linearly to strength over physical 0.3..GHOST_ARM while angle
tracks direction — one gesture, two dials. Selection guard widened:
locked-but-tunable actors are aimable.

## 49. Presentation amendments (amends §34)

- **Win zone:** diagonal wave removed. Whole-region temporal pulse
  (pow(sin(uPulsePhase),2.2) from darkness; CPU already scales beat rate
  with flow, amplitude scales with uSinkHeat). White absorption halo on the
  zone rim where red is present (region-mask neighbor min). Over threshold,
  `sinkHueDrift` accumulates CPU-side ∝ flow and rotates the sink color
  around the luminance axis (Rodrigues) — the rainbow starts at the crossing
  color and walks; decays when capture drops.
- Pistons render as stroke-axis-aligned squares (collision still circular,
  radius r — imperceptible at game scale).
- Exo defaults retuned from play: exoForce 17745, exoKnee 0.45, stagBoost
  33.9, stagSpeed 27.3, exoConsume 0.3 (log-slider read-offs interpreted as
  exponents). playerMass 1.5, restitution 0.9.
- Menu: corner credits (Dobryakov link lower-left; "made with FABLE"
  lower-right, animated gradient clip); `#menuWash` 15%-black div tracked to
  the attract level's media-zone rect via uvToScreen.

## 50. Status ledger (v0.5)

IMPLEMENTED: switches (3 kinds, masks, inhibitors, targets, wires, gauges,
latch fade) · events (time/capture/switch → pulse/setParams/callout) ·
callouts (anchored, device-aware) · dynamite + chains + blast walls · spin
tiers · placeable amps · tunable emitters · win-zone viz v2 · mobile control
suite (aim, twist-spin, paint, win-advance).

SPEC'D, NOT BUILT: matter wells (extant-sum invariant; needs field-sum
telemetry) · flow lanes (RG force field + drag gesture) · event paint
primitives · charge flow-porosity (§44 gap) · touch amp aiming · entity
deletion gesture.

NEEDS PLAY CALIBRATION: switch thresholds (T5: 0.8 vol / 0.06 flow; T7:
0.05 flow / 60 pressure) · dynRed/dynBurn/dynForce chain feel.

DESIGN BACKLOG: stage-3 cull of the 61 associations → motif seed table ·
per-epoch level sessions · per-level param overrides as self-contained
level files (user's IDE split).


## 51. Wells & flow lanes (closes the §50 "spec'd, not built" pair)

**Storage:** lanes live in the matter texture's free channels — `dyn` is now
RGBA16F: r = dynamite charge, gb = lane unit direction. This dodges the
composite's exhausted 16 texture units (one bind serves both systems);
dynUpdate passes gb through, lanePaint preserves r.

**Lane painting:** `lanePaintFS` writes a capsule along each drag segment
(uSegA→uSegB, width laneBrush·RES_SCALE) with the CPU-side tangent — an EMA
(k=0.45) of physical-space drag deltas, ≈3-sample smoothing. Last-written-
wins: repainting redirects. Force: `vel += dyn.gb · laneForce·RES_SCALE · dt`
in reactForce, pre-projection like fans/amps. Composite renders teal chevron
bands marching along the direction (aspect-corrected dot, −uTime phase).

**Wells (extant-material invariant):** per frame, `matPackFS` packs
(walls.r, min(|lane|,1)) at SIM res; the existing reduceChain sums it; a
copy lands in a 1×1 F32 `matSum`; the readback gains a third readPixels at
offset (TELEM_W+8)·16 (telemetry now TELEM_W+9 px). CPU converts to
reference-resolution pixels (÷RES_SCALE²) so well capacities are
quality-preset-invariant. Paint permitted while used < `wells.{slate,lanes}`;
erase always free — refunds are exact by construction, ~2-frame readback
latency permits a few px of soft overshoot (accepted). Half-float reduce
precision degrades above ~10k texels coverage (few-% granularity; accepted).

**Consequence discovered in implementation:** level removableWalls
rasterize into the same walls field, so they count against the slate well
and erasing them refunds the player — matter harvesting is now a mechanic,
and the legacy dissolver-seconds budget is deleted (budgets.wallAdd/
wallErase gone; T-06-style level converted to `wells:{slate:450}`).

**Tools/IO:** TOOLS + LANE+/LANE− (type 12), digits 5–8, touch toolbar
rebuilt (also fixes a stale-index bug from the amp insert that mislabeled
W+/W− on touch). Shift+right-drag erases the selected paint material;
shift+left paints; touch uses the double-tap-arm gesture for all four paint
tools. Pickups: gives:"slate"/"lanes" add `count` px to the well. HUD shows
used/capacity per material; GUI budget folder gains amp + well capacities.

**§50 ledger deltas:** wells, lanes → IMPLEMENTED. Still open: event paint
primitives, charge flow-porosity, touch amp aiming, entity deletion gesture,
calibration debt (+ laneForce 700 and well sizes now join it).


## 52. Tool consolidation (v0.6)

The amp placement item is deleted (§47 superseded): amps are level fixtures
only — placeable matter is walls and lanes, full stop. The paint tool pairs
collapse to single tools: **WALL** (key 4) and **LANE** (key 5); shift+left
paints, shift+right erases. Touch, lacking a right button, gets an erase
toggle (⌫) on the toolbar that flips the armed paint mode. canPlace no
longer consults budgets for paint tools (the well gate lives in the
executor). Well-capacity pickups confirmed in: `gives:"slate"|"lanes"`,
`count` = pixels added.


## 53. Editor, serialization, zone unification, per-pixel demolition (v0.7)

**fluxLevel v1 serialization:** levels as data — polys (solid / removable /
slate / sink / drain / media / flow / door) + actors + switches + events +
callouts + wells/budgets/config. `dataLevel(d, extra)` wraps data into a
LEVELS-compatible object (paint() generated from polys via pxPoly; CPU
point-in-polygon raster fills the walls field, media texture, and lane
buffer at load). `extra` merges declarative source-code additions on top of
a serialized level. Exposed as `window.fluxLevelFromJSON`.

**Zone unification:** ampTex, refreshAmps, and the uAmp pathway are DELETED.
"flow" polys and legacy `ampZones` both rasterize into dyn.gb (direction ×
strength) with dyn.a = red-powered flag; reactForce applies one term:
`gb · laneForce · mix(1, min(red,4), a)`. dynUpdate and lanePaint pass the
other's channels through. Composite tints powered chevrons amber, plain
teal. One buffer is the in-level truth; polygons are the design/serialization
truth; the rendering layer stays distinct for legibility.

**Per-pixel destructible slate (`wallErodeFS`):** one SIM-res pass per
frame: a walls-field boundary pixel (any 4-neighbor < 0.5) dies when the max
|pressure| beside it exceeds `wallTough` (default 90, log slider). Feasible
because the slate field drives physics directly (no SDF rebuild) — blasts
carve craters; the wells invariant refunds eroded player matter
automatically. Immutable (SDF) walls remain blast-proof; pressure-switch
walls remain the authored binary option.

**Editor (v1):** menu → EDITOR; live sim, win disabled. lil-gui panel:
select/entity/polygon modes, per-type entity property folders (writeActor on
change), drag-move, Delete key, polygon vertex clicking with kind-specific
properties, player-start placement, export (JSON + clipboard) / import via
#ioBox overlay, exit. Editor state serializes through snapshotActors()
(runtime keys stripped). Known v2 items: switch/event/callout editing UI,
touch editor, poly vertex editing after commit.


## 54. Steel (v0.7.1)

Walls field is now RG16F: r = slate (soft; wallErode applies), g = steel
(hard; erosion passes it through untouched). Steel is a full player
material: STEEL tool (key 5), its own well (matPack B channel → third
matter-sum component), pickups `gives:"steel"`, "steel" polys in fluxLevel,
editor kind + tint. Solidity sites (flow solidAt, body hardAt) take
max(r,g); composite renders slate as cyan-seamed panels, steel as riveted
gunmetal. wallPaint gained uPaintChan. Slate keeps its name and becomes the
canonically destructible species per author direction.


## 55. Editor v1.1 (sandbox ergonomics + full serializability)

Rectangle mode (drag-commit, axis-aligned polys); resolution-independent
480x270 snap grid (toggle + Alt bypass); gel/dynamite poly kinds rasterizing
into their fields at load (amount per poly); switch authoring as rectangle
kind "switch" (id auto A.., kind/threshold/holdSec/latch/mask/inhibit from
panel; targets/wires by id in JSON); auto-wires: a switch with actor-id
targets and no authored wires renders a straight runtime wire; hover
crosshair + rect preview in the overlay; tuning panel reachable from the
editor; export embeds config = diff(params, DEFAULT_PARAMS) so tuned physics
travels with the level; touch routes single-finger input through the shared
pointer functions (mobile editing v1). Events/pulses confirmed serializable
as-is (string conditions -> action lookup); dataLevel(json, extra) is the
escape hatch for non-serializable logic.


## 56. Editor v1.2 (switch effects, undo, win rename, tooltips)

Target schema extended: {id|poly, action: enable|disable|delete|modify,
state?, invert?}. setTargetEnabled: delete frees the actor slot when fired;
modify stashes touched keys in c._saved, Object.assigns state while ON,
restores on release; poly targets (removable/slate/steel, auto-id "P"+idx)
cut once via wallCutFS (mask raster -> maskTex scratch -> per-channel
multiply on the walls field). Editor: clicking a switch in select mode opens
a live condition folder + target builder (entity/wall dropdown, action,
modify angle+strength). Poly kind "win" replaces "sink" in the editor;
"sink" stays a loader alias. Undo: 40-deep JSON snapshots of editData,
pushUndo() before every structural mutation, Ctrl+Z + panel button. All
editor controllers get mouseover tooltips via a property->text walk after
build. Known limit: modify captures angle+strength only (richer states via
JSON); per-property entity edits are not undo-tracked.


## 57. Game window + window-relative grid (v0.7.3)

GW global from L.size (small/medium/large/full -> 1/3, 1/2, 3/4, 1 centered).
Loader auto-paints SOLID outside the window after L.paint; composite gets
uWin and renders outside as dark backdrop + sdBox frame line (skipped at
full). layoutChrome() positions #hud above and #toolbar below the window's
screen rect (resize-aware; portrait keeps defaults). Editor: size in the
level folder (rebuild on change), serialized through dataLevel. Grid
redefined: gridDiv = N square subdivisions of the window short axis
(slider 4..100, default 24), lattice anchored at the window corner, clamped
to window bounds (ragged long-axis cells land on the edge), and rendered
faintly in the editor overlay while snap is on. Fixes the perceived
whole-canvas snap anchoring; grid is now visibly window-true.


## 58. Tutorial sequencing layer (v0.7.4)

E1-T0 lands as LEVELS[0]: editor-exported JSON wrapped in dataLevel(json,
{events}) — the canonical serialize-then-extend workflow. Events gained `at`
time sugar (compiles to time>= condition) and actions enable/disable (by
actor id, via new setActorEnabled — also the switch-toggle path now) and
emphasize ({id|poly|at, dur, level}): per-frame target resolution (tracks
telemetry), expanding rings for circles (glyph-radius origin), shadowBlur
border pulses for polys; high level = 2 rings, warm palette. Actors carry a
serialized `enabled` flag: loader applies at placement, editor checkbox
(fans/emitters/nests), snapshot exports true strength when disabled.
Callouts: markup (*title* shimmer gradient, ~soft~), CSS enter/exit fades
(.show/.fading), innerHTML with escaping. Aesthetic: cyan regular, amber
high, both on the overlay canvas.
