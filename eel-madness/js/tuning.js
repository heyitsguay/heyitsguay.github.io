// THE experiment surface (see docs/07-progression.md). Anything you'd tune to
// shape the game lives here: axes, the food economy, light palettes, dials.
// Structural/math constants stay in their modules.

import { lerp } from './math.js';

// ---- Axes ----------------------------------------------------------------
// axis value = 1 − exp(−W / K), quantized into LEVELS.COUNT levels (docs/08).
// K sets the axis timescale. Calibration (docs/07+08): spawn share ∝ rarity/27,
// K ≈ (expected 4-session W) / 3 so level 30 (= 3K of W) hits ~0.95 at session 4.
// color: the axis signature (eat pulse, level-ups, milestone sparks) — approved palette.
export const AXES = {
  light: { K: 6.6, color: [1.00, 0.83, 0.42], label: 'LIGHT' },       // warm gold
  life: { K: 9.0, color: [0.48, 0.90, 0.50], label: 'LIFE' },         // spring green
  worldMagic: { K: 1.8, color: [0.55, 0.50, 0.95], label: 'WORLD MAGIC' }, // violet-teal
  eelMagic: { K: 6.1, color: [1.00, 0.55, 0.75], label: 'EEL MAGIC' },     // rose-pink
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
    1: 'The water warms',
    5: 'God rays reach deeper',
    9: 'Caustics shimmer above',
    13: 'The mid-water brightens',
    17: 'The gloom recedes',
    21: 'Golden waters',
    25: 'The deep begins to open',
    30: 'The sea shines',
  },
  life: {
    2: 'Seagrass takes root',
    4: 'Minnows arrive',
    7: 'The minnows school up',
    10: 'The kelp grows denser',
    13: 'Jellyfish drift in',
    18: 'The schools multiply',
    24: 'A crowded sea',
    30: 'The sea teems with life',
  },
  worldMagic: {
    2: 'Plankton glow in the deep',
    3: 'Jelly lanterns tint strange colors',
    4: 'Sparkles drift on the current',
    5: 'Minnows mob falling food',
    11: 'Food pulses with enchantment',
    20: 'The magic thickens',
    30: 'An enchanted sea',
  },
  eelMagic: {
    1: { text: 'GREET unlocked — press I (or tap ♡)', guide: true },
    4: 'A touch of makeup',
    8: { text: 'SPEED BURST — hold Shift (or a second finger). Fast, but wide turns!', guide: true },
    12: 'Longer lashes',
    18: 'Makeup hues begin to drift',
    30: 'Fully fabulous',
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
};

// 1–10 scale → world units (food v2 consumes these; see docs/07)
export const FALL_MAP = s => lerp(24, 180, (s - 1) / 9);  // px/s terminal
export const SWAY_MAP = s => lerp(4, 50, (s - 1) / 9);    // px lateral amplitude

// Global progression damper: axis grants are amount × this (the CSV amounts
// above stay authored as-is; lots of food falls, each bite counts for less).
export const AMOUNT_SCALE = 0.25;

// ---- Progression dials -----------------------------------------------------
// One shape everywhere: value = max * curve01((axis − threshold) / rampWidth),
// zero below threshold. Consumed by their systems as they come online.
export const DIALS = {
  // EEL MAGIC power track (docs/07+08): greet unlocks at level 1 — the first
  // magic food (LEVELS.FIRST_CAP guarantees one chocolate reaches level 1,
  // whose value is 0.040; the threshold sits inside it).
  greet: { axis: 'eelMagic', threshold: 0.03, curve: 'linear', rampWidth: 0.01, max: 1 },
  // speed burst = level 8 (0.30 sits between V(7)=0.280 and V(8)=0.313)
  speedBurst: { axis: 'eelMagic', threshold: 0.30, curve: 'smoothstep', rampWidth: 0.6, max: 1 },
  // (a baseline eel glow was built here and cut — looked bad; next EEL MAGIC
  // power after speed burst is TBD, docs/07)
  // EEL MAGIC cosmetics (docs/07): makeup fades in, then its hues start drifting
  makeup: { axis: 'eelMagic', threshold: 0.15, curve: 'smoothstep', rampWidth: 0.45, max: 1 },
  makeupHue: { axis: 'eelMagic', threshold: 0.60, curve: 'linear', rampWidth: 0.35, max: 1 },
  // WORLD MAGIC: jelly light hues drawn from an expanding range around cyan
  jellyHue: { axis: 'worldMagic', threshold: 0.12, curve: 'sqrt', rampWidth: 0.8, max: 1 },
  // WORLD MAGIC: minnows swarm toward nearby falling food (no interaction)
  minnowFeast: { axis: 'worldMagic', threshold: 0.20, curve: 'smoothstep', rampWidth: 0.6, max: 1 },
  // WORLD MAGIC: ambient multicolor drift-sparkles (glow layer)
  sparkles: { axis: 'worldMagic', threshold: 0.15, curve: 'sqrt', rampWidth: 0.7, max: 1 },
  // Population dials: max IS the target head-count at full ramp.
  minnows: { axis: 'life', threshold: 0.14, curve: 'sqrt', rampWidth: 0.7, max: 60 },
  jellyfish: { axis: 'life', threshold: 0.45, curve: 'smoothstep', rampWidth: 0.5, max: 20 },
  // P2+ placeholders (spawn dials read these when their systems land)
  seagrass: { axis: 'life', threshold: 0.05, curve: 'quadratic', rampWidth: 0.8, max: 1 },
  plankton: { axis: 'worldMagic', threshold: 0.08, curve: 'sqrt', rampWidth: 0.6, max: 1 },
  pixelPulse: { axis: 'worldMagic', threshold: 0.40, curve: 'smoothstep', rampWidth: 0.4, max: 1 },
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
  RANGE: 260,   // px — critters this close to the eel's head respond
  CD: 1.6,      // s — eel greet cooldown
  // a tiny rose flash + shake on a successful greet (~1/3 of the eat feedback)
  FLASH_A: 0.045,
  SHAKE: 2.0,
  COLOR: [1.0, 0.616, 0.722],   // #ff9db8 — the eel-heart pink
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

// ---- Parallax planes (docs/03): both BEHIND the main scene ------------------
// Blur is faked with jittered semi-transparent re-draws (no framebuffers).
export const LAYERS = {
  NEAR: { PF: 0.72, BLUR: 1.6, TAPS: 2, ALPHA: 0.8 },   // just behind the forest
  FAR: { PF: 0.40, BLUR: 4.5, TAPS: 3, ALPHA: 0.65 },   // deep background
};

// Kelp growth with the LIFE axis: at LIFE = 1 the forest is denser and taller.
export const KELP_GROWTH = {
  DENSITY: 0.6,   // +60% strand count at full LIFE (all planes)
  HEIGHT: 0.35,   // +35% strand height at full LIFE
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
