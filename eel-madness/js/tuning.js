// THE experiment surface (see docs/07-progression.md). Anything you'd tune to
// shape the game lives here: axes, the food economy, light palettes, dials.
// Structural/math constants stay in their modules.

import { lerp } from './math.js';

// ---- Axes ----------------------------------------------------------------
// axis value = 1 − exp(−W / K), quantized into LEVELS.COUNT levels (docs/08).
// K sets the axis timescale. Calibration (docs/07+08): spawn share ∝ rarity/27,
// K ≈ (expected 4-session W) / 3 so level 30 (= 3K of W) hits ~0.95 at session 4.
// color: the axis signature (eat pulse, level-ups, milestone sparks) — approved palette.
// K values ×1.5 (2026-07: everything leveled too quickly — the requirement
// for every level grew 50%; the ladder shape is K-independent, docs/08).
export const AXES = {
  light: { K: 9.9, color: [1.00, 0.83, 0.42], label: 'LIGHT' },       // warm gold
  life: { K: 13.5, color: [0.48, 0.90, 0.50], label: 'LIFE' },        // spring green
  worldMagic: { K: 2.7, color: [0.55, 0.50, 0.95], label: 'WORLD MAGIC' }, // violet-teal
  eelMagic: { K: 9.15, color: [1.00, 0.55, 0.75], label: 'EEL MAGIC' },    // rose-pink
  // LOVE (P4, docs/10): charged by GREETING, not food — K is the least
  // calibrated of the five (greeting is optional play): first guess assumes
  // ~60 responder-greets/session at GREET.LOVE_PER.
  love: { K: 20, color: [1.00, 0.40, 0.32], label: 'LOVE' },          // warm coral-red
};

// ---- The infinite sea (docs/09) --------------------------------------------
// One seed, deterministic everywhere: flora chunks, terrain, spawn hotspots.
export const SEA = {
  SEED: 20260704,   // change for a different sea; same seed = same sea forever
  CHUNK_W: 960,     // px — flora/terrain generation chunk width
  CELL_W: 512,      // px — spawn-hotspot cell width (x factor of the tensor)
  RETIRE: 0.012,    // per-second chance an OFFSCREEN critter quietly retires —
                    // keeps population flux alive under an idle camera
  CATCHUP: 18,      // fast-travel backfill (docs/09): seconds' worth of spawn
                    // attempts owed per view-width of freshly swept water, so
                    // outrunning the ambient rate doesn't mean empty ocean
};

// Depth-band rarity tiers (docs/09): bands say where a species prefers to be.
export const TIERS = { common: 1, uncommon: 0.3, rare: 0.06, vrare: 0.012 };

// The species spawn records (docs/09). Populations are NOT capped dials:
// arrival gates on LIFE (`arrive`, a dial record), place comes from depth
// bands × the x hotspot field, and size emerges from the damping factor —
// each live member multiplies the next spawn's acceptance by c, and LIFE
// walks c toward 1 on a log scale (damp: [c at arrival, c at LIFE = 1]).
//   pool     — preallocated elements, the hard ceiling
//   rate     — candidate spawn attempts/s at full arrival dial
//   bands    — [[y0, y1, tier], ...] world-height fractions
//   hotEvery — mean px between hotspot cells (0 = uniform); baseW = weight
//              off-hotspot. For the rarest species the x field IS the rarity:
//              near-certain at home, near-impossible elsewhere.
//   kelp     — spawn beside seeded kelp strands instead of using bands
export const SPECIES = {
  minnow: {
    pool: 110, salt: 11, rate: 6,
    bands: [[0.00, 0.33, 'common'], [0.33, 0.60, 'uncommon']],
    hotEvery: 0, baseW: 1, damp: [0.82, 0.99],
    arrive: { axis: 'life', threshold: 0.14, curve: 'sqrt', rampWidth: 0.7, max: 1 },
  },
  reef: {   // colorful banded reef fish (docs/09); flocks loosely
    pool: 16, salt: 12, rate: 1.8,
    bands: [[0.05, 0.40, 'common'], [0.40, 0.70, 'uncommon']],
    hotEvery: 3500, baseW: 0.3, damp: [0.60, 0.90],
    arrive: { axis: 'life', threshold: 0.29, curve: 'smoothstep', rampWidth: 0.6, max: 1 },
  },
  seahorse: {
    pool: 10, salt: 13, rate: 0.9, kelp: true,
    bands: [], hotEvery: 0, baseW: 1, damp: [0.45, 0.85],
    arrive: { axis: 'life', threshold: 0.39, curve: 'smoothstep', rampWidth: 0.55, max: 1 },
  },
  // (drifter — surface vine tangles — was built and CUT: read as another
  // jellyfish. Surface flora is an open slot; salt 18 is retired with it.)
  jelly: {
    pool: 20, salt: 14, rate: 4,
    bands: [[0.50, 0.80, 'rare'], [0.80, 1.00, 'uncommon']],
    hotEvery: 6000, baseW: 0.25, damp: [0.50, 0.88],
    arrive: { axis: 'life', threshold: 0.45, curve: 'smoothstep', rampWidth: 0.5, max: 1 },
  },
  // For the hotspot species below: attempts are cheap, so rarity lives in a
  // HIGH rate × a TINY baseW — at the hotspot spawns land in seconds, away
  // from it they almost never do. (A low rate instead would make even the
  // hotspot slow: only ~340 px of a hot cell can sit offscreen-in-vicinity
  // at once, so few candidates hit it — the rate compensates.)
  octopus: {
    pool: 7, salt: 15, rate: 2,
    bands: [[0.20, 0.60, 'uncommon'], [0.60, 0.80, 'rare']],
    hotEvery: 9000, baseW: 0.05, damp: [0.30, 0.70],
    arrive: { axis: 'life', threshold: 0.51, curve: 'smoothstep', rampWidth: 0.45, max: 1 },
  },
  salmon: {   // the honest average fish — muted pinkish silver; FLOCKS
    pool: 14, salt: 19, rate: 2.2,
    bands: [[0.12, 0.55, 'common'], [0.55, 0.75, 'uncommon']],
    hotEvery: 0, baseW: 1, damp: [0.50, 0.95],
    arrive: { axis: 'life', threshold: 0.42, curve: 'smoothstep', rampWidth: 0.5, max: 1 },
  },
  barracuda: {   // long, skinny, bold — knifes through the mid-water
    pool: 6, salt: 20, rate: 1.0,
    bands: [[0.08, 0.50, 'uncommon']],
    hotEvery: 3000, baseW: 0.25, damp: [0.25, 0.9],
    arrive: { axis: 'life', threshold: 0.55, curve: 'smoothstep', rampWidth: 0.4, max: 1 },
  },
  swordfish: {   // the late-game patroller: big, billed, fast
    pool: 3, salt: 21, rate: 1.2,
    bands: [[0.05, 0.50, 'uncommon']],
    hotEvery: 4000, baseW: 0.15, damp: [0.12, 0.75],
    arrive: { axis: 'life', threshold: 0.86, curve: 'smoothstep', rampWidth: 0.14, max: 1 },
  },
  angler: {   // "too good to make this rare" — 3× common, 2× size
    pool: 4, salt: 16, rate: 10.5,
    bands: [[0.80, 1.00, 'uncommon']],   // overall rarity carried by the x field
    hotEvery: 6000, baseW: 0.05, damp: [0.10, 0.70],
    arrive: { axis: 'life', threshold: 0.69, curve: 'smoothstep', rampWidth: 0.3, max: 1 },
  },
  giantOcto: {   // THE octopus: essentially one, living at its seeded hotspot
    pool: 2, salt: 17, rate: 16,
    bands: [[0.80, 1.00, 'uncommon']],   // vrare-ness lives in hotEvery/baseW
    hotEvery: 80000, baseW: 0.0002, damp: [0.02, 0.1],
    arrive: { axis: 'life', threshold: 0.83, curve: 'smoothstep', rampWidth: 0.17, max: 1 },
  },
};

// Befriended-follow rubberbanding (docs/07 "Saying hello"): followers run
// slightly faster than the eel when far, easing to slightly slower up close.
export const FOLLOW = {
  T: 12,         // s of following after a greet (+33%, 2026-07-05 — every
                 // greet response lasts longer)
  NEAR: 90,      // px — at/inside this, speed target is SLOW × eel speed
  FAR: 260,      // px — at/beyond this, FAST × eel speed
  SLOW: 0.90, FAST: 1.05,   // gentle rubberband — drifting escorts, not darts
  MIN: 60,       // px/s floor so followers never stall around an idle eel
  TURN: 1.4,     // × the species turn rate while following (attentive, not snappy)
};

// ---- Levels (docs/08) -------------------------------------------------------
// Each axis is quantized into COUNT levels; sessions land levels 1–16 / 17–24 /
// 25–28 / 29–30, so the W cost per level doubles each band (64 cost units total,
// one unit = 3K/64 — the level 30 threshold is exactly 3K).
export const LEVELS = {
  COUNT: 30,
  BANDS: [16, 8, 4, 2],   // levels per session; per-level cost doubles each band
  // Per-axis cap on the level-1 threshold: eelMagic's first level must cost no
  // more than one chocolate (scaled), so the first magic food teaches greet.
  FIRST_CAP: { eelMagic: 0.25 },
  BLOOM_T: 1.5,     // s — the world eases into each new step (smoothstep)
  POP_T: 1.6,       // s — a normal "Level Up!" popup's dwell
  GUIDE_T: 3.0,     // s — dwell for guide popups (control unlocks)
  SPARKS: 14,       // axis-colored confetti motes per level-up
};

// Level-up announcements (docs/08): manual per-axis {level: note} map. Levels
// without an entry still pop "Level Up!", just with no note line. Unlock notes
// MUST sit at their dial's computed unlock level — check-progress enforces it.
// {text, guide: true} = an instructional unlock popup (longer dwell).
export const LEVEL_NOTES = {
  light: {
    1: 'Slightly brighter',
    5: 'God rays reach deeper',
    9: 'Caustics shimmer above',
    13: 'The mid-water brightens',
    17: 'The gloom recedes',
    21: 'Golden waters',
    25: 'The deep begins to open',
    30: 'The sea shines',
  },
  life: {
    1: 'Kelp takes root',
    2: 'Seagrass sprouts below',
    4: 'Minnows arrive',
    7: 'The minnow schools grow',
    8: 'A flash of color — reef fish',
    10: 'The kelp grows denser',
    11: 'Seahorses curl into the kelp',
    12: 'Salmon run the midwater',
    13: 'Jellyfish drift in',
    16: 'An octopus takes up residence',
    17: 'A barracuda knifes past',
    18: 'The schools multiply',
    21: 'A pale light prowls the abyss',
    24: 'A crowded sea',
    26: 'Something vast stirs below',
    27: 'A swordfish patrols the blue',
    30: 'The sea teems with life',
  },
  worldMagic: {
    2: 'Plankton glow in the deep',
    3: 'Jelly lanterns pulse strange colors',
    4: 'Sparkles drift on the current',
    5: 'Minnows mob falling food',
    8: 'Fairies dance on the current',
    9: 'Reef fish shimmer with enchantment',
    14: 'Distant lights kindle on the seafloor',
    17: 'Lanterns bloom in the kelp',
    20: 'The magic thickens',
    30: 'An enchanted sea',
  },
  eelMagic: {
    1: { text: 'GREET — press I (or tap ♡) when critters are near', guide: true },
    4: 'A touch of makeup',
    8: { text: 'SPEED BURST — hold Shift (or a second finger) to sprint!', guide: true },
    12: 'Longer lashes',
    14: { text: 'EEL LIGHT — you glow softly; hold J (or ✦) to flare!', guide: true },
    18: 'Makeup hues start dancing',
    30: 'Fully fabulous',
  },
  love: {   // charged by greeting (docs/10) — flavor stays vague where no mechanic exists yet
    1: 'The sea warms to you',
    2: 'Friends greet you first sometimes',
    6: 'Warm currents follow you',
    12: 'The water feels friendlier',
    18: 'Hearts come easier',
    24: 'A sea full of friends',
    30: 'Beloved by the sea',
  },
};

// ---- The food economy (Matt's CSV — docs/07) ------------------------------
// rarity: 1–10, HIGHER = MORE COMMON (spawn weight ∝ rarity).
// fall/sway: 1–10 scales, mapped to units by FALL_MAP / SWAY_MAP below.
// axis/amount: the progression this food grants when eaten.
// size: display size in world px — placeholder values pending a visual pass.
export const FOODS = {
  toast: { asset: 'assets/food_salmon-toast.png', size: [62, 32],
    rarity: 4, fall: 3, sway: 5, axis: 'life', amount: 1.0 },
  pinecone: { asset: 'assets/food_pinecone.png', size: [24, 32],
    rarity: 8, fall: 1, sway: 9, axis: 'light', amount: 0.3 },
  burger: { asset: 'assets/food_cheeseburger.png', size: [47, 36],
    rarity: 2, fall: 7, sway: 2, axis: 'eelMagic', amount: 2.0 },
  soppressata: { asset: 'assets/food_soppressata.png', size: [32, 31],
    rarity: 6, fall: 5, sway: 3, axis: 'worldMagic', amount: 0.25 },
  chocolate: { asset: 'assets/food_chocolate.png', size: [24, 50],
    rarity: 1, fall: 9, sway: 1, axis: 'eelMagic', amount: 1.0 },
  avocado: { asset: 'assets/food_avocado.png', size: [30, 40],
    rarity: 3, fall: 5, sway: 2, axis: 'light', amount: 1.0 },
  greens: { asset: 'assets/food_greens.png', size: [60, 40],
    rarity: 3, fall: 6, sway: 3, axis: 'life', amount: 1.1 },
  // The red beans & rice PATCH (P4, docs/10): one spawn = a drifting cloud of
  // individual grains the eel swoops through like a whale through krill.
  // amount is PER GRAIN; grains are procedural SVG (no asset). Rare on
  // purpose — the many-particle rendering stays an event, not a load.
  beansrice: { size: [120, 74], rarity: 1, fall: 2, sway: 2, axis: 'life', amount: 0.09,
    patch: { grains: 106, beanFrac: 0.45, rx: 66, ry: 41 } },   // dispersion +~13% (Matt)
};

// 1–10 scale → world units (food v2 consumes these; see docs/07)
export const FALL_MAP = s => lerp(24, 180, (s - 1) / 9);  // px/s terminal
export const SWAY_MAP = s => lerp(4, 50, (s - 1) / 9);    // px lateral amplitude

// Global progression damper: axis grants are amount × this (the CSV amounts
// above stay authored as-is; lots of food falls, each bite counts for less).
export const AMOUNT_SCALE = 0.25;

// ---- Food grades (P4, docs/10) ----------------------------------------------
// Every spawned item rolls a grade, independent of the rarity spawn weight:
// the grade multiplies the eat's progression grant (and with it the eat FX).
// Tells while falling are RENDER-ONLY (physics/probe/eat use true positions):
// rare+ buzzes (smoothed random jitter); legendary also throbs — a size pulse
// that dwells at rest for most of its period, then swells and settles over a
// shorter window (NOT a sine — docs/07 P4 item 2).
export const GRADES = {
  P: { rare: 0.10, legendary: 0.02 },   // common = the rest
  MUL: { common: 1, rare: 2.5, legendary: 6 },
  BUZZ_A: 2.4,        // px — jitter amplitude
  BUZZ_TAU: 0.05,     // s — jitter smoothing (lightly smoothed, not teleporty)
  THROB_T: 1.7,       // s — full throb period
  THROB_DUTY: 0.28,   // fraction of the period that is the active swell
  THROB_A: 0.14,      // peak size swell (fraction of rest size)
};

// ---- Food combos (P4, docs/10) -----------------------------------------------
// Eats within WINDOW of each other chain; patch grains refresh the window but
// don't increment. The reward is a PLACEHOLDER (charge boost stamina) — it
// lives behind comboReward() in main.js and WILL change; the feel is settled:
// counter popups ("2x".."4x", "5x!"+) + escalating eat FX + a wiggle surge.
export const COMBO = {
  WINDOW: 2.2,        // s between eats to keep the chain
  BANG_AT: 5,         // exclamation mark from this tier up
  FX_MUL: 0.18,       // extra eat flash/shake per link past the first...
  FX_CAP: 2.2,        // ...capping the total multiplier
  SPARKS: 5,          // confetti motes per combo tier (n × this, capped 30)
  EXCITE: 0.5,        // eel wiggle surge added per link (eel.js eases it out)
  POP_T: 0.9,         // s — counter popup dwell
  STAMINA_PER: 0.34,  // placeholder reward: stamina refilled per link (from 2x)
};

// ---- Rocks + the dressing shaker (P4, docs/10) --------------------------------
export const ROCKS = {
  EVERY: 2100,        // px — mean spacing of seeded rocks along the floor
  R: [48, 88],        // px — rock radius range (~2× — Matt, 2026-07-05)
  SALT: 33,           // worldgen stream salt
  SMASH_BOOST: 0.5,   // boost01 needed to shatter...
  SMASH_SPEED: 250,   // ...at at least this speed (px/s)
  RESPAWN_H: 24,      // hours until a shattered rock returns (reset also clears)
  BUFF_T: 60,         // s — dressing buff duration
  BUFF_MUL: 3,        // greens amount multiplier while buffed
};

// ---- Progression dials -----------------------------------------------------
// One shape everywhere: value = max * curve01((axis − threshold) / rampWidth),
// zero below threshold. Consumed by their systems as they come online.
export const DIALS = {
  // EEL MAGIC power track (docs/07+08): greet unlocks at level 1 — the first
  // magic food (LEVELS.FIRST_CAP guarantees one chocolate reaches level 1,
  // whose value is 0.027 since the K retune; the threshold sits inside it).
  greet: { axis: 'eelMagic', threshold: 0.02, curve: 'linear', rampWidth: 0.01, max: 1 },
  // speed burst = level 8 (0.30 sits between V(7)=0.280 and V(8)=0.313 —
  // only eelMagic's V(1) shifts under K retunes; T(L≥2) rides the universal
  // ladder, FIRST_CAP clamps T(1) alone)
  speedBurst: { axis: 'eelMagic', threshold: 0.30, curve: 'smoothstep', rampWidth: 0.6, max: 1 },
  // EEL LIGHT (P4 follow-up, docs/10): ambient light radiating gently around
  // the eel, flareable on J / the touch ✦ button. NOT the old cut glow-blob:
  // this one is a soft MASK HOLE in the veil itself, so it genuinely reveals
  // the dark instead of painting over it. Unlocks at EEL MAGIC level 14.
  eelLight: { axis: 'eelMagic', threshold: 0.47, curve: 'smoothstep', rampWidth: 0.5, max: 1 },
  // EEL MAGIC cosmetics (docs/07): makeup fades in, then its hues start drifting
  makeup: { axis: 'eelMagic', threshold: 0.15, curve: 'smoothstep', rampWidth: 0.45, max: 1 },
  makeupHue: { axis: 'eelMagic', threshold: 0.60, curve: 'linear', rampWidth: 0.35, max: 1 },
  // WORLD MAGIC: jelly hue PULSES away from cyan — magnitude and frequency
  // both grow with this dial (docs/09; replaced the static expanded range)
  jellyHue: { axis: 'worldMagic', threshold: 0.12, curve: 'sqrt', rampWidth: 0.8, max: 1 },
  // WORLD MAGIC: minnows swarm toward nearby falling food (no interaction)
  minnowFeast: { axis: 'worldMagic', threshold: 0.20, curve: 'smoothstep', rampWidth: 0.6, max: 1 },
  // WORLD MAGIC: ambient multicolor drift-sparkles (glow layer)
  sparkles: { axis: 'worldMagic', threshold: 0.15, curve: 'sqrt', rampWidth: 0.7, max: 1 },
  // WORLD MAGIC: wandering glow-fairies shedding sparkle trails (docs/09)
  fairies: { axis: 'worldMagic', threshold: 0.30, curve: 'sqrt', rampWidth: 0.7, max: 1 },
  // WORLD MAGIC: reef-fish shimmer pulses (docs/09)
  reefPulse: { axis: 'worldMagic', threshold: 0.33, curve: 'smoothstep', rampWidth: 0.6, max: 1 },
  // WORLD MAGIC: seafloor lights in the background planes (glow layer, docs/03)
  bgLights: { axis: 'worldMagic', threshold: 0.47, curve: 'sqrt', rampWidth: 0.5, max: 1 },
  // WORLD MAGIC: lantern kelp — bulbs kindling in sequence up seeded strands
  lanternKelp: { axis: 'worldMagic', threshold: 0.55, curve: 'smoothstep', rampWidth: 0.45, max: 1 },
  // LOVE (docs/10): nearby critters spontaneously greet the eel — full
  // in-character response, no befriend-follow, no LOVE grant (no feedback loop)
  spontGreet: { axis: 'love', threshold: 0.08, curve: 'sqrt', rampWidth: 0.8, max: 1 },
  // LIFE: kelp density — the barren sea starts near-bare (docs/09); this dial
  // gates every kelp plane (main, wall, near-behind, front) plus seahorse homes
  kelp: { axis: 'life', threshold: 0.03, curve: 'sqrt', rampWidth: 0.9, max: 1 },
  // (fauna populations moved to SPECIES above — spawn tensor, docs/09)
  seagrass: { axis: 'life', threshold: 0.05, curve: 'quadratic', rampWidth: 0.8, max: 1 },
  plankton: { axis: 'worldMagic', threshold: 0.08, curve: 'sqrt', rampWidth: 0.6, max: 1 },
  // (pixelPulse was cut — the food pixelation effect looked bad)
};

// ---- Eat feedback (docs/06): screen flash + shake, scaled by food amount ----
export const EAT_FX = {
  FLASH_A: 0.10,     // peak flash opacity at amount 0...
  FLASH_A_AMT: 0.045, // ...plus this per progression amount (capped 0.22)
  FLASH_TAU: 0.18,   // s — flash fade
  SHAKE_BASE: 4,     // px shake amplitude at amount 0...
  SHAKE_AMT: 3,      // ...plus this per progression amount
  SHAKE_TAU: 0.12,   // s — shake decay
  SHAKE_F1: 31, SHAKE_F2: 37,   // rad/s — incommensurate x/y wobble
  LEVELUP_MUL: 1.4,  // flash+shake multiplier when the bite levels an axis up (docs/08)
};

// ---- Greeting (docs/07) ------------------------------------------------------
export const GREET = {
  RANGE: 128,   // px — critters this close to the eel's head respond
  CD: 1.6,      // s — eel greet cooldown
  // a tiny rose flash + shake on a successful greet (~1/3 of the eat feedback)
  FLASH_A: 0.045,
  SHAKE: 2.0,
  COLOR: [1.0, 0.616, 0.722],   // #ff9db8 — the eel-heart pink
  // LOVE earning (P4, docs/10): per responding critter, capped per greet —
  // the per-critter greet cooldown (6 s) already bounds the farm rate.
  LOVE_PER: 0.25,
  LOVE_CAP: 5,   // responders counted per greet
};

// Spontaneous greeting (P4, docs/10): the LOVE spontGreet dial's mechanics —
// an on-screen, off-cooldown critter inside RANGE greets the eel first.
export const SPONT = {
  RANGE: 200,   // px — a little wider than the player's greet reach
  RATE: 0.04,   // per-second chance per eligible critter at full dial
};

// ---- Eel light (P4 follow-up, docs/10) ---------------------------------------
// The ambient glow: a soft radial mask hole in the darkness veil around the
// eel — strength/radius ramp with the eelLight dial, and holding the flare
// swells both plus a cool halo on the glow layer. R in world px; HOLE is how
// much of the veil the core clears (0..1).
export const EEL_LIGHT = {
  R_BASE: 180, R_RAMP: 150,      // ambient radius at unlock → full dial
  HOLE_BASE: 0.45, HOLE_RAMP: 0.30,   // ambient veil relief at the core
  FLARE_R: 1.7,                  // radius multiplier at full flare
  FLARE_HOLE: 0.95,              // core relief at full flare (near-clear)
  TAU_UP: 0.22, TAU_DOWN: 0.55,  // s — flare ease in/out
  HALO_A: 0.16,                  // cool glow-layer halo peak opacity at flare
  HALO_COLOR: 'hsl(190, 90%, 78%)',   // icy cyan — the boost-crackle family
  // The flare's fuel (release notes 2026-07-05): hold-to-sustain on the green
  // light stamina, mirroring the boost rules — drains while flaring, steady
  // recharge while off, a minimum reserve to (re)ignite, holding through
  // empty never self-retriggers.
  STAM_DUR: 3.0,        // s of sustained flare from a full meter
  STAM_RECHARGE: 5.0,   // s to refill from empty
  STAM_MIN: 0.35,       // reserve needed to (re)ignite
  BAR_COLOR: 'hsl(135, 85%, 62%)',   // the light-stamina meter green
  // The ignition pulse: a bright front radiating outward from the eel before
  // the flare settles at its steady state. The veil hole overshoots (PULSE_R/
  // PULSE_HOLE at the envelope peak) and a glow ring expands and fades.
  PULSE_T: 0.6,         // s — pulse lifetime
  PULSE_R: 2.3,         // hole-radius multiplier at the pulse peak
  PULSE_HOLE: 1.0,      // veil relief at the pulse peak (fully clear)
  RING_A: 0.45,         // expanding ring opacity at birth
  RING_R: 2.4,          // ring travel: end radius as a multiple of the hole radius
  RING_W: 12,           // ring stroke width at birth (px, thins as it expands)
};

// ---- Speed burst (docs/07): base values + ramps along the speedBurst dial ----
export const BOOST = {
  AMT_BASE: 0.50,   // +50% top speed at dial 0...
  AMT_RAMP: 1.00,   // ...up to +150% at dial 1 — a real charge (turn rate
                    // drops by the same factor, docs/02)
  DUR_BASE: 1.5,    // s of full boost (stamina capacity)...
  DUR_RAMP: 1.5,    // ...up to 3 s
  SPARK_BASE: 10,   // electric sparks/s while boosting...
  SPARK_RAMP: 26,   // ...ramping with the dial
};

// ---- Minnow flocking (docs/07) ------------------------------------------------
export const FLOCK = {
  JOIN_BIAS: 0.7,    // 0 = new minnows enter uniformly from any offscreen point,
                     // 1 = always appear near an existing school
  MAX_SCHOOLS: 3,    // wander-leader cap
  SPLIT_SIZE: 16,    // a school past this many buds a new leader beside it
  MERGE_D: 140,      // px — leaders closer than this merge into one school
  RETARGET: 0.25,    // per-second chance a minnow re-picks its nearest leader
};

// ---- Parallax planes (docs/03): two BEHIND the main scene (GL) plus one
// sharp SVG plane IN FRONT of the eel (fgplane.js, docs/09). RES is the
// plane's offscreen render resolution (P4 blur FBO, docs/10): the plane
// renders at RES × canvas size and is bilinearly upsampled — smaller RES =
// stronger depth-of-field blur. ALPHA is applied at composite time.
// Background planes draw SHARP. Depth is faked with FOG instead: the far
// plane's colors pull toward the water color by this extra fraction (docs/10
// — three blur attempts each read badly and the whole FBO routine was
// removed, Matt 2026-07-05; the no-framebuffer rule of docs/03 is back).
export const LAYERS = {
  NEAR: { PF: 0.72, ALPHA: 0.8 },              // just behind the forest
  FAR: { PF: 0.40, ALPHA: 0.65, FOG: 0.25 },   // deep background, fogged
  FRONT: { PF: 1.22 },                         // occludes the eel, sharp
};

// Kelp growth with the LIFE axis: at LIFE = 1 the forest is denser and taller.
export const KELP_GROWTH = {
  DENSITY: 0.6,   // +60% strand count at full LIFE (all planes)
  HEIGHT: 0.35,   // +35% strand height at full LIFE
};

// ---- Seafloor terrain on EVERY plane (docs/03, docs/09, docs/10) ------------
// Per-plane silhouette terrain: undulation amplitude and base lift above the
// plane floor, keyed by plane. Average heights are ordered front (a sliver)
// → main (low) → near → far (highest, and blurred) — docs/07 P4 item 3.
// Lives here because it's shared between water.js (GL geometry), fgplane.js
// (the SVG front sliver), rocks.js (rocks sit ON the main terrain), and the
// glow-layer seafloor lights (sparkles.BgLights).
export const TERRAIN = {
  // Rolling floor only — no spires (they read badly and were cut). Heights
  // are FRACTIONS OF THE VIEW HEIGHT; worldgen.terrainShape keeps the roll
  // mostly low with occasional tall swells. POW shapes the roll per plane:
  // lower = more mid-height rolling variation (the main floor wants visible
  // dunes — Matt, 2026-07-05), higher = mostly-flat with rare swells.
  AMP: { front: 0.045, main: 0.34, near: 0.34, far: 0.5 },
  BASE: { front: 3, main: 5, near: 8, far: 12 },   // px minimum rise
  SALT: { front: 25, main: 22, near: 23, far: 24 },
  POW: { front: 2.6, main: 1.4, near: 2.6, far: 2.6 },   // main: REAL dunes
};

// ---- Light endpoints (docs/03) ---------------------------------------------
// Unified lighting: the GL palettes carry HUE; the veil (below) is the single
// authority on depth-brightness for GL and sprites alike. So LIGHT0 is a dim
// but *formed* blue scene — the veil multiplies it (and everything else) down
// to black at depth.
const LIGHT0 = {
  deep: [0.008, 0.038, 0.055],
  surface: [0.140, 0.300, 0.340],
  ray: 0.10, shim: 0.03, kelpDim: 0.55,
};
const LIGHT1 = {
  deep: [0.012, 0.055, 0.080],
  surface: [0.330, 0.670, 0.710],
  ray: 0.40, shim: 0.075, kelpDim: 1.05,
};
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Gamma on the GL palette response: the scene warms slowly through most of the
// LIGHT axis and blooms late, instead of lightening linearly.
export const LIGHT_GAMMA = 1.7;

export function lightParams(light01) {
  const t = Math.pow(light01, LIGHT_GAMMA);
  return {
    deep: lerp3(LIGHT0.deep, LIGHT1.deep, t),
    surface: lerp3(LIGHT0.surface, LIGHT1.surface, t),
    ray: lerp(LIGHT0.ray, LIGHT1.ray, t),
    shim: lerp(LIGHT0.shim, LIGHT1.shim, t),
    kelpDim: lerp(LIGHT0.kelpDim, LIGHT1.kelpDim, t),
  };
}

// ---- Mobile ----------------------------------------------------------------
export const MOBILE = {
  ZOOM: 0.5,   // camera zoom on coarse-pointer devices: view spans W/ZOOM world px
};

// ---- The illumination veil (docs/03) ----------------------------------------
// A multiply layer over the whole scene: white at the surface (no-op) falling
// toward TINT at depth — one depth-darkness function shared by GL and sprites.
export const VEIL = {
  MODE: 'multiply',        // 'multiply' (true multiplicative color) | 'alpha'
                           // ('alpha' = tinted overlay fallback if a browser's
                           // mix-blend-mode compositing ever misbehaves)
  TINT: [6, 20, 30],       // rgb the deep water multiplies toward (near-black blue)
  SURF_A: 0.30,            // darkness at the surface when LIGHT = 0
  CLEAR_D: 0.06,           // depth fraction where darkening starts
  BLACK_D0: 0.55,          // depth of full darkness at LIGHT = 0...
  BLACK_D1: 1.60,          // ...receding past the floor as LIGHT grows
  GAMMA: 2.2,              // LIGHT response: darkness clears ∝ 1 − light^GAMMA,
                           // and the black line recedes on the same curve — the
                           // deep stays dark through most of the progression
                           // and only opens up late (no linear lightening)
  DEPTH_EXP: 0.7,          // <1 = darkness arrives faster as you descend
  // The abyss never fully clears: a permanent depth-darkness floor that even
  // LIGHT = 1 can't lift — the world floor sits at ~10% max brightness.
  END_A: 0.93,             // darkness at the very bottom at LIGHT = 1
  END_START: 0.30,         // depth fraction where the permanent floor begins
                           // (low start = a long, gentle ramp into the dark)
  STOPS: 8,                // gradient sample count
  REBUILD_EPS: 0.01,       // LIGHT delta that triggers a gradient rebuild
};
