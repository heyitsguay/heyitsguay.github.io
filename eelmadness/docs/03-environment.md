# Environment — the Living Kelp Forest

Everything behind the eel is one WebGL canvas. Goal: a scene that feels *inhabited* — it moves
on its own and it reacts to the eel — while holding 60 fps (or a clean 30) on a medium-end
modern phone.

## Layers (three draw calls)

### 1. Water background — fullscreen fragment shader

- Vertical gradient: deep `#04120E`-ish at the bottom to teal-green toward the surface.
- **God rays**: two multiplied sine bands in a skewed coordinate (`uv.x·3 − uv.y·0.9`),
  raised to a power for crisp-ish shafts, faded in with height, drifting slowly. Cheap,
  no noise texture needed.
- Faint large-scale shimmer (product of two slow sines) for water volume.
- Soft vignette.

All procedural, zero textures, one fullscreen triangle.

### 2. Kelp — one triangle strip, vertex-shader sway

~14 strands in two depth layers (far = dimmer/shorter, near = darker/taller), heights 35–85%
of screen height. Geometry is built **once per resize** into a single vertex buffer
(strands joined by degenerate triangles → one `drawArrays(TRIANGLE_STRIP)`), with per-vertex
attributes: position, height-fraction, random phase, shade.

All motion happens in the vertex shader — no per-frame uploads:

- **Ambient sway**: two sines at different rates, amplitude scaling with `frac^1.4` so bases
  stay planted and tips wave.
- **Eel push**: the eel head position and speed are uniforms; vertices get displaced away from
  the head with a Gaussian falloff (`radius ≈ 110 px`), scaled by height-fraction and eel
  speed. Swimming through kelp visibly parts it — the single biggest "the world is alive"
  signal for its cost (two uniforms).

### 3. Particles — one dynamic point buffer

- **Motes** (~120): pale specks drifting with slow sinusoidal wander. Updated in JS; the eel's
  head **repels** motes within ~70 px proportional to its speed, so a fast pass scatters
  them and they lazily re-drift. Rendered as soft `gl_PointS` discs.
- **Bubbles** (pool of ~40): spawned from the eel's mouth while effort is high (~10/s),
  rise with buoyancy, wobble, fade, recycled offscreen. Rendered as rings (same point shader,
  a `kind` attribute switches disc → ring).

One buffer upload per frame (~160 points × 5 floats — trivial), one draw call.

## Mobile performance budget

| Item | Cost |
|---|---|
| Draw calls | 3 (bg, kelp, points) + 1 SVG path update + ~10 SVG attribute updates |
| Fragment load | bg shader is the ceiling: ~10 ALU ops/pixel, no textures |
| devicePixelRatio | capped at 2 (a 3× phone screen pays 2.25× fragments for invisible gain) |
| Per-frame JS | spine sim (44 pts), outline build (~90 pts → string), particle update (~160) |

Degradation levers if a target device struggles, in order: drop dpr cap to 1.5 → halve motes
→ drop far kelp layer → simplify god rays to one sine. All are constants at the top of
`water.js`.

## Deliberate exclusions (PoC)

- No textures, no framebuffers/post-processing, no SVG filters (blur on an animated path is
  the classic mobile perf trap).
- Water does not distort the eel (would require rendering the SVG into the GL pipeline —
  revisit only if the hybrid layering ever feels flat).
