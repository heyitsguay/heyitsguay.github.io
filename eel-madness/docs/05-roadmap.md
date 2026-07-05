# Roadmap

> **Status:** the game has moved past this page's milestones — the progression game
> (docs/07) is the live roadmap. P0–P2, the level system (docs/08), and the P3
> kickoff are implemented: the infinite procedural sea + spawn tensor (docs/09),
> five new species, greet-follow rubberbanding, the front kelp plane, fairies +
> jelly hue pulses, and the background seafloor. This page keeps the original M0/M1
> framing and the mobile checklist, which still applies every phase.

## M0 — Wiggling Eel Sandbox  (done)

One screen, one eel, living water. Everything in docs 01–04.

- [x] Spec & docs
- [x] Spine sim + outline rendering (the wiggle)
- [x] Steering physics with ease-in/momentum, WASD + tap-and-hold
- [x] Side-view composition: eye, pupil-look, wig (physics locks, jittered roots),
      smooth side-roll
- [x] Head contour with hinged jaw (Space = open wide, adds drag)
- [x] WebGL water: gradient + god rays, swaying kelp with eel-push, motes with repulsion,
      bubbles from the eel
- [x] 2×3-screen fixed world (3840×3240) with follow camera and depth-light gradient
- [ ] Feel pass: tune the wiggle/steering constants on desktop *and* a real phone
- [ ] Mobile mouth input

**Exit criteria:** swimming feels good enough that you idle in it. 60 fps on a mid-range
phone (or a stable 30 with the degradation levers in 03).

## M1 — Polish the creature

- Turn lean: skew wave amplitude asymmetrically through hard turns
- ~~Wig physics~~ done in M0: strands are pinned trailing chains that drift in the wake
- Dedicated dorsal-fin ribbon path (second SVG path sharing the spine, offset + lag)
- Blink (eyelid arc), idle behaviors (look-arounds, occasional dart)
- Speed-burst input (double-tap / shift) with recovery curve
- Sound: water ambience, whoosh tied to `effort`

## M2 — A world with stuff in it

Ideation gate — decide what the *game* is. Candidates that build directly on M0 tech:

- ~~Camera-follow in a larger level~~ done: 2×3-screen world, depth-light gradient
- ~~Things to eat~~ first pass done: drifting food with mouth-open eating (docs/06);
  fleeing prey via the steering model is still open
- Currents (flow fields the eel and particles both ride)
- Hiding in kelp / being seen (kelp-push already knows where the eel is)
- Collectibles that attach to the spine as decorations (the composition system is the hook)

## Testing checklist (every milestone, on-device)

- iOS Safari + Android Chrome, mid-range hardware
- Touch: hold-and-drag steering, no scroll/zoom/selection hijacks, safe-area insets
- Frame time under sustained swimming (worst case: fast swim through kelp + bubble burst)
- Resize/rotate: browser chrome show/hide, orientation change
- Battery sanity: no runaway when tab is backgrounded (rAF pauses; dt clamp catches return)
