# Environment — the Living Kelp Forest

Everything behind the eel is one WebGL canvas. Goal: a scene that feels *inhabited* — it moves
on its own and it reacts to the eel — while holding 60 fps (or a clean 30) on a medium-end
modern phone.

## Layers (three draw calls + a few pulse quads)

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
- **Marine snow** (~50): sparse pale specks sinking slowly through the view, wrapping
  around the camera rect — the barren sea's first texture, present from LIGHT = 0.

One buffer upload per frame (~210 points × 5 floats — trivial), one draw call.

### 4. Light pulses — a handful of additive quads

A small pool (~6) of expanding radial glows, additively blended, one tiny draw each:
the eat flourish (axis-colored, docs/06) and any future momentary light. Zero cost
when idle.

## Progression-driven lighting (LIGHT axis — see docs/07)

The scene's light is no longer fixed: it interpolates between an authored **dark
endpoint** (near-black deep water, faint rays — the barren sea) and a **bright
endpoint** (today's look, a touch brighter) as the LIGHT axis grows. Two pieces:

1. **GL uniforms.** The background shader's deep/surface colors, god-ray strength,
   and shimmer strength are uniforms; the kelp shader gains a dim factor so plants
   don't glow against black water. Endpoint palettes live in `js/tuning.js`
   (`lightParams(light01)` returns the blended values); main.js feeds them to
   `water.setLight(params)` only when LIGHT actually changes.
2. **The darkness veil** (`js/veil.js`) — sprites (SVG food, later critters) must
   darken too, and they composite above the canvas. The veil is a single
   world-height div above the SVG layer carrying a fixed vertical gradient
   (black, alpha rising with world depth), moved with `transform: translateY(−camY)`
   each frame — a compositor-only operation, no repaint. The gradient itself is
   regenerated only when LIGHT moves by >0.01. At LIGHT=0 the deep world is genuinely
   unreadable (that's gameplay); at LIGHT=1 the veil is fully transparent.
   Perf watch: the veil layer rasters at viewport-width × world-height; if it ever
   hurts on mobile, the fallback is a viewport-sized gradient re-anchored at ~10 Hz.

The eel-glow "hole" in the veil is a later EEL MAGIC unlock (docs/07), planned as a
second, small radial-gradient element following the eel — same compositor-only
pattern.

## Mobile performance budget

| Item | Cost |
|---|---|
| Draw calls | 3 (bg, kelp, points) + 1 SVG path update + ~10 SVG attribute updates |
| Fragment load | bg shader is the ceiling: ~10 ALU ops/pixel, no textures |
| devicePixelRatio | capped at 2 (a 3× phone screen pays 2.25× fragments for invisible gain) |
| Per-frame JS | spine sim (44 pts), outline build (~90 pts → string), particle update (~160) |

Degradation levers if a target device struggles, in order: drop dpr cap to 1.5 → halve motes
→ drop far kelp layer → simplify god rays to one sine. All are constants at the top of
`water.js`. JS-side sim knobs (mote/bubble physics, kelp geometry, eel-push strength) are
named constants there too; shader-internal shape and color numbers deliberately live in the
shader source strings next to the effect they shape.

## Deliberate exclusions (PoC)

- No textures, no framebuffers/post-processing, no SVG filters (blur on an animated path is
  the classic mobile perf trap).
- Water does not distort the eel (would require rendering the SVG into the GL pipeline —
  revisit only if the hybrid layering ever feels flat).
