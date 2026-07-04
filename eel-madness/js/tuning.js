// THE experiment surface (see docs/07-progression.md). Anything you'd tune to
// shape the game lives here: axes, the food economy, light palettes, dials.
// Structural/math constants stay in their modules.

import { lerp } from './math.js';

// ---- Axes ----------------------------------------------------------------
// axis value = 1 − exp(−W / K). K sets the axis timescale.
// Calibration (docs/07): ~25 eats per 5-min session, spawn share ∝ rarity/27,
// K ≈ (expected 5-session W) / 3 so the axis hits ~0.95 at session 5.
// color: the axis signature (eat pulse, milestone sparks) — approved palette.
export const AXES = {
  light: { K: 8.3, color: [1.00, 0.83, 0.42], label: 'LIGHT' },       // warm gold
  life: { K: 11.3, color: [0.48, 0.90, 0.50], label: 'LIFE' },        // spring green
  worldMagic: { K: 2.3, color: [0.55, 0.50, 0.95], label: 'WORLD MAGIC' }, // violet-teal
  eelMagic: { K: 7.7, color: [1.00, 0.55, 0.75], label: 'EEL MAGIC' },     // rose-pink
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
  // EEL MAGIC power track (docs/07): greet unlocks on the first magic food
  // (one chocolate → axis ≈ 0.12 > threshold).
  greet: { axis: 'eelMagic', threshold: 0.10, curve: 'linear', rampWidth: 0.01, max: 1 },
  eelGlow: { axis: 'eelMagic', threshold: 0.45, curve: 'smoothstep', rampWidth: 0.25, max: 1 },
  glowBurst: { axis: 'eelMagic', threshold: 0.75, curve: 'linear', rampWidth: 0.01, max: 1 },
  // P1+ placeholders (spawn dials read these when their systems land)
  minnows: { axis: 'life', threshold: 0.04, curve: 'sqrt', rampWidth: 0.7, max: 1 },
  jellyfish: { axis: 'life', threshold: 0.25, curve: 'smoothstep', rampWidth: 0.5, max: 1 },
  seagrass: { axis: 'life', threshold: 0.12, curve: 'quadratic', rampWidth: 0.8, max: 1 },
  plankton: { axis: 'worldMagic', threshold: 0.08, curve: 'sqrt', rampWidth: 0.6, max: 1 },
  pixelPulse: { axis: 'worldMagic', threshold: 0.40, curve: 'smoothstep', rampWidth: 0.4, max: 1 },
};

// ---- Light endpoints (docs/03) ---------------------------------------------
// The scene lerps between these as LIGHT grows. LIGHT1 ≈ today, a touch
// brighter; LIGHT0 is the barren sea — the deep end is genuinely black.
const LIGHT0 = {
  deep: [0.000, 0.001, 0.002],
  surface: [0.035, 0.075, 0.090],
  ray: 0.04, shim: 0.015, kelpDim: 0.22,
};
const LIGHT1 = {
  deep: [0.012, 0.055, 0.080],
  surface: [0.330, 0.670, 0.710],
  ray: 0.40, shim: 0.075, kelpDim: 1.05,
};
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function lightParams(light01) {
  const t = light01;
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

// ---- The darkness veil (docs/03) -------------------------------------------
export const VEIL = {
  TINT: '1, 6, 10',        // rgb of the dark water
  SURF_A: 0.30,            // alpha at the surface when LIGHT = 0
  CLEAR_D: 0.06,           // depth fraction where darkening starts
  BLACK_D0: 0.55,          // depth of full black at LIGHT = 0...
  BLACK_D1: 1.60,          // ...receding past the floor as LIGHT grows
  FADE_EXP: 1.4,           // veil strength ∝ (1 − LIGHT)^this
  STOPS: 8,                // gradient sample count
  REBUILD_EPS: 0.01,       // LIGHT delta that triggers a gradient rebuild
};
