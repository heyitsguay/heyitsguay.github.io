# Levels: discretizing the progression

**Status: landed.** (P4 adds a fifth axis, LOVE — greet-charged, docs/10 —
which rides this whole layer unchanged: thresholds, popups, meters, URL
`?love=`, and its own `LEVEL_NOTES.love`.) Each axis is quantized into **30 discrete levels** with
chained "Level Up!" popups announcing material changes. This amends the
"Continuous axes, no stages" decision in docs/07 — but only at the surface:
the underlying math (W accumulators, the exp squash, dials, light curves) is
untouched. Levels are a **quantization layer** over the continuous axes.
Decisions (Matt, 2026-07): 4-session pacing · chained per-level popups ·
bloom-eased steps · "charge" = the existing speed burst (made far more
pronounced, see docs/07).

## Why levels

Playing the continuous version, the world improves by imperceptible creep —
progress is real but nothing ever *happens*. Levels turn the same progression
into legible reward moments: a snappy "Level Up!", a visible bloom, and a line
of text saying what you just earned (a power, a critter, a denser forest).
Unlocks stop being silent: greet and speed burst get guide popups teaching the
control the moment it activates.

## Mechanics: quantization, not a new economy

Unchanged: food economy, per-axis W accumulators, persistence (same store key —
existing saves just resolve to a level), the dial records, the light curves.

In progress.js:

- **`level(axis)`** = the largest `L` with `W ≥ T(L)` (thresholds below).
  Fresh sea = level 0; 30 level-ups per axis.
- **`value(axis)`** returns the squash evaluated **at the current level's
  threshold** — `V(L) = 1 − exp(−T(L)/K)` — instead of at live W. Every
  consumer (dials, lightParams, the veil, populations) sees a step function
  and needs no changes. `V(0) = 0`, `V(30) = 1 − e⁻³ ≈ 0.95` ("fully alive").
- **Bloom (step feel):** on level-up the returned value **eases from the old
  step to the new one over `LEVELS.BLOOM_T` (1.5 s, smoothstep)**, advanced by
  `progress.tick(dt)` from the frame loop — the level-up reads as a bloom
  that plays with the popup, never a flicker. Headless tests must call
  `tick()` past `BLOOM_T` before asserting post-level-up values.
- **Level-up events:** `add()` queues one `{axis, level}` record per level
  crossed; main.js drains them via `consumeLevelUps()` each frame.
- **URL previews:** values **> 1 mean a level** (`?eelmagic=12` pins level 12's
  quantized value); values **≤ 1 stay raw axis fractions** (exact-value pins
  for dial tuning, and back-compat). Pinned axes bypass quantization, bloom,
  and level-up events, exactly like before.

## Level thresholds

Pacing target: **4 sessions to level 30**, front-loaded — sessions land levels
**1–16, 17–24, 25–28, 29–30**. That's a geometric halving (16/8/4/2 levels per
session), so with roughly constant intake per session the **W cost per level
doubles each band**. In units: band costs 1/2/4/8, total 64 units across the
30 levels, one session ≈ 16 units.

- **`K` stays THE per-axis timescale knob** (as always): the unit cost is
  `3K/64`, so `T(30) = 3K` and level 30 lands at `1 − e⁻³ ≈ 0.95`. K is
  calibrated to 4 sessions: `K = (expected 4-session W) / 3` — light 9.9 ·
  life 13.5 · worldMagic 2.7 · eelMagic 9.15 (all ×1.5 in the 2026-07 pacing
  retune: everything leveled too quickly, so every level's requirement grew
  50% — ~150 scaled eats per session-equivalent now). The ladder's *shape* is
  K-independent, so no dial/note alignment moved. By construction, one
  expected session of W lands exactly one band.
- **`LEVELS.FIRST_CAP` guardrail:** eelMagic's `T(1)` is clamped to 0.25 — one
  chocolate's scaled grant — so the **first magic food is always level 1**,
  which is where greet unlocks (the axis teaching itself, docs/07). Found
  while building this: `AMOUNT_SCALE` had quietly broken that promise (a
  chocolate granted axis ≈ 0.03 against greet's old 0.10 threshold); the
  greet dial threshold is now 0.03 to sit inside level 1.
- **Multi-level jumps are a feature.** One eat drives one axis, and early
  levels are cheap, so a big food can cross several at once (a burger ≈ 2
  early EEL MAGIC levels — the lottery moments from docs/07, now visible).
  Each crossed level gets its own popup, chained.

## The "Level Up!" display

Chained popups — one per level, played back-to-back from a FIFO queue, driven
by `ui.tick(dt)` (so the pause menu freezes them):

- **Color** = the axis signature from `AXES[axis].color` — the same palette as
  the eat light pulses (warm gold / spring green / violet-teal / rose-pink).
- **Shape:** a DOM element in `#levelups` (top-center, `pointer-events: none`,
  outside `#ui` so steering is unaffected): a "Level Up!" flourish over
  `LIGHT · LV 12`, plus the level's note line if one is authored. Opacity
  rides one keyframe animation (fade in/hold/out, duration set inline from
  `LEVELS.POP_T` ≈ 1.6 s); the pop-in scale overshoot is a separate fixed
  0.35 s animation on an inner element so the snap never stretches with
  dwell time. Subtle: modest size, text-shadow only, never a banner.
- **Guide popups:** notes authored as `{text, guide: true}` (greet, speed
  burst) dwell `LEVELS.GUIDE_T` ≈ 3 s and carry the control instruction.
- **Confetti:** `sparkles.burst()` scatters `LEVELS.SPARKS` glow-layer motes
  in the axis color from the eel (the "axis-milestone confetti" of the
  docs/07 catalog).
- **Heavier bite:** the eat's own flash + shake scale by `EAT_FX.LEVELUP_MUL`
  (1.4×) when that bite crossed a level (docs/06).

## The notes table

**`LEVEL_NOTES` in tuning.js** — a manual per-axis `{level: text|{text,guide}}`
map. Levels without an entry still get the "Level Up!" popup, just no note.

Unlock levels are *derived* facts — the first `L` with `V(L) ≥` the dial's
threshold — while notes are authored by hand. The quantized ladder is the same
for every axis (`V(L) = 1 − e^(−3·units(L)/64)`, K cancels), so dial
thresholds map to universal levels:

**One eelMagic quirk**: FIRST_CAP clamps its T(1) to an absolute W (one
chocolate), so K retunes shift its V(1) alone — .027 since the ×1.5 pacing
retune (T(L≥2) rides the universal ladder untouched). The greet threshold
(.02) sits under that.

| level | V(L) | unlocks there |
|---|---|---|
| 1 | .046 (eelMagic .027) | greet (.02), kelp (.03) |
| 2 | .089 | seagrass (.05), plankton (.08) |
| 3 | .131 | jellyHue (.12) |
| 4 | .171 | minnows arrive (.14), sparkles (.15), makeup (.15) |
| 5 | .209 | minnowFeast (.20) |
| 8 | .313 | speedBurst (.30), reef fish arrive (.29), fairies (.30) |
| 9 | .344 | reefPulse (.33) |
| 11 | .403 | seahorses arrive (.39) |
| 12 | .430 | salmon arrive (.42) |
| 13 | .456 | jellyfish arrive (.45) |
| 14 | .481 | bgLights (.47) |
| 16 | .528 | octopus arrives (.51) |
| 17 | .570 | barracuda arrives (.55), lanternKelp (.55) |
| 18 | .608 | makeupHue (.60) |
| 21 | .704 | anglerfish arrives (.69) |
| 26 | .847 | the giant octopus arrives (.83) |
| 27 | .873 | swordfish arrives (.86) |

**check-progress pins this:** every dial's — and every species arrival's
(docs/09) — computed unlock level must have a `LEVEL_NOTES` entry, so retuning
`K` or a threshold can't silently desync the announcement from the mechanic.

## Pause menu

Meters are level readouts: `LIGHT · LV 12` plus a fill bar of progress through
the current level, `(W − T(L)) / (T(L+1) − T(L))`. URL-pinned axes show the
pinned level, a full bar, and the "(preview)" tag. **Main Menu** returns to
the title (place remembered and saved, unless leaving the sandbox — Start
resumes it).

## Title screen & attract mode

Boot lands on the title (`#title`): "Eel Madness / eat the Eel's favorite
meals" over the sea **playing itself at full dials** — `progress.demo` forces
every axis *value* to 1 **except EEL MAGIC, which stays 0** (the eel's powers
are the game's surprise; levels and W stay real) — the eel cruises steadily
right at half throttle, food falls, and the auto-mouth eats. Attract bites are
theater: no `progress.add`, no position saves. **Start** clears the demo world
(blank-slate eviction), restores real dials, and returns the eel to where the
save left it; **Skip To The End** enters `progress.sandbox` — a separate,
fully-maxed instance where `add()` and position persistence are inert (the
pause menu hides its reset there, since that one WOULD wipe the real save);
**Reset** (shown only when a save exists, two-step) wipes the save from the
title — the saved sea's per-axis levels are listed along the bottom edge
("looks like a Eel has been here"). Enter/Space
also starts. **URL preview parameters skip the title entirely** and load
straight into the pinned state. Composition anchors to the **attract eel's
swim line at mid-view (50vh)**: the title + tagline end 9vh above that line,
the buttons begin 9vh below it — symmetric around the swimmer.

**Reset is a blank slate**: axes and levels zero, popup queue dropped, the eel
returned to the origin (position persistence cleared), the camera snapped home,
and every live world object evicted — critters, food, hearts, glow particles,
bubbles, pulses. The spawn tensor (docs/09) has no population targets, so
without the explicit eviction the old sea's fauna would linger around a
"reset" player indefinitely — that shipped as a bug once; the `clear()`
methods exist because of it.

## Where things live

| File | Owns |
|---|---|
| `js/tuning.js` | `LEVELS` (COUNT, BANDS, FIRST_CAP, BLOOM_T, POP_T, GUIDE_T, SPARKS), `LEVEL_NOTES`, recalibrated `AXES.K` |
| `js/progress.js` | threshold tables, `level()`, quantized + bloomed `value()`, `tick()`, `consumeLevelUps()` |
| `js/ui.js` | popup queue + renderer (`levelUp()`, `tick()`), level meters |
| `js/main.js` | drains level-ups → popups + confetti; ticks progress/ui |
| `js/sparkles.js` | `burst()` — axis-colored radial scatter on the shared pool |
| `style.css` | `#levelups`, `.levelup` animations, meter level chip |
| `tests/check-progress.mjs` | thresholds, band pacing, chocolate→greet, multi-level chains, bloom, note↔dial alignment |
