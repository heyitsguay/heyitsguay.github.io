// Glow-layer particles (docs/07, docs/09): populations sharing one pooled
// circle system, all living ABOVE the darkness veil so they shine in the dark.
//
//  - ambient sparkles (WORLD MAGIC `sparkles` dial): little multicolor glints
//    that drift and spiral before fading away — pure prettiness, everywhere.
//  - phosphorescent plankton (`plankton` dial): green motes of the deep water;
//    they twinkle slowly, brighten as the eel passes, and occasionally SCOOT —
//    a sporadic little burst of jet propulsion (fast ramp, slow ease-out).
//  - fairies (`fairies` dial, docs/09): fuzzy warm glow-wisps that wander near
//    the view and shed sparkle trails whose lifetime grows with WORLD MAGIC.
//  - boost crackle (docs/07): the speed burst's electric-blue charge — bolts
//    crackle from the eel's head back along the body and shoot off in its
//    wake. Lives here (not GL) so the crackle punches through the veil.
//
// Particles fade in and out, so spawning inside the view never pops.
//
// BgLights (bottom of this file) is the seafloor-lights system for the
// background parallax planes (docs/03, docs/09) — emissive, so it lives here
// on the glow layer in a counter-transformed group, not in the GL planes.

import { TAU, clamp, lerp, expApproach, curves } from './math.js';
import { DIALS, LAYERS, TERRAIN, KELP_GROWTH, SEA, EEL_LIGHT } from './tuning.js';
import { progress } from './progress.js';
import { hash01, terrainShape, kelpStrands, mainFloorY } from './worldgen.js';

const POOL = 300;
// ambient sparkles
const AMB_RATE = 7;            // spawns/s at full dial (in-view)
const AMB_LIFE_MIN = 2.5, AMB_LIFE_VAR = 2.5;   // s
const AMB_SIZE_MIN = 1.2, AMB_SIZE_VAR = 1.5;   // px radius
const AMB_ALPHA = 0.55;
const AMB_DRIFT = 14;          // px/s slow travel
const AMB_SPIRAL_R = 14;       // px — spiral radius it winds out to
const AMB_SPIRAL_W = 1.8;      // rad/s ± spiral speed
const AMB_SAT = 85, AMB_LUM = 75;   // hsl of the random hues
// plankton — a few shades of medium-light green (no rainbow — Matt)
const PLK_RATE = 9;            // spawns/s at full dial (in the deep band)
const PLK_MIN_DEPTH = 0.5;     // world-height fraction where plankton begins
const PLK_LIFE_MIN = 4, PLK_LIFE_VAR = 3;
const PLK_SIZE_MIN = 0.9, PLK_SIZE_VAR = 1.1;
const PLK_ALPHA = 0.5;
const PLK_DRIFT = 6;
const PLK_SHADES = ['hsl(98, 48%, 60%)', 'hsl(112, 55%, 64%)',
                    'hsl(124, 45%, 57%)', 'hsl(135, 40%, 66%)'];
const PLK_TWINKLE_F = 1.3;     // rad/s
const PLK_EEL_R = 170;         // px — brighten near a passing eel...
const PLK_EEL_GAIN = 1.6;      // ...by up to this much extra
// the scoot: a sporadic water-jet burst — fast ramp up, slow ease out
const SCOOT_GAP_MIN = 2.5, SCOOT_GAP_VAR = 9;   // s between scoots
const SCOOT_V = 46;            // px/s peak scoot speed
const SCOOT_UP = 0.06;         // s — attack time constant
const SCOOT_DOWN = 0.8;        // s — ease-out time constant
// fairies — warm orange through yellow into pale blue (Matt's palette)
const FAIRY_MAX = 8;           // at full dial
const FAIRY_HUES = [
  { h: 26, s: 95, l: 68 }, { h: 38, s: 95, l: 70 }, { h: 52, s: 92, l: 74 },
  { h: 58, s: 85, l: 78 }, { h: 205, s: 75, l: 80 },
];
const FAIRY_SIZE = 4.2;        // px radius — the gradient makes the edge fuzzy
const FAIRY_ALPHA = 0.7;       // whisper, not beacon; falloff lives in the gradient
const FAIRY_TRAIL_ALPHA = 0.38;   // trail sparkles, dimmer to match
// fuzzy body: opacity peaks ~90% at the core and decays to nothing
const FAIRY_STOPS = [[0, 0.9], [0.45, 0.55], [1, 0]];
const FAIRY_SPEED = 36;        // px/s wander
const FAIRY_WANDER = 1.1;      // rad/s heading noise
const FAIRY_TRAIL_DT = 0.08;   // s between shed trail sparkles
const FAIRY_TRAIL_LIFE = 1.1;  // s trail sparkle life at dial → 0...
const FAIRY_TRAIL_RAMP = 1.3;  // ...growing by this factor at full WORLD MAGIC
const FAIRY_FADE = 1.2;        // s fade in/out when (de)activating
const FAIRY_PAD = 120;         // px beyond the view before a fairy wraps
// boost crackle — an intense blue shower, emitted CONTINUOUSLY in proportion
// to the eel's forward speed (no pulsing waves): bolts/s = speed × PER_100/100
const CRK_PER_100 = 9;         // bolts/s per 100 px/s of eel speed, dial 0...
const CRK_PER_100_RAMP = 7.5;  // ...plus this at full speedBurst dial
const CRK_SPAN = 0.9;          // bolts spawn anywhere along this body fraction
const CRK_BACK = 170;          // px/s — bolts shoot backward in the wake...
const CRK_BACK_VAR = 150;
const CRK_SIDE = 70;           // ...with lateral scatter
const CRK_LIFE_MIN = 0.45, CRK_LIFE_VAR = 0.45;
const CRK_SIZE_MIN = 1.5, CRK_SIZE_VAR = 1.9;
const CRK_FLICKER_F = 42;      // rad/s — the crackle flicker

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
    this.fairies = [];
    for (let i = 0; i < FAIRY_MAX; i++) {
      // per-fairy fuzzy radial gradient (falloff peaks at the core)
      const pal = FAIRY_HUES[i % FAIRY_HUES.length];
      const grad = document.createElementNS(NS, 'radialGradient');
      grad.setAttribute('id', `fgrad${i}`);
      for (const [off, op] of FAIRY_STOPS) {
        const s = document.createElementNS(NS, 'stop');
        s.setAttribute('offset', `${off * 100}%`);
        s.setAttribute('stop-opacity', op);
        s.setAttribute('stop-color', `hsl(${pal.h}, ${pal.s}%, ${pal.l}%)`);
        grad.appendChild(s);
      }
      group.appendChild(grad);
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('fill', `url(#fgrad${i})`);
      el.setAttribute('display', 'none');
      group.appendChild(el);
      this.fairies.push({
        el, on: false, a: 0, shown: false, x: 0, y: 0, hd: 0,
        hue: pal.h, phase: Math.random() * TAU, trailT: 0,
      });
    }
    this.time = 0;
    this.crackleAcc = 0;
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
      const a = Math.random() * TAU;
      p.vx = Math.cos(a) * AMB_DRIFT * (0.4 + Math.random());
      p.vy = Math.sin(a) * AMB_DRIFT * (0.4 + Math.random()) - 4;
      p.spiralW = (Math.random() < 0.5 ? -1 : 1) * AMB_SPIRAL_W * (0.6 + Math.random() * 0.8);
      p.spiralR = AMB_SPIRAL_R * (0.4 + Math.random());
      p.alpha = AMB_ALPHA;
      p.el.setAttribute('fill', `hsl(${(Math.random() * 360).toFixed(0)}, ${AMB_SAT}%, ${AMB_LUM}%)`);
    } else if (kind === 1) {   // plankton: green shades, drifting until it scoots
      p.life = PLK_LIFE_MIN + Math.random() * PLK_LIFE_VAR;
      p.size = PLK_SIZE_MIN + Math.random() * PLK_SIZE_VAR;
      p.vx = (Math.random() - 0.5) * PLK_DRIFT;
      p.vy = (Math.random() - 0.5) * PLK_DRIFT;
      p.spiralW = 0;
      p.spiralR = 0;
      p.alpha = PLK_ALPHA;
      p.scootIn = SCOOT_GAP_MIN + Math.random() * SCOOT_GAP_VAR;
      p.scootAge = 1e9;
      p.scootDir = 0;
      p.el.setAttribute('fill', PLK_SHADES[(Math.random() * PLK_SHADES.length) | 0]);
    } else {            // boost crackle bolt (velocity set by the caller)
      p.life = CRK_LIFE_MIN + Math.random() * CRK_LIFE_VAR;
      p.size = CRK_SIZE_MIN + Math.random() * CRK_SIZE_VAR;
      p.vx = 0; p.vy = 0;
      p.spiralW = 0;
      p.spiralR = 0;
      p.alpha = 0.95;
      p.el.setAttribute('fill',
        `hsl(196, 100%, ${(68 + Math.random() * 14).toFixed(0)}%)`);
    }
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

  // Blank-slate reset (docs/08): every particle out, fairies dark.
  clear() {
    for (const p of this.pool) {
      if (p.age >= p.life) continue;
      p.age = p.life;
      if (p.shown) { p.shown = false; p.el.setAttribute('display', 'none'); }
    }
    for (const f of this.fairies) {
      f.on = false;
      f.a = 0;
      if (f.shown) { f.shown = false; f.el.setAttribute('display', 'none'); }
    }
    this.crackleAcc = 0;
  }

  // A fairy sheds one trail sparkle in its own warm hue; the trail lingers
  // longer as WORLD MAGIC grows (docs/09).
  shedTrail(f, dial) {
    const p = this.spawn(0, f.x, f.y, 0);
    if (!p) return;
    p.life = FAIRY_TRAIL_LIFE * (1 + FAIRY_TRAIL_RAMP * dial) * (0.7 + Math.random() * 0.6);
    p.alpha = FAIRY_TRAIL_ALPHA;
    p.size = 0.9 + Math.random() * 0.9;
    p.vx = (Math.random() - 0.5) * 10;
    p.vy = (Math.random() - 0.5) * 10 + 3;   // trail settles gently
    p.spiralR *= 0.3;
    p.el.setAttribute('fill',
      `hsl(${(f.hue + (Math.random() - 0.5) * 24).toFixed(0)}, 90%, 78%)`);
  }

  update(dt, cam, viewW, viewH, eel, worldH) {
    const t = (this.time += dt);
    this.eelX = eel.x; this.eelY = eel.y;
    this.view = { x0: cam.x, y0: cam.y, x1: cam.x + viewW, y1: cam.y + viewH };

    const amb = progress.dial(DIALS.sparkles);
    if (amb > 0 && Math.random() < AMB_RATE * amb * dt) {
      this.spawn(0,
        cam.x + Math.random() * viewW,
        clamp(cam.y + Math.random() * viewH, 20, worldH - 20), worldH);
    }
    const plk = progress.dial(DIALS.plankton);
    if (plk > 0) {
      // only the deep band spawns plankton; skip when the view is shallow
      const y0 = Math.max(cam.y, PLK_MIN_DEPTH * worldH);
      const y1 = cam.y + viewH;
      if (y1 > y0 && Math.random() < PLK_RATE * plk * dt * clamp((y1 - y0) / viewH, 0, 1)) {
        this.spawn(1,
          cam.x + Math.random() * viewW,
          y0 + Math.random() * (y1 - y0), worldH);
      }
    }

    // Boost crackle (docs/07): while the eel bursts, bolts shed continuously
    // along the body — the emission rate rides the eel's FORWARD SPEED, so
    // the shower thickens as the burst winds up and thins as it fades.
    if (eel.pointAt && eel.boost01 > 0.05) {
      const bDial = progress.dial(DIALS.speedBurst);
      this.crackleAcc += dt * eel.speed * (CRK_PER_100 + CRK_PER_100_RAMP * bDial)
        / 100 * eel.boost01;
      while (this.crackleAcc >= 1) {
        this.crackleAcc -= 1;
        const pt = eel.pointAt(Math.random() * CRK_SPAN);
        const p = this.spawn(2, pt.x, pt.y, worldH);
        if (!p) break;
        p.vx = -eel.hx * (CRK_BACK + Math.random() * CRK_BACK_VAR)
          + pt.nx * CRK_SIDE * (Math.random() - 0.5);
        p.vy = -eel.hy * (CRK_BACK + Math.random() * CRK_BACK_VAR)
          + pt.ny * CRK_SIDE * (Math.random() - 0.5);
      }
    }

    for (const p of this.pool) {
      if (p.age >= p.life) continue;
      p.age += dt;
      // the plankton scoot: sporadic jet bursts, fast in, long ease-out
      if (p.kind === 1) {
        p.scootIn -= dt;
        if (p.scootIn <= 0) {
          p.scootIn = SCOOT_GAP_MIN + Math.random() * SCOOT_GAP_VAR;
          p.scootAge = 0;
          p.scootDir = Math.random() * TAU;
        }
        if (p.scootAge < 4) {
          p.scootAge += dt;
          const a = (1 - Math.exp(-p.scootAge / SCOOT_UP)) * Math.exp(-p.scootAge / SCOOT_DOWN);
          p.x += Math.cos(p.scootDir) * SCOOT_V * a * dt;
          p.y += Math.sin(p.scootDir) * SCOOT_V * a * dt;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age >= p.life
          || p.x < this.view.x0 - VIEW_PAD || p.x > this.view.x1 + VIEW_PAD
          || p.y < this.view.y0 - VIEW_PAD || p.y > this.view.y1 + VIEW_PAD) {
        p.age = p.life;
        if (p.shown) { p.shown = false; p.el.setAttribute('display', 'none'); }
      }
    }

    // Fairies: dial-counted persistent wisps that wander near the view and
    // shed trails. Activation fades in/out, spawns/wraps are offscreen only.
    const fairyDial = progress.dial(DIALS.fairies);
    const wantFairies = Math.round(fairyDial * FAIRY_MAX);
    for (let i = 0; i < this.fairies.length; i++) {
      const f = this.fairies[i];
      const want = i < wantFairies;
      if (want && !f.on) {
        f.on = true;
        // enter just offscreen, drifting in
        const side = Math.random() < 0.5 ? -1 : 1;
        f.x = side < 0 ? cam.x - FAIRY_PAD * 0.7 : cam.x + viewW + FAIRY_PAD * 0.7;
        f.y = clamp(cam.y + Math.random() * viewH, 30, worldH - 30);
        f.hd = side < 0 ? 0 : Math.PI;
      }
      if (!want) f.on = false;
      f.a = clamp(f.a + (f.on ? dt : -dt) / FAIRY_FADE, 0, 1);
      if (f.a <= 0) continue;
      f.hd += (Math.sin(t * 0.7 + f.phase) + Math.sin(t * 0.23 + f.phase * 2.7)) * FAIRY_WANDER * dt;
      f.x += Math.cos(f.hd) * FAIRY_SPEED * dt;
      f.y += Math.sin(f.hd) * FAIRY_SPEED * dt;
      f.y = clamp(f.y, 30, worldH - 30);
      // wrap around the padded view — offscreen to offscreen, never visible
      const spanX = viewW + 2 * FAIRY_PAD, spanY = viewH + 2 * FAIRY_PAD;
      if (f.x < cam.x - FAIRY_PAD) f.x += spanX;
      else if (f.x > cam.x + viewW + FAIRY_PAD) f.x -= spanX;
      if (f.y < cam.y - FAIRY_PAD) f.y += spanY;
      else if (f.y > cam.y + viewH + FAIRY_PAD) f.y -= spanY;
      f.trailT -= dt;
      if (f.trailT <= 0 && f.a > 0.4) {
        f.trailT = FAIRY_TRAIL_DT * (0.7 + Math.random() * 0.6);
        this.shedTrail(f, fairyDial);
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
      } else if (p.kind === 1) {
        a *= 0.65 + 0.35 * Math.sin(t * PLK_TWINKLE_F + p.phase);
        const d = Math.hypot(p.x - this.eelX, p.y - this.eelY);
        a *= 1 + PLK_EEL_GAIN * Math.exp(-(d * d) / (PLK_EEL_R * PLK_EEL_R));
      } else {
        a *= 0.7 + 0.3 * Math.sin(t * CRK_FLICKER_F + p.phase * 7);   // crackle
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
    for (const f of this.fairies) {
      if (f.a <= 0) {
        if (f.shown) { f.shown = false; f.el.setAttribute('display', 'none'); }
        continue;
      }
      const pulse = 1 + 0.22 * Math.sin(t * 2.1 + f.phase);
      f.el.setAttribute('cx', f.x.toFixed(1));
      f.el.setAttribute('cy', f.y.toFixed(1));
      f.el.setAttribute('r', (FAIRY_SIZE * pulse).toFixed(2));
      f.el.setAttribute('opacity', (FAIRY_ALPHA * f.a).toFixed(2));
      if (!f.shown) {
        f.shown = true;
        f.el.setAttribute('display', 'inline');
      }
    }
  }
}

// ---- Lantern kelp (docs/07 catalog — LANDED, WORLD MAGIC level 17) ---------
// A seeded fraction of main-plane kelp strands grow soft glow bulbs. The
// aesthetic contract (Matt): GENTLE, LIVELY, NOT TOO SATURATED, soft-edged
// illumination — pale gold first, the palette widening into seafoam, blush,
// and lavender as the dial climbs. Bulbs kindle progressively (fade in, no
// pops), and once lit a slow light packet climbs each strand bottom→top.
// Bulbs replicate the kelp vertex shader's sway (and eel-push) in JS, so they
// ride their strands exactly — both clocks accumulate the same dt from boot.
const LK_FRAC = 0.22;          // fraction of kelp strands that are lanterns
const LK_SALT = 57;
const LK_POOL = 44;
const LK_R = 6.5;              // px bulb radius — the gradient fades the edge
const LK_ALPHA = 0.8;
const LK_DARK = 1.0, LK_LIGHT = 0.55;   // dim a touch in bright water
const LK_CLIMB_T = 5.5;        // s — one light-packet climb up a strand
const LK_CLIMB_W = 0.14;       // packet width, strand fraction
const LK_BASE_GLOW = 0.5;      // a lit bulb's floor brightness between packets
// gentle hues: pale gold → seafoam → blush → lavender (widens with the dial)
const LK_HUES = [46, 162, 350, 265];
const LK_SAT = 46, LK_LUM = 78;
const LK_STOPS = [[0, 0.85], [0.45, 0.5], [1, 0]];   // soft-edged falloff
const LK_FRACS = [0.3, 0.52, 0.72, 0.88];   // bulb positions up the strand
const LK_KELP_PUSH_R = 100;    // eel-push replication (water.js shader values)
const LK_KELP_PUSH = 30;
const REF_H_LK = 1080;         // reference screen height (world sizing unit)

export class Lanterns {
  constructor(glowRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    const group = glowRoot.querySelector('#glows');
    this.pool = [];
    for (let i = 0; i < LK_POOL; i++) {
      const grad = document.createElementNS(NS, 'radialGradient');
      grad.setAttribute('id', `lkgrad${i}`);
      const stops = [];
      for (const [off, op] of LK_STOPS) {
        const s = document.createElementNS(NS, 'stop');
        s.setAttribute('offset', `${off * 100}%`);
        s.setAttribute('stop-opacity', op);
        stops.push(s);
        grad.appendChild(s);
      }
      group.appendChild(grad);
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('fill', `url(#lkgrad${i})`);
      el.setAttribute('display', 'none');
      group.appendChild(el);
      this.pool.push({ el, stops, shown: false, lastHue: -1 });
    }
    this.time = 0;
  }

  // kelpLife: the LIFE value the kelp geometry was BUILT with (water.builtLife)
  // — using the live value could put bulbs on strands that aren't drawn yet.
  render(dt, rcam, viewW, viewH, worldH, eel, kelpLife) {
    const t = (this.time += dt);
    const dial = progress.dial(DIALS.lanternKelp);
    let i = 0;
    if (dial > 0) {
      const light = progress.value('light');
      const kd = DIALS.kelp;
      const dens = kd.max * curves[kd.curve](clamp((kelpLife - kd.threshold) / kd.rampWidth, 0, 1))
        * (1 + KELP_GROWTH.DENSITY * kelpLife);
      const tall = 1 + KELP_GROWTH.HEIGHT * kelpLife;
      const push = 0.25 + 0.75 * (eel.speedSm || 0);   // PUSH_BASE/SLOPE (water.js)
      const x0 = rcam.x - 60, x1 = rcam.x + viewW + 60;
      const c0 = Math.floor(x0 / SEA.CHUNK_W), c1 = Math.floor(x1 / SEA.CHUNK_W);
      for (let c = c0; c <= c1 && i < this.pool.length; c++) {
        const strands = kelpStrands(c, dens);
        for (let si = 0; si < strands.length && i < this.pool.length; si++) {
          if (hash01(c * 131 + si, LK_SALT) >= LK_FRAC) continue;   // not a lantern
          const s = strands[si];
          if (s.type && s.type !== 'norm') continue;   // typed strands (docs/10)
          // are reshaped/offset in GL — bulbs only ride normal strands exactly
          if (s.x < x0 || s.x > x1) continue;
          const h = s.h * REF_H_LK * tall;
          const seed = hash01(c * 131 + si, LK_SALT + 1);
          // the palette widens with the dial: gold first, then the pastels
          const hue = LK_HUES[(seed * Math.min(LK_HUES.length, 1 + dial * LK_HUES.length)) | 0];
          const nBulbs = s.h > 0.6 ? 4 : 3;
          for (let b = 0; b < nBulbs && i < this.pool.length; b++) {
            const f = LK_FRACS[b];
            // progressive kindling: strand order + height order, eased in
            const order = seed * 0.7 + f * 0.3;
            const on = clamp((dial - order) / 0.22, 0, 1);
            if (on <= 0) continue;
            // replicate the shader sway so the bulb rides its strand
            let x = s.x + (Math.sin(t * 0.55 + s.ph + f * 2.6) * 14
              + Math.sin(t * 0.23 + s.ph * 1.7 + f * 1.3) * 9) * Math.pow(f, 1.3);
            // strands root on the terrain now (docs/10) — bulbs ride the same root
            const y = mainFloorY(s.x, viewH, worldH) + 6 - h * f;
            const dx = x - eel.x, dy = y - eel.y;
            const dl2 = dx * dx + dy * dy;
            x += (dx / (Math.abs(dx) + 24)) * Math.exp(-dl2 / (LK_KELP_PUSH_R * LK_KELP_PUSH_R))
              * LK_KELP_PUSH * f * push;
            // the climbing light packet (per-strand phase, bottom → top)
            const pos = (t / LK_CLIMB_T + seed * 7) % 1;
            let d = Math.abs(pos - f);
            d = Math.min(d, 1 - d);
            const packet = Math.exp(-(d * d) / (LK_CLIMB_W * LK_CLIMB_W));
            const bright = LK_BASE_GLOW + (1 - LK_BASE_GLOW) * packet;
            const p = this.pool[i++];
            if (p.lastHue !== hue) {
              p.lastHue = hue;
              const col = `hsl(${hue}, ${LK_SAT}%, ${LK_LUM}%)`;
              for (const st of p.stops) st.setAttribute('stop-color', col);
            }
            p.el.setAttribute('cx', x.toFixed(1));
            p.el.setAttribute('cy', y.toFixed(1));
            p.el.setAttribute('r', (LK_R * (0.85 + 0.3 * packet)).toFixed(2));
            p.el.setAttribute('opacity',
              (LK_ALPHA * on * bright * lerp(LK_DARK, LK_LIGHT, light)).toFixed(2));
            if (!p.shown) { p.shown = true; p.el.setAttribute('display', 'inline'); }
          }
        }
      }
    }
    for (; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (p.shown) { p.shown = false; p.el.setAttribute('display', 'none'); }
    }
  }
}

// ---- Seafloor lights in the background planes (docs/03, docs/09) ----------
// Tiny emissive points that kindle with WORLD MAGIC along the far plane's
// terrain. They must punch through the veil, so they live on the glow layer,
// counter-transformed to the plane's parallax factor. Seeded per cell: light
// h-order below the dial's reach fades in — progressive kindling, no pops.
const BGL_POOL = 26;
const BGL_STEP = 230;          // px between light cells (plane space)
const BGL_EXIST = 0.6;         // fraction of cells that ever hold a light
const BGL_SIZE = 1.6;          // px radius
const BGL_ALPHA = 0.75;
const BGL_TWINKLE_F = 0.9;     // rad/s
const BGL_SALT = 41;
const BGL_HUES = [46, 40, 185, 320, 55];   // mostly warm, a stray cyan/pink

// ---- The eel-light flare halo (P4 follow-up, docs/10) ----------------------
// The LIGHT itself is the veil mask hole (veil.js) — this is only the flare's
// visible flourish: a soft icy-cyan halo around the eel while flaring, kept
// deliberately faint (the old always-on glow blob was cut for looks; the
// reveal does the work, the halo just says "the eel is doing it").
const HALO_STOPS = [[0, 0.55], [0.5, 0.22], [1, 0]];

export class EelHalo {
  constructor(glowRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    const group = glowRoot.querySelector('#glows');
    const grad = document.createElementNS(NS, 'radialGradient');
    grad.setAttribute('id', 'eelhalo-grad');
    for (const [off, op] of HALO_STOPS) {
      const s = document.createElementNS(NS, 'stop');
      s.setAttribute('offset', `${off * 100}%`);
      s.setAttribute('stop-opacity', op);
      s.setAttribute('stop-color', EEL_LIGHT.HALO_COLOR);
      grad.appendChild(s);
    }
    group.appendChild(grad);
    this.el = document.createElementNS(NS, 'circle');
    this.el.setAttribute('fill', 'url(#eelhalo-grad)');
    this.el.setAttribute('display', 'none');
    group.appendChild(this.el);
    this.shown = false;
    // The ignition pulse's expanding ring (docs/10 follow-up 2): a stroked
    // circle racing outward from the eel and thinning/fading as it goes.
    this.ring = document.createElementNS(NS, 'circle');
    this.ring.setAttribute('fill', 'none');
    this.ring.setAttribute('stroke', EEL_LIGHT.HALO_COLOR);
    this.ring.setAttribute('display', 'none');
    group.appendChild(this.ring);
    this.ringShown = false;
  }

  // flare01: the eased flare factor; rWorld: the hole radius; pulseU: the
  // ignition pulse's 0→1 progress (−1 when idle) — see eel.pulseU.
  render(eel, flare01, rWorld, pulseU = -1) {
    if (pulseU >= 0 && rWorld > 0) {
      const ease = 1 - (1 - pulseU) * (1 - pulseU);   // ease-out travel
      this.ring.setAttribute('cx', eel.x.toFixed(1));
      this.ring.setAttribute('cy', eel.y.toFixed(1));
      this.ring.setAttribute('r', (rWorld * lerp(0.3, EEL_LIGHT.RING_R, ease)).toFixed(1));
      this.ring.setAttribute('stroke-width', (EEL_LIGHT.RING_W * (1 - 0.6 * pulseU)).toFixed(1));
      this.ring.setAttribute('opacity', (EEL_LIGHT.RING_A * (1 - pulseU)).toFixed(3));
      if (!this.ringShown) { this.ringShown = true; this.ring.setAttribute('display', 'inline'); }
    } else if (this.ringShown) {
      this.ringShown = false;
      this.ring.setAttribute('display', 'none');
    }
    if (flare01 < 0.03) {
      if (this.shown) { this.shown = false; this.el.setAttribute('display', 'none'); }
      return;
    }
    this.el.setAttribute('cx', eel.x.toFixed(1));
    this.el.setAttribute('cy', eel.y.toFixed(1));
    this.el.setAttribute('r', (rWorld * 0.6).toFixed(1));
    this.el.setAttribute('opacity', (EEL_LIGHT.HALO_A * flare01).toFixed(3));
    if (!this.shown) { this.shown = true; this.el.setAttribute('display', 'inline'); }
  }
}

// ---- The stamina bars (P4, docs/10) -----------------------------------------
// Slim bars riding below the eel — boost (electric blue) and the eel light
// (green), one instance per pool. GLOW LAYER on purpose: they must read in
// dark water. Each fades in while its value < 1 (draining/recharging) or
// briefly when a combo charges it (flash()); fades out when full. No HUD
// chrome — a track sliver and a fill, nothing else.
//
// Stacking (follow-up 2): the caller assigns each bar a row slot per frame —
// fixed pool ordering, but visible bars always compact from slot 0 (the one
// position that exists today) with no gaps; a vacated slot's neighbor slides
// up (eased) rather than popping.
const SB_W = 88, SB_H = 4.5;   // px
const SB_BELOW = 34;           // px below the eel's head point (row slot 0)
const SB_ROW_DY = 8;           // px between stacked row slots
const SB_ROW_TAU = 0.15;       // s — slide when a bar's slot compacts upward
const SB_FADE = 0.35;          // s fade in/out
const SB_FLASH_T = 1.4;        // s shown after a combo charge (even if full)
const SB_TRACK = 'rgba(140, 200, 220, 0.22)';
const SB_FILL = 'hsl(196, 100%, 72%)';   // the boost-crackle electric blue

export class StaminaBar {
  constructor(glowRoot, fill = SB_FILL) {
    const NS = 'http://www.w3.org/2000/svg';
    const group = glowRoot.querySelector('#glows');
    this.g = document.createElementNS(NS, 'g');
    this.g.setAttribute('display', 'none');
    this.track = document.createElementNS(NS, 'rect');
    this.track.setAttribute('width', SB_W);
    this.track.setAttribute('height', SB_H);
    this.track.setAttribute('rx', SB_H / 2);
    this.track.setAttribute('fill', SB_TRACK);
    this.fill = document.createElementNS(NS, 'rect');
    this.fill.setAttribute('height', SB_H);
    this.fill.setAttribute('rx', SB_H / 2);
    this.fill.setAttribute('fill', fill);
    this.g.appendChild(this.track);
    this.g.appendChild(this.fill);
    group.appendChild(this.g);
    this.a = 0;         // eased visibility
    this.flashT = 0;
    this.shown = false;
    this.wanted = false;   // this frame's want — the caller stacks on it
    this.rowSm = 0;        // eased row slot
  }

  // A combo charged the stamina — show the bar briefly even at full.
  flash() {
    this.flashT = SB_FLASH_T;
  }

  // value: the pool 0..1 (defaults to boost stamina for the original caller);
  // row: the stack slot assigned this frame (0 = topmost).
  render(dt, eel, unlocked, value = eel.stamina, row = 0) {
    this.flashT = Math.max(0, this.flashT - dt);
    const want = unlocked && (value < 0.999 || this.flashT > 0);
    this.wanted = want;
    this.a = clamp(this.a + (want ? dt : -dt) / SB_FADE, 0, 1);
    if (this.a <= 0) {
      this.rowSm = row;   // take the new slot invisibly — no slide-in on show
      if (this.shown) { this.shown = false; this.g.setAttribute('display', 'none'); }
      return;
    }
    this.rowSm = expApproach(this.rowSm, row, dt, SB_ROW_TAU);
    const x = eel.x - SB_W / 2, y = eel.y + SB_BELOW + this.rowSm * SB_ROW_DY;
    this.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    this.fill.setAttribute('width', Math.max(0.01, SB_W * value).toFixed(1));
    this.g.setAttribute('opacity', (0.85 * this.a).toFixed(2));
    if (!this.shown) { this.shown = true; this.g.setAttribute('display', 'inline'); }
  }
}

export class BgLights {
  constructor(glowRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    this.group = glowRoot.querySelector('#bg-glows');
    this.pool = [];
    for (let i = 0; i < BGL_POOL; i++) {
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('display', 'none');
      this.group.appendChild(el);
      this.pool.push({ el, shown: false });
    }
    this.time = 0;
  }

  render(dt, rcam, viewW, viewH, worldH) {
    const t = (this.time += dt);
    const dial = progress.dial(DIALS.bgLights);
    const pf = LAYERS.FAR.PF;
    // counter-transform: viewBox already subtracts rcam; this leaves rcam·pf
    this.group.setAttribute('transform',
      `translate(${((1 - pf) * rcam.x).toFixed(1)} ${((1 - pf) * rcam.y).toFixed(1)})`);
    const floorY = viewH + (worldH - viewH) * pf;   // plane floor (docs/09)
    const x0 = rcam.x * pf - 40, x1 = rcam.x * pf + viewW + 40;
    let i = 0;
    if (dial > 0) {
      for (let cell = Math.floor(x0 / BGL_STEP); cell * BGL_STEP < x1 && i < this.pool.length; cell++) {
        const h = hash01(cell, BGL_SALT);
        if (h >= BGL_EXIST) continue;
        const order = h / BGL_EXIST;                 // kindle order in [0, 1)
        const on = clamp((dial - order) / 0.25, 0, 1);
        if (on <= 0) continue;
        const x = (cell + 0.2 + 0.6 * hash01(cell, BGL_SALT + 1)) * BGL_STEP;
        // perched on the rolling terrain (same shaped heightfield as the GL)
        const y = floorY - TERRAIN.BASE.far
          - terrainShape(x, TERRAIN.SALT.far, TERRAIN.POW.far) * TERRAIN.AMP.far * viewH
          - 4 - hash01(cell, BGL_SALT + 2) * 26;
        const p = this.pool[i++];
        const tw = 0.7 + 0.3 * Math.sin(t * BGL_TWINKLE_F + h * 40);
        p.el.setAttribute('cx', x.toFixed(1));
        p.el.setAttribute('cy', y.toFixed(1));
        p.el.setAttribute('r', (BGL_SIZE * (0.8 + 0.5 * hash01(cell, BGL_SALT + 3))).toFixed(2));
        p.el.setAttribute('fill',
          `hsl(${BGL_HUES[(hash01(cell, BGL_SALT + 4) * BGL_HUES.length) | 0]}, 90%, 72%)`);
        p.el.setAttribute('opacity', (BGL_ALPHA * on * tw).toFixed(2));
        if (!p.shown) { p.shown = true; p.el.setAttribute('display', 'inline'); }
      }
    }
    for (; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (p.shown) { p.shown = false; p.el.setAttribute('display', 'none'); }
    }
  }
}
