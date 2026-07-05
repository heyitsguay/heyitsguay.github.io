# Architecture

## Files

```
eel-madness/
  index.html        DOM skeleton: <canvas id="water"> under <svg id="eel-layer">, hint text
  style.css         fullscreen stacking, eel/wig/eye styling, level-up popups, touch-action: none
  docs/             these documents
  tests/            headless suites (check-*.mjs) + run.sh, the one-command check runner
  js/
    main.js         boot, resize, frame loop — owns the order of operations
    input.js        keyboard + pointer → the intent struct (see 02)
    eel.js          spine sim, outline build, SVG rendering, decorations (see 01, 02)
    food.js         falling food: spawn, drift, auto-mouth probe, eat/bounce (see 06)
    water.js        WebGL: background, kelp, particles (see 03)
    worldgen.js     the seeded infinite sea (see 09): hashes, chunk RNG, kelp strand
                    streams, terrain heights, spawn hotspot field
    fgplane.js      the sharp front kelp plane (SVG, camera factor > 1 — see 03, 09)
    tuning.js       THE experiment surface: axes, levels + level-up notes, food economy,
                    light palettes, dials, species spawn records (see 07, 08, 09)
    progress.js     axis accumulators, level quantization + bloom (see 08), localStorage
                    persistence, URL overrides, dial eval
    veil.js         the darkness veil overlay (see 03)
    critters.js     fauna: minnows, jellies, reef fish, seahorses, octopuses (+ giant),
                    anglerfish — spawn tensor, greet responses (see 07, 09)
    hearts.js       pooled heart-emitter (greets; pattern/color/size per species)
    sparkles.js     glow-layer particles: WORLD MAGIC drift-sparkles + deep plankton
                    + level-up confetti bursts
    ui.js           pause menu (level meters) + reset, greet button (touch),
                    level-up popup queue (see 08)
    math.js         clamp / lerp / expApproach / angleDiff / curves (curve01 library)
```

No build step, no dependencies. ES modules loaded from `index.html`; deploy = push to
github.io.

## DOM stacking

```
<body>                      position:fixed, inset:0 on the fullscreen layers
  <canvas id="water">       WebGL — environment, behind
  <svg id="eel-layer">      world sprites — in front of the canvas, pointer-events:none
    <g id="critters">       all fauna — behind the food
    <g id="food">           food <image> pool, behind the eel
    <g id="eel">            the eel
    <g id="fg">             the front kelp plane (fgplane.js): sharp, occludes the eel,
                            counter-transformed to pan FASTER than the camera (docs/03)
    <g id="hearts">         greet hearts, topmost
  <div id="veil">           the illumination multiply layer (docs/03), camera-translated
  <svg id="glow-layer">     emissive sprites above the veil — viewBox synced per frame
    <g id="bg-glows">       seafloor lights in the behind-planes, counter-transformed to
                            their parallax factor (emissive can't live in GL, docs/03)
    <g id="glows">          jelly inner glows, anglerfish lures, fairies, sparkles + plankton
    <g id="hearts">         greet hearts — they shine in the dark
  <div id="flash">          eat/greet screen flash — color set per event, opacity per frame
  <div id="hint">           "WASD / hold to swim", fades on first input (above the veil)
  <div id="levelups">       level-up popup queue (docs/08) — pointer-events:none, outside
                            #ui so steering never sees it
```

Input listens on `window`, so the SVG layer never intercepts touches.

**Chromium stale-raster bug + the damage-rect workaround.** In Chrome (hardware raster,
dPR 1, 100% zoom — Firefox is clean), the wig paths' per-frame paint invalidation fails:
each frame's raster of a lock is not cleared before the next. Near the body this is
masked — the body/eye/wig-mass invalidation rects force re-raster of everything around
the eel each frame — so residue only becomes visible where lock tips drift above that
crowd, instantly stacking into scribble-like wads a fixed height above the body. Any
overlapping invalidation rect erases it (observed directly); a window resize wipes it
all. `will-change: transform` does NOT fix it. Root cause in Chromium unidentified.

The workaround makes the accidental cleanup deliberate: `<rect id="eel-damage">` (first
child of `#eel`, painted at an imperceptible 0.4% alpha so Chromium can't skip it) is
resized every frame to the bounding box of all wig-lock outlines plus `DAMAGE_PAD`
(eel.js). Its old∪new invalidation rect then forces re-raster of the wig's entire
painted region every frame — an explicit clear step for the layer. Perf cost is
re-rastering the wig neighborhood per frame, which normal swimming already pays. If the
Chromium bug is ever fixed upstream, the rect and its bookkeeping can be deleted.

## Coordinate system & camera

**World units = CSS pixels of a 1920×1080 reference screen; the world is `3240` deep
and infinite along x** (docs/09 — seeded procedural chunks; x may be any float64,
negative included). Window size only changes how much of it you see. The eel (fixed
375-unit body), kelp heights, and god-ray scale are all authored in reference units so
the world looks identical on every device. Everything simulates in float64 world
coordinates; only rendering knows about the camera — and the GL side only ever sees
camera-relative numbers (per-buffer origin uniforms + a wrapped background camera,
docs/09), so nothing jitters far from the origin:

- Camera: top-left `(camX, camY)`, eased toward centering the eel (τ = 0.3 s) with a small
  speed-scaled lookahead along the heading, clamped to world bounds in y only, snapped on
  resize. The eel's position persists across sessions (`eel-madness:pos:v1`).
- **Zoom:** on coarse-pointer (touch) devices the camera is zoomed out to `MOBILE.ZOOM`
  (0.5×): the view spans `W/zoom × H/zoom` world px. Implementation: the viewBox uses the
  view span; water gets `(viewW, viewH, dpr·zoom)` — its canvas backing store stays
  `W×dpr` so nothing blurs, the world-to-device scale just becomes `dpr·zoom`; the veil
  is built at `worldH·zoom` CSS px; input converts the eel's world position to screen
  via `(eel − cam) · zoom`.
- SVG: `viewBox="camX camY W H"` — **the viewBox is the camera.** Spine coordinates stay in
  world space; one attribute per frame pans the whole eel layer.
- WebGL: canvas backing store is `W×dpr, H×dpr` (dpr capped at 2). Geometry and uniforms are
  world-space device px; each shader subtracts a `u_cam` uniform. The background shader
  computes fragment *world* position for the depth-light gradient (surface bright → floor
  dark) and world-anchored god rays.
- Input: pointer is screen-space; `getIntent` is fed the eel's screen position so direction
  and arrive-distance stay consistent.
- Motes wrap around the camera rect (constant visible density); kelp spans the full world
  floor; bubbles pop at world y ≈ 0 (the surface).

## Frame loop (main.js)

```
requestAnimationFrame:
  if ui.paused: skip everything, keep the loop alive
  dt = clamp(now - last, ≤ 50 ms)          # tab-switch protection
  intent = getIntent(eel.x, eel.y)         # input → intent
  intent.mouth = food.probe(eel)           # auto-mouth: food ahead opens the jaw
  eel.update(dt, intent, worldH)           # physics: head, chain, phase, side factor
  eaten = food.update(dt, eel, cam, viewW, worldH, water) # spawn/fall; eat/bounce; trails
  per eaten item: water.burst + water.pulse + screenFeedback (flash + camera shake)
    + progress.add(axis, amount)
  boost sparks stream off the body while eel.boost01 is up
  greet input (I / touch button, if unlocked): hearts.emit at the head +
    critters.greet(eel, hearts) + a small rose screenFeedback
  critters.update(...); hearts.update(dt); sparkles.update(...)
  camera shake perturbs a render-only rcam; viewBox/veil/water.render use it
  water.update(dt, eel, cam)               # particles react to eel; bubbles spawn
  water.setLight(lightParams(light))       # only when LIGHT changed meaningfully
  veil.update(camY, light)                 # compositor-only translate (+ rare rebuild)
  persist eel position (throttled ~1.5 s)
  eel.render(); critters.render(); food.render(); fg.render(rcam)
  bgLights.render(rcam); hearts.render(); sparkles.render()
  water.render(rcam)  # bg + 2 blurred parallax planes (terrain/corals/fauna) + kelp
                      # + seagrass + points (+ pulses)
```

Update fully precedes render; `water.update` reads the eel *after* its physics step so
reactions are same-frame.

## Module contracts

```
input.js   initInput(onFirstInput)                    # once
           getIntent(screenX, screenY) → intent       # per frame; eel's SCREEN position

eel.js     new Eel(svgRoot)
           .resize(worldH)                            # body length fixed (375 world units)
           .place(x, y)                               # teleport (persisted spawn, reset)
           .update(dt, intent, worldH)                # intent.boost drives the speed burst
           .setMagic({lashLen, shadowA, lipA, hueRange, boostAmt, boostDur})
           .render()                                  # incl. makeup; exposes boost01, stamina
           exposes: x, y, hx, hy, speed01, speedSm, effort, mouth   # read by main/water
                    px, py, wArr (spine points + half-widths)       # read by food collision

food.js    new Food(svgRoot)
           .probe(eel) → bool                            # food on the nose probe?
           .update(dt, eel, cam, viewW, worldH, fx) → [{x, y, key}]  # eat events
           .render()

water.js   new Water(canvas)
           .resize(W, H, dpr, worldH)                 # rebuilds chunk windows
           .update(dt, eel, cam)
           .render(cam)
           .burst(x, y, count?)                       # bubble burst at a world point
           .emitBubble(x, y, size, life)              # one trail bubble
           .spark(x, y, vx, vy)                       # one electric boost spark
           .pulse(x, y, color, amount)                # additive light pulse
           .setLight(params)                          # from tuning.lightParams(light01)

critters.js  new Critters(svgRoot, glowRoot)
           .update(dt, eel, worldH, water, cam, viewW, viewH, foodPts)
               # spawn-tensor populations (docs/09: bands × hotspots × damping,
               # vicinity principle unchanged);
               # foodPts = food.positions() for the WORLD MAGIC minnow feast
           .render(hearts)   # owns element visibility: reveal/hide only on in-pad
                             # writes, so stale geometry from a previous life can
                             # never show; hearts pops the seahorse pair vignette
           .greet(eel, hearts)                        # in-range critters respond

hearts.js  new Hearts(glowRoot)
           .emit(x, y, spec)   # spec: {color, size, count, pattern, delay, spread}
           .update(dt) / .render()

sparkles.js  new Sparkles(glowRoot)
           .update(dt, cam, viewW, viewH, eel, worldH)   # dial-driven spawns; also
           .render()                                     # fairies + their trails
           .burst(x, y, rgb, n)   # level-up confetti in the axis color (docs/08)
           new BgLights(glowRoot)                     # seafloor lights (docs/03, 09)
           .render(dt, rcam, viewW, viewH, worldH)    # counter-transform + twinkle
           new Lanterns(glowRoot)                     # lantern kelp bulbs (docs/07)
           .render(dt, rcam, viewW, viewH, worldH, eel, kelpLife)
               # kelpLife = water.builtLife, so bulbs sit on strands that exist

worldgen.js  pure seeded functions (docs/09): hash01(i, salt), chunkRng(chunk, salt),
           kelpStrands(chunk, dens) / kelpAnchors(x0, x1, dens) (water + seahorses),
           strandsInChunk(chunk, spec), terrain01(x, salt) → heightfield,
           xWeight(x, sp) → hotspot f_x, bandW(bands, yFrac), dampC(sp, arrive01)

fgplane.js new FrontPlane(svgRoot)
           .resize(viewW, viewH, worldH)              # re-anchors the plane floor
           .render(dt, rcam)                          # assign pooled strands + sway

food.js    also exposes .positions() → [{x, y}]   # live items, for the minnow feast

ui.js      initUI({ onReset, onGreet, onStart, onSkip, onMenu, skipTitle }) → { paused(),
           showGreet(v), levelUp({axis, level}), tick(dt) }
               # tick drives the popup queue (docs/08); pause freezes it.
               # Also owns the title screen (#title, docs/08): boots visible
               # over attract mode, hands off to onStart, gates Escape/keys.

progress.js  progress (singleton) — docs/08 for the level layer
           .value(axis) → 0..1     # the level's quantized step, bloom-eased over
                                   # BLOOM_T after a level-up; URL override verbatim
           .level(axis) → 0..30, .add(axis, amount), .reset()
           .tick(dt)               # advances the bloom (main calls it per frame)
           .consumeLevelUps() → [{axis, level}]   # one per level crossed, in order
           .dial({axis, threshold, curve, rampWidth, max}) → value
           URL previews (not persisted): values > 1 = a level (?eelmagic=12),
           ≤ 1 = a raw axis fraction (?life=0.35)

veil.js    new Veil(el, worldH)
           .update(camY, light01)                     # translate; rebuild on LIGHT change
```

## Resize strategy

On `resize`: recompute `W, H, dpr`; SVG viewBox updated; eel re-derives `SEG`/`widthScale`
from the new body length (spine points are kept — the eel just re-scales); water rebuilds the
kelp vertex buffer and re-seeds any offscreen motes. Mobile browser chrome show/hide fires
resize constantly, so everything in the resize path must be cheap and allocation-light.
