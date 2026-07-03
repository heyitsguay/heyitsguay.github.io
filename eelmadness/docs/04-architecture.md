# Architecture

## Files

```
eelmadness/
  index.html        DOM skeleton: <canvas id="water"> under <svg id="eel-layer">, hint text
  style.css         fullscreen stacking, eel/wig/eye styling, touch-action: none
  docs/             these documents
  js/
    main.js         boot, resize, frame loop — owns the order of operations
    input.js        keyboard + pointer → the intent struct (see 02)
    eel.js          spine sim, outline build, SVG rendering, decorations (see 01, 02)
    water.js        WebGL: background, kelp, particles (see 03)
    math.js         clamp / lerp / expApproach / angleDiff
```

No build step, no dependencies. ES modules loaded from `index.html`; deploy = push to
github.io.

## DOM stacking

```
<body>                      position:fixed, inset:0 on both layers
  <canvas id="water">       WebGL — environment, behind
  <svg id="eel-layer">      the eel — in front, pointer-events:none
  <div id="hint">           "WASD / hold to swim", fades on first input
```

Input listens on `window`, so the SVG layer never intercepts touches.

## Coordinate system & camera

**World units = CSS pixels of a 1920×1080 reference screen; the world is a fixed
`3840 × 3240`** — window size only changes how much of it you see. The eel (fixed 375-unit
body), kelp heights, and god-ray scale are all authored in reference units so the world looks
identical on every device. Everything simulates in world coordinates; only rendering knows
about the camera:

- Camera: top-left `(camX, camY)`, eased toward centering the eel (τ = 0.3 s) with a small
  speed-scaled lookahead along the heading, clamped to world bounds, snapped on resize.
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
  dt = clamp(now - last, ≤ 50 ms)          # tab-switch protection
  intent = getIntent(eel.x, eel.y)         # input → intent
  eel.update(dt, intent, W, H)             # physics: head, chain, phase, side factor
  water.update(dt, eel)                    # particles react to eel; bubbles spawn
  eel.render()                             # spine → path d + decoration transforms
  water.render(t)                          # 3 GL draw calls
```

Update fully precedes render; `water.update` reads the eel *after* its physics step so
reactions are same-frame.

## Module contracts

```
input.js   initInput(onFirstInput)                    # once
           getIntent(screenX, screenY) → intent       # per frame; eel's SCREEN position

eel.js     new Eel(svgRoot)
           .resize(worldW, worldH)                    # body length fixed (375 world units)
           .update(dt, intent, worldW, worldH)
           .render()
           exposes: x, y, hx, hy, speed01, speedSm, effort, mouth   # read by main/water

water.js   new Water(canvas)
           .resize(W, H, dpr, worldW, worldH)         # rebuilds kelp geometry
           .update(dt, eel, cam)
           .render(cam)
```

## Resize strategy

On `resize`: recompute `W, H, dpr`; SVG viewBox updated; eel re-derives `SEG`/`widthScale`
from the new body length (spine points are kept — the eel just re-scales); water rebuilds the
kelp vertex buffer and re-seeds any offscreen motes. Mobile browser chrome show/hide fires
resize constantly, so everything in the resize path must be cheap and allocation-light.
