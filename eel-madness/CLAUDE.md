# Eel Madness — agent guide

A vanilla HTML/CSS/JS/WebGL game: an eel with a platinum wig swims through a kelp forest.
Currently at Milestone 0+ (the swim sandbox with a follow-cam world); gameplay comes later.

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
   specific checklist of what to look at. `node --check js/*.js` for syntax is fine.
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
| `docs/06-food.md` | food items: spawn bands, Poisson spawner, drift, floor pile, eat/bounce |
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
    progression dials, light palettes, veil shape. Preview any state via URL:
    `?light=0.7&life=0.2&worldmagic=0.5&eelmagic=1`
  - `style.css`: eel body/fin colors, **hair color** (`#eel-wig path`), eye colors
  - `js/main.js` top: world size, camera feel
- Matt tunes constants directly between requests — expect the file to have changed since you
  last saw it; his values are intentional, keep them.
- **Controls:** WASD/arrows or press-and-hold pointer to swim, Space (hold) to open the
  mouth. Mobile mouth input doesn't exist yet.
- Cartoon over realism: proportions (big head, huge gape, flowing wig) deliberately deviate
  from real eels for visual effect. Cute > accurate.
- Perf target: mid-range phone at 60fps. No SVG filters, no GL textures/framebuffers —
  degradation levers are listed in `docs/03-environment.md`.
- Subtle-but-load-bearing details that look removable and aren't: the five-plus samples
  across the nose front (blunt vs cone), the `sideSm` side-roll factor (decoration flip
  without pops), the head-wiggle *delta* injection (sinuous path without drift), and the
  bend limit on the spine chain (no hairpin kinks).
