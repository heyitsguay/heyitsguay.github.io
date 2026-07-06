# The Infinite Sea — procedural world & the spawn tensor

**The shift (agreed 2026-07-04).** The world stops being a fixed 3840-px-wide box and
becomes **infinite along x** (both directions), procedurally generated from a
deterministic seed. Depth stays exactly as it was: `y ∈ [0, 3240]`, surface to abyss,
with the veil as the single lighting authority. The vicinity principle (docs/07) was
already "simulate around the camera, statistics everywhere else" — this document makes
the *statistics* deterministic in space, so distant things aren't tracked, but the
world still remembers them. Swim 100 000 px away and back: the giant octopus you met
is *statistically the same octopus*, because its spawn probability lives at that x.

## Determinism: one seed, many streams

- `SEA.SEED` (tuning.js) is the world seed. Same seed ⇒ same sea, everywhere, every
  session. All procedural content — flora placement, terrain, spawn hotspots — derives
  from it via integer hashing; **nothing procedural rolls `Math.random()`**.
  (Behavioral jitter — wander phases, greet-heart scatter — stays `Math.random()`;
  only *world structure* is seeded.)
- `worldgen.js` owns the streams:
  - `hash01(i, salt)` — one uint32 hash → [0, 1) for lattice/cell lookups.
  - `chunkRng(chunk, salt)` — a seeded PRNG (mulberry32) for per-chunk sequences.
  - Every consumer gets its own salt so streams are independent.

## Chunks: flora that exists wherever you look

The x axis is divided into **chunks of `SEA.CHUNK_W` (960) world px**, indexed by
`floor(x / CHUNK_W)` (negative indices fine). Each strip layer (main kelp, seagrass,
far kelp wall, near-behind kelp, front plane, terrain, corals) generates its strands
per chunk from `chunkRng(chunk, layerSalt)`:

- A chunk always draws its **maximum** strand set (attributes for full LIFE), then
  takes the first `round(max · densityDial)` — so LIFE growth *adds* strands without
  reshuffling the ones already there, and generation is deterministic at every dial
  value.
- `water.js` keeps, per layer, a vertex buffer covering the chunks that intersect the
  (plane-space) camera window plus a pad, and rebuilds it only when that chunk range
  changes, LIFE moves > 0.08, or the window resizes. Rebuilds are a few dozen strands —
  cheap and rare.
- `worldgen.kelpStrands(chunk, ...)` is shared: water.js builds geometry from it and
  critters.js queries the same strands to anchor seahorses. One truth, two consumers.

### Parallax anchoring (fixes an invisible-rocks bug)

Background-plane geometry used to be anchored at the *world* floor but drawn with
camera factor `pf < 1`, which left it below the window at every reachable camera —
the far-plane rock spires were effectively never visible. Plane-space floors are now
anchored so they align with the window bottom when the camera rests on the world
floor: `planeFloorY(pf) = viewH + (worldH − viewH) · pf`. (Depends on the view height,
so plane geometry rebuilds on resize, which it already did.) The front plane
(`pf > 1`) uses the same formula.

## Float precision (why nothing jitters at x = 1 000 000)

- JS simulates in float64 world coordinates — exact far beyond any reachable x.
- **GL never sees large numbers:** strip vertices are stored relative to their chunk
  window's origin, and one per-draw `u_off` uniform (computed in float64 JS as
  `origin − planeCam`, always view-sized) places them. Dynamic points/pulses upload
  camera-relative positions each frame. The background shader receives its camera x
  **wrapped modulo the god-ray/shimmer common period** (`20π/3 · REF_W` device px —
  the smallest x-translation that leaves both ray sines and the shimmer invariant),
  so ray phase stays exact forever.
- The SVG layers still carry `cam.x` in the viewBox / counter-transforms; browsers
  hold those as doubles. Known limit: some renderers degrade to float32 internally
  around |x| ≈ 10⁷ (≈ 7 hours of sustained one-way swimming) — accepted, not
  engineered around.

## Persistence

The eel's position persists (`eel-madness:pos:v1`, saved ~every 1.5 s): the sea is
continuous across sessions and hotspots you found stay found. "Reset progress" also
returns the eel to the origin — a fresh sea starts at home. First-ever session spawns
at x = 0, near the surface.

## The spawn tensor

Every species spawns from one factored probability field:

```
p(spawn at x, y) ∝ rate · arrive(axes) · f_x(x) · f_y(y) · c^N
```

evaluated by **attempt/accept**: each species rolls `rate · arrive` candidate
attempts per second; a candidate picks a strictly-offscreen point in the vicinity
(uniform in x, uniform over its depth-band union — the no-pops rule from docs/07 is
unchanged) and is accepted with probability `f_x · w_band · c^N`. Rejected attempts
just wait. Pools are hard ceilings (SVG elements are preallocated), not targets.

- **`arrive` — the axis gate.** A dial record on LIFE: zero before the species'
  threshold, ramping after. Rarer species arrive later (levels listed below); the
  barren sea stays barren.
- **`f_y` — depth bands.** Piecewise weights `[[y0, y1, tier], …]` (fractions of
  world height) using the shared tier table `TIERS = { common: 1, uncommon: 0.3,
  rare: 0.06, vrare: 0.012 }`. Population targets also scale by how much of the view
  overlaps the bands, exactly as before.
- **`f_x` — the hotspot field.** x is divided into cells of `SEA.CELL_W` (512) px;
  `hash01(cell, speciesSalt)` marks a cell *hot* with probability `CELL_W /
  hotEvery`. Acceptance weight is 1 in a hot cell, `baseW` elsewhere. Common species
  set `hotEvery: 0` (uniform, f_x ≡ 1); the giant octopus sets `hotEvery` huge and
  `baseW` near zero — it has a high chance of spawning in ~1 in every N spawn
  locations rather than a uniform sliver everywhere, so its territory is a *place*.
  Seahorses replace `f_x` entirely: candidates snap to seeded kelp strands
  (`kelp: true`).
- **`c^N` — the spawn damping factor.** `N` is the species' live (in-vicinity)
  population; every accepted spawn multiplies the next attempt's acceptance by `c`.
  With attempts arriving at `A/s`, the expected wait for member `N+1` is
  `1 / (A · p̄ · c^N)` — soft-exponential growth cutoff instead of a hard cap.
  **LIFE scales population through `c` on a log scale** (per Matt): per species,
  `1 − c` log-lerps from `DAMP[0]` (at arrival) to `DAMP[1]` (at LIFE = 1), e.g.
  minnows `c: 0.72 → 0.87` — early sea supports a handful, living sea supports
  dozens. (Numbers are stronger than a naive read suggests because deaths are rare —
  see turnover.)
- **Turnover.** Culling (out of vicinity for `CULL_T`) still sheds population as you
  travel. For an idle camera, a small **offscreen retire rate** (`SEA.RETIRE`/s per
  critter, offscreen only — never a visible despawn) keeps flux through the field so
  the scene doesn't just saturate and freeze.
- **Fast-travel backfill.** A boosting eel sweeps fresh water into the vicinity
  faster than the ambient attempt rate can populate it — without compensation you
  outrun the spawns into empty ocean. Each view-width of freshly swept water owes
  every species `SEA.CATCHUP` seconds' worth of extra attempts, confined to the
  newly entered offscreen strip (capped per frame; teleports owe nothing). The
  attempts pass through the same acceptance — bands, hotspots, `c^N` — so swept
  water fills toward the density the field implies.

Minnow flocking (leaders, split/merge, JOIN_BIAS) sits unchanged on top: the tensor
decides *that* a minnow spawns; the school decides *where it swims*.

## The species table (tuning.SPECIES)

| species | arrives (LIFE level) | depth bands | x field | damping c (arrival → full) |
|---|---|---|---|---|
| minnow | 4 | common 0–33%, uncommon 33–60% | uniform | 0.82 → 0.96 |
| reef fish | 8 | common 5–40%, uncommon 40–70% | mild hotspots | 0.60 → 0.85 |
| seahorse | 11 | n/a — anchors to kelp strands | kelp-anchored | 0.45 → 0.72 |
| salmon | 12 | common 12–55%, uncommon 55–75% | uniform | 0.50 → 0.85 |
| jellyfish | 13 | rare 50–80%, uncommon 80–100% | mild hotspots | 0.50 → 0.80 |
| octopus | 16 | uncommon 20–60%, rare 60–80% | hotspots | 0.30 → 0.60 |
| barracuda | 17 | uncommon 8–50% | hotspots | 0.25 → 0.55 |
| anglerfish | 21 | uncommon 80–100% | hotspots | 0.10 → 0.30 |
| giant octopus | 26 | vrare 80–100% | strong hotspots (~1/150 000 px) | 0.02 → 0.05 |
| swordfish | 27 | uncommon 5–50% | hotspots | 0.12 → 0.35 |

The three **roaming fish** (salmon / barracuda / swordfish) share one spine-fish
framework (`ROAMERS`, critters.js): minnow-style wiggle, muted organic shimmer
tones (rosy silver / steel green / steel blue — the swordfish outline's first
widths are its bill), per-species wander/band/flee (the swordfish fears
nothing), and the standard greet-and-follow.

Arrival thresholds are authored to land exactly on their LEVEL_NOTES level (the
note↔dial alignment test extends to SPECIES). All numbers above are the *initial*
tuning — they live in tuning.js and Matt retunes freely.

## New critters (P3)

- **Reef fish** — solo wanderer ~2× minnow size, deep-bodied with a trailing tail
  fin. **Per-fish hue** drawn from a cluster around an aesthetic anchor (warm
  corals: pink→orange→violet). As WORLD MAGIC grows (`reefPulse` dial, level 9), a
  fish occasionally runs a **shimmer pulse** — a brief eased brightness/saturation
  sweep along its body (pulse discipline: long periods, per-fish phase). Greets with
  a scatter of hearts in its own hue; briefly befriended like minnows.
- **Octopus** — a soft dome + six trailing tentacle chains (the jelly-tentacle tech),
  drifting in slow jet kicks. Greeted: a **color-pulse** rolls its body hue through a
  happy flush + fan of lavender hearts. Startled (fast eel inside its space): **ink
  puff** — a dark cloud sprite that blooms and fades (sprite layer, under the veil)
  plus a bubble scatter — then it jets away.
- **Giant octopus** — the same rig at ~3.4×, deep water, very rare, damping 0.02 (one
  at a time, essentially). Slow, majestic, unbothered by anything. Its hotspot makes
  it a landmark: *the* octopus that lives out at that x.
- **Seahorse** — small curled-tail silhouette bobbing beside its home kelp strand
  (seeded anchor), gentle vertical sway, snout into the current. At high LIFE,
  seahorses spawn in **pairs** that drift toward each other and curl tails — the
  rare vignette from the catalog. Greets with a pastel ring of tiny hearts.
- **Anglerfish** — deep-band prowler: dark wedge body, underbite jaw, a stalk arcing
  forward holding the **lure — a glow-layer light** (like the jelly lanterns; the
  veil-hole idea stays cut). The lure sways with its swimming and pulses slowly;
  greeting it makes the lure flare and it answers with deep-blue hearts.
- ~~Drift-vines~~ — surface vine tangles were built on the fauna machinery and
  **cut**: they read as another jellyfish, not flora. The surface-flora slot is
  deliberately open (candidates in the docs/07 catalog).

**Individual scale:** every critter draws a ±20% size at spawn (`sizeJit`,
critters.js) on top of any species scale — the sea is not a clone factory.

**Depth-band freedom:** bands bias where species *spawn and idle*; a greeted critter
follows the eel wherever it goes (band-keeping suspends while following, jelly-style,
for every species).

## Greet-follow rework (rubberbanding)

Befriended critters keep pace instead of being outrun: follow speed rubberbands on
distance to the eel — `lerp(SLOW, FAST, d)` × the eel's current speed (slightly
*slower* than the eel when close, slightly *faster* when far), floored at cruise.
The motion is deliberately soft — a drifting escort, not darts (`FOLLOW.TURN`
caps how attentively they steer). You shed the fan club by speed-bursting or by
waiting out the follow timer. `FOLLOW` block in tuning.js: `T` (9 s), `NEAR`/`FAR`
(90/260 px), `SLOW`/`FAST` (0.90/1.05), `TURN` (1.4×).

## Also in this pass (docs/07 Next-up items)

- **Front kelp plane** (`js/fgplane.js`, `<g id="fg">` after `#eel`): a *sharp*
  SVG kelp plane at `LAYERS.FRONT.PF` (1.22), counter-transformed per frame
  (`translate((1 − pf) · rcam)`), chunk-seeded like every other layer, pooled path
  elements, sway = small per-frame rotate about the root. It occludes the eel and
  sits under the veil — lighting authority respected by construction.
- **Background seafloor**: each behind-plane gets a seeded rolling **terrain
  silhouette** (value-noise heightfield per chunk, shaped `t^2.6` so it mostly hugs
  the floor and occasionally swells to ~half the view height — the rock spires were
  cut) at its re-anchored floor, with **corals** (short wide strand-tufts in warmer
  silhouette tones) growing on it as LIFE climbs, and **seafloor lights** — tiny
  seeded twinkle points that kindle with WORLD MAGIC (`bgLights` dial, level 14).
  Lights are emissive, so they live in a counter-transformed `#bg-glows` group on
  the **glow layer**, not in GL.
- **Kelp is progression** (`DIALS.kelp`, life level 1): every kelp plane's strand
  density is the dial × the LIFE growth factor — the level-0 sea is near-bare.
- **Fairies** (`fairies` dial, WORLD MAGIC level 8, sparkles.js): a few wandering
  warm glow-motes that shed an ephemeral sparkle trail from the shared pool. Glow
  layer; they read as tiny lights in the dark.
- **Jellyfish hue rework**: jellies keep their standard cyan lantern; WORLD MAGIC
  (`jellyHue` dial, unchanged record) now drives **hue pulses** — eased excursions
  away from cyan and back, whose magnitude *and* frequency grow with the dial
  (shaped `sin³` so lanterns dwell at cyan and bloom into color), per-jelly phase
  and period. Replaces the static expanded-range coloring.

## P4 additions (docs/10)

- **Kelp types**: main-plane strands are typed (normal / sinuous / spindle)
  from a side hash-stream so the chunk-RNG stream — and with it determinism,
  growth supersets, and seahorse anchors — stays byte-identical.
- **Rocks**: `worldgen.rocksInChunk` seeds boulders on the main-plane terrain;
  boost-shatterable, 24 h localStorage respawn, dressing-shaker reveal.
- **Terrain everywhere**: `tuning.TERRAIN` is keyed per plane
  (front/main/near/far), heights ordered front-lowest → far-highest.

## Module impact

```
worldgen.js   NEW — seed, hashes, chunk RNG, kelp strand streams, terrain height,
              hotspot field, band sampling helpers
fgplane.js    NEW — the front kelp plane (SVG, pf > 1)
tuning.js     SEA, TIERS, SPECIES, FOLLOW, LAYERS.FRONT, TERRAIN, FAIRIES,
              new DIALS (fairies, reefPulse, bgLights), LEVEL_NOTES additions;
              DIALS.minnows/jellyfish population dials retired (SPECIES owns them)
water.js      chunked windows for all strips, u_off precision scheme, wrapped bg
              camera, terrain + corals, re-anchored planes
critters.js   spawn framework (attempt/accept + damping), 5 new species rigs,
              follow rubberband, jelly hue pulses, ink puffs
main.js       infinite camera (y-clamp only), position persistence, fg plane +
              bg-glows wiring
eel.js        x unclamped (y walls stay), spawn from persisted position
food.js       spawns above the camera window (was: across the fixed world)
sparkles.js   fairies
```
