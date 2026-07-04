# Eel Madness — agent guide

A vanilla HTML/CSS/JS/WebGL game: an eel with a platinum wig swims through a kelp forest,
eating falling food to transform a dark barren sea into a bright living one. Progression
runs on four persistent axes (LIGHT / LIFE / WORLD MAGIC / EEL MAGIC — docs/07); phases
P0–P2 are implemented.

## Workflow rules

1. **Read `docs/` first.** Start with `docs/00-overview.md`, then whichever doc covers the
   system you're touching. They are current and are meant to stay that way.
2. **Begin every development step with documentation and planning.** Before writing code for
   a new feature or a significant change, write or update the relevant doc (design intent,
   approach, constants) — then implement to match. If code and docs drift, fixing the doc is
   part of the change, not optional.
3. **Stay in this directory.** The parent repo hosts unrelated projects; don't explore or
   modify above `eelmadness/`.
4. **Don't launch browsers to test.** Matt tests by hand. After changes, give him a short,
   specific checklist of what to look at. `node --check js/*.js` for syntax is fine, and
   **run the headless suites in `tests/`** (`cd tests && node check-<name>.mjs` — they mock
   the DOM and simulate real frames). Extend them when you add mechanics; when one fails,
   check whether the test hardcodes constants Matt has since retuned before suspecting
   the code.
5. **ASK QUESTIONS, DO NOT MAKE ASSUMPTIONS.** You are instruction-tuned to be confident
   in your ability to make assumptions and guess user intent, but you are NOT capable of
   it. When observed behavior, a diagnosis, or Matt's intent is uncertain or has more than
   one plausible reading, stop and ask him — he is testing by hand and can answer quickly.
   Never present an assumption as a conclusion, and never build a fix on an unconfirmed
   hypothesis.

## Doc index

| Doc | Covers |
|---|---|
| `docs/00-overview.md` | vision, pillars, locked decisions table |
| `docs/01-eel-wiggle.md` | spine sim, wave, outline/head-contour/mouth, wig physics, eye — the creature |
| `docs/02-movement-and-input.md` | steering/easing model, intent abstraction, boundaries |
| `docs/03-environment.md` | WebGL water/kelp/particles, perf budget, degradation levers |
| `docs/04-architecture.md` | file map, frame loop, world/camera coordinate system, module APIs |
| `docs/05-roadmap.md` | milestone status, gameplay candidates, mobile test checklist |
| `docs/06-food.md` | falling food: Poisson spawner, drift, the auto-mouth probe, eat effects |
| `docs/07-progression.md` | the game: dark→vibrant progression axes, tuning.js plan, critter/FX catalog, phases |

## Facts you'll want at zero context

- **No build step.** ES modules, open `index.html` or `python3 -m http.server`. Deploy = push
  (this is a github.io subdirectory site).
- **World is fixed 3840×3240** (2×3 screens of a 1920×1080 reference); the window is a
  viewport. Everything is authored in world units; the SVG `viewBox` is the camera.
- **The eel is one SVG path** regenerated every frame from a simulated spine chain, plus
  composed decorations (eye/lashes/wig locks/mouth interior). The environment is one WebGL
  canvas behind it (3 draw calls). This hybrid is a locked decision.
- **Feel/appearance knobs are deliberately centralized:**
  - `js/eel.js` top: wiggle, easing, head contour (`HEAD_PTS`), mouth, wig geometry constants
  - `js/water.js` top + shader source strings: colors, kelp, particles
  - `js/food.js` top: food types table (sizes, spawn bands, populations, drift), eat/bounce
  - `js/tuning.js`: THE game-shaping surface — axes (K, colors), food economy CSV,
    progression dials, light palettes, veil shape, boost/greet/eat-feedback numbers
  - `js/critters.js` top: minnow/jelly feel, flocking, follow, greet signatures;
    `js/sparkles.js` + `js/hearts.js` tops: particle and heart feel
  - `style.css`: eel body/fin colors, **hair color** (`#eel-wig path`), eye colors
  - `js/main.js` top: world size, camera feel
- Matt tunes constants directly between requests — expect the file to have changed since you
  last saw it; his values are intentional, keep them.
- **Controls:** WASD/arrows or press-and-hold pointer to swim. The mouth is automatic —
  food crossing a nose probe opens the jaw (`food.probe`, docs/02 + docs/06). Greet = I
  (or the touch button), speed burst = hold Shift (or a second finger) — both are EEL
  MAGIC unlocks and silently inert before their dial thresholds. Esc or ⏸ pauses
  (axis meters + reset).
- **Progression persists** in localStorage; preview any state with URL params
  (`?light=0.7&life=0.2&worldmagic=0.5&eelmagic=1` — pinned axes show "(preview)" in
  the pause meters, a common source of "progression looks frozen" confusion).
- Cartoon over realism: proportions (big head, huge gape, flowing wig) deliberately deviate
  from real eels for visual effect. Cute > accurate.
- Perf target: mid-range phone at 60fps. No SVG filters, no GL textures/framebuffers —
  degradation levers are listed in `docs/03-environment.md`.
- Subtle-but-load-bearing details that look removable and aren't: the five-plus samples
  across the nose front (blunt vs cone), the `sideSm` side-roll factor (decoration flip
  without pops), the head-wiggle *delta* injection (sinuous path without drift), and the
  bend limit on the spine chain (no hairpin kinks).
- **Hard-won gotchas from development:**
  - CSS properties **always beat** SVG presentation attributes. Setting `opacity`/`fill`
    via `setAttribute` while a stylesheet rule targets the same property silently loses
    (this shipped two invisible-feature bugs: makeup, jelly-glow color).
  - **The renderer owns pooled-sprite visibility.** Never `display: inline` at spawn —
    reveal only on the element's first in-view attribute write of its current life, and
    hide when it leaves the render pad, or stale geometry from a previous life pops in
    mid-screen (docs/07, "No pops, ever").
  - **Lighting has one authority**: the veil (multiply layer) owns depth-brightness for
    GL and SVG alike; GL palettes carry hue only; anything emissive must live on the
    glow layer above the veil or darkness crushes it (docs/03).
  - The wig damage rect (`#eel-damage`, docs/04) works around a real Chromium
    stale-raster bug — it looks like dead code and isn't.
  - Perceptual scaling wants gamma, not linear (light curves use `light^2.2`-shaped
    responses; linear lightened the deep far too early).
