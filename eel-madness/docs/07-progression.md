# Progression: from a dark barren sea to a living one

**The motif.** The game starts in near-black, empty water. Eating makes the world
richer — brighter light, more life, more magic. The reward *is* watching the sea become
beautiful. We get there by stacking *many* bespoke, low-cost effects — most of them
conventional (little light blooms, particle trails, things drifting in parallax
planes) — combined tastefully. The god rays set the tone: subtle, cheap, lovely.

Status: **P3 landed** (docs/09) — the sea is now procedurally **infinite along x**
(seeded chunks; deterministic flora, terrain, and spawn hotspots), all fauna spawns
through the factored spawn tensor (depth bands × x hotspots × LIFE-scaled damping —
population caps retired), and five new species arrived: reef fish, seahorses,
octopuses, a very rare giant octopus, and anglerfish. Also in P3: greet-follow
rubberbanding (the fan club keeps pace), the sharp front kelp plane, WORLD MAGIC
fairies, jelly hue *pulses* (replacing the static rainbow spread), background
seafloor terrain with LIFE corals and WORLD MAGIC lights, and the plankton palette
rework (medium-light greens + sporadic scoots). Previously: **Levels landed**
(docs/08) — the four axes are quantized into 30 discrete
levels each with chained, axis-colored "Level Up!" popups (guide popups for the
greet and speed-burst unlocks), a ~1.5 s bloom ease into each new step, and
axis-colored confetti sparks; pacing retuned from 5 sessions to 4; speed burst
buffed to +50%→+150% with a proportional turn-rate penalty. Previously: **P2
landed** — phosphorescent plankton (deep water, brightens near the eel)
and ambient WORLD MAGIC drift-sparkles (multicolor, spiraling, all on the glow layer
so they shine in the dark); the food pixelation pulse (precomputed levels, eased —
**cut in P3, looked bad**
1→8px pulses, WORLD MAGIC-gated); seagrass along the floor growing denser/taller
with LIFE. The eel baseline glow was built and **cut** (looked bad) — the EEL MAGIC
power after speed burst is open again, and glow burst (J) is shelved with it. Speed
burst verified working — it unlocks along `DIALS.speedBurst` (since retuned:
EEL MAGIC level 8 / 0.30, docs/08); below that, Shift is intentionally inert. Previously: **P1 + unified lighting** — the veil is now a multiplicative
illumination layer over the whole scene (GL palettes carry hue only) and emissive
sprites (jelly glow, hearts; later eel glow) live on a glow layer above it — light
sources punch through the dark (docs/03). Also in P1 — far parallax silhouettes
(rock spires + LIFE-gated kelp wall)
and near-foreground fronds; minnow school (dial-driven count, mini spine chains,
wander-leader flocking, heading-catch silver shimmer, eel-flee darts); jellyfish
(pulsing bell, chain tentacles, dark-water glow); greet on I / touch button (unlocks
with the EEL MAGIC dial; eel heart + per-species responses via the shared heart
emitter); food bubble trails + surface-entry plops. Previously (P0): Landed: tuning.js + progress.js (axes, persistence, URL
overrides, dials); parameterized light + darkness veil (docs/03); food v2 with all
7 foods, contact tumbling, suck-in + axis-colored eat pulse (docs/06); marine snow;
pause menu with two-step reset and per-axis progress meters (Esc / ⏸; URL-preview
axes show "(preview)"); mobile 0.5× zoom; auto-mouth via the nose probe — no eat key
or button on any platform (greet button exists, wired in P1); eel spawns near the
surface. Next: P1 — parallax,
minnows, jellyfish, greet/hearts, food bubble trails.

## Decisions made

- **Persistence:** localStorage. Reset lives in a **minimal pause menu** (also the
  natural home for future options); minimal version ships with P0 alongside
  persistence itself. Timescales span sessions.
- **Timescale targets** (retuned +50% in P3 — leveling felt too fast): one
  session ≈ **7–8 minutes**; **4 sessions** to "sea fully
  alive" (level 30 on every axis — sessions land levels 1–16 / 17–24 / 25–28 /
  29–30, docs/08).
- **Darkness is gameplay:** early on, food that sinks into the deep dark is genuinely
  lost unless you dive blind and get lucky.
- **Continuous axes**, no stages: each world element has a dial that is zero until its
  axis crosses a threshold, then creeps up along a per-element curve.
  **Amendment (landed, docs/08):** the presentation is discretized into 30 levels
  per axis with chained level-up popups — the continuous squash stays underneath as
  the level→value mapping; dials and curves are unchanged.
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
| **WORLD MAGIC** | environmental enchantment: phosphorescence, particle effects, pulses, glowing flora, fairies, ambient events |
| **EEL MAGIC** | the eel's own powers and cosmetics: greet → baseline glow → glow burst (J) → further powers TBD later |
| **LOVE** (P4, docs/10) | the bond with your sea friends — charged by *greeting*, not food (warm coral-red); first effect: nearby critters spontaneously greet you (`spontGreet` dial), more later |

**Earning:** each food drives exactly one axis by its progression amount (table
below) — except LOVE, which earns from successful greets (`GREET.LOVE_PER` per
responder, capped per greet; docs/10).
Axis accumulators `W` squash to a 0–1 value with diminishing returns:
`axis = 1 − exp(−W / K_axis)`, **quantized into 30 levels** (docs/08). Calibration:
pick each `K ≈ (expected 4-session W for that axis) / 3`, since `1 − e⁻³ ≈ 0.95` —
"fully alive" (level 30) lands at session 4. Session 1 must still visibly bloom
within minutes (first god-ray warmth, first minnow) — that's what the cheap early
levels and near-zero thresholds are for.

**Element dials** — every gated element is one record, one shape, everywhere:

```
{ axis, threshold, curve, rampWidth, max }
value = max * curve01((axis − threshold) / rampWidth)   # 0 until threshold
```

`curve01` from a small shared library: linear, smoothstep, sigmoid, sqrt, quadratic,
log. Effect intensities, glow radii, arrival gates — all dials. (Fauna populations
are no longer capped dials: species arrival is a dial gate, but population size
emerges from the spawn tensor's damping factor — docs/09.)

**Dev ergonomics:** URL overrides — values > 1 pin a level (`?eelmagic=12`), ≤ 1 pin a
raw axis fraction (`?light=0.35`) — so any state of the sea is reachable instantly while
tuning. (A cheat key granting axis weight was once planned; the overrides made it moot.)

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
- ~~Pixelation pulse~~ built in P2, **cut in P3** — the blocky sweep read as a
  glitch, not enchantment.
- **Bubble trails** on falling food, character keyed to the food (fast fallers = tight
  sparse trail; big swayers = lazy scattered bubbles). Shared GL pool, per-source
  emitter spec.

## Liveliness: the vicinity principle

Fauna is simulated **around the camera, not globally**. A vicinity rect (the view
plus `VIC_PAD`) is the world that matters:

- **Population dials are in-vicinity targets**, scaled by how much of the visible
  water column lies inside the species' depth band — deep down you see jellies, not
  minnows, and the numbers always match what the progression level implies.
- **Spawns happen just outside the view** (inside the vicinity), so critters swim in
  rather than pop in.
- **Culling:** a critter outside the vicinity for `CULL_T` seconds despawns silently.
  Swim two screens away and back — you meet statistically-equivalent critters, not
  the same individuals, and nobody can tell — *except* where the spawn field says
  otherwise: hotspots are deterministic in x (docs/09), so a rare creature's
  territory survives the culling. Statistically the same octopus.
- **No pops, ever:** spawns are *strictly* offscreen — if no valid offscreen point
  exists this frame, the spawn just waits. Over-target despawns only ever remove
  offscreen critters; visible ones are left to drift out and cull naturally. The
  population converges statistically; the player never sees an appearance or
  disappearance.
- **Render LOD:** critters outside the view (+ a pad) skip their DOM writes entirely;
  only visible fauna costs per-frame SVG updates. This is what lets head-counts like
  60 minnows read as *dense* — they're all near you, and all of the budget is spent
  where you're looking.

The minnow school's wander-leader is confined to the vicinity (snapped to a fresh
offscreen point if the camera outruns it), so the school re-forms wherever you go.

## Phase-1 critters

- **Minnows** — appear solo at low LIFE; group size is itself a dial, growing into
  schools. Wiggly little swim (mini spine chain), a subtle 1–1.5px dark eye dot, and
  the **silver shimmer**: each minnow's fill interpolates dark→bright silver as a
  function of heading × a slow time sine — they catch the light when they turn.
  **Schools split and join:** up to `FLOCK.MAX_SCHOOLS` wander-leaders; a school past
  `SPLIT_SIZE` members buds a new leader beside it, leaders that drift within
  `MERGE_D` merge, and minnows occasionally re-target their nearest leader, so fish
  trade between passing schools organically. New minnows join near an existing school
  with probability `FLOCK.JOIN_BIAS` (0 = enter uniformly from anywhere offscreen,
  1 = always beside a school), else spawn uniformly — always offscreen either way.
- **Jellyfish** — pulsing bell (scale/squash on a beat) + wig-chain tentacles; drifts;
  inner glow that reads beautifully in the dark zone. The glow falls off nonlinearly —
  fast near the core, then a long soft tail pushing the halo outward — and **dims as
  the eel approaches** (shy light). **WORLD MAGIC example:** each jelly's light hue is
  a *pulse* away from cyan and back (shaped so lanterns dwell at cyan and bloom into
  color), with both the pulse's magnitude and frequency growing with the `jellyHue`
  dial — per-jelly phase and period, pulse discipline applies. (Replaced the original
  static expanding-range coloring, which read as a rainbow and was reworked in P3.)

## Eel magic track

Greet (I) is the **first EEL MAGIC unlock**, not a birthright — the axis teaches
itself by granting a power on your first EEL MAGIC food. Since those foods are rare,
greet unlocks at **EEL MAGIC level 1**, whose threshold is capped at one chocolate's
scaled grant (`LEVELS.FIRST_CAP`, docs/08) — one chocolate or one burger grants it.
Then, along the axis:

1. **Speed burst (hold Shift / second finger)** — the eel wiggles faster and harder
   and its top speed ramps +50% (eased in and out), draining a stamina bar; on empty
   or release it eases back and recharges. **Electric-blue bolts shed continuously
   along the body, at a rate proportional to the eel's forward speed** (no pulsed
   waves — the shower thickens as the burst winds up), shooting off in the wake —
   glow-layer particles (sparkles.js), so the crackle burns through the dark.
   Boost strength, stamina duration, and crackle intensity all ramp with the
   `speedBurst` dial (base +50% → up to +150% — a real charge, unlocks at EEL MAGIC
   level 8). The same factor that multiplies top speed *divides* the turn rate
   (docs/02) — bursting trades agility for speed, committing the eel to wide arcs.
2. Further powers TBD (deliberately open). A baseline glow + veil-hole was built and
   cut — it looked bad in practice; if a "see in the dark" power returns it needs a
   different visual treatment.

Cosmetic ramps along the same axis (the eel gets glamorous as it gets magical):

- **Lashes** grow from length 4 at EEL MAGIC 0 to 8 at 1.
- **Makeup** fades in with the `makeup` dial: tasteful purple eyeshadow (a soft
  crescent over the lid) and red lipstick along the lip contour.
- Past the `makeupHue` threshold, the makeup shades **hue-shift** slowly around
  their base hues, in a range that widens as EEL MAGIC grows.
- Later: heart palette richness, wig sparkle glints, warmer eye catchlight.

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
- **Lantern kelp — LANDED** (sparkles.Lanterns, WORLD MAGIC level 17): a seeded
  fraction (~22%) of main-plane kelp strands grow soft glow-layer bulbs. The
  aesthetic contract: **gentle, lively, not too saturated** — pale gold first,
  the palette widening into seafoam/blush/lavender as the dial climbs; each
  bulb is a soft-edged radial gradient (bright core → nothing); bulbs kindle
  progressively with the dial (fade in, never pop), and once lit, a slow light
  packet climbs each strand bottom→top (~5.5 s, per-strand phase — pulse
  discipline). Bulbs replicate the kelp shader's sway + eel-push in JS so they
  ride their strands exactly. ◐
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
per-instance period and phase detune) drives glows, bells, lanterns,
shimmer — everything breathes on related-but-unsynchronized rhythms. Tasteful = low
amplitude, long periods, never everything pulsing at once.

## Saying hello

Greet key **I** / mobile greet button: a fan of three big hearts pops from the eel's
head; hearts spring in with a boing, rise, wobble, and lean into their wobble before
fading (~1.5 s). **A greeting needs a subject**: the greet only fires when someone
greetable is in range (`critters.anyGreetable` gates it in main) — pressing I into
empty water does nothing, no heart, no cooldown. A successful greet also gives a
tiny rose flash + shake (~⅓ of the eat feedback; `GREET.FLASH_A` / `GREET.SHAKE`).
**Everyone in the greet radius responds at once** (no responder cap)
via one shared heart-emitter parameterized per species — count, palette, size, motion
pattern (fan / ring / scatter), delay. Per-critter cooldown. Once greeting is
unlocked, critters that would respond get **pulsing corner brackets** — a
bounding-box corner set in the eel-heart pink, framed from the critter's live
geometry (chain vertex min/max + width margins) on the glow layer — whenever
they're in range and off cooldown, so you can see who's listening. (Replaced
the old CSS contour stroke, which traced whatever outline a critter happened
to have and flattered none of them.)
**A greeted critter befriends you briefly:** minnows and reef fish leave their
routine and swarm in orbit around the eel (`FOLLOW.T` ≈ 9 s), **rubberbanding** to
your pace — slightly faster than you when they've fallen behind, easing to slightly
slower once they're close — so a cruising eel keeps its fan club and only a speed
burst sheds it. They don't spook while following, and band-keeping suspends for every
followed species, so friends will chase you to any depth. The rest respond in
place, each in character: **jellies** suspend their shy-dim and beat their lanterns
like a heart — th-thump (pause) th-thump — while leaning gently your way;
**seahorses** spin a delighted clockwise pirouette (slow → fast → slow);
**octopuses** vanish — their fill repaints to the sampled water color behind them
(a true color match, no transparency) and fades back; **anglerfish** flare their
lures.

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

### P3 kickoff (agreed 2026-07-04) — LANDED, see docs/09

All five items shipped, with the scope expanded mid-flight into the infinite
procedural sea (docs/09 is the authoritative spec):

1. **More critter types** — reef fish, seahorse, octopus + giant octopus,
   anglerfish (crab deferred); each on the spawn tensor and the shared greet emitter.
2. **Greeted critters follow closer** — rubberbanding follow ("Saying hello" above).
3. **In-focus front parallax plane** — sharp SVG kelp at camera factor 1.22,
   occludes the eel, under the veil (docs/03).
4. **WORLD MAGIC: fairies + jelly hue pulses** — both landed (fairies at WORLD MAGIC
   level 8; jelly pulse spec in "Phase-1 critters" above).
5. **Seafloor in the background parallax planes** — seeded terrain silhouettes,
   LIFE corals, WORLD MAGIC seafloor lights on the glow layer (docs/03, docs/09).

### P4 ideation (jotted 2026-07-05 — BUILD IN PROGRESS, spec in docs/10)

Matt's idea dump for the next round. Items 2–5 and 7–8 plus the seafloor/rocks/
shaker fold (items 3+4+6) are being built against docs/10; the combo's real
reward and the picture-based new foods (item 1's basics) remain open.

1. **More foods.** A few basic new types (Matt will supply pictures). The exciting
   one: **red beans and rice** — not a single sprite but a *small patch* of
   individual beans and rice grains hanging in the water, which the eel swoops
   through like a whale guzzling krill. Rare (low spawn rarity) so the many-particle
   rendering never overstresses a frame, but eating a swath of it should feel
   deeply satisfying. Rendering note: the current food pool is one `<image>` per
   item — a patch wants a different shape (many tiny cheap sprites or GL points
   with a shared eat test along the eel's path).

2. **Food grades (common / rare / legendary).** Every spawned item rolls a
   **grade** (settled term, 2026-07-05) that *scales its leveling impact*
   (progression-amount multiplier). This is **independent of the existing
   `rarity` column** (which stays the spawn-frequency knob — higher = more
   common); a given falling pinecone has some chance of being
   common/rare/legendary. Tells while falling:
   - **Rare — "buzz":** random positional jitter, lightly smoothed.
   - **Legendary — buzz + "throb":** a slight size pulse that is **not a sine** —
     inactive for the larger part of its period, then a rise-and-fall over a
     shorter window. Same family as the `sin³`-shaped jelly hue pulse — dwell,
     then bloom; the shared pulse helper is the home for the shaping (agreed).

3. **Seafloor on every plane.** The background-plane terrain (docs/09) looks
   great — extend it to *all* planes, with **average terrain height increasing the
   further back the plane sits**: the front kelp plane (pf 1.22) gets a sliver of
   floor with average height very close to max depth, the main plane a little
   higher, the near-behind plane higher still, and the far background highest —
   plus depth-of-field blur on the farthest floor and a tiny bit on the shallow
   background plane. **Blur plan (2026-07-05): one small framebuffer total** — a
   deliberate, single exception to the no-FBO rule in docs/03. Blur =
   render-at-low-res + bilinear upsample: one small RGBA texture, reused twice a
   frame — deep plane drawn into a heavily downscaled viewport (~⅙–⅛ res) and
   composited to screen (strong soft blur from magnification), shallow plane at
   ~½ res (faint blur). If the box-filter look bothers, add a few sample-offset
   taps in the *upsample* shader — still one FBO, no ping-pong; a true two-pass
   Gaussian (2 FBOs) should never be needed for silhouettes. Clear to
   transparent + premultiplied-alpha composite. Degradation lever: skip the FBO
   and draw the planes sharp. The main-plane
   floor is a big deal: the eel can finally *be at* the bottom, and it opens the
   door to seafloor creatures, anemones, and the like — note for later phases.

4. **Shatterable rocks.** Rocks on the (new main-plane) seafloor that the eel can
   **shatter by charging into them at high speed with the boost mechanic** —
   speed burst finally gets a collision payoff. A shattered rock reveals some item,
   to be specified later. Seeded placement (worldgen chunk streams) so rocks are
   deterministic in x like everything else. **Persistence (decided 2026-07-05):**
   localStorage keeps a list of (spawn x, shatter timestamp) pairs; a shattered
   rock reappears after **24 hours**, or immediately on game reset (which clears
   the list along with everything else).

5. **LOVE axis.** A fifth progression axis, **charged by greeting your sea
   friends** (and maybe other things eventually). First effect of progressing it:
   a chance for nearby creatures to **spontaneously greet you** — more effects
   down the line. Structural touch-points: `AXES` (K, color, persistence key),
   30-level quantization + level notes (docs/08), pause meters, URL override
   (`?love=...`), and it breaks the current "each food drives exactly one axis"
   symmetry — LOVE earns from *behavior*, not food, which needs its own K
   calibration story.

6. **Hidden items on the seafloor.** Items deliberately tucked behind plants and
   terrain — and maybe even tunnels, possibly *hidden* tunnels??? First item:
   a **shaker of dressing** that temporarily boosts the effectiveness of the
   greens food (a timed amount-multiplier buff on one food type). Seeded
   placement, like the rocks.

7. **More kelp types.** Cheap flora variety on the existing strand tech:
   - a **longer, more sinuous** kelp;
   - a **very tall, narrow, spindly** one with periodic growths along the stalk,
     each sprouting lots of little wavy grassy projections.
   And the seafloor itself is a flora bonanza — rocks and smaller debris, stuff
   growing on the rocks, corals, starfish, many great possibilities.

8. **Food combos.** Steering to snag a run of food in quick succession is tricky
   and satisfying — the game should notice, make it feel *viscerally* satisfying,
   and reward it. Eats within a short window of each other charge a **combo
   meter**; what it does is TBD (**Matt: revisit this — flagged for reminder**).
   Threads so far, all open:
   - **Reward:** boost stamina is the natural target (refill or overcharge past
     the cap — and note the loop this creates: nail a combo → charged boost →
     shatter a rock). Axis composition could matter too: a same-axis run is a
     "flavor run" (bonus to that axis?), a run spanning all four axes is a
     "feast" (something special?). Or a temporary amount multiplier, stacking
     with grades (item 2). Open to ideas.
   - **Feel (agreed 2026-07-05):** escalate the existing eat feedback as the
     combo grows — the flash/shake (`EAT_FX`) and axis-colored light pulse
     already scale with amount and have a level-up multiplier precedent
     (`LEVELUP_MUL`), so a combo-tier multiplier slots right in; higher tiers
     add confetti sparks (sparkles.js), a brief eel wiggle-amplitude surge, wig
     glints. **No meter.** Instead, each combo link briefly pops a **counter
     text** — "2x", "3x", "4x", then "5x!", "6x!", … (exclamation mark from 5x
     onward) — styled in keeping with the established popup UI (docs/08
     level-up popups are the pattern to match).
   - Combo definition: probably just time-between-eats (a per-link window),
     no aim/steering judgment — the steering difficulty is already what gates it.

9. ~~Food spawns at the viewport, not the surface~~ — considered and **decided
   against (2026-07-05)**: viewport-following spawns would soften the "darkness
   is gameplay / food lost to the deep" decision. Food keeps spawning at the
   surface; the depths get interesting through new elements instead (seafloor,
   rocks, hidden items, tunnels — items 3, 4, 6 above).

## Still open (deliberately)

1. EEL MAGIC powers beyond glow burst — decided later, the track stays open-ended.
2. Later-phase critter sequencing and which catalog effects land next (crab,
   whale/manta crossing, sunken ruin, Very Rare far-apart WORLD MAGIC events the
   infinite sea now makes possible).
