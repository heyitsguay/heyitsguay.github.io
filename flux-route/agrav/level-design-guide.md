# FLUX ROUTE — Level Development Guide (v2)

*a frustrating plumbing simulator*

This document is the shared design surface for level work. Division of labor:
the human author owns spatial arrangement, final tutorial text, and play-feel
judgment; this doc owns the systems inventory, mechanism specs, teaching
order, and per-level intent. Sections marked **[SPEC]** describe mechanics
agreed in design but not yet implemented — they are the engine worklist for
the post-IDE-split codebase. Everything else is live in the current build.

---

## 1. Premise & voice

You are a small maintenance organism inside a derelict fluidics computer — a
machine that once thought in flows. Its red working fluid ("flux") still
leaks from ancient emitters. Your job, level by level, is to route flux into
intake basins to bring dead subsystems back online. Everything in the machine
is plumbing: switches are valves, predators are feral cleaning agents, gel is
emergency sealant that still works too well.

**Voice:** terse, diegetic where free, instructional where necessary,
controls verbatim. All tutorial copy in this doc is *functional placeholder*
— the author owns final text. Flavor and humor are author additions only.

### 1.1 Callout mechanism [SPEC]

Replaces center-screen `messages` as the text system. A callout is:

```js
{ t: 12,                    // sim-clock seconds, OR:
  on: "capture>=0.10",      // event condition (see section 8)
  dur: 6,                   // seconds on screen
  text: "...",              // desktop text
  textTouch: "...",         // optional touch variant
  at: [u, v],               // optional UV anchor; omitted = banner position
  size: 1.0 }               // scale multiplier on base font
```

Anchored callouts render in the DOM layer and must map UV→screen through the
same letterbox/portrait transform as input (anchors stay glued to their
subject when the phone rotates). Banner callouts stack; anchored callouts
don't collide-resolve (author's job to not overlap them).

---

## 2. Mechanics inventory

### 2.1 Species

| Species | Personality | Source |
|---|---|---|
| RED — flux | baseline water (visc 1, curl 1); the only thing that scores | locked level emitters only |
| BLUE — builder | thin, lively (visc 0.1, curl 4); runs fast, eddies hard | level fixtures; rarely an item |
| GREEN — reagent | syrup (visc 10, curl 0.1); sluggish, smothers swirls | level fixtures; rarely an item |

Design stance (revised): blue and green emitters remain legal *items*, but
their primary role is **fixed environmental features** — a blue leak that
gels your line if you route carelessly, a green seep making a whole chamber
syrupy. The interesting verbs are routing around them, sealing them off, and
exploiting them; handing the player a blue emitter is the exception that
makes a specific level tick.

### 2.2 Reactions

- **RED + BLUE → GEL.** Interface membranes; porous below threshold (drags
  flow and wading bodies), solid above (wall for everything); erodes under
  fast flow; consumes both.
- **RED + GREEN → EXOTHERM.** "Mix, slow, BAM": stagnation-multiplied
  product, logarithmic force curve. Plumbed demolition.
- **BLUE + GREEN → DYNAMITE.** Co-located blue+green deposits a stationary
  solid charge, consuming both dyes; red contact above a trigger
  concentration detonates it violently and consumes the charge. Plumbed
  demolition you must *manufacture* (section 9).

### 2.3 Zones

- **Immutable wall** — dark, blue SDF rim. Forever.
- **Removable wall** — slate with cyan seam; dissolver works here.
- **Blast wall** — a wall segment held closed by a pressure switch (§3.1);
  a strong enough shock deletes it permanently.
- **Slate vs steel [two matter species]** — SLATE (player paint, removable
  level walls, slate polys) is the SOFT matter: boundary pixels erode where
  |pressure| exceeds `wallTough` — blasts carve actual craters, and eroded
  player slate refunds its well. STEEL is the HARD matter: identical
  placement/erase/well mechanics, immune to erosion. Both are player tools
  with separate wells. Taxonomy: immutable SDF walls = terrain; door polys =
  switch-driven; slate = soft matter; steel = hard matter; pressure-switch
  walls = authored binary demolition.
- **Intake (sink)** — win zone; sustained capture (`winFraction` held
  `winHoldSec`). Always red-masked.
- **Drain** — voids all dye.
- **Media zones** — local physics weather: curl, velocity death, dye fog.
- **Flow zones [unified]** — directional thrust regions, plain or
  **red-powered** (the old amp behavior). Design-time they are polygons with
  constant direction/strength; at load they rasterize into the SAME buffer
  the player's drawn lanes use — one in-level mechanism, two authoring
  faces. Powered zones render warm amber chevrons, plain zones teal.
- **Switch zones [SPEC]** — replace gates/trigger/sensor wholesale; section 3.

### 2.4 Entities

Player (swim, spin — governed by a **spin tier**: terminal spin speed
ω_max = spinAccel/spinDamp, tiers lower the effective damping; tier pickups
raise ω_max, with higher tiers visually throbbing harder · collide, wade) ·
Fan · Emitter (angle and/or strength
lockable — see 2.6) · Spring piston · Predator (spiral-suction vortex, eats
dye, hunts red gradients, finite life, leaves churning wake) · Nest ·
Pickup.

### 2.5 Player matter tools [IMPLEMENTED — well model, section 5]

- **Slate (walls):** paint solid matter; right-click/erase-gesture removes it
  and refunds the well.
- **Flow lanes:** drag-laid directional acceleration paths (section 6).
Both draw from per-material **wells** measured in pixels, granted by pickups.

### 2.6 Emitter locks [SPEC: strength]

Per-emitter flags: `locked` (placement), `rotatable` (angle), and **new**
`tunable` (strength adjustable between `minStrength`..`maxStrength`).
Interaction proposal: hover + scroll on desktop; in touch aim-mode, radial
finger distance from the emitter sets strength while angle tracks direction
— one gesture tunes both. Puzzle value: a red emitter you may throttle but
not aim, a green seep you can choke but not stop.

### 2.7 Systemic layers

Sustained-capture win · predator wakes · per-level parameter overrides ·
events & pulses (section 8) · pickups-as-sequence (section 7).

---

## 3. Switches [SPEC — replaces gates]

One visual grammar for all conditional logic. A **switch** is a zone that
senses dye and drives any number of **targets** through rendered **wires**.

### 3.1 Sensing types

- **Volume switch:** accumulates matching dye into a bank; fires at
  `threshold`. Latched forever once fired. *Read:* a tank that fills.
- **Pressure (blast) switch:** samples |pressure| on a grid over its rect;
  the single-frame MAX crossing `threshold` latches forever. Aggregate is
  max, not sum or min: a blast is a traveling front that touches only part
  of a boundary at peak, so max detects the hit wherever it lands. Wire one
  to a wall segment and you have a **blast-destructible wall** — dynamite is
  the intended key, exo the budget option. Thresholds are pressure-rated
  armor: author them per wall.
- **Flow switch:** measures instantaneous matching flux; condition =
  flux ≥ `threshold` sustained for `holdSec`. Two latch modes:
  - **static** — once the condition is met, ON forever.
  - **dynamic** — ON only while the condition has held for the trailing
    `holdSec` window; starve it and it reverts.

### 3.2 Dye masks

Every switch has `mask: {r, g, b}` — any subset. The intake is conceptually
a red-masked volume condition. Masks enable **inhibitor switches**:

- **Inhibitor [key mechanic]:** a switch whose ON state *blocks the win
  condition* (or any target) — e.g. a blue-masked dynamic flow switch wired
  to the intake: while too much blue passes through it, you cannot win even
  with perfect red capture. Inverts the routing problem: the player must
  steer dye AWAY from somewhere. HUD: win meter shows a fault state with a
  wire-traceable cause.

### 3.3 Targets

Anything togglable: wall segments (open/close), emitters (on/off), nests
(active/dormant), amp zones, media zones, other switches (enable/disable —
shallow chains only, no general logic), event emission (section 8).

### 3.4 Visual language

- **Common switch body:** a ring-gauge fixture in the glyph family. Volume
  switches fill radially (a tank); flow switches show a flowing chevron ring
  whose speed tracks measured flux against threshold.
- **Latch mode:** static switches have a solid outer ring (clicks shut —
  permanent); dynamic switches have a dashed outer ring that visibly decays
  when starved. Taught explicitly in T-10/T-11.
- **Mask:** the gauge is tinted with the display colors of accepted species.
- **Wire:** a thin polyline from switch to each target, rendered in the
  composite (no logic, pure legibility). OFF = dim slate; ON = lit cyan with
  a slow energy-flow animation toward the target; inhibitor wires render
  warning-amber and lit means *blocked*. Wires are authored as point lists.

---

## 4. (reserved — merged into 3)

## 5. The well model for player matter [IMPLEMENTED]

Replaces paired add/erase items and seconds-based budgets for slate and flow
lanes. Per material, the player has a **well**: a pixel quantity.

**Invariant, not transaction:** rather than tracking pixels added/removed per
stroke (readback-heavy, drift-prone), the engine enforces *extant material ≤
well capacity*. The field's current total is already cheaply summable into
the telemetry row each frame; painting is permitted while `sum < well`, and
erasing lowers the sum — refund is automatic and exact by construction.

Consequences worth designing around:
- **Relocation is free:** matter is owned, not spent. Scaffolding puzzles —
  build a vane, use it, erase it, rebuild it downstream — become the genre.
- **Erase is universal:** right-click (desktop) / dedicated erase mode
  (touch) removes the active material and visibly refills the well gauge.
- **Decay refunds:** if any future mechanic destroys player matter
  (erosion, blast chipping), the sum drops and capacity returns — reads as
  conservation, feels fair. (Decision locked: yes, refund.)
- Wells are granted by pickups (`gives: "slate", pixels: 600`) and shown as
  gauges in the HUD/toolbar.
- AMENDED in implementation: level removable walls live in the same field
  as player slate, so they count against `wells.slate` and erasing them
  refunds the player's pool — **matter harvesting**. A level with removable
  walls and a small (or zero) well makes reclaiming the machine's own slate
  the opening move. The old "dissolver seconds" grant is gone; demolition
  scarcity now comes from well capacity and from blast walls (§3.1).

## 6. Flow lanes (drag-laid acceleration) [IMPLEMENTED]

A placeable directional-force field, the moving-walkway counterpart to slate.

**Gesture:** press-and-drag (Shift+drag desktop / double-tap-and-drag touch,
mirroring wall painting). The drag polyline is collected; each sampled
segment lays a capsule of force field whose direction is the segment tangent
(smoothed over ~3 samples to kill jitter). Lane width = brush radius.

**Field:** an RG16F "lanes" buffer storing direction×strength per texel;
applied as a force pre-projection (same slot as fans/amps), composited
visually as faint chevron streaks flowing along the lane direction.
Permanent until erased; erasing refunds the lanes well. Overlap rule:
last-written wins (repainting redirects a lane without erase-then-paint).

**Tuning surface:** laneForce (global), per-level lane wells, optional decay
(default 0 — lanes are owned matter under the well invariant).

## 7. Items as sequence — the scarcity doctrine

Diagnosis (from play): most current templates fall to three fans. Fans are
pure Carrier (see section 10) and carriers are the weakest puzzle currency.

Doctrine for real levels:
1. **Items are sparse, named beats.** A level is authored as a sequence:
   *collect A → use A to reach/trigger B → B yields C → … → win.* The pickup
   placement IS the level's plot. Write this chain in the level entry before
   any geometry.
2. **Pickups are gated by mechanics, not distance** — behind an inhibitor
   you must first silence, past a piston you must time, inside a chamber
   only a blast opens.
3. **Carriers never suffice alone.** Every level includes at least one
   condition fans cannot satisfy: an inhibitor (fans can't un-contaminate),
   a cold-start (amp/switch needs red before red can arrive), or a
   matter-only passage.
4. Wells make scarcity continuous: a level can grant 400 px of slate where
   the comfortable solve wants 600 — the gap is the puzzle.

## 8. Events & triggers [SPEC]

Per-level declarative list:

```js
events: [
  { on: "switch:A:on",            // conditions: time>=N, capture>=X,
                                  // switch:<id>:on/off, dyeInZone:<id>>=X,
                                  // predatorsAlive>=N, well:<mat><=N ...
    once: true,
    do: [
      { pulse: { key: "hueShift", value: 0.6, dur: 1.5 } },   // (a) time-bound
      { setParams: { exoForce: 20000 } },                     // (b) for level
      { callout: { text: "...", at: [u,v], dur: 5 } },
      { paint: { primitive: "rect", layer: "media",           // (c) stretch:
                 rect: [..], curl: 3 } }                      // mutate buffers
    ] }
]
```

(a) **Pulses** are the existing `fluxPulse` machinery — already live; use for
visual signals (hue blink on switch-fire, tonemap thump on detonation) and
mechanical lurches. (b) **setParams** rides the per-level override path. (c)
**paint** is the stretch goal: write shape primitives into the
spatially-varying buffers (media, amps, lanes, walls) at runtime — scripted
terrain changes. Implement (a)+(b)+callouts first; (c) when a level needs it.

## 9. BLUE + GREEN: dynamite

**History:** the first implementation (gradient compaction into drifting
"beads" + a ternary exo boost) worked mechanically but underwhelmed in play
— retired. Current design:

**Dynamite.** Where blue and green are co-located above a floor, dye
converts into a stationary solid field — the charge. It does not advect; it
sits where it was mixed, dragging flow like dense matter. When red dye
touches a charge above `dynTrigger` concentration, it detonates: a violent
outward blast force scaled by charge density, the charge consumed at
`dynBurn`. A burning charge bites its trigger, then **releases red of its
own** (`dynRed`, net-positive by default): the blast wave carries fresh red
into neighboring charges, so one detonation primes the next — chain
reactions are the intended endgame of any charge field. Tuning surface:
`dynForm` (deposit rate), `dynTrigger`, `dynForce`, `dynBurn`, `dynRed`.

Design notes: manufacturing is aiming — the player (or the level) co-locates
two fixture streams to lay charges, then delivers red to fire them. Charges
are terrain until triggered (blockade play), then demolition (the only
player-authored explosion that doesn't need stagnation). The bead fantasy's
"drifting mine" reading is gone; what replaced it is *plastique*: shaped,
placed, deliberate — and chainable: a line of charges is a fuse, a field of
them is a minefield that goes up together.

## 10. Epochs & the motif pipeline

### 10.1 Epochs

The game is organized into **Epochs**: contiguous level groups defined by
their available mechanism set. Each epoch adds 4–6 mechanisms; epoch N draws
freely on everything from epochs 1..N. Tutorials are not a separate arc —
they are the opening levels of each epoch, introducing its additions.

| Epoch | New mechanisms |
|---|---|
| **I · HYDRAULICS** | swim, spin, locked/rotatable/tunable red emitters, intake, drains, fans |
| **II · CHEMISTRY** | fixed blue/green fixtures, gel, exotherm, gel wading |
| **III · THE MACHINE WAKES** | pistons, media zones, powered flow zones (née amps), scripted pulses |
| **IV · MATTER** | slate well, flow lanes, relocation/refund |
| **V · SIGNALS** | volume switches, flow switches (static/dynamic), dye masks, inhibitors, wires & event feedback |
| **VI · FAUNA & DEEP CHEMISTRY** | predators, nests, wakes, B+G dynamite |

Ordering is settled through III (machinery before tools: it adds perception
and timing, not new verbs, so it paces the curve without crowding it). The
constraint that matters is *measured growth* and that each epoch's additions enable a
genuinely new verb, not just new furniture.

### 10.2 The motif pipeline

Named motif seeds are the OUTPUT of a four-stage process, not an input:

1. **STAGE 1 — Mechanism catalog.** Sections 2–9 of this doc.
2. **STAGE 2 — Free association (high volume, low filter).** Per epoch,
   generate many candidate mechanism sequences/interactions using only that
   epoch's cumulative set. Duds are expected and useful — they map the
   space's edges. The current batch is §10.4; it grows in working sessions.
3. **STAGE 3 — Review & cull (joint).** Score against the rubric in §10.3,
   weighted by author play-feel. Keep roughly a third.
4. **STAGE 4 — Refine to motif seeds.** Survivors get a name, a one-line
   interaction thesis, and an epoch tag; they become the vocabulary campaign
   levels are composed from. §10.5 holds the (currently empty) seed table.

### 10.3 Culling rubric

- **Feedback or inversion:** does it contain a sensor→actuator feedback edge
  OR an inversion (routing bad dye, erasing as progress, hazard as tool)?
- **Carrier test:** do carriers alone (fans/lanes/spin) fail to solve it?
- **Legibility:** can the player SEE the causal chain (wires, gauges,
  visible reactions) without documentation?
- **One new thought:** does it exercise its epoch's additions, not just
  restage an earlier epoch's solve?
- **Engine cost:** implementable with spec'd mechanics, no new systems.
- **Author gut:** play-feel veto/promotion overrides all of the above.

### 10.4 STAGE 2 — free association batch 1 (raw, unculled)

**Epoch I — Hydraulics**
1. Two locked fans oppose head-on; the player's parked spin breaks the symmetry left or right.
2. Emitter rotatable but the intake is behind it: the stream must be U-turned via a racetrack loop.
3. Drain checkerboard: only a high arcing jet clears it; any sag is taxed on the HUD.
4. One fan, two gaps: placement chooses which gap the player must personally patrol forever.
5. Spin budget as the level's only fuel: no fans, three corners, ration the meter.
6. The jet must be reflected off a back wall to reach an intake upstream of the emitter.
7. Fan ladder: chained jets climb against a drain-lined floor that pulls like gravity.
8. Player-as-valve: a throat narrow enough that the player's body plugs it; redirect by standing there.
9. Decoy basin: two green-ish rings, one is a drain — visual literacy as the puzzle.
10. Wake surfing: the jet alone is too weak; swimming laps inside the stream adds the missing momentum.

**Epoch II — Chemistry**
1. A blue waterfall crosses the route: tunnel under it with a red-fed gel roof.
2. Green moat: red crosses syrup by detonation ferry — small charges hop the flux forward.
3. Gel kiln: run parallel red/blue lines to grow a pipe, then route flux through your own plumbing.
4. Exo bellows: rhythmic detonations in a pocket pump the main line uphill — explosion as piston.
5. A blue leak fouls the intake: grow a gel berm at a distance to divert it.
6. Green as brake: seed a storm chamber with syrup until the eddies die, then cross.
7. Sacrificial split: 20% of the red feeds a gel dam protecting the other 80% — flux as building budget.
8. Detonation mining: the level pre-grows a dense gel plug; blast it open.
9. Two-leak crossfire: blue and green fixtures aimed at each other; thread the gap between two reactions.
10. Gel weir cascade: a stepped series of player-grown dams turns one violent jet into a calm staircase.

**Epoch III — The machine wakes**
1. Piston organ: staggered pistons phase-pump a gallery; entry timing is the puzzle.
2. Amp ladder cold start: each amp feeds the next; prime the first with a brief deliberate burst.
3. Storm lighthouse: a calm media disc inside a storm; the switch gauges are readable only from the calm.
4. Order of operations: an amp corridor crosses dead water, but an inhibitor disables it until silenced.
5. Pulse quake: scripted pulses triple curl for two seconds on a schedule; build quake-proof plumbing.
6. Piston-fed switch: only the piston's pumped slug can hold a dynamic switch through its stroke.
7. Fog ledger: dye fog taxes 30%/s — the route must be SHORT; media forces economy walls never could.
8. Afterburner discipline: an amp aimed past a drain — overfeed and it throws your flux away.
9. Breathing weather: events rotate the media zones on a timer; re-aim on the beat.
10. Midpoint betrayal: at 50% capture an event flips a key fan 180° — the level has a second act.

**Epoch IV — Matter**
1. One vane, three jobs: the well holds one wall; the route needs it in three places, sequentially.
2. Lane bridge over a drain lake; the well forces the shortest crossing — geometry as economy.
3. Throttle band: a tunable red emitter overshoots into a drain at full power, dies in fog at low — find the band.
4. Lane through a window: a drawn lane sustains a threshold only at one emitter strength — two dials, one answer.
5. Erase-to-open: the level pre-spends your well on a wall whose reclamation opens a leak you must then manage.
6. Lane time-share: one well, two intakes that alternate; redraw the lane on a rhythm.
7. The long ladle: lanes reach where fan budgets can't — draw a river across dead distance.
8. Pocket release: wall a chamber, fill it with green, erase the wall — a syrup slug as a moving plug.
9. Shared cap: slate and lanes draw from one combined well; choose your material identity per attempt.
10. Vane sculpture: a storm chamber crossed not by force but by three precisely-angled slate deflectors.

**Epoch V — Signals**
1. Dead man's valve: a dynamic flow switch on the final door demands a permanent parallel feed.
2. Contamination clause: a blue-masked inhibitor near the intake; the fixed blue leak must go elsewhere.
3. Toll then tax: a volume switch opens door one; the same stream must then also hold a dynamic switch.
4. Green-only window: route syrup (slow!) through a mask sieve to unlock — a patience puzzle.
5. Inhibitor standoff: two inhibitors whose naive fixes trip each other; a third routing wins.
6. Wire detective: five switches, unlabeled; the lit wires are the only documentation.
7. Mask sieve corridor: R, G, B flow switches in series — purify the line to one species.
8. Bootstrap emitter: a dormant red emitter wakes only when fed red — and there is exactly one other source.
9. Hysteresis clock: a dynamic switch deliberately starved and refed becomes a self-oscillating door; ride it.
10. Fault tree: win blocked, three amber wires lit, only one inhibitor is actually fixable — diagnosis.
11. Switch chain with one rotten link: latching switches in series, but one is dynamic — find which.

**Epoch VI — Fauna & deep chemistry**
1. Bead minefield: pre-seeded B+G beads drift the gallery; thread them or sweep with a sacrificial trickle.
2. Bead herding: lanes push beads (they're dye) into the predator lane — mines as pest control.
3. Nest metronome: two out-of-phase nests create safe windows; wired gauges display the rhythm.
4. Wake farming: lure predators across a storm zone so their wakes deaden it — pests as terraformers.
5. Scent shadow: an inhibitor blocks win while predators feed; route red where they cannot smell it.
6. Bead factory: tunable blue+green fixtures co-aimed; manufacture mines at a chosen rate.
7. Escort the slug: one fat red payload, one gauntlet, every defense protecting a single delivery.
8. The hive: a sensor-held wall cages a nest — but the feed that holds the cage is also their dinner bell.
9. Domestication: correctly fenced, predator suction vortices PUMP the line.
10. Heart finale: scheduled destabilization pulses, drifting beads, every switch type, every well rationed.

### 10.5 Vignette log (observed in play)

Cool emergent interactions noted during play sessions; raw material for
finishers, set-pieces, and motif seeds. Append liberally.

1. **Lava flourish.** A green emitter placed close beside a red emitter,
   both facing the same way, with the v0.5 exo settings: the co-moving
   streams burn continuously into channels of glittering fiery lava across
   the screen. Level use: a switch wired to a dormant green emitter mounted
   beside the level's red source — flipping it ends the level in a
   spectacular full-screen flourish.

2. **Blast-cast gel.** Dynamite detonated near a well-placed blue emitter:
   the explosion disperses its released red straight through the blue cloud,
   and a whole shell of gel condenses in the blast's wake — demolition that
   *builds*. The explosion is a casting mold: charge placement + blue
   fixture position decide the cast's shape. Level uses: blow a charge to
   simultaneously open one passage and gel-seal another; or a level where
   the only way to build the needed dam is to detonate next to the leak you
   are trying to seal.

### 10.6 STAGE 3/4 — cull record & motif seeds

**Cull record.**
- *Epoch I (session 1):* kept 1, 2, 4, 5, 7, 8, 9, 10. Cut 3 (drain
  checkerboard — pure tax, no inversion or feedback) and 6 (wall
  reflection — a carrier-only solve). Author's verdict; rationale glosses
  are the editor's reading.
- Refinement notes: #5 was written against the retired spin *budget*;
  recast for spin *tiers* as positional economy (see "Three Corners").
  #9 plays better as a garnish inside other levels than as a level of its
  own (one read, then it's spent) — seeded but flagged garnish-grade.
  Tunable emitters joined Epoch I (taught beside rotation), so throttle
  play is legal here.

| Seed | Epoch | Interaction thesis |
|---|---|---|
| **The Tiebreaker** | I | Two locked fans cancel head-on; a parked, spinning body is the asymmetry that decides which way the stalemate breaks. |
| **The U-Bend** | I | The intake sits behind the emitter; the jet must be turned 180° by a swum racetrack circulation — the player is the pump's return loop. |
| **The Porter** | I | One fan, two gaps: the fan holds one door forever, the player personally works the other. Placement is a staffing decision. |
| **Three Corners** | I | No fans; corners turn only on parked spin, and base-tier torque can't serve them all — park where one body's wake does two jobs. |
| **The Updraft** | I | A drain-lined floor taxes everything that flies low; a fan ladder buys altitude rung by rung, and sag is money. |
| **The Stopcock** | I | A throat exactly one body wide: the player IS the valve — and leaving to do anything else reopens the leak. Pairs naturally with sustained-capture wins. |
| **The Imposter** | I | Two basins; one is a drain wearing the intake's silhouette. Reading the glyph contract is the solve. *(garnish-grade)* |
| **The Escort** | I | The jet is too weak to arrive alone; swimming laps inside the stream donates wake momentum. The player as escort pump. |

## 11. Tutorial arc (v2)

Tutorials are the opening levels of their Epochs (§10.1). Epoch I's set is
authored in §12.1 (E1-T1..T4, superseding T-01..T-03 below); remaining
epochs: T-04/05 Epoch II, T-08/09 Epoch III, T-06/07 Epoch IV, T-10/11
Epoch V, T-12 Epoch VI — renumbering to epoch order happens when levels
become files. Format: **Thesis** · **Introduces** · **Layout intent**
(verbal) · **Teaching beats** (functional placeholder copy; author owns
final text) · **Failure teaches**.

### T-01 · INTAKE
Thesis: aim the leak at the intake, feel the water.
Introduces: premise, swim, rotate-a-fixture, intake, sustained capture.
Layout: one chamber, zero items/wells, one locked `rotatable` red emitter
aimed wrong on load; near-self-solving once aimed; player's wake covers the
last margin. Beats: (1) premise; (2) rotate controls [D]/[T]; (3) "hold the
capture level — a working machine, not a lucky splash"; (4) on
`capture>=0.10`: swimming is also pumping. Failure teaches: the meter is the
objective.

### T-02 · TORQUE
Thesis: your body is a rotating machine part.
Introduces: spin, spin tiers, curveball bounce.
Layout: non-rotatable emitter; one corner only a parked, spinning player can
turn — but base-tier spin barely stirs it. A tier-1 spin pickup en route is
the level's hinge: collect, return, and the same corner yields. Beats: spin
controls; "a spinning body is a pump"; "that part made you a faster motor."
Failure teaches: position-then-spin; pickups change what your body can do.

### T-03 · LEAKAGE
Thesis: the machine taxes sloppy plumbing.
Introduces: drains, first fan, placement controls.
Layout: straight line crosses a drain field; arc route sags without one
well-placed fan (budget: 1, not 3 — scarcity doctrine starts here).
Beats: drains return nothing; placement controls; "spare parts are counted."
Failure teaches: HUD as accounting.

### T-04 · SEALANT
Thesis: blue is a building material — and the machine leaks it too.
Introduces: gel, FIXED blue emitter as environmental hazard, wading.
Layout: a fixed blue leak crosses the natural route, gelling careless red;
the solve seals the leak by feeding it red deliberately (gel dam at the
leak's mouth) — the hazard is the material. No blue item.
Beats: gel forms where red meets blue; "seal the leak with what it fears";
gel softens under fast flow. Failure teaches: reactions live at interfaces.

### T-05 · REAGENT
Thesis: mix, slow down, BAM.
Introduces: exo, stagnation trigger, fixed green seep.
Layout: dead pocket the stream can't cross; a fixed green seep pools there;
red admitted into the pocket stagnates and detonates across the gap. A
fast-mixing attempt fizzles by design. Beats: "with flux it burns — but only
where the water rests"; saturation note ("more reagent is not more boom").
Failure teaches: stillness is the fuse; stagnant zones are readable terrain.

### T-06 · SLATE
Thesis: matter is owned, not spent.
Introduces: the slate well, paint/erase/refund, removable vs immutable.
Layout: a route requiring a guide vane in position A *then* a dam in
position B — but the well only holds enough for one. Erase-and-relocate is
the level. A slate pickup en route demonstrates well refills. Beats: paint
and erase controls + the well gauge; "erasing returns matter to your well";
seam-vs-dark wall contract. Failure teaches: scaffolding thinking.

### T-07 · LANES
Thesis: draw the current you wish existed.
Introduces: flow lanes, the drag gesture, the lanes well.
Layout: a long doglegged gallery, no fan budget; one continuous drawn lane
carries the stream through; well sized so the lane must be efficient (no
scribbling). A redraw-to-redirect moment (overlap rule). Beats: drag
gesture; "lanes are matter too — erase refunds"; chevrons show direction.
Failure teaches: economy of line.

### T-08 · MACHINERY
Thesis: the machine still moves and does not care that you're in the way.
Introduces: pistons, body collisions, stolen impulses.
Layout: piston corridor; passive solve (time the gaps) and active solve
(the stroke is a free pump). Survivable bounce showcases restitution+spin.
Beats: "their stroke is a pump — steal it"; collision is physics, not damage.
Failure teaches: timing as mechanic.

### T-09 · WEATHER
Thesis: some water is haunted — read it before you trust it.
Introduces: media zones, amp zones, red-as-fuel, first cold-start.
Layout: three lanes (storm/dead/fog), none works raw; an amp in the dead
lane bootstraps once a trickle of red reaches it. Beats: "the machine has
weather"; "the amplifier burns flux as fuel — feed it and it feeds you."
Failure teaches: observe a test stream before spending.

### T-10 · SWITCHES I
Thesis: doors that want paying.
Introduces: switch body grammar, wires, volume switch, static flow switch.
Layout: two doors. Door 1: volume switch (fill the tank once, latched —
solid ring). Door 2: static flow switch (sustain a feed for holdSec once;
latches — solid ring with chevrons). Wires visibly connect switch→door and
light when ON. Beats: gauge reading; "solid ring = it remembers";
wire = cause. Failure teaches: state vs payment.

### T-11 · SWITCHES II
Thesis: doors that want feeding — and one that wants you to stop.
Introduces: dynamic flow switches (dashed ring, decays), inhibitors, masks.
Layout: a dynamic switch holds the final door open only while fed — forces
a permanent parallel line. Then the twist: a blue-masked inhibitor wired to
the intake; a fixed blue leak currently trips it (warning-amber wire lit;
win meter shows the fault). The player must divert/seal the blue away from
the inhibitor window while keeping the red feed alive. Beats: "dashed ring =
it forgets"; "amber wire = something is wrong upstream"; mask tints.
Failure teaches: routing the BAD dye; reading fault state through wires.

### T-12 · FAUNA
Thesis: something else lives here, and it is hungry for exactly what you need.
Introduces: predators, nests, wakes; full-kit defense review.
Layout: one long-period nest harassing the main line; gel armor, slate
fencing, syrup bogs, and patience (`predTtl`) all valid; the wake forces one
re-route. Beats: "they drink flux and they smell it"; "what they leave is
worse than what they take." Failure teaches: defense is plumbing; the wake
is the true cost.

---

## 12. Campaign levels

Designed per-Epoch from the §10.6 motif seed table once that epoch's
stage-3 cull has run. Each entry is authored as: thesis → **item/trigger
sequence chain** (the plot, per §7) → content sketch → geometry sessions
(author owns spatial layout). No campaign level is designed from an
unculled association.

### 12.1 EPOCH I roster — HYDRAULICS

Eight entries: four tutorials, four levels. Tutorials cover the author's
required set: premise (red → intake), drains, emitter rotation AND emission
scaling, spinning, fans. Supersedes §11's T-01..T-03 for Epoch I.

**E1-T1 · INTAKE** *(tutorial)*
Thesis: aim the leak at the basin; the meter is the objective.
Introduces: premise, swim, rotate-a-fixture, intake, sustained capture.
Sketch: one chamber, a locked `rotatable` red emitter aimed wrong on load;
near-self-solving once aimed; the player's wake covers the last margin.
Beats: premise; rotate controls; "hold the level — a working machine, not a
lucky splash." Failure teaches: capture is sustained, not splashed.

**E1-T2 · THROTTLE** *(tutorial — new)*
Thesis: strength is a dial, not a switch.
Introduces: tunable emitters (wheel / finger-distance), reading overshoot.
Sketch: a `tunable` emitter (rotation locked) faces the basin across a drain
pit; full strength overshoots — the jet slaps the far wall and sloshes into
a drain behind the basin; low strength sags into the pit. Only a band of
strengths lands. Beats: throttle controls; "too much is also a leak."
Failure teaches: both extremes feed drains; watch where the water actually
goes, not how hard it leaves.

**E1-T3 · TORQUE** *(tutorial — §11 T-02 v2 as written)*
Thesis: your body is a rotating machine part; pickups change what it can do.
Introduces: spin, spin tiers (tier-1 pickup as the level's hinge).

**E1-T4 · LEAKAGE** *(tutorial — §11 T-03 as written)*
Thesis: the machine taxes sloppy plumbing.
Introduces: drains as terrain, the first fan, scarcity (budget: 1).

**E1-L1 · TWO DOORS** *(seed: The Porter)*
Thesis: placement is a staffing decision.
Chain: survey both gaps → place the single fan → personally patrol the
other gap → win.
Sketch: the duct from emitter chamber to intake chamber splits through two
separated gaps; flow leaks through whichever gap is unattended (drains
beyond each). The fan can hold exactly one gap forever; the player works the
other. The wrong placement isn't unwinnable — it's *exhausting*, which is
the lesson.

**E1-L2 · RACETRACK** *(seeds: The U-Bend + The Escort)*
Thesis: you are the return loop.
Chain: aim the emitter into the loop → swim laps to establish circulation →
escort momentum until the U-turn arrives at the intake → hold.
Sketch: an annular chamber; the intake sits BEHIND the emitter's mount. The
emitter is deliberately weak (locked low strength): its jet alone dies
halfway around. Circulation is built, not found — laps inside the stream
donate wake momentum until the loop self-sustains enough to hold capture
with light maintenance.

**E1-L3 · THE VALVE ROOM** *(seeds: The Stopcock + The Imposter garnish)*
Thesis: your body is plumbing — read the room before you plug it.
Chain: identify the true intake among look-alikes → plug the leak throat
with your body → hold position while the meter climbs.
Sketch: a manifold chamber: the feed passes a one-body-wide throat that
bleeds to a drain gallery; downstream, two ringed basins, one a drain in the
intake's silhouette. Plugged, the stream reaches the true basin; unplugged,
the leak starves it. Sustained-capture win makes the hold itself the level —
the player finishes it parked, feeling exactly like a valve.

**E1-L4 · STALEMATE** *(epoch finale — seeds: The Tiebreaker + The Updraft,
Three Corners flavor)*
Thesis: the machine cancels itself; you are the casting vote.
Chain: read the opposed-fan stalemate → set the feed's throttle → park in
the seam and spin to break the symmetry the right way → the fan ladder
lifts the stream over the drain floor → hold.
Sketch: two locked fans oppose head-on across the main duct, pinning the
emitter's stream in a standing seam. The floor below is drain-lined; the
intake is high on the far side, reachable only via a pre-placed fan ladder
on ONE side of the stalemate. Breaking the tie the wrong way feeds the
floor. Parked spin direction decides everything; throttle controls how
violently the seam breaks.

Reserve: **Three Corners** as a full level if the epoch needs a fifth;
**The Imposter** redeployable as garnish anywhere in the epoch.

---

## 13. Authoring reference (current engine schema)

```js
{
  name: "T1 \u00b7 basics",
  winFraction: 0.25, winHoldSec: 4,
  budgets: { fan: 3, blue: 0, green: 0, wallAdd: 6, wallErase: 5 },
  allowNudge: true,
  playerStart: [0.25, 0.78],                       // UV, v is UP
  removableWalls: [{ rect: [x0, y0, x1, y1] }],
  actors: [
    { type: 3, pos: [u,v], angle: 0, r: 5, strength: 430, dye: RED,
      locked: true, rotatable: true },             // emitter
    { type: 2, pos, angle, r, strength },          // fan
    { type: 5, pos, r, amp, axis, omega, phase },  // spring piston
    { type: 7, pos, period: 9, jitter: 0.3, predTtl: 14, predThrust: 0.45 },
    { type: 8, pos, r: 5, gives: "green", count: 1 }
    // gives: "fan"|"blue"|"green"|"spin1".."spin3" (spin tiers throb by tier)
    // gives: "slate"|"lanes" with count = pixels added to that well
  ],
  mediaZones: [{ rect, curl: 2.5, velDiss: 1, dyeDiss: 1 }],
  ampZones:   [{ rect, angle: 0, gain: 800 }],
  gates: [ /* legacy; superseded by switches [SPEC] */
    { id: "A", kind: "trigger", threshold: 0.05 },
    { id: "B", kind: "sensor", threshold: 1.0, releaseBelow: 0.5 } ],
  messages: [{ t: 1, dur: 7, text: "..." }],       // superseded by callouts
  paint(gs) { base(); pxRect(SOLID_C, ...); /* gs = gate/switch state */ }
}
```

PROPOSED schema additions (track with engine work): `callouts` (1.1),
`switches` + `wires` (3), `wells: { slate: px, lanes: px }` (5), emitter
`tunable/minStrength/maxStrength` (2.6), `events` (8), bead params (9).

UV coords in [0,1], v UP; physical aspect 16:9 (`dx = dy*9/16` for screen
squares); `r`/`strength` in resolution-independent reference units;
`fluxPulse(key, value, seconds)` is live for scripted lurches.


---

## 14. Serialization & the level editor

### 14.1 The fluxLevel format (v1)

A level is pure data: walls, zones, and entities. Polygons are the
design-time truth; buffers are the in-level truth (polys rasterize at load).

```js
{ "fluxLevel": 1, "name": "...",
  "win": { "fraction": 0.15, "holdSec": 4 },
  "size": "full",            // small (1/3) | medium (1/2) | large (3/4) | full
  "playerStart": [u, v],
  "budgets": { "fan": 2 }, "wells": { "slate": 450, "lanes": 0 },
  "config": { /* per-level param overrides */ },
  "polys": [
    { "kind": "solid",     "pts": [[u,v], ...] },
    { "kind": "removable", "pts": [...] },          // -> slate field
    { "kind": "slate",     "pts": [...] },          // soft matter (erodible)
    { "kind": "steel",     "pts": [...] },          // hard matter (blast-proof)
    { "kind": "sink",      "pts": [...] },
    { "kind": "drain",     "pts": [...] },
    { "kind": "media",     "pts": [...], "curl": 2.5, "velDiss": 1, "dyeDiss": 1 },
    { "kind": "flow",      "pts": [...], "angle": 0, "strength": 1, "powered": true },
    { "kind": "door",      "pts": [...], "id": "A" },  // drawn while switch A is off
    { "kind": "gel",       "pts": [...], "amount": 1 }, // pre-placed gel
    { "kind": "dynamite",  "pts": [...], "amount": 1 }  // pre-placed charge
  ],
  "actors":   [ /* full schema incl. locked/rotatable/tunable/id */ ],
  "switches": [...], "events": [...], "callouts": [...] }
```

In source, `dataLevel(json, extra)` (or `window.fluxLevelFromJSON`) turns a
serialized level into a LEVELS entry — and `extra` merges declarative
additions on top (events, custom paint, anything), so the workflow "import a
built level, then extend it in code" is one call.

### 14.2 The editor

Title menu → EDITOR. The sim runs live while editing (win check disabled).
Modes: **select** (click an entity → full property panel: angle, strength,
locked/rotatable/tunable, min/max strength, species, nest timing, pickup
gives/count, id; drag to move; Delete removes), **entity** (click to place),
**polygon** (click vertices, "close polygon" commits with the panel's kind +
properties). Shift+click still does normal play interaction inside the
editor — slate/lane painting and item placement work for testing. Export
copies the JSON (with `config` capturing every tuning param changed from
defaults); import accepts any fluxLevel string. Polygons of kind
`win` mark the goal basin (`sink` remains a loading alias for older
strings). Click a placed switch in select mode to edit its condition live
and build its **target list**: pick any entity (auto-id'd) or removable /
slate / steel wall poly, choose enable / disable / **delete** / **modify**
(modify applies a captured angle+strength state while the switch is ON and
restores on release; wall polys are cut from the matter field when fired).
Ctrl+Z walks a 40-deep undo history over the whole level state, and every
panel control has a mouseover description. **Rectangle** mode drags
axis-aligned polys of any kind — including **switch** rects (kind, threshold,
holdSec, latch, mask, inhibit set in the panel; targets/wires by id in JSON,
and switches with actor-id targets but no authored wires get a straight
auto-wire at runtime). Gel and dynamite polys pre-place reactive matter with
an `amount`. A resolution-independent 480×270 design grid snaps all editor
input (toggle in panel; hold Alt to bypass). The tuning panel opens from the
editor. Touch: single-finger taps/drags drive the same pointer logic —
mobile editing is functional v1. Events and pulse effects remain
JSON-authored: they are already a serializable lookup (`pulse` / `setParams`
/ `callout` actions on string conditions), with `dataLevel(json, extra)` as
the hook for richer source-code logic on top.


### 14.3 The game window

`size` makes the playable field a centered sub-rect of the 16:9 frame
(small = 1/3, medium = 1/2, large = 3/4). It is first-class: the engine
auto-paints solid beyond the window (no hand-built border walls), the
composite renders the outside as a quiet page backdrop with a thin glowing
frame, and the HUD/toolbar anchor just outside the window's edges so chrome
never floats in dead space. Resolution independence is untouched — the sim
grid is unchanged; a smaller window is simply less of it.

The editor grid is defined against the window, not the screen: the slider
sets N square subdivisions of the window's short axis (so cells stay square
at any window size), the lattice originates at the window corner, ragged
cells along the long axis clamp to the window edge, and the grid is drawn
faintly while snap is on.


### 14.4 Tutorial sequencing (declarative timeline)

Sequencing on top of a serialized level follows the standard cutscene-track
model: a flat list of fire-once steps with absolute times, an action
vocabulary, and the engine owning the clock. `{ at: 6.2, do: [...] }` is
sugar for `on: "time>=6.2"`; conditions like `capture>=` still work for
reactive steps. Actions: `callout` (banner when no `at`, world-anchored
otherwise; `*text*` renders the shimmer title style, `~text~` the soft
style; all callouts fade in/out), `emphasize` (`{id|poly|at, dur, level}` —
expanding halo rings on entities, border glow pulses on polys, both
target-tracking; `high` doubles the rings and runs warm), `enable` /
`disable` (by entity id), plus the existing `pulse` and `setParams`. Actors
serialize an `enabled` flag (editor checkbox) so entities can sleep until a
trigger wakes them. E1-T0 in source is the canonical example: raw editor
JSON into `dataLevel(json, { events: [...] })`.
