// Pooled heart emitter (see docs/07): one system, parameterized per species —
// color, size, count, motion pattern, delay — so every critter gets its own
// greeting signature for a few config lines. Hearts pop in, float up with a
// wobble, and fade.

import { TAU, clamp } from './math.js';

const POOL = 48;
// Unit heart, ~13px tall, centered on its visual middle, point down.
const HEART_D = 'M0 5.4 C -3.4 2.6, -6.2 -0.2, -6.2 -2.8 C -6.2 -5.2, -4.4 -6.6, -2.6 -6.6 C -1.4 -6.6, -0.4 -6.0, 0 -4.9 C 0.4 -6.0, 1.4 -6.6, 2.6 -6.6 C 4.4 -6.6, 6.2 -5.2, 6.2 -2.8 C 6.2 -0.2, 3.4 2.6, 0 5.4 Z';
const RISE = 34;        // px/s initial float
const RISE_DECAY = 0.8; // 1/s
const WOBBLE = 9;       // px lateral wobble amplitude
const WOBBLE_F = 3.2;   // rad/s
const TILT_DEG = 15;    // hearts lean into their wobble
const DUR = 1.5;        // s lifetime
const POP_T = 0.14;     // s grow-in before the spring takes over
const POP_OVER = 0.45;  // springy overshoot amplitude...
const POP_DAMP = 4.2;   // ...decaying at this rate
const POP_FREQ = 13;    // rad/s — the boing
const FADE_FRAC = 0.35; // last fraction of life fades out

export class Hearts {
  constructor(svgRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    const group = svgRoot.querySelector('#hearts');
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('d', HEART_D);
      el.setAttribute('display', 'none');
      group.appendChild(el);
      this.pool.push({ el, age: 1e9, x: 0, y: 0, vy: 0, size: 6, color: '#fff', phase: 0 });
    }
    this.pending = [];
  }

  // spec: { color, size=6, count=1, pattern='single'|'scatter'|'ring'|'fan',
  //         delay=0, spread=14 }
  emit(x, y, spec) {
    const { color, size = 6, count = 1, pattern = 'single', delay = 0, spread = 14 } = spec;
    for (let k = 0; k < count; k++) {
      let ox = 0, oy = 0;
      if (pattern === 'scatter') {
        ox = (Math.random() - 0.5) * 2 * spread;
        oy = (Math.random() - 0.5) * spread;
      } else if (pattern === 'ring') {
        const a = (k / count) * TAU - Math.PI / 2;
        ox = Math.cos(a) * spread;
        oy = Math.sin(a) * spread;
      } else if (pattern === 'fan') {
        const a = -Math.PI / 2 + (count === 1 ? 0 : (k / (count - 1) - 0.5) * 1.7);
        ox = Math.cos(a) * spread;
        oy = Math.sin(a) * spread;
      }
      this.pending.push({
        t: delay + k * (pattern === 'single' ? 0 : 0.07),
        x: x + ox, y: y + oy, size, color,
      });
    }
  }

  spawn(p) {
    const h = this.pool.find(h => h.age >= DUR) || this.pool[0];
    h.age = 0;
    h.x = p.x; h.y = p.y;
    h.vy = -RISE * (0.85 + Math.random() * 0.3);
    h.size = p.size;
    h.color = p.color;
    h.phase = Math.random() * TAU;
    h.el.setAttribute('fill', p.color);
    h.el.setAttribute('display', 'inline');
  }

  // Blank-slate reset (docs/08): drop queued and airborne hearts.
  clear() {
    this.pending.length = 0;
    for (const h of this.pool) {
      if (h.age >= DUR) continue;
      h.age = DUR;
      h.el.setAttribute('display', 'none');
    }
  }

  update(dt) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.spawn(p);
        this.pending.splice(i, 1);
      }
    }
    for (const h of this.pool) {
      if (h.age >= DUR) continue;
      h.age += dt;
      h.vy *= Math.exp(-dt * RISE_DECAY);
      h.y += h.vy * dt;
      if (h.age >= DUR) h.el.setAttribute('display', 'none');
    }
  }

  render() {
    for (const h of this.pool) {
      if (h.age >= DUR) continue;
      const u = h.age / DUR;
      // grow in fast, then a springy overshoot that boings itself out
      const grow = clamp(h.age / POP_T, 0, 1);
      const pop = grow * (grow * (3 - 2 * grow))
        * (1 + POP_OVER * Math.exp(-h.age * POP_DAMP) * Math.sin(h.age * POP_FREQ));
      const s = (h.size / 13) * pop;
      // wobble sideways and lean into it
      const wob = Math.sin(h.age * WOBBLE_F + h.phase) * WOBBLE;
      const tilt = Math.cos(h.age * WOBBLE_F + h.phase) * TILT_DEG;
      h.el.setAttribute('transform',
        `translate(${(h.x + wob).toFixed(1)} ${h.y.toFixed(1)}) rotate(${tilt.toFixed(1)}) scale(${s.toFixed(3)})`);
      h.el.setAttribute('opacity',
        (u > 1 - FADE_FRAC ? (1 - u) / FADE_FRAC : 1).toFixed(2));
    }
  }
}
