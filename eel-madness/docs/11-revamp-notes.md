# The Revamp — initial direction notes (NOT a spec)

Jotted 2026-07-05 from Matt's direction notes. **Nothing here is being
implemented yet.** The plan of record: finish **one more clean-up / small-
feature iteration on the current game** (the P4 follow-up pass), then get
serious about planning this overhaul as its own design effort.

## The direction

A serious overhaul of the game, refocused on **exploration**:

- **Dark seafloor tunnels** — navigating them is the core activity. The
  infinite sea stays, but the seafloor becomes a *place*: tunnel entrances,
  interiors, hidden branches.
- **Managing light** — darkness stops being just an early-game veil state and
  becomes an ongoing resource/tension axis. The new EEL LIGHT power (ambient
  glow + flare, docs/10) is the seed of this: what does it cost, how far does
  it reach, what does flaring risk or reveal?
- **Finding secrets** — hidden items, hidden tunnels, things deliberately
  tucked behind flora and terrain (the dressing shaker was the first toe in
  this water).
- **Powers gate regions** (metroid-shaped progression):
  - boost level 1 breaks seafloor rocks (SHIPPED, docs/10);
  - boost level 2 breaks *harder* rocks that block certain tunnel entrances;
  - some other power TBD unlocks access to further regions inside the
    tunnels (or elsewhere) — deliberately open.
- This probably means **enemies or other tension elements** — but Matt is
  explicitly interested in **nontraditional approaches** to tension and
  difficulty that also *encourage fun maneuvering* (the wiggle is still the
  game).

## Tension without goblins — candidate directions (brainstorm, unvetted)

Sketches to react to, not decisions:

- **Currents & flows** in tunnels: push/pull fields that make maneuvering the
  challenge — ride them, fight them, time them. Pure movement tension.
- **Light as the pressure**: places where your light draws something, or
  where flaring is the only way to see but costs something — dark/quiet vs
  lit/exposed as a rhythm.
- **Fragile terrain**: silt clouds you kick up that blind you, collapsing
  passages on a timer, brittle formations a boost shatters *behind* you.
- **Shy hazards**: creatures that are dangerous only if startled (the octopus
  startle-dodge already sketches this grammar) — care, not combat.
- **The squeeze**: tunnel geometry itself as the antagonist — gaps sized to a
  relaxed body vs a fast straight one (the spine sim makes body *shape* a
  real input).
- **Getting lost**: no map, landmarks and seeded layout as the navigation
  challenge; light management decides how much you can read.

## The carry mechanic

The eel's collision physics already *emergently* lets it catch and push items
across the scene (mouth-closed food bounces off the whole spine). Matt: this
is obviously something to play with, e.g. inside tunnels — **non-food items
on more or less the same physics** (pushable, carryable, losable). Sketch
uses: pushing a glowing thing through a dark tunnel as a portable lamp;
fitting a thing into a slot; ferrying a fragile thing without boosting.
Not implemented; noting that food.js's bounce code is the reference physics.

## Process

1. **Now**: the P4 follow-up pass (docs/10 amendments) — last small iteration
   on the current game.
2. **Next**: a real planning round for the revamp — scope, what carries over
   (the eel, the rendering stack, progression axes?), what the first playable
   slice of "tunnel + light + secret" looks like. Written up as its own doc
   before any code.
