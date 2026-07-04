// Glow-layer particles (docs/07): two populations sharing one pooled circle
// system, both living ABOVE the darkness veil so they shine in the dark.
//
//  - ambient sparkles (WORLD MAGIC `sparkles` dial): little multicolor glints
//    that drift and spiral before fading away — pure prettiness, everywhere.
//  - phosphorescent plankton (`plankton` dial): cyan-green motes of the deep
//    water; they twinkle slowly and brighten as the eel passes.
//
// Particles fade in and out, so spawning inside the view never pops.

import { TAU, clamp } from './math.js';
import { DIALS } from './tuning.js';
import { progress } from './progress.js';

const POOL = 90;
// ambient sparkles
const AMB_RATE = 7;            // spawns/s at full dial (in-view)
const AMB_LIFE_MIN = 2.5, AMB_LIFE_VAR = 2.5;   // s
const AMB_SIZE_MIN = 1.2, AMB_SIZE_VAR = 1.5;   // px radius
const AMB_ALPHA = 0.55;
const AMB_DRIFT = 14;          // px/s slow travel
const AMB_SPIRAL_R = 14;       // px — spiral radius it winds out to
const AMB_SPIRAL_W = 1.8;      // rad/s ± spiral speed
const AMB_SAT = 85, AMB_LUM = 75;   // hsl of the random hues
// plankton
const PLK_RATE = 9;            // spawns/s at full dial (in the deep band)
const PLK_MIN_DEPTH = 0.5;     // world-height fraction where plankton begins
const PLK_LIFE_MIN = 4, PLK_LIFE_VAR = 3;
const PLK_SIZE_MIN = 0.9, PLK_SIZE_VAR = 1.1;
const PLK_ALPHA = 0.5;
const PLK_DRIFT = 6;
const PLK_HUE_MIN = 160, PLK_HUE_VAR = 45;      // cyan-greens
const PLK_TWINKLE_F = 1.3;     // rad/s
const PLK_EEL_R = 170;         // px — brighten near a passing eel...
const PLK_EEL_GAIN = 1.6;      // ...by up to this much extra
const FADE_FRAC = 0.25;        // fraction of life fading in and out
const VIEW_PAD = 40;

export class Sparkles {
  constructor(glowRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    const group = glowRoot.querySelector('#glows');
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('display', 'none');
      group.appendChild(el);
      this.pool.push({ el, age: 1e9, life: 1, shown: false });
    }
    this.time = 0;
  }

  spawn(kind, x, y, worldH) {
    const p = this.pool.find(p => p.age >= p.life);
    if (!p) return null;
    p.kind = kind;
    p.age = 0;
    p.x = x; p.y = y;
    p.shown = false;
    p.phase = Math.random() * TAU;
    if (kind === 0) {   // ambient sparkle
      p.life = AMB_LIFE_MIN + Math.random() * AMB_LIFE_VAR;
      p.size = AMB_SIZE_MIN + Math.random() * AMB_SIZE_VAR;
      p.hue = Math.random() * 360;
      const a = Math.random() * TAU;
      p.vx = Math.cos(a) * AMB_DRIFT * (0.4 + Math.random());
      p.vy = Math.sin(a) * AMB_DRIFT * (0.4 + Math.random()) - 4;
      p.spiralW = (Math.random() < 0.5 ? -1 : 1) * AMB_SPIRAL_W * (0.6 + Math.random() * 0.8);
      p.spiralR = AMB_SPIRAL_R * (0.4 + Math.random());
      p.alpha = AMB_ALPHA;
    } else {            // plankton
      p.life = PLK_LIFE_MIN + Math.random() * PLK_LIFE_VAR;
      p.size = PLK_SIZE_MIN + Math.random() * PLK_SIZE_VAR;
      p.hue = PLK_HUE_MIN + Math.random() * PLK_HUE_VAR;
      p.vx = (Math.random() - 0.5) * PLK_DRIFT;
      p.vy = (Math.random() - 0.5) * PLK_DRIFT;
      p.spiralW = 0;
      p.spiralR = 0;
      p.alpha = PLK_ALPHA;
    }
    p.el.setAttribute('fill', `hsl(${p.hue.toFixed(0)}, ${AMB_SAT}%, ${AMB_LUM}%)`);
    void worldH;
    return p;
  }

  // Level-up confetti (docs/08): a brief radial scatter of axis-colored motes,
  // riding the ambient-sparkle spiral/envelope on the shared pool.
  burst(x, y, rgb, n) {
    const fill = `rgb(${rgb.map(c => Math.round(c * 255)).join(',')})`;
    for (let i = 0; i < n; i++) {
      const p = this.spawn(0, x, y, 0);
      if (!p) return;
      const a = Math.random() * TAU, sp = 40 + Math.random() * 90;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 24;   // a little lift — celebration, not debris
      p.life = 0.9 + Math.random() * 0.8;
      p.size = 1.5 + Math.random() * 1.8;
      p.el.setAttribute('fill', fill);
    }
  }

  update(dt, cam, viewW, viewH, eel, worldW, worldH) {
    const t = (this.time += dt);
    this.eelX = eel.x; this.eelY = eel.y;
    this.view = { x0: cam.x, y0: cam.y, x1: cam.x + viewW, y1: cam.y + viewH };

    const amb = progress.dial(DIALS.sparkles);
    if (amb > 0 && Math.random() < AMB_RATE * amb * dt) {
      this.spawn(0,
        clamp(cam.x + Math.random() * viewW, 20, worldW - 20),
        clamp(cam.y + Math.random() * viewH, 20, worldH - 20), worldH);
    }
    const plk = progress.dial(DIALS.plankton);
    if (plk > 0) {
      // only the deep band spawns plankton; skip when the view is shallow
      const y0 = Math.max(cam.y, PLK_MIN_DEPTH * worldH);
      const y1 = cam.y + viewH;
      if (y1 > y0 && Math.random() < PLK_RATE * plk * dt * clamp((y1 - y0) / viewH, 0, 1)) {
        this.spawn(1,
          clamp(cam.x + Math.random() * viewW, 20, worldW - 20),
          y0 + Math.random() * (y1 - y0), worldH);
      }
    }

    for (const p of this.pool) {
      if (p.age >= p.life) continue;
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age >= p.life
          || p.x < this.view.x0 - VIEW_PAD || p.x > this.view.x1 + VIEW_PAD
          || p.y < this.view.y0 - VIEW_PAD || p.y > this.view.y1 + VIEW_PAD) {
        p.age = p.life;
        if (p.shown) { p.shown = false; p.el.setAttribute('display', 'none'); }
      }
    }
  }

  render() {
    const t = this.time;
    for (const p of this.pool) {
      if (p.age >= p.life) continue;
      const u = p.age / p.life;
      // smooth in/out envelope
      const env = Math.min(u, 1 - u) / FADE_FRAC;
      let a = p.alpha * clamp(env, 0, 1);
      let x = p.x, y = p.y;
      if (p.kind === 0) {
        // wind outward along a spiral as it drifts
        const r = p.spiralR * u;
        const th = t * p.spiralW + p.phase;
        x += Math.cos(th) * r;
        y += Math.sin(th) * r;
      } else {
        a *= 0.65 + 0.35 * Math.sin(t * PLK_TWINKLE_F + p.phase);
        const d = Math.hypot(p.x - this.eelX, p.y - this.eelY);
        a *= 1 + PLK_EEL_GAIN * Math.exp(-(d * d) / (PLK_EEL_R * PLK_EEL_R));
      }
      p.el.setAttribute('cx', x.toFixed(1));
      p.el.setAttribute('cy', y.toFixed(1));
      p.el.setAttribute('r', p.size.toFixed(2));
      p.el.setAttribute('opacity', Math.min(1, a).toFixed(2));
      if (!p.shown) {
        p.shown = true;
        p.el.setAttribute('display', 'inline');
      }
    }
  }
}
