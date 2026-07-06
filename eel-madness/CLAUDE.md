# Eel Madness — agent guide

A vanilla HTML/CSS/JS/WebGL game: an eel with a platinum wig swims through a kelp forest,
eating falling food to transform a dark barren sea into a bright living one. Progression
runs on five persistent axes (LIGHT / LIFE / WORLD MAGIC / EEL MAGIC / LOVE — docs/07;
LOVE is greet-charged, docs/10), each quantized into 30 levels with level-up popups
(docs/08); phases P0–P3 and the level system are implemented, P4 (docs/10) in progress.

## Workflow rules

1. **Read `docs/` first.** Start with `docs/00-overview.md`, then whichever doc covers the
   system you're touching. They are current and are meant to stay that way.
2. **Begin every development step with documentation and planning.** Before writing code for
   a new feature or a significant change, write or update the relevant doc (design intent,
   approach, constants) — then implement to match. If code and docs drift, fixing the doc is
   part of the change, not optional.
3. **Stay in this directory.** The parent repo hosts unrelated projects; don't explore or
   modify above `eel-madness/`.
4. **Don't launch browsers to test.** Matt tests by hand. After changes, give him a short,
   specific checklist of what to look at. **Run `tests/run.sh`** — it syntax-checks all of
   `js/` and runs every headless suite (`tests/check-*.mjs`, which mock the DOM and simulate
   real frames; new `check-<name>.mjs` files are picked up automatically, and rare-RNG
   failures are auto-retried and flagged FLAKY rather than FAIL — a recurring FLAKY is a
   real intermittent bug). Extend the suites when you add mechanics; when one hard-fails,
   check whether the test hardcodes constants Matt has since retuned before suspecting
   the code. **Prefer `tests/run.sh` over ad-hoc checks** — don't hand-roll `node --check`
   loops or one-off sim snippets for things the suite already covers (syntax across all
   of `js/`, spawn/population behavior, progression math, no-pops discipline, boost,
   food); add a `check-<name>.mjs` if a case is missing, then run the suite.
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
| `docs/08-levels.md` | discrete level system: 30 levels/axis, chained level-up popups, quantization layer |
| `docs/09-infinite-sea.md` | the infinite procedural sea: seeded chunks/worldgen, the spawn tensor (bands × hotspots × damping), P3 species, GL precision scheme |
| `docs/10-p4.md` | the P4 build: food grades, combos + stamina bar, beans & rice patch, LOVE axis, seafloor on all planes (far-plane fog, blur removed), rocks + shaker, kelp types, the eel light |
| `docs/11-revamp-notes.md` | direction notes (not a spec) for the planned exploration/tunnels/light-management overhaul |

## Facts you'll want at zero context

- **No build step.** ES modules, open `index.html` or `python3 -m http.server`. Deploy = push
  (this is a github.io subdirectory site).
- **World is 3240 deep and infinite along x** (seeded procedural chunks, docs/09; was
  a fixed 3840×3240 box). The window is a viewport. Everything is authored in world
  units; the SVG `viewBox` is the camera. GL only ever sees camera-relative
  coordinates (float precision — docs/09).
- **The eel is one SVG path** regenerated every frame from a simulated spine chain, plus
  composed decorations (eye/lashes/wig locks/mouth interior). The environment is one WebGL
  canvas behind it (3 draw calls). This hybrid is a locked decision.
- **Feel/appearance knobs are deliberately centralized:**
  - `js/eel.js` top: wiggle, easing, head contour (`HEAD_PTS`), mouth, wig geometry constants
  - `js/water.js` top + shader source strings: colors, kelp, particles
  - `js/food.js` top: food types table (sizes, spawn bands, populations, drift), eat/bounce
  - `js/tuning.js`: THE game-shaping surface — axes (K, colors), level bands + level-up
    notes/popup timing, food economy CSV, progression dials, light palettes, veil shape,
    boost/greet/eat-feedback numbers, SEA (seed/chunks/cells) + SPECIES spawn records
    (bands, hotspots, damping) + FOLLOW rubberband
  - `js/critters.js` top: per-species feel (minnow/jelly/reef/seahorse/octopus/angler/
    drift-vines), flocking, follow, greet signatures;
    `js/sparkles.js` + `js/hearts.js` tops: particle, fairy, and heart feel
  - `style.css`: eel body/fin colors, **hair color** (`#eel-wig path`), eye colors
  - `js/main.js` top: world size, camera feel
- Matt tunes constants directly between requests — expect the file to have changed since you
  last saw it; his values are intentional, keep them.
- **Controls:** WASD/arrows or press-and-hold pointer to swim. The mouth is automatic —
  food crossing a nose probe opens the jaw (`food.probe`, docs/02 + docs/06). Greet = I
  (or the touch button), speed burst = hold Shift (or a second finger) — both are EEL
  MAGIC unlocks (levels 1 and 8), inert before their level and announced by guide
  popups when they arrive (docs/08). Esc or ⏸ pauses (level meters + reset).
- **Progression persists** in localStorage, quantized into 30 levels per axis
  (docs/08); preview any state with URL params — values > 1 are levels, ≤ 1 raw
  fractions (`?light=21&eelmagic=0.35` — pinned axes show "(preview)" in the pause
  meters, a common source of "progression looks frozen" confusion).
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
  - **`mediump` is fp16 on mobile GPUs** (desktop silently gives fp32, hiding the
    bug): any fragment shader touching world-scale coordinates or a growing clock
    needs `highp` + wrapped uniforms (BG_WRAP / T_WRAP in water.js) — mediump
    world-x quantized in 32 px steps and shipped as "low-res god rays".
