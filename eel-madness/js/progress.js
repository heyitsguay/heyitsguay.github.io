// Progression state (docs/07 + docs/08): per-axis weight accumulators squashed
// to 0–1 values and QUANTIZED into discrete levels — consumers see a step
// function that bloom-eases into each new step. Persisted to localStorage,
// with URL preview overrides for tuning (values > 1 = a level, ≤ 1 = a raw
// axis fraction; overrides bypass quantization, bloom, and level-up events).

import { clamp, lerp, curves } from './math.js';
import { AXES, LEVELS } from './tuning.js';

const STORE_KEY = 'eel-madness:progress:v1';
const URL_KEYS = { light: 'light', life: 'life', worldmagic: 'worldMagic', eelmagic: 'eelMagic', love: 'love' };

// Cumulative W thresholds T[0..COUNT] for one axis (docs/08): the per-level
// cost doubles each session band; one unit = 3K / total units, so the last
// threshold is exactly 3K and level COUNT lands at 1 − e⁻³ ≈ 0.95.
function buildThresholds(axis) {
  const totalUnits = LEVELS.BANDS.reduce((s, n, b) => s + n * 2 ** b, 0);
  const unit = 3 * AXES[axis].K / totalUnits;
  const T = [0];
  LEVELS.BANDS.forEach((n, band) => {
    for (let i = 0; i < n; i++) T.push(T[T.length - 1] + unit * 2 ** band);
  });
  const cap = LEVELS.FIRST_CAP[axis];
  if (cap !== undefined) T[1] = Math.min(T[1], cap);
  return T;
}

class Progress {
  constructor() {
    this.W = {};
    for (const axis in AXES) this.W[axis] = 0;
    this.override = {};
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && saved.W) {
        for (const axis in AXES) if (Number.isFinite(saved.W[axis])) this.W[axis] = saved.W[axis];
      }
    } catch { /* fresh sea */ }
    this.T = {};
    this.lvl = {};        // current level per axis
    this.disp = {};       // displayed (bloom-eased) step value per axis
    this.bloomFrom = {};
    this.bloomAge = {};   // Infinity = no bloom running
    this.pending = [];    // level-up events awaiting consumeLevelUps()
    for (const axis in AXES) {
      this.T[axis] = buildThresholds(axis);
      this.lvl[axis] = this.levelFromW(axis);
      this.disp[axis] = this.levelValue(axis, this.lvl[axis]);
      this.bloomAge[axis] = Infinity;
    }
    try {
      const q = new URLSearchParams(location.search);
      for (const [key, axis] of Object.entries(URL_KEYS)) {
        if (!q.has(key)) continue;
        const raw = parseFloat(q.get(key)) || 0;
        this.override[axis] = raw > 1
          ? this.levelValue(axis, clamp(Math.round(raw), 0, LEVELS.COUNT))
          : clamp(raw, 0, 1);
      }
    } catch { /* not in a browser (headless tests) */ }
  }

  levelFromW(axis) {
    const T = this.T[axis];
    let L = 0;
    while (L < LEVELS.COUNT && this.W[axis] >= T[L + 1]) L++;
    return L;
  }

  // The quantized step: the squash evaluated at level L's threshold.
  levelValue(axis, L) {
    return 1 - Math.exp(-this.T[axis][L] / AXES[axis].K);
  }

  // Current level; a preview override reports the level its pin sits at.
  level(axis) {
    if (this.sandbox) return LEVELS.COUNT;
    if (axis in this.override) {
      let L = LEVELS.COUNT;
      while (L > 0 && this.levelValue(axis, L) > this.override[axis] + 1e-9) L--;
      return L;
    }
    return this.lvl[axis];
  }

  // Axis value in 0..1: the bloom-eased step, or the URL preview verbatim.
  // demo = the title screen's attract mode (docs/08): the sea reads fully
  // alive — EXCEPT EEL MAGIC, which stays 0 (the powers are the game's
  // surprise) — while levels/W stay real (the title header shows them).
  // sandbox = "Skip To The End" (docs/08): everything maxed, nothing saved.
  value(axis) {
    if (this.sandbox) return 1;
    if (this.demo) return axis === 'eelMagic' ? 0 : 1;
    if (axis in this.override) return this.override[axis];
    return this.disp[axis];
  }

  // Is there a saved sea? (drives the title screen's Reset button + header)
  hasSave() {
    return Object.values(this.W).some(w => w > 0);
  }

  add(axis, amount) {
    if (this.sandbox) return;   // the sandbox never touches the save
    if (!(axis in this.W)) return;
    this.W[axis] += amount;
    const to = this.levelFromW(axis);
    if (to > this.lvl[axis]) {
      for (let L = this.lvl[axis] + 1; L <= to; L++) this.pending.push({ axis, level: L });
      this.bloomFrom[axis] = this.disp[axis];
      this.bloomAge[axis] = 0;
      this.lvl[axis] = to;
    }
    this.save();
  }

  // Bloom (docs/08): after a level-up, the displayed value eases from the old
  // step to the new one over BLOOM_T. Called once per frame from main.js;
  // headless tests must tick past BLOOM_T before asserting post-level values.
  tick(dt) {
    for (const axis in AXES) {
      if (this.bloomAge[axis] === Infinity) continue;
      this.bloomAge[axis] += dt;
      const u = Math.min(1, this.bloomAge[axis] / LEVELS.BLOOM_T);
      this.disp[axis] = lerp(this.bloomFrom[axis], this.levelValue(axis, this.lvl[axis]),
        curves.smoothstep(u));
      if (u >= 1) this.bloomAge[axis] = Infinity;
    }
  }

  // Drain queued level-ups ({axis, level}, one per level crossed, in order).
  consumeLevelUps() {
    if (!this.pending.length) return this.pending;
    const p = this.pending;
    this.pending = [];
    return p;
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ W: this.W })); } catch { /* private mode */ }
  }

  reset() {
    for (const axis in this.W) {
      this.W[axis] = 0;
      this.lvl[axis] = 0;
      this.disp[axis] = 0;
      this.bloomAge[axis] = Infinity;
    }
    this.pending = [];
    this.save();
  }

  // Evaluate a progression dial record (tuning.DIALS shape, docs/07).
  dial({ axis, threshold, curve, rampWidth, max }) {
    const t = (this.value(axis) - threshold) / rampWidth;
    return t <= 0 ? 0 : max * curves[curve](t);
  }
}

export const progress = new Progress();
