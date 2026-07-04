// Progression state (see docs/07-progression.md): per-axis weight accumulators
// squashed to 0–1 values, persisted to localStorage, with URL preview overrides
// for tuning (?light=0.7&life=0.2&worldmagic=0.5&eelmagic=1 — not persisted).

import { clamp, curves } from './math.js';
import { AXES } from './tuning.js';

const STORE_KEY = 'eel-madness:progress:v1';
const URL_KEYS = { light: 'light', life: 'life', worldmagic: 'worldMagic', eelmagic: 'eelMagic' };

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
    try {
      const q = new URLSearchParams(location.search);
      for (const [key, axis] of Object.entries(URL_KEYS)) {
        if (q.has(key)) this.override[axis] = clamp(parseFloat(q.get(key)) || 0, 0, 1);
      }
    } catch { /* not in a browser (headless tests) */ }
  }

  // Axis value in 0..1: diminishing-returns squash, or the URL preview.
  value(axis) {
    if (axis in this.override) return this.override[axis];
    return 1 - Math.exp(-this.W[axis] / AXES[axis].K);
  }

  add(axis, amount) {
    if (!(axis in this.W)) return;
    this.W[axis] += amount;
    this.save();
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ W: this.W })); } catch { /* private mode */ }
  }

  reset() {
    for (const axis in this.W) this.W[axis] = 0;
    this.save();
  }

  // Evaluate a progression dial record (tuning.DIALS shape, docs/07).
  dial({ axis, threshold, curve, rampWidth, max }) {
    const t = (this.value(axis) - threshold) / rampWidth;
    return t <= 0 ? 0 : max * curves[curve](t);
  }
}

export const progress = new Progress();
