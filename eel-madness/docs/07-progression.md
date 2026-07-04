# Progression: from a dark barren sea to a living one

**The motif.** The game starts in near-black, empty water. Eating makes the world
richer — brighter light, more life, more magic. The reward *is* watching the sea become
beautiful. We get there by stacking *many* bespoke, low-cost effects — most of them
conventional (little light blooms, particle trails, things drifting in parallax
planes) — combined tastefully. The god rays set the tone: subtle, cheap, lovely.

Status: **P0 complete.** Landed: tuning.js + progress.js (axes, persistence, URL
overrides, dials); parameterized light + darkness veil (docs/03); food v2 with all
7 foods, contact tumbling, suck-in + axis-colored eat pulse (docs/06); marine snow;
pause menu with two-step reset and per-axis progress meters (Esc / ⏸; URL-preview
axes show "(preview)"); mobile 0.5× zoom + translucent eat button
(greet button exists, wired in P1); eel spawns near the surface. Next: P1 — parallax,
minnows, jellyfish, greet/hearts, food bubble trails.

## Decisions made

- **Persistence:** localStorage. Reset lives in a **minimal pause menu** (also the
  natural home for future options); minimal version ships with P0 alongside
  persistence itself. Timescales span sessions.
- **Timescale targets:** one session ≈ **5 minutes**; **5 sessions** to "sea fully alive."
- **Darkness is gameplay:** early on, food that sinks into the deep dark is genuinely
  lost unless you dive blind and get lucky.
- **Continuous axes**, no stages: each world element has a dial that is zero until its
  axis crosses a threshold, then creeps up along a per-element curve.
- **Parallax lives in existing surfaces:** far planes = extra silhouette passes in the
  WebGL canvas (per-layer camera factor); near-foreground = a counter-transformed group
  in the existing SVG. No new compositing surfaces.
- **Food v2 falls from the surface:** spawns just above the top of the world, sinks,
  vanishes past the bottom. No floor pile.
- **Keys:** greet = **I**, glow burst (late unlock) = **J**, mouth stays Space.
- **Mobile:** camera zoom 0.5× current (viewBox spans 2× the CSS viewport, threaded
  through GL uniforms + input mapping), plus two translucent tasteful buttons: eat
  (hold) and greet.

## The four axes

| axis | what it drives |
|---|---|
| **LIGHT** | ambient depth-light curve (start near-black at depth, end a touch brighter than today), god-ray richness, caustics, visibility depth |
| **LIFE** | flora dials (kelp, seagrass, corals, anemones…) and fauna dials (per-critter spawn probability, population, school size) |
| **WORLD MAGIC** | environmental enchantment: phosphorescence, particle effects, pulses (incl. food pixelation), glowing flora, ambient events |
| **EEL MAGIC** | the eel's own powers and cosmetics: greet → baseline glow → glow burst (J) → further powers TBD later |

**Earning:** each food drives exactly one axis by its progression amount (table below).
Axis accumulators `W` squash to a 0–1 value with diminishing returns:
`axis = 1 − exp(−W / K_axis)`. Calibration: at ~25 eats/session (5 min), pick each
`K ≈ (expected 5-session W for that axis) / 3`, since `1 − e⁻³ ≈ 0.95` — "fully alive"
lands at session 5. Session 1 must still visibly bloom within minutes (first god-ray
warmth, first minnow) — that's what thresholds near 0 are for.

**Element dials** — every gated element is one record, one shape, everywhere:

```
{ axis, threshold, curve, rampWidth, max }
value = max * curve01((axis − threshold) / rampWidth)   # 0 until threshold
```

`curve01` from a small shared library: linear, smoothstep, sigmoid, sqrt, quadratic,
log. Spawn probabilities, population caps, effect intensities, glow radii — all dials.

**Dev ergonomics:** URL overrides (`?light=0.7&eelmagic=0.2`) and a cheat key granting
axis weight, so any state of the sea is reachable instantly while tuning.

## Food v2

Authored as a CSV-shaped table (Matt's numbers). 1–10 scales map to units in
tuning.js (mapping knobs, first guess: fall 1→12 px/s, 10→90 px/s; sway amp 1→4 px,
10→50 px). **Rarity: higher = more common** (spawn weight ∝ rarity): pinecones are
everywhere, chocolate is scarce. The pacing this creates: LIGHT drips steadily from
abundant low-value pinecones; LIFE and WORLD MAGIC advance moderately; EEL MAGIC
foods (burger, chocolate) are rare with big amounts — **powers arrive as punctuated
lottery moments**, not a steady grind.

| food | rarity | fall speed | sway amp | axis | amount |
|---|---|---|---|---|---|
| salmon toast | 4/10 | 3/10 | 5/10 | LIFE | 1.0 |
| pinecone | 8/10 | 1/10 | 9/10 | LIGHT | 0.3 |
| cheeseburger | 2/10 | 7/10 | 2/10 | EEL MAGIC | 2.0 |
| soppressata | 6/10 | 5/10 | 3/10 | WORLD MAGIC | 0.25 |
| chocolate | 1/10 | 9/10 | 1/10 | EEL MAGIC | 1.0 |
| avocado | 3/10 | 5/10 | 2/10 | LIGHT | 1.0 |
| greens | 3/10 | 6/10 | 3/10 | LIFE | 1.1 |

- **No self-tumbling:** food sways laterally but holds orientation while falling.
  On contact (eel bounce), it picks up plausible angular velocity from the tangential
  impact, then spins down under water damping. Display sizes need a relative pass.
- **Eat light pulse:** on eat, the eel emits a brief colored light pulse — **color =
  the food's axis signature, intensity ∝ progression amount** (burger flashes big).
  Axis palette (approved): LIGHT warm gold · LIFE spring green ·
  WORLD MAGIC violet-teal · EEL MAGIC rose-pink. Implementation: one additive radial
  GL glow at the head, ~0.6 s ease-out.
- **Eat suck-in:** sprite swaps to a precomputed white-tinted copy (offscreen canvas at
  load — no filters), shrinks/translates into the mouth ~0.3 s; food layer is behind
  the eel so occlusion is free. Plays together with the light pulse.
- **Pixelation pulse** (WORLD MAGIC dial): ~8 precomputed pixelation levels per sprite
  (nearest-neighbor, blob URLs); pulses ease the level 1→~8→1 smoothly. Href swaps
  only.
- **Bubble trails** on falling food, character keyed to the food (fast fallers = tight
  sparse trail; big swayers = lazy scattered bubbles). Shared GL pool, per-source
  emitter spec.

## Phase-1 critters

- **Minnows** — appear solo at low LIFE; group size is itself a dial, growing into
  schools. Wiggly little swim (mini spine chain, 5–7 points). Simple flocking
  approximation once schools exist (cohesion/alignment/separation on a few neighbors,
  plus a shared wander leader). **Silvery shimmer without filters:** each minnow's fill
  interpolates between dark-silver and bright-silver as a function of its heading ×
  a slow time sine — they "catch the light" when they turn. One fill update per minnow
  per frame, ≤ a few dozen minnows: trivial.
- **Jellyfish** — pulsing bell (scale/squash on a beat) + wig-chain tentacles; drifts;
  inner glow that reads beautifully in the dark zone (WORLD MAGIC synergy).

## Eel magic track

Greet (I) is the **first EEL MAGIC unlock**, not a birthright — the axis teaches
itself by granting a power on your first EEL MAGIC food. Since those foods are rare,
the unlock threshold is tiny (raw W ≤ 1.0, i.e., one chocolate or one burger grants
it). Then, along the axis:

1. **Baseline glow** — a subtle, shimmery halo (two detuned slow sines on radius and
   alpha so it breathes); doubles as a hole in the darkness veil, so it's *useful*
   deep down — earning it changes the early "lost food" pressure.
2. **Glow burst (J)** — a brief expanding flash + temporarily larger veil hole, on a
   cooldown. Great for blind dives.
3. Further powers TBD later (deliberately open).

Cosmetic ramps along the same axis: heart palette richness, wig sparkle glints, warmer
eye catchlight.

## The effects catalog

The point of this section: *lots* of opportunities, each cheap, most conventional.
Each is a dial on some axis. Costs: ✚ = GL points/quad pass, ◐ = SVG elements,
● = shader tweak to existing pass.

**Light & glow**
- Eat light pulse at the head, axis-colored (spec above) ✚
- Eel baseline glow + glow burst (spec above) ✚
- God-ray richness ramp — count/width/warmth grow with LIGHT ●
- Caustic shimmer near the surface intensifies with LIGHT ●
- Kelp-tip glints — tiny sparkles where god rays sweep kelp tops ✚
- Phosphorescent plankton field in the deep — cyan points, brighter near the eel ✚
- Eel wake bioluminescence — fast swimming in dark water leaves brief glow points ✚
- Jellyfish inner glow, pulsing with the bell beat ◐
- Anglerfish lure — a genuine point light with its own small veil hole ✚
- Greeting glow rings — expanding circle from the greeted critter ◐
- Lantern kelp — bulbs lighting in sequence up a strand (high WORLD MAGIC) ◐
- Moonbeam shaft — rare slow diagonal beam event ●
- Golden-hour event — palette warms for ~20 s, rare, high LIGHT ●
- Aurora bands near the surface, late game — slow sinusoid ribbons, hue drift ●
- Surface underside shimmer line at y≈0, brightens with LIGHT ●
- Food glint — falling food occasionally catches the light (tiny star overlay) ◐

**Particles & trails**
- Food bubble trails (per-food character) ✚
- Surface-entry plop — ring + tiny bubble burst where food drops in at y≈0 ✚
- Marine snow — sparse slow-sinking pale motes in mid-depths (present from the start;
  the barren sea gets its own austere beauty) ✚
- Plankton swirl shed behind sharp eel turns ✚
- Spore puffs from glow-shrooms when the eel brushes them ✚
- Seabed vent bubble columns (WORLD MAGIC) ✚
- Current streaklines — faint elongated drifting lines ✚
- Drifting petals near the surface, late LIFE ◐
- Minnow dart micro-bubbles ✚
- Axis-milestone confetti — brief scatter of sparks in the axis color ✚
- Companion heart trail — a greeted companion occasionally emits a mini-heart ◐

**Parallax planes** (far = GL silhouette passes; near = SVG counter-transformed group)
- Rock spires / arches, far, static ✚
- Distant kelp wall, mid-far, density grows with LIFE ✚
- Whale or manta silhouette crossing, very far, rare event ✚
- Distant minnow-school shimmer — just drifting points, mid-far ✚
- Sunken arch/ruin that gains glowing moss with WORLD MAGIC ✚
- Depth-fog bands between planes that thin as LIGHT grows ●
- Near-foreground fronds — big soft dark leaves sliding past at 1.3× ◐
- Near-foreground bokeh — a few large translucent discs at 1.5×, very sparse ◐

**Flora & critter micro-moments** (LIFE, with WORLD MAGIC seasoning)
- Seagrass: starts **deep and sparse**, grows taller and thicker with LIFE ✚
- Fan coral growing by scale; bubble coral that occasionally burps a bubble ◐
- Anemone tendrils (chain tech) swaying; hosts a clownfish at high LIFE ◐
- Minnows briefly mob falling greens ◐
- Jelly drifts toward god rays and lingers (phototaxis) ◐
- Octopus color-pulse when greeted; ink puff if startled by a fast pass ✚◐
- Seahorse pair curl tails together — rare vignette at high LIFE ◐
- Crab claw-wave greeting; dust puff when it scuttles ✚◐
- Cleaner-fish companion after greeting: orbits the head, occasionally tugs a wig lock ◐
- Minnow school trails the eel briefly after a greet ◐

**Pulse discipline:** one shared eased-pulse helper (smooth in-out between min/max,
per-instance period and phase detune) drives pixelation, glows, bells, lanterns,
shimmer — everything breathes on related-but-unsynchronized rhythms. Tasteful = low
amplitude, long periods, never everything pulsing at once.

## Saying hello

Greet key **I** / mobile greet button: a small heart pops from the eel's head, floats
up with a wobble, fades ~1 s. Critters in range respond via one shared heart-emitter
parameterized per species — count, palette, size, motion pattern (fan / ring / spiral
/ zigzag), delay — each species gets a signature response for a few config lines.
Per-critter cooldown. Greeting hooks special outcomes (companion, octopus color-shift).

## Parameterization

**`js/tuning.js`** is the experiment surface: `AXES` (K, colors, persistence keys),
`FOODS` (the CSV table + scale-to-unit mappings), `DIALS` (every gated element),
`FX` / `CRITTERS` / `FLORA` / `LAYERS` / `MOBILE`. Structural math constants stay in
their modules; anything you'd tune to shape the game lives here.

## Implementation phases (each: doc first, then code)

- **P0 — foundations:** tuning.js + axes + persistence + dev overrides; minimal pause
  menu with reset; food v2 (drop model, CSV table, contact tumbling, eat pulse +
  suck-in); mobile zoom + buttons; parameterized light + darkness veil; marine snow
  (the sea's first texture).
- **P1 — first life:** parallax passes; minnows (solo → schools) + jellyfish;
  greet/hearts; food bubble trails + surface plop.
- **P2 — magic:** phosphorescence set, eel baseline glow, glow burst (J), pixelation
  pulse, seagrass + first flora growth, kelp-tip glints.
- **P3+ —** catalog expansion, rare events, companion, remaining powers, sound.

## Still open (deliberately)

1. Relative display sizes for the 7 food sprites (a visual pass with Matt).
2. EEL MAGIC powers beyond glow burst — decided later, the track stays open-ended.
3. Later-phase critter sequencing and which catalog effects land in P2 vs P3.
