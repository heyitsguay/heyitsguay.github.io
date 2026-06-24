# FLUX ROUTE — Shader-Based Game Architecture

> Last updated: 2026-06-24

## Design Philosophy

FLUX ROUTE runs its entire game world — physics, AI, chemistry, scoring — in GPU fragment shaders. The CPU orchestrates passes and reads back a thin telemetry slice for HUD/win-condition logic. This document maps every GPU buffer, every shader pass, the data that flows between them, and the CPU↔GPU boundary.

**Why shaders for game logic?** A fluid sim already demands per-pixel GPU work. By encoding game entities, reactions, and scoring into the same pipeline, we avoid CPU↔GPU round-trips and get O(resolution²) parallelism for free. The tradeoff: debugging is harder, and all game state must fit in texture formats.

---

## 1. Buffer Atlas

Every piece of game state lives in a GPU texture. The simulation grid runs at `SIM_W × SIM_H`; dye runs at the higher `DYE_W × DYE_H`. The actor table is a special 64×4 RGBA32F texture.

### 1.1 Simulation-Resolution Buffers (SIM_W × SIM_H)

| Buffer | Format | Ping-Pong | Channel Layout | Written By | Read By |
|--------|--------|-----------|----------------|------------|---------|
| **velocity** | RG16F | ✓ | RG = field velocity (sim texels/s) | advect, vorticity, reactForce, gradSub, splatForce | advect, curl, divergence, gelUpdate, actorUpdate, composite |
| **pressure** | R16F | ✓ | R = pressure iterate | jacobi, copy(warmStart) | jacobi, gradSub |
| **divergence** | R16F | ✗ | R = ∇·v | divergence | jacobi |
| **curlTex** | R16F | ✗ | R = ∂v/∂x − ∂u/∂y | curl | vorticity, composite |
| **level** | RGBA16F | ✗ | R = SDF (+ in fluid, − in solid), GB = gradient | JFA pipeline (at load) | actorUpdate, obstacleCompose, dyePost, composite |
| **obstacle** | RGBA16F | ✗ | RG = boundary velocity (texels/s), B = solid flag, A = porous gel drag | obstacleCompose | advect, divergence, jacobi, gradSub, reactForce (via `solidAt()`) |
| **gel** | R16F | ✓ | R = gel concentration (0–2) | gelUpdate | obstacleCompose, actorUpdate, dyePost, composite |
| **walls** | R16F | ✓ | R = log(pressure threshold); >0 erodible, <0 indestructible, 0=empty | wallPaint, wallErode, wallCut | obstacleCompose, actorUpdate, dyePost, composite |
| **dyn** | RGBA16F | ✓ | R = dynamite charge, G = flow-X, B = flow-Y, A = powered(flow)/rate(mult) | dynUpdate | obstacleCompose, actorUpdate, reactForce, dyePost, composite |
| **wake** | R16F | ✓ | R = predator wake intensity | wakeUpdate, splatWake | advect(vel), vorticity |
| **dynMask** | RGBA16F | ✗ | Actor boundary coverage (cleared each substep) | splatMask | obstacleCompose |
| **regionsTex** | RGBA8 | ✗ | R = sink, G = drain, B = trigger, A = sensor | CPU upload (refreshLevelTextures) | dyePost, scoreAccum, composite |
| **mediaTex** | RGBA16F | ✗ | R = curl mul, G = velDiss mul, B = dyeDiss mul, A = temp zone target (−1 = none) | CPU upload | advect, vorticity, dyePost |
| **scoreAcc** | F32¹ | ✓ | R = accumulated red delivery | scoreAccum | reduce chain → telemetry |
| **matPackRT** | RGBA16F | ✗ | R = soft wall px (sand+slate), G = lane px, B = concrete px, A = steel px | matPack | reduce → matSum |

¹ F32 = RGBA32F normally, RGBA16F on half-float fallback devices (with `SCORE_SCALE = 1/64` compensation).

### 1.2 Dye-Resolution Buffer (DYE_W × DYE_H)

| Buffer | Format | Ping-Pong | Channel Layout |
|--------|--------|-----------|----------------|
| **dye** | RGBA16F | ✓ | R = red (cargo), G = green (reagent), B = blue (builder), A = temperature |

The dye texture is the richest single buffer: three independent chemical species plus a temperature field, all advected together. Temperature (`.a`) drives viscosity, reaction rates, gel melting, dynamite detonation, and visual tonemap.

### 1.3 Actor Table (64 × 4 pixels, RGBA32F)

Each column is one actor slot (0 = player, 1–63 = entities). Each row stores 4 floats:

| Row | .x | .y | .z | .w |
|-----|----|----|----|----|---|
| **0** (r0) | pos.x (UV) | pos.y (UV) | vel.x (UV/s) | vel.y (UV/s) |
| **1** (r1) | type | radius (sim texels) | strength/param | angle/param |
| **2** (r2) | ttl (−1=immortal) | flags/enabled | varies by type | varies by type |
| **3** (r3) | varies by type | varies by type | varies by type | varies by type |

**Row 2–3 vary by type:**

| Type | r2.z | r2.w | r3.x | r3.y | r3.z | r3.w |
|------|------|------|------|------|------|------|
| 1 (player) | spin ω | spin θ | — | friction heat | — | — |
| 3 (emitter) | dye.g | dye.b | dye.r | — | — | — |
| 5 (piston) | omega | phase | — | home.x | home.y | — |
| 6 (predator) | dye.g | wander heading | vortex spin (±1) | — | — | ttl₀ |
| 7 (nest) | — | arm frac | — | — | — | — |
| 8 (pickup) | species.r | species.g | species.b | — | — | — |

**Type codes:** 0=empty, 1=player, 2=fan, 3=emitter, 5=piston, 6=predator, 7=nest, 8=pickup, 10=tempEmitter

### 1.4 Small Buffers

| Buffer | Size | Format | Purpose |
|--------|------|--------|---------|
| **swState** | 8×1 | RGBA16F, PP | Switch sensor state: (bank, hold timer, latched, instant flux) |
| **telemetry** | 66×1 | RGBA32F | Gathered readback data: score + sensor + all actor row 0 |
| **scoreOne** | 1×1 | RGBA32F | Reduced score total |
| **sensorRT** | SIM | F32¹ | Sensor flux field (reduce to 1×1) |
| **matSum** | 1×1 | F32¹ | Reduced material pixel counts |

---

## 2. Substep Pass Sequence

Each substep executes 15+ GPU passes. The ordering is critical — each pass depends on outputs from previous passes.

```
substep() {
  ┌─ 1. actorUpdate ──→ actors.write    [reads: actors, velocity, level, dye, walls, gel, dyn]
  │     actors.swap()
  │
  ├─ 2. splatMask ──→ dynMask (cleared) [reads: actors]
  │     Instanced quads, target=2: player(1), piston(5), predator(6)
  │
  ├─ 3. gelUpdate ──→ gel.write          [reads: gel, dye, velocity]
  │     gel.swap()                        R+B precipitation, dissolve, erosion, thermal melt
  │
  ├─ 4. obstacleCompose ──→ obstacle     [reads: level, dynMask, gel, walls, dyn]
  │     Merges ALL solid sources into one texture
  │
  ├─ 5. splatForce ──→ velocity.read     [reads: actors]  (additive blend)
  │     target=0: fan(2), emitter(3), predator(6)
  │
  ├─ 6. splatDye ──→ dye.read            [reads: actors]  (additive blend)
  │     target=1: emitter(3), predator(6), tempEmitter(10)
  │
  ├─ 7. splatWake ──→ wake.read          [reads: actors]  (additive blend)
  │     target=3: predator(6) only
  │     wakeUpdate ──→ wake.swap()
  │
  ├─ 8. advect(velocity) ──→ vel.swap()  [reads: velocity, dye, media, wake]
  │     Semi-Lagrangian backtrace, species-dependent viscosity, cold damping
  │
  ├─ 9. curl ──→ curlTex                 [reads: velocity]
  │     vorticity ──→ vel.swap()          [reads: curl, velocity, dye, media, wake]
  │
  ├─ 10. reactForce ──→ vel.swap()       [reads: dye, dyn, obstacle, velocity]
  │      Exothermic R×G repulsion, dynamite blast, lane/amp forces
  │
  ├─ 11. PRESSURE SOLVE:
  │      divergence ──→ divergence        [reads: velocity, obstacle]
  │      copy(pressure, warmStart)
  │      jacobi ×N ──→ pressure.swap()    [reads: divergence, pressure, obstacle]
  │      gradSub ──→ vel.swap()           [reads: velocity, pressure, obstacle]
  │
  ├─ 12. advect(dye) ──→ dye.swap()      [reads: velocity, dye, media]
  │      At DYE resolution. Temperature dissipates toward ambient.
  │
  ├─ 13. dyePost ──→ dye.write           [reads: dye, regions, obstacle, velocity, media, dyn,
  │      dye.swap()                               actors, level, walls, gel]
  │      Zone absorption, solid decay, gel/dyn chemistry, temperature evolution,
  │      friction heat injection, temperature diffusion, multiplier zones
  │
  ├─ 14. dynUpdate ──→ dyn.swap()        [reads: dye, dyn]
  │      Dynamite charge evolution (per-substep for fast chain reactions)
  │
  └─ 15. scoreAccum ──→ scoreAcc.swap()  [reads: scoreAcc, dye(pre-absorption), regions]
}
```

### 2.1 Splat Mechanism

The splat passes use **instanced rendering**: 64 quad instances drawn with `gl.ONE, gl.ONE` additive blending. The vertex shader reads actor data from `uActors` via `texelFetch`, culls by type (`writesTarget(type, target)`), positions/scales the quad, and passes actor state to the fragment shader as varyings.

**Target routing** (which types write to which field):
| Target | Field | Types |
|--------|-------|-------|
| 0 | velocity (force) | fan(2), emitter(3), predator(6) |
| 1 | dye (injection) | emitter(3), predator(6), tempEmitter(10) |
| 2 | dynMask (boundary) | player(1), piston(5), predator(6) |
| 3 | wake (deposit) | predator(6) |

---

## 3. Actor Update — Game Logic in a Fragment Shader

`actorUpdateFS` is the most complex shader (~350 lines). It runs on the 64×4 actor texture. Each fragment corresponds to one (slot, row) pair. The shader reads all 4 rows for the current slot, branches on `type`, runs per-type physics, then outputs the appropriate row.

### 3.1 Per-Type Logic

**Player (type 1):**
- Reads `uInput.xy` for thrust, `uInput.z` for spin input
- Fluid coupling: samples velocity field in a ring around body (`fluidRing`), applies `flowPush` drag
- Spin: `ω += spinAccel × input × dt`, damped by `spinDamp` (tier-based damping multiplier applied on CPU side)
- Friction heat: before `resolveWalls`, samples level SDF and dynamic solids (`hardAt`) to detect contact; stores `|ω| × penetration × spinHeat` in `r3.y`
- Collision: `resolveWalls` → `resolveDynamic` → inline body collision loop (types 2,3,5,6) with spin kick (tangential velocity ∝ ω on bounce) and bounce floor
- Gel drag: exponential damping proportional to local gel concentration

**Predator (type 6):**
- AI: follows red dye gradient (wide stencil), with random wander heading and scent-biased steering
- Danger sense: avoids wall proximity using level SDF gradient; steers wander heading away
- Fluid coupling: `fluidRing` drag + linear damping
- Collision: `collideBodies` → `resolveWalls` → `resolveDynamic`
- TTL countdown → death when expired (type set to 0)

**Piston (type 5):**
- Spring-damper to oscillating target: `vel += spring × (target − pos) × dt`, damped by `pistonDamp`
- Target = home + axis × amp × sin(time × omega + phase)
- Collision: `collideBodies` → `resolveWalls` → `resolveDynamic`

**Nest (type 7), Pickup (type 8):**
- Mostly passive in shader; CPU handles spawning/collection via telemetry readback

### 3.2 Shared Physics Functions

These are defined within `actorUpdateFS` and used by multiple actor types:

| Function | Purpose |
|----------|---------|
| `fluidRing(pos, r)` | Average velocity field around body perimeter (8 samples) |
| `resolveWalls(pos, vel, r)` | Push body out of level SDF solid regions |
| `resolveDynamic(pos, vel, r)` | Push body out of dynamic solids (walls, gel, dynamite) |
| `collideBodies(slot, pos, vel, r, mass)` | Elastic collision with all other active actors (types 1–6 only, skips 7/8/10) |
| `hardAt(uv)` | Binary solid test against walls + gel + dynamite textures |

### 3.3 Row Output

The shader outputs one row per fragment:
```glsl
fragColor = (row == 0) ? vec4(pos, vel) :
            (row == 1) ? r1 :
            (row == 2) ? r2 : r3;
```

---

## 4. Temperature & Chemistry System

Temperature lives in `dye.a` and participates in a rich web of interactions:

### 4.1 Heat Sources
| Source | Location | Mechanism |
|--------|----------|-----------|
| R×G exothermic | dyePostFS | `tempHeatRate × R × G × stagnationBoost × Arrhenius(T)` |
| Dynamite blast | dyePostFS | `dynHeat × charge × trigger²` |
| Friction (spin) | dyePostFS | Player spinning against any solid → heat at overlap pixels |
| Temp emitters | splatDyeFS | Actor type 10, direct `.a` injection |
| Temp zones | dyePostFS | `mediaZones` with `.a ≥ 0` → lerp toward target |

### 4.2 Heat Sinks
| Sink | Mechanism |
|------|-----------|
| Newton cooling | `−coolLinear × max(T − ambient, 0)` (only excess, floored at 0) |
| Quadratic brake | `−coolQuad × max(T − ambient, 0)²` |
| Gel absorption | `−gelHeatAbsorb × R×B reaction` |
| Ambient restore | Lerp toward `tempAmbient` at `tempAmbientRestore` rate (unscaled by `tempScale`) |
| Advective dissipation | `tempDiss` applied during dye advection |

> **Note**: All source/sink terms except ambient restore are accumulated into `dT`, then applied as `T += tempScale × dT × dt`. The `tempScale` parameter acts as an inverse heat capacity.

### 4.3 Temperature Effects
| Consumer | Effect |
|----------|--------|
| Viscosity | `visc × exp(−viscTempK × (T − ambient))` — hot = thin, cold = thick |
| Cold damping | `visc × (1 + coldDamp / (1 + coldScale × T))` — extreme cold freezes flow |
| Reaction rate | Rational Arrhenius: `activation × T / (1 + activation × T)`, scaled by `arrhScale`, plus `reactFloor` |
| Curl confinement | `(1 + tempCurlBoost × T)` — hot fluid swirls more |
| Gel formation | `coldFavor × hotCutoff × selfBoost` — cold favors, hot prevents |
| Gel melting | `gelMeltRate × max(T − hotThresh, 0)` — excess heat dissolves gel |
| Dynamite detonation | Triggers when `T > dynTempTrigger` (smoothstep from 70% to 100% of threshold) |
| Tonemap | `thermalFloor + thermalVis × T/tempMax` — hot glows bright |
| Diffusion | 5-point Laplacian: heat spreads to neighbors at `tempDiffuse` rate |

### 4.4 Friction Heat Pipeline

The friction heat system uses **two independent mechanisms** (not a pipeline):

- **actorUpdateFS** (vestigial): Detects player-solid contact (level SDF + `hardAt` probes at perimeter). Stores `|ω| × penetration × spinHeat` in `r3.y`. This value is currently **not consumed** by any other shader — it's a remnant of the old splat-based approach.
- **dyePostFS** (active): Reads player position/spin from `uActors` via `texelFetch(ivec2(0,row))`. For each dye pixel within player radius that is a real solid (level/walls/gel/dynamite — NOT the player body mask from obstacle compose), deposits heat with a `smoothstep` rim profile favoring the contact edge. This is the mechanism that actually heats the fluid.
- **Diffusion**: 5-point Laplacian in dyePostFS spreads heat from contact pixels into surrounding fluid.
- **gelUpdate**: If heat exceeds `gelHotThresh`, gel dissolves at `gelMeltRate × excess`. Result: spinning against ice melts it.

---

## 5. CPU ↔ GPU Boundary

### 5.1 CPU → GPU (per substep)
| Data | Mechanism | Destination |
|------|-----------|-------------|
| Player input (WASD + spin) | `uInput` uniform vec4 | actorUpdateFS |
| All `params` (~90 floats) | Individual uniforms | Various shaders |
| Spawn command | `uSpawn`/`uSpawnParams`/`uSpawnDye` uniforms | actorUpdateFS |
| Wall paint strokes | `wallPaintFS` / `lanePaintFS` passes | walls / dyn textures |

### 5.2 CPU → GPU (at level load)
| Data | Mechanism |
|------|-----------|
| Level geometry | Canvas paint → `levelPngTex` → JFA → `level` SDF |
| Zone map | Canvas paint → pixel swizzle → `regionsTex` |
| Media zones | Canvas paint → `mediaTex` |
| Pre-placed gel | Float32Array → `gel` texture |
| Pre-placed dynamite | Float32Array → `dyn` texture |
| Actor initial state | `writeActor()` → `actors` texture (both PP copies) |

### 5.3 GPU → CPU (async, 2–3 frame latency)
| Data | Source | Readback Path |
|------|--------|---------------|
| Score totals | scoreAcc → reduce → scoreOne → telemetry px 0 | PBO ring → `S.lastTelem[0..3]` |
| Sensor flux | sensorRT → reduce → telemetry px 1 | PBO ring → `S.lastTelem[4..7]` |
| Actor positions | actors → telemetry px 2..65 | PBO ring → `S.lastTelem[8..263]` |
| Switch state | swState (8 px) | PBO ring → `S.lastTelem[264..295]` |
| Material counts | matPackRT → reduce → matSum (1 px) | PBO ring → `S.lastTelem[296..299]` |

**Critical invariant:** No synchronous GPU→CPU reads. Ever. The PBO ring uses `gl.fenceSync` + `gl.clientWaitSync` polling. Game logic (win detection, switch evaluation, nest spawning) operates on 2–3 frame old data, which is imperceptible.

---

## 6. Rendering Pipeline

After all substeps complete, one render pass per frame:

```
1. brightFS         Extract pixels above bloomThr → bloom texture
2. blurFS ×N        Separable Gaussian blur (BLUR_PASSES iterations)
3. compositeFS      THE big shader (~250 lines):
   Binds 16+ textures simultaneously:
   - dye, velocity, curlTex, obstacle, level, gel, walls, dyn
   - regionsTex, mediaTex, bloom, wake
   - Render logic:
     a. speciesToDisplay() — curated palette, not literal RGB
     b. Streak/motion-smear (species-dependent)
     c. Blackbody-inspired temperature tonemap
     d. Bloom with redBloomBoost
     e. Per-species curl tint (vortex coloring)
     f. Schlieren (invisible-current visualization)
     g. Gel membrane (icy panes + rim glow)
     h. Win zone iridescence (cosine palette animation)
     i. Flow zone rendering (amber arrows, opacity floor)
     j. Multiplier zone rendering (white pulse + color chirp)
     k. 11 debug visualization modes
4. glyphFS          Instanced quads for actor icons (player ring, fan arrows, etc.)
5. ghostFS          Tool placement preview (if shift held)
```

### 6.1 Zone Rendering in Composite

Zones use the `dyn` texture's GBA channels (flow direction, multiplier rate). The composite shader distinguishes:

- **Flow zones** (`length(dyn.gb) > 0.001`): Amber gradient with animated flow lines, opacity floor of 0.4
- **Multiplier zones** (`|dyn.a| > 1e-5`, no flow): Spatially uniform white pulse using `sin²(t)`, with a delayed color chirp — green (`#080`) for concentrators, red (`#800`) for diluters

---

## 7. Shared GLSL Snippets (common.js)

These string constants are prepended to shader sources via concatenation:

| Snippet | Provides | Used By |
|---------|----------|---------|
| `VS_FULLSCREEN` | Standard fullscreen triangle VS | All fullscreen passes |
| `FRAG_HEADER` | `#version 300 es`, precision, vUv, fragColor | All FS |
| `OBST` | `solidAt(uv)` → reads composed `uObstacle` | Fluid sim passes, dyePost |
| `ZONES` | `zoneRemoval(dye, uv)` → sink/drain/trigger rates, `uDt` | dyePost, scoreAccum |
| `SPECIES` | `speciesToDisplay(rgb)` → curated display color | compositeFS |
| `SPECIES_PHYS` | `speciesMix(rgb, coeffVec)` → species-weighted blend | advect, vorticity |

---

## 8. Practical Guide: Adding a New Game Mechanic

### Adding a new per-pixel field effect (e.g., magnetic zones)
1. Choose storage: spare channel in existing texture (e.g., `dyn.a` was repurposed for multiplier rate) or new texture
2. Add uniform declarations to the consuming shader in `sources.js`
3. Bind the texture in `simulation.js` (check texture unit availability)
4. Add the param to `DEFAULT_PARAMS` in `config.js`
5. Add slider + tooltip in `panel.js`

### Adding a new actor type
1. Pick an unused type code (next: 11)
2. Add initialization in `actorRecord()` in `gl-core.js` — set row fields
3. Add physics branch in `actorUpdateFS` (the `if(type==N)` chain)
4. Add to `writesTarget()` for whichever splat targets it participates in
5. Add splat fragment logic in the relevant `splatXxxFS`
6. Add glyph rendering in `glyphFS` if it needs a visual icon
7. Add CPU-side handling in `main.js` (collection, spawning, etc.)
8. Add editor support in `editor.js` entity mode

### Adding a new temperature interaction
1. All temperature evolution happens in `dyePostFS` after the `/* temperature evolution */` comment
2. Add source/sink terms to the `dT` accumulator
3. If you need data from other textures, bind them in the dyePost pass in `simulation.js`
4. Temperature clamps to `[0, tempMax]` at the end

---

## 9. Debugging

### Debug Visualization Modes (Tab key, 11 modes)
The composite shader's `uDebugMode` uniform switches rendering:
0. Normal, 1. Velocity magnitude, 2. Pressure, 3. Divergence, 4. Curl,
5. Obstacle field, 6. Gel, 7. Wake, 8. Regions, 9. Temperature,
10. Raw dye (literal RGB without palette mapping)

### Common Shader Bugs
- **Uniform not bound**: WebGL silently uses 0. Check `simulation.js` bindings match `sources.js` declarations.
- **Texture unit collision**: Multiple textures bound to the same unit. Each `bindTex` call specifies a unit number — verify uniqueness within each pass.
- **Ping-pong read/write hazard**: Reading from and writing to the same texture. `drawTo` has a feedback-loop assertion in debug builds.
- **Missing import**: Using a config constant (like `DYE_W`) without importing it in the consuming JS module.
- **RES_SCALE**: New distance/force params must be scaled by `RES_SCALE` to be quality-invariant. Forgetting this makes physics change with quality preset.
