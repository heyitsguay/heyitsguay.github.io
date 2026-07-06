# Eel Madness — Overview

A small HTML/CSS/JS/WebGL game about an eel swimming around and doing stuff. What stuff comes
later; the first milestone is a satisfying proof-of-concept sandbox: a black, slender eel
swimming through a living underwater scene, controlled by keyboard or touch.

## Design pillars

1. **Satisfying swim** — the wiggle is the game. Undulation, ease-in when starting, momentum
   carrying briefly after stopping, arcing turns. If the eel feels good to move, everything
   else can be built on top.
2. **SVG-composed eel** — the eel is authored and rendered as SVG: a body path whose outline
   is regenerated every frame from a simulated spine, with decorations (eyes, wig, later more)
   composed as SVG child elements that ride the spine.
3. **Living water** — the environment isn't a backdrop. Kelp sways and reacts when the eel
   swims past, motes drift and scatter, bubbles trail from the eel. All within a mid-range
   mobile phone's frame budget.
4. **Dual input from day one** — keyboard (WASD/arrows = swim direction) and pointer
   (tap-and-hold a point = swim toward it) are both first-class, unified behind one intent
   abstraction so the physics never knows which was used.
5. **Statistically alive** — the goal is a convincing, densely active world of clever
   animated SVGs *around the camera*. Fauna is not tracked globally: critters that stay
   distant are culled and fresh ones spawn just offscreen, so what you see always matches
   the spawn rates the current progression level implies (see [07](07-progression.md)).
   Density where you look, statistics everywhere else — and the statistics are
   *deterministic in space* (seeded spawn fields, [09](09-infinite-sea.md)), so rare
   creatures live at findable places in an infinite sea.

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Rendering | Hybrid: SVG eel layered over a WebGL canvas | True SVG authoring/composition for the eel; WebGL headroom for the environment. One animated path is cheap in the DOM. |
| Vibe | Moody kelp forest | Green-teal mid-depth water, kelp silhouettes, dappled god rays. Atmospheric but readable. |
| Eel look | Black and slender, cartoon head | Dark silhouette body with a near-black bluish fin-fringe stroke. Slender body, but the head is deliberately oversized with a deep-hinged jaw and huge gape — cute > accurate (a deliberate deviation from real eel proportions). |
| Stack | Vanilla JS, ES modules, no build step | Static hosting on github.io; open `index.html` and it runs. |
| Camera | Smoothed follow-cam in an infinite-x world | The sea is procedurally infinite along x (seeded, deterministic — [09](09-infinite-sea.md)), three reference screens deep. Depth = light: the surface is bright aqua, the floor keeps the original deep palette. Kelp lines the whole floor. The SVG viewBox is the camera. |
| View convention | Side view | One eye, wig on top of the head, dorsal-fin fringe. The eel swims freely in 2D (a side-on water column), and decorations smoothly swap sides when it turns to face the other way — a "roll" rather than a mirror pop. See [01-eel-wiggle](01-eel-wiggle.md). |

## Documents

- [01-eel-wiggle.md](01-eel-wiggle.md) — the crux: spine simulation, wave model, outline
  generation, SVG composition system.
- [02-movement-and-input.md](02-movement-and-input.md) — steering physics, ease curves,
  momentum, the intent abstraction.
- [03-environment.md](03-environment.md) — the WebGL kelp forest: layers, shaders, particles,
  performance budget.
- [04-architecture.md](04-architecture.md) — file layout, frame loop, coordinate system,
  module APIs.
- [05-roadmap.md](05-roadmap.md) — milestones and the mobile testing checklist.
- [06-food.md](06-food.md) — falling food: spawning, drift, the auto-mouth, eating.
- [07-progression.md](07-progression.md) — the game: dark→vibrant progression axes,
  critters, effects catalog, phases.
- [08-levels.md](08-levels.md) — the discrete level system: 30 levels per axis,
  chained level-up popups, quantization over the continuous axes.
- [09-infinite-sea.md](09-infinite-sea.md) — the procedurally infinite world: seeded
  chunks, the spawn tensor (depth bands × x hotspots × damping), P3 critters.
- [10-p4.md](10-p4.md) — the P4 build: food grades, combos + stamina bar, the
  beans & rice patch, the LOVE axis, seafloor on every plane (far-plane fog),
  rocks + the dressing shaker, new kelp types, the eel light.
- [11-revamp-notes.md](11-revamp-notes.md) — initial direction notes (not a
  spec) for the exploration/tunnels/light-management overhaul.

## Current scope

The game (see [07-progression](07-progression.md)): food falls from the surface, the
auto-mouth eats it, and eating drives four persistent progression axes that transform
a dark barren sea into a bright living one — critters, flora, magic effects, and eel
powers all dial in as each axis climbs its 30 levels, celebrated with level-up popups
([08-levels](08-levels.md)). P0–P2 and the level system are implemented; no sound yet.
The original M0 bar still applies underneath it all: swimming has to feel good enough
that you idle in it.
