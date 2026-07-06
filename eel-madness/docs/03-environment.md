# Environment — the Living Kelp Forest

Everything behind the eel is one WebGL canvas. Goal: a scene that feels *inhabited* — it moves
on its own and it reacts to the eel — while holding 60 fps (or a clean 30) on a medium-end
modern phone.

## Layers (~a dozen small draw calls)

### 0. Parallax planes — behind the main forest (tuning.LAYERS) + one in front

Two depth planes between the background and the main kelp, panning slower than the
camera (per-pass parallax factor): a **near-behind plane** (factor ≈ 0.72, lightly
blurred) with its own kelp strands, and a **far plane** (factor ≈ 0.40, heavily
blurred) holding a denser kelp wall — both rooted on their **seafloor terrain**: a
seeded rolling silhouette heightfield per plane (docs/09), smooth swells only (the
rock spires were cut — they read as bad triangles), mostly hugging the floor with
occasional rises to about half the view height, anchored so the plane floor meets
the window bottom when the camera rests on the world floor
(`planeFloorY = viewH + (worldH − viewH)·pf` — geometry anchored at the raw world
floor with `pf < 1` would sit forever below the window). **Corals** — short,
wide strand-tufts in warmer silhouette tones — grow on the terrain as LIFE climbs,
and tiny **seafloor lights** kindle with WORLD MAGIC (`bgLights` dial) — those are
emissive, so they live in a counter-transformed `#bg-glows` group on the glow layer,
not in GL. Plane **blur is faked** — no framebuffers — by drawing each plane 2–3
times with small jitter offsets at reduced alpha (`BLUR`/`TAPS`/`ALPHA` per plane);
at silhouette contrast it reads as soft focus. Palettes are fogged toward the water
color per plane, more for the far one.

The **front plane** (`LAYERS.FRONT`, factor ≈ 1.22) is SVG, not GL: a *sharp* kelp
plane in `<g id="fg">` after the eel (js/fgplane.js) — it occludes the eel and sits
under the veil, so the single lighting authority holds by construction. Pooled path
elements, chunk-seeded strands, sway = a small per-frame rotation about the root.

**P4 amendment (docs/10):** plane BLUR is gone entirely — the jitter-tap fake was
retired for an FBO depth-of-field pass, three variants of which all read badly
(flicker, ghosting — the saga is logged in docs/10), so the whole routine was
deleted and the no-framebuffer rule below stands unbroken. Depth is faked with
**fog** instead: `LAYERS.FAR.FOG` pulls the far plane's palette an extra fraction
toward the water color; planes draw sharp. Also P4: **every plane has seafloor
terrain** — front (SVG sliver, lowest), main (GL, rolling dunes), near, far
(highest) — per-plane amplitude/shape keyed in `tuning.TERRAIN` (`AMP`, `POW`).

Each behind-plane is **inhabited**: a school of dim silhouette minnow-dots orbiting a
wandering anchor (the point shader) and one or two soft pulsing jelly blobs (the
pulse shader, additive) — all wrapping around the plane-space camera window like
motes, with counts scaling on the LIFE axis. Plane fauna renders into the plane's
offscreen pass, so it blurs with its plane.

**All strip geometry is chunked and seeded** (docs/09): strands/terrain generate per
960-px chunk from deterministic streams (worldgen.js), and each layer's vertex buffer
covers the chunks around the camera, rebuilding only when the chunk window shifts,
LIFE moves > 0.08, or the window resizes. **Kelp grows with LIFE**
(tuning.KELP_GROWTH): +60% strand density and +35% height at full LIFE, on every
plane — a chunk always generates its full-LIFE strand set and shows the first
`round(max·dial)`, so growth adds strands without reshuffling. **Kelp is gated on
LIFE** (`DIALS.kelp`, unlocking at life level 1): the barren sea starts near-bare
on every plane — main, wall, near-behind, and the SVG front plane all share the
dial. **Seagrass** (the LIFE `seagrass` dial): short bright tufts along the floor
in the main plane, sparse at first, denser and taller with LIFE — same strand
generator, drawn after the kelp with its own greens and the eel-push.

### 1. Water background — fullscreen fragment shader

- Vertical gradient: deep `#04120E`-ish at the bottom to teal-green toward the surface.
- **God rays**: two multiplied sine bands in a skewed coordinate (`uv.x·3 − uv.y·0.9`),
  raised to a power for crisp-ish shafts, faded in with height, drifting slowly. Cheap,
  no noise texture needed.
- Faint large-scale shimmer (product of two slow sines) for water volume.
- Soft vignette.

All procedural, zero textures, one fullscreen triangle. **`precision highp`
is load-bearing**: mediump is fp16 on mobile GPUs (desktop silently promotes
to fp32), and the fragment world-x reaches ~80k device px — fp16 quantized it
in 32+ px steps, which shipped as "low-res god rays" on phones. The camera x
arrives pre-wrapped (BG_WRAP) and the clock pre-wrapped (T_WRAP, an exact
common period of every shader frequency), so highp stays precise forever.

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
- **Boost sparks live on the glow layer, not here** (sparkles.js): GL points sit
  under the veil and were multiplied to black in deep water — the electric crackle
  has to shine in the dark, so it's emissive by definition (docs/07).

One buffer upload per frame (~260 points × 5 floats — trivial), one draw call.

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
| GL draw calls | ~14–20 small: bg + parallax blur taps (far ×3, near ×2, each incl. terrain+corals) + plane fauna (≤4) + kelp + seagrass + points + pulses |
| Fragment load | bg shader is the ceiling: ~10 ALU ops/pixel, no textures; blur taps are silhouette-sized |
| devicePixelRatio | capped at 2 (a 3× phone screen pays 2.25× fragments for invisible gain) |
| SVG per frame | eel (~30 attrs) + in-view critters/food/hearts/sparkles + front-plane strands (~10 transforms) — everything offscreen skips its DOM writes (vicinity principle, docs/07) |
| Per-frame JS | spine sim (44 pts), outline build (~90 pts → string), particles (~250), fauna sims |

Degradation levers if a target device struggles, in order: drop dpr cap to 1.5 → halve motes
→ drop far kelp layer → simplify god rays to one sine. All are constants at the top of
`water.js`. JS-side sim knobs (mote/bubble physics, kelp geometry, eel-push strength) are
named constants there too; shader-internal shape and color numbers deliberately live in the
shader source strings next to the effect they shape.

## Deliberate exclusions (PoC)

- No textures, no framebuffers/post-processing, no SVG filters (blur on an animated path is
  the classic mobile perf trap). A P4 depth-of-field FBO briefly broke this rule
  and was removed after three bad-looking variants (docs/10) — background depth
  is fog, not blur. The rule stands.
- Water does not distort the eel (would require rendering the SVG into the GL pipeline —
  revisit only if the hybrid layering ever feels flat).
