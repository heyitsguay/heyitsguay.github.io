# Environment — the Living Kelp Forest

Everything behind the eel is one WebGL canvas. Goal: a scene that feels *inhabited* — it moves
on its own and it reacts to the eel — while holding 60 fps (or a clean 30) on a medium-end
modern phone.

## Layers (three draw calls + a few pulse quads)

### 0. Parallax planes — both behind the main forest (tuning.LAYERS)

Two depth planes between the background and the main kelp, panning slower than the
camera (per-pass `u_pf`): a **near-behind plane** (factor ≈ 0.72, lightly blurred)
with its own kelp strands, and a **far plane** (factor ≈ 0.40, heavily blurred)
holding the rock spires + a denser kelp wall. Plane **blur is faked** — no
framebuffers — by drawing each plane 2–3 times with small jitter offsets at reduced
alpha (`BLUR`/`TAPS`/`ALPHA` per plane); at silhouette contrast it reads as soft
focus. Palettes are fogged toward the water color per plane, more for the far one.

Each plane is **inhabited**: a school of dim silhouette minnow-dots orbiting a
wandering anchor (the point shader with the plane's `u_pf`) and one or two soft
pulsing jelly blobs (the pulse shader, additive) — all wrapping around the
plane-space camera window like motes, with counts scaling on the LIFE axis.

**Kelp grows with LIFE** (tuning.KELP_GROWTH): +60% strand density and +35% height
at full LIFE, on every plane; geometry rebuilds when LIFE has moved > 0.08.
**Seagrass** (the LIFE `seagrass` dial): short bright tufts along the floor in the
main plane, sparse at first, denser and taller with LIFE — same strand generator,
drawn after the kelp with its own greens and the eel-push.

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
- **Bubbles** (pool of ~90, shared by every emitter): the eel's mouth while effort is
  high, falling-food trails (`emitBubble` — rate scales with fall speed), surface-entry
  plops, eat-flourish bursts, and critter micro-bubbles. Rise with buoyancy, wobble,
  fade, recycled offscreen. Rendered as rings (same point shader, a `kind` attribute
  switches disc → ring).
- **Marine snow** (~50): sparse pale specks sinking slowly through the view, wrapping
  around the camera rect — the barren sea's first texture, present from LIGHT = 0.
- **Boost sparks** (pool of ~48): electric-blue jittering motes streamed off the eel's
  body during a speed burst (docs/07); a third `kind` in the same point shader.

One buffer upload per frame (~210 points × 5 floats — trivial), one draw call.

### 4. Light pulses — a handful of additive quads

A small pool (~6) of expanding radial glows, additively blended, one tiny draw each:
the eat flourish (axis-colored, docs/06) and any future momentary light. Zero cost
when idle.

## Unified lighting (LIGHT axis — see docs/07)

One rule: **the veil is the single authority on depth-brightness for the whole
scene; the GL palettes handle hue only; anything that emits light lives above the
veil.** This keeps the WebGL and SVG layers lit identically without rendering
sprites into the GL pipeline (rejected: per-frame SVG rasterization/texture upload
is a mobile frame-budget killer and abandons the locked SVG+GL hybrid).

1. **The veil is multiplicative illumination** (`js/veil.js`): a world-height div
   above the SVG layer with `mix-blend-mode: multiply`, carrying a fixed vertical
   gradient from white (surface, no-op) toward the deep-water tint at depth — i.e.,
   exactly "render everything at full illumination, then multiply by depth." It's
   moved with `transform: translateY(−camY·zoom)` each frame (compositor-only) and
   rebuilt only when LIGHT moves >0.01. At LIGHT=0 the deep world multiplies to
   ~black (gameplay); at LIGHT=1 it's a no-op. `VEIL.MODE: 'alpha'` in tuning.js is
   the one-knob fallback (tinted alpha overlay, no blend mode) if multiply ever
   misbehaves in a browser.
   **Gamma-shaped response:** darkness clears as `1 − light^GAMMA` (2.2) and the
   full-black depth line recedes on the same curve, so the deep stays dark through
   most of the LIGHT axis and only opens up late — a linear response lightened it
   far too early. `DEPTH_EXP < 1` brings darkness on faster with descent, and the
   GL palettes blend on their own softer gamma (`LIGHT_GAMMA`).
   **The abyss never fully clears:** a permanent floor (`END_A`, `END_START`) keeps
   the very bottom at ~10% brightness even at LIGHT = 1.
2. **GL palettes are hue, not brightness.** `LIGHT0` (tuning.js) is a dim-but-formed
   blue scene, not black — the veil supplies the darkness on top of it, the same
   darkness the sprites get. Rays/shimmer/kelp-dim still ramp with LIGHT.
3. **The glow layer** (`<svg id="glow-layer">`, above the veil, viewBox synced with
   the sprite layer each frame): emissive elements only — jellyfish inner glows,
   greet hearts, ambient sparkles + deep plankton (sparkles.js), and later the
   anglerfish lure. Light sources punch through the darkness by construction; a
   jelly in black water reads as a lantern. (An eel glow + white veil-hole lived
   here briefly and was cut for looks.)

Known, accepted seam: the GL light pulses (eat flourish) render below the veil, so
deep-water pulses are absorbed — reads as water absorption, revisit only if it
bothers.

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
