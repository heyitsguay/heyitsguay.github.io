// Food v2: fall from the surface, eat or lose it (see docs/06-food.md).
//
// Every type spawns from a population-damped Poisson process just above the
// surface, eases to its terminal fall speed with a per-type lateral sway, and
// silently despawns past the bottom of the world. Orientation holds while
// falling; body contact imparts a plausible tumble. Eating (headfirst, mouth
// open) starts the suck-in: the sprite swaps to a precomputed white copy and
// chases the mouth while shrinking. The economy lives in tuning.js (FOODS).

import { TAU, clamp, expApproach } from './math.js';
import { FOODS, FALL_MAP, SWAY_MAP } from './tuning.js';

// Interaction knobs (economy/motion scales are tuning.js's job)
const SPAWN_BASE = 0.03;      // Poisson rate per rarity unit, per second
const SPAWN_XPAD = 300;       // spawn band extends this far past the view sides
                              // (the sea is infinite in x — food falls where
                              // you are, docs/09)
const SPAWN_CLEAR = 220;      // px — skip spawns this close to the eel
const ENTRY_SPEED = 0.5;      // initial vy as a fraction of terminal
const TAU_FALL = 0.9;         // s — ease toward terminal fall speed
const SWAY_F = 0.55;          // rad/s — shared sway oscillation
const TAU_SWAY = 0.7;         // s — ease toward sway velocity
const EXIT_PAD = 60;          // px past the world bottom before despawn
const BODY_FIT = 0.85;        // item radius fraction used vs the eel body
const BODY_STEP = 2;          // test every Nth spine point
const BOUNCE_REST = 0.75;     // restitution of the mouth-closed bounce
const BOUNCE_KICK = 60;       // px/s extra shove, scaled by eel speed01
const TUMBLE_GAIN = 0.9;      // contact tangential speed → angular velocity
const TUMBLE_DAMP = 0.6;      // 1/s — water damping on spin
const EAT_MOUTH_MIN = 0.5;    // gape needed to eat
const EAT_RADIUS = 34;        // px around the mouth point
const MOUTH_FWD = 8;          // px — mouth point sits ahead of the head
const PROBE_START = 4;       // px — nose probe begins this far ahead of the head
const PROBE_LEN = 120;         // px — probe length: food on it opens the jaw
const PROBE_WIDTH_FRAC = 0.10; // probe max full width (at the far tip) as a fraction
                               // of its length — the probe is an isosceles triangle
                               // with its apex at the nose
const EAT_T = 0.30;           // s — suck-in duration
const EAT_SHRINK = 0.12;      // final suck-in scale
const EAT_CHASE = 0.05;       // s — how tightly the dying sprite tracks the mouth
const EAT_FADE = 0.7;         // fraction of EAT_T where the fade-out starts
const TRAIL_PER_100 = 2.0;    // trail bubbles/s per 100 px/s of fall speed
const PLOP_COLOR = [0.45, 0.75, 0.80];   // surface-entry ring tint
// (the WORLD MAGIC pixelation pulse was cut — looked bad)

const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export class Food {
  constructor(svgRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    const group = svgRoot.querySelector('#food');
    // One pooled <image> per population slot (cap = rarity); nothing is
    // created at runtime.
    this.items = [];
    this.white = {};   // key → white-tinted data-URL, filled async at load
    for (const [key, cfg] of Object.entries(FOODS)) {
      for (let k = 0; k < cfg.rarity; k++) {
        const el = document.createElementNS(NS, 'image');
        el.setAttribute('href', cfg.asset);
        el.setAttribute('width', cfg.size[0]);
        el.setAttribute('height', cfg.size[1]);
        el.setAttribute('x', -cfg.size[0] / 2);
        el.setAttribute('y', -cfg.size[1] / 2);
        el.setAttribute('display', 'none');
        group.appendChild(el);
        this.items.push({
          key, cfg, el, alive: false,
          r: Math.max(cfg.size[0], cfg.size[1]) / 2 * 0.75,
          x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0,
          phase: 0, eating: 0,
        });
      }
      this.makeWhite(key, cfg.asset);
    }
    this.time = 0;
  }

  // Precompute the suck-in's white-tinted sprite (docs/06) — an offscreen
  // canvas at load instead of a runtime filter. Browser-only; harmless no-op
  // headless or if it fails (the suck-in then just shrinks the normal sprite).
  makeWhite(key, src) {
    try {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        this.white[key] = c.toDataURL();
      };
      img.src = src;
    } catch { /* headless */ }
  }

  spawnOne(key, cfg, eel, cam, viewW) {
    const slot = this.items.find(it => !it.alive && it.key === key);
    if (!slot) return;
    const x = cam.x - SPAWN_XPAD + Math.random() * (viewW + 2 * SPAWN_XPAD);
    const y = -cfg.size[1] / 2 - 4;
    if (Math.hypot(x - eel.x, y - eel.y) < SPAWN_CLEAR) return;  // retried later
    slot.alive = true;
    slot.eating = 0;
    slot.x = x; slot.y = y;
    slot.vx = 0;
    slot.vy = FALL_MAP(cfg.fall) * ENTRY_SPEED;
    slot.rot = 0; slot.vrot = 0;
    slot.entered = false;   // surface plop fires when it crosses y = 0
    slot.phase = Math.random() * TAU;
    slot.el.setAttribute('href', cfg.asset);
    slot.el.setAttribute('opacity', '1');
    slot.el.setAttribute('display', 'inline');
  }

  despawn(it) {
    it.alive = false;
    it.el.setAttribute('display', 'none');
  }

  // Blank-slate reset (docs/08): everything falling vanishes.
  clear() {
    for (const it of this.items) if (it.alive) this.despawn(it);
  }

  // Live falling items, for the minnow feast (docs/07) — read-only positions.
  positions() {
    const out = [];
    for (const it of this.items) if (it.alive && it.eating === 0) out.push({ x: it.x, y: it.y });
    return out;
  }

  // The auto-mouth (docs/02, docs/06): true while any live item touches the
  // probe — a narrow isosceles triangle off the nose tip (apex at the nose,
  // widening to PROBE_WIDTH_FRAC of its length at the far end). main.js feeds
  // this in as intent.mouth.
  probe(eel) {
    const ax = eel.x + eel.hx * PROBE_START, ay = eel.y + eel.hy * PROBE_START;
    for (const it of this.items) {
      if (!it.alive || it.eating > 0) continue;
      // project onto the heading; allowed lateral reach grows with distance
      const dx = it.x - ax, dy = it.y - ay;
      const s = clamp(dx * eel.hx + dy * eel.hy, 0, PROBE_LEN);
      const px = dx - eel.hx * s, py = dy - eel.hy * s;
      const allowed = it.r + s * PROBE_WIDTH_FRAC * 0.5;
      if (px * px + py * py <= allowed * allowed) return true;
    }
    return false;
  }

  // Runs after eel.update. Returns eat events ({x, y, key}) for the flourish.
  // fx (the water instance) receives trail bubbles and surface plops; optional.
  update(dt, eel, cam, viewW, worldH, fx) {
    const eaten = [];
    const t = (this.time += dt);
    const mouthOpen = eel.mouth > EAT_MOUTH_MIN;
    const mx = eel.x + eel.hx * MOUTH_FWD, my = eel.y + eel.hy * MOUTH_FWD;

    // Population-damped Poisson spawning, one process per type.
    for (const [key, cfg] of Object.entries(FOODS)) {
      let pop = 0;
      for (const it of this.items) if (it.alive && it.key === key) pop++;
      const rate = SPAWN_BASE * cfg.rarity * Math.max(0, 1 - pop / cfg.rarity);
      if (rate > 0 && Math.random() < rate * dt) this.spawnOne(key, cfg, eel, cam, viewW);
    }

    for (const it of this.items) {
      if (!it.alive) continue;

      // The suck-in: chase the moving mouth, shrink, fade, free the slot.
      if (it.eating > 0) {
        it.eating += dt;
        it.x = expApproach(it.x, mx, dt, EAT_CHASE);
        it.y = expApproach(it.y, my, dt, EAT_CHASE);
        if (it.eating >= EAT_T) this.despawn(it);
        continue;
      }

      // Fall + sway; orientation holds (spin only comes from contact).
      const cfg = it.cfg;
      it.vy = expApproach(it.vy, FALL_MAP(cfg.fall), dt, TAU_FALL);
      const swayV = SWAY_MAP(cfg.sway) * SWAY_F * Math.cos(t * SWAY_F + it.phase);
      it.vx = expApproach(it.vx, swayV, dt, TAU_SWAY);
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.rot += it.vrot * dt;
      it.vrot *= Math.exp(-dt * TUMBLE_DAMP);

      // splash-in at the surface, then a bubble trail keyed to fall speed
      if (fx) {
        if (!it.entered && it.y > it.r * 0.5) {
          it.entered = true;
          fx.pulse(it.x, 4, PLOP_COLOR, 0.25);
          fx.burst(it.x, 6, 3);
        } else if (it.entered && Math.random() < TRAIL_PER_100 * (it.vy / 100) * dt) {
          fx.emitBubble(it.x, it.y - it.r * 0.5, 2.8, 1.1);
        }
      }

      if (it.y > worldH + it.r + EXIT_PAD) { this.despawn(it); continue; }

      // Eat check: headfirst (in front of the head) into an open mouth.
      if (mouthOpen) {
        const dx = it.x - mx, dy = it.y - my;
        if (dx * eel.hx + dy * eel.hy > -it.r * 0.5
            && Math.hypot(dx, dy) < EAT_RADIUS + it.r * 0.5) {
          eaten.push({ x: it.x, y: it.y, key: it.key });
          it.eating = 1e-6;
          if (this.white[it.key]) it.el.setAttribute('href', this.white[it.key]);
          continue;
        }
      }

      // Whole-body elastic bounce off the spine chain, with contact tumble.
      let best = 0, bnx = 0, bny = 0;
      const rBody = it.r * BODY_FIT;
      for (let i = 0; i < eel.px.length; i += BODY_STEP) {
        const dx = it.x - eel.px[i], dy = it.y - eel.py[i];
        const d = Math.hypot(dx, dy);
        const pen = eel.wArr[i] + rBody - d;
        if (pen > best && d > 1e-6) { best = pen; bnx = dx / d; bny = dy / d; }
      }
      if (best > 0) {
        it.x += bnx * best;
        it.y += bny * best;
        const vn = it.vx * bnx + it.vy * bny;
        if (vn < 0) {
          it.vx -= (1 + BOUNCE_REST) * vn * bnx;
          it.vy -= (1 + BOUNCE_REST) * vn * bny;
        }
        it.vx += bnx * BOUNCE_KICK * eel.speed01;
        it.vy += bny * BOUNCE_KICK * eel.speed01;
        // plausible spin: tangential slip at the contact point
        const vt = it.vx * -bny + it.vy * bnx;
        it.vrot += (vt / it.r) * TUMBLE_GAIN;
      }
    }

    return eaten;
  }

  render() {
    for (const it of this.items) {
      if (!it.alive) continue;
      let scale = 1, opacity = 1;
      if (it.eating > 0) {
        const u = it.eating / EAT_T;
        scale = 1 - smooth(u) * (1 - EAT_SHRINK);
        opacity = u > EAT_FADE ? 1 - (u - EAT_FADE) / (1 - EAT_FADE) : 1;
      }
      const deg = it.rot * 180 / Math.PI;
      it.el.setAttribute('transform',
        `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)}) rotate(${deg.toFixed(1)}) scale(${scale.toFixed(3)})`);
      it.el.setAttribute('opacity', opacity.toFixed(2));
    }
  }
}
