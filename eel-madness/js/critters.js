// Fauna (see docs/07): minnow schools and jellyfish. Populations track their
// tuning.DIALS records; every critter answers a greet through the shared
// heart emitter in its own style.
//
// THE VICINITY PRINCIPLE (docs/00 pillar 5, docs/07): fauna is simulated
// around the camera, not globally. Dial targets are in-vicinity head-counts
// (scaled by band presence in the view), anything distant for CULL_T seconds
// despawns, and offscreen critters skip their DOM writes. NO POPS: spawns are
// strictly offscreen (a spawn with no valid offscreen point just waits), and
// over-target despawns only ever take offscreen critters.

import { TAU, clamp, lerp, expApproach, angleDiff } from './math.js';
import { DIALS, GREET, FLOCK } from './tuning.js';
import { progress } from './progress.js';

// ---- Minnows ----
const M_N = 6;                  // spine points
const M_LEN = 22;               // body length, px
const M_W = [1.0, 2.0, 2.2, 1.6, 0.9, 0.25];   // half-widths per point
const M_EYE_R = 0.65;           // the little dark eye dot (subtle)
const M_EYE_BACK = 2.3;         // px behind the head point, along the body
const M_EYE_UP = 3.55;          // px above the spine, on the upper body side
const M_SPEED = 55;             // px/s cruise
const M_DART = 175;             // px/s fleeing a fast eel
const M_TURN = 3.4;             // rad/s
const M_TAU_SPEED = 0.5;
const M_ORBIT_R = 26;           // school slot radius around the leader...
const M_ORBIT_STEP = 5;         // ...plus this per fish
const M_ORBIT_F = 0.35;         // rad/s — slots slowly circulate
const M_SEP = 14;               // px — neighbor separation distance
const M_FLEE_R = 170;           // px — flee a faster-than-this eel inside this
const M_FLEE_SPEED = 0.35;      // eel speed01 that spooks
const M_BAND = [0.06, 0.5];     // minnows live in this world-height band
const M_XPAD = 200;
const L_SPEED = 42;             // leader wander speed
const M_WAVE = 1.1;             // px — tail-wave amplitude
const M_COL_A = [0.48, 0.58, 0.63];  // scale silver (dark)
const M_COL_B = [0.93, 0.97, 0.99];  // catch-the-light silver (bright)
const M_BUBBLE_RATE = 0.9;      // per s while darting
const M_FEAST_R = 240;          // px — minnows notice falling food inside this...
const M_FEAST_W = 0.75;         // ...and blend toward it this hard at full dial

// ---- Jellyfish ----
const J_R = 26;                 // bell radius, px
const J_PULSE_T = 2.9;          // s per pulse cycle
const J_KICK = 34;              // px/s impulse per contraction
const J_DRAG = 0.55;            // 1/s
const J_WANDER_F = 0.11;        // rad/s heading wander
const J_BAND = [0.18, 0.72];
const J_TENT_N = 4;
const J_TENT_PTS = 6;
const J_TENT_SEG = 9;           // px per tentacle segment
const J_TENT_SWAY = 6;          // px/s ambient tentacle sway
const J_TENT_TAU = 1.4;         // s — rest pull toward hanging down
const J_GLOW_DARK = 0.9;        // inner-glow opacity in the dark (a lantern)...
const J_GLOW_LIGHT = 0.25;      // ...and in full light
const J_GLOW_SCALE = 2.6;       // glow radius vs the bell — long soft halo
// glow falloff: bright core, fast drop, then a slow tail (docs/07)
const J_GLOW_STOPS = [[0, 1.0], [0.12, 0.6], [0.30, 0.18], [0.60, 0.06], [1, 0]];
const J_GLOW_PULSE_A = 0.14;    // gentle always-on glow pulse (opacity)
const J_GLOW_PULSE_R = 0.05;    // ...and radius
const J_GLOW_PULSE_F = 1.15;    // rad/s
const J_SHY_NEAR = 110;         // px — glow dims as the eel approaches...
const J_SHY_FAR = 380;          // ...back to full past this
const J_SHY_MIN = 0.15;         // dimmest the shy light gets
const J_HUE_BASE = 196;         // deg — cyan; WORLD MAGIC widens the range
const J_HUE_MAX = 170;          // deg — ± range at full jellyHue dial (rainbow)
const J_HUE_SAT = 95;           // % — vivid, not pastel
const J_HUE_LUM = 70;           // %
const CRITTER_GREET_CD = 6;     // s per critter

// The vicinity (docs/07)
const VIC_PAD = 340;            // px beyond the view that still "exists"
const CULL_T = 5;               // s outside the vicinity before a critter despawns
const RENDER_PAD = 120;         // px beyond the view where DOM writes still happen

// Greeting signatures (hearts.emit specs). Everyone in radius responds — no
// responder cap; the heart pool is the natural ceiling.
const MINNOW_HEART = { color: '#dff3f7', size: 5.5, count: 2, pattern: 'scatter', spread: 10 };
const JELLY_HEART = { color: '#a8ecff', size: 8, count: 10, pattern: 'ring', spread: 26, delay: 0.35 };

// Closed Catmull-Rom loop -> cubic Bezier path (same helper as eel.js).
function closedLoopPath(xs, ys, n) {
  let d = `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = (i - 1 + n) % n, p1 = i, p2 = (i + 1) % n, p3 = (i + 2) % n;
    const c1x = xs[p1] + (xs[p2] - xs[p0]) / 6, c1y = ys[p1] + (ys[p2] - ys[p0]) / 6;
    const c2x = xs[p2] - (xs[p3] - xs[p1]) / 6, c2y = ys[p2] - (ys[p3] - ys[p1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${xs[p2].toFixed(1)} ${ys[p2].toFixed(1)}`;
  }
  return d + 'Z';
}

const rgb = (a, b, t) =>
  `rgb(${Math.round(lerp(a[0], b[0], t) * 255)},${Math.round(lerp(a[1], b[1], t) * 255)},${Math.round(lerp(a[2], b[2], t) * 255)})`;

export class Critters {
  // svgRoot: the sprite layer (under the veil). glowRoot: the glow layer above
  // it — emissive parts (jelly inner glow) live there so they shine in the dark.
  constructor(svgRoot, glowRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    const group = svgRoot.querySelector('#critters');
    const glows = glowRoot.querySelector('#glows');
    this.time = 0;
    this.eelX = 0; this.eelY = 0;

    // Wander-leaders: schools split and join through these (docs/07).
    this.leaders = [];
    for (let i = 0; i < FLOCK.MAX_SCHOOLS; i++) {
      this.leaders.push({ active: false, x: 0, y: 0, hd: 0, phase: Math.random() * TAU });
    }

    this.minnows = [];
    for (let i = 0; i < DIALS.minnows.max; i++) {
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('class', 'minnow');
      el.setAttribute('display', 'none');
      group.appendChild(el);
      const eye = document.createElementNS(NS, 'circle');
      eye.setAttribute('class', 'minnow-eye');
      eye.setAttribute('r', M_EYE_R);
      eye.setAttribute('display', 'none');
      group.appendChild(eye);
      this.minnows.push({
        el, eye, alive: false, x: 0, y: 0, hd: 0, speed: 0, greetCd: 0, outT: 0,
        school: 0, px: new Float64Array(M_N), py: new Float64Array(M_N),
        phase: Math.random() * TAU,
      });
    }
    this.mlx = new Float64Array(2 * M_N);   // minnow outline scratch
    this.mly = new Float64Array(2 * M_N);

    this.jellies = [];
    for (let i = 0; i < DIALS.jellyfish.max; i++) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('display', 'none');
      // per-jelly glow gradient so WORLD MAGIC can color each lantern
      const grad = document.createElementNS(NS, 'radialGradient');
      grad.setAttribute('id', `jgrad${i}`);
      const stops = [];
      for (const [off, op] of J_GLOW_STOPS) {
        const s = document.createElementNS(NS, 'stop');
        s.setAttribute('offset', `${off * 100}%`);
        s.setAttribute('stop-opacity', op);
        stops.push(s);
        grad.appendChild(s);
      }
      glows.appendChild(grad);
      const glow = document.createElementNS(NS, 'ellipse');
      glow.setAttribute('class', 'jelly-glow');
      glow.setAttribute('fill', `url(#jgrad${i})`);
      glow.setAttribute('display', 'none');
      glows.appendChild(glow);
      const bell = document.createElementNS(NS, 'path');
      bell.setAttribute('class', 'jelly-bell');
      const tents = [];
      for (let k = 0; k < J_TENT_N; k++) {
        const t = document.createElementNS(NS, 'path');
        t.setAttribute('class', 'jelly-tent');
        g.appendChild(t);
        tents.push(t);
      }
      g.appendChild(bell);
      group.appendChild(g);
      this.jellies.push({
        g, bell, glow, stops, tents, alive: false, greetCd: 0, outT: 0,
        x: 0, y: 0, vx: 0, vy: 0, hd: -Math.PI / 2,
        hue: J_HUE_BASE, lastHue: -999,
        phase: Math.random() * TAU, prevP: 0,
        tx: [], ty: [],
      });
    }
  }

  inView(x, y, pad = 0) {
    const v = this.view;
    return x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad;
  }

  // A strictly-offscreen spawn point inside the vicinity, band, and world.
  // Returns null when none exists this frame — the spawn waits (no pops).
  spawnPoint(band, worldW, worldH) {
    for (let tries = 0; tries < 10; tries++) {
      const x = clamp(this.vic.x0 + Math.random() * (this.vic.x1 - this.vic.x0), 30, worldW - 30);
      const y = clamp(this.vic.y0 + Math.random() * (this.vic.y1 - this.vic.y0),
        band[0] * worldH, band[1] * worldH);
      if (!this.inView(x, y)) return [x, y];
    }
    return null;
  }

  spawnMinnow(m, worldW, worldH) {
    // JOIN_BIAS (docs/07): 0 = uniform offscreen entry, 1 = always beside a
    // school. Either way the point must be offscreen, or the spawn waits.
    let pt = null;
    const active = this.leaders.filter(L => L.active);
    if (active.length && Math.random() < FLOCK.JOIN_BIAS) {
      const L = active[(Math.random() * active.length) | 0];
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * TAU, r = 120 + Math.random() * 160;
        const x = clamp(L.x + Math.cos(a) * r, 30, worldW - 30);
        const y = clamp(L.y + Math.sin(a) * r, M_BAND[0] * worldH, M_BAND[1] * worldH);
        if (!this.inView(x, y)) { pt = [x, y]; break; }
      }
    }
    if (!pt) pt = this.spawnPoint(M_BAND, worldW, worldH);
    if (!pt) return false;
    m.alive = true;
    m.outT = 0;
    m.shown = false;   // the RENDERER reveals it on its first in-pad write —
                       // never at spawn, or stale geometry from a previous
                       // life would pop in mid-screen (that was a real bug)
    [m.x, m.y] = pt;
    m.school = this.nearestLeader(m.x, m.y);
    m.hd = Math.random() * TAU;
    m.speed = M_SPEED;
    for (let j = 0; j < M_N; j++) {
      m.px[j] = m.x - Math.cos(m.hd) * j * (M_LEN / (M_N - 1));
      m.py[j] = m.y - Math.sin(m.hd) * j * (M_LEN / (M_N - 1));
    }
    return true;
  }

  hideMinnow(m) {
    m.alive = false;
    m.shown = false;
    m.el.setAttribute('display', 'none');
    m.eye.setAttribute('display', 'none');
  }

  spawnJelly(j, worldW, worldH) {
    const pt = this.spawnPoint(J_BAND, worldW, worldH);
    if (!pt) return false;
    j.alive = true;
    j.outT = 0;
    j.shown = false;   // revealed by the renderer (see spawnMinnow)
    [j.x, j.y] = pt;
    j.vx = 0; j.vy = 0;
    // WORLD MAGIC: light hue drawn from an expanding range around cyan
    const range = progress.dial(DIALS.jellyHue) * J_HUE_MAX;
    j.hue = J_HUE_BASE + (Math.random() * 2 - 1) * range;
    j.hueWob = range * 0.35;
    j.lastHue = -999;
    j.tx = []; j.ty = [];
    for (let k = 0; k < J_TENT_N; k++) {
      const xs = new Float64Array(J_TENT_PTS), ys = new Float64Array(J_TENT_PTS);
      const rx = j.x + (k / (J_TENT_N - 1) - 0.5) * J_R * 1.2;
      for (let p = 0; p < J_TENT_PTS; p++) { xs[p] = rx; ys[p] = j.y + p * J_TENT_SEG; }
      j.tx.push(xs); j.ty.push(ys);
    }
    return true;
  }

  hideJelly(j) {
    j.alive = false;
    j.shown = false;
    j.g.setAttribute('display', 'none');
    j.glow.setAttribute('display', 'none');
  }

  nearestLeader(x, y) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.leaders.length; i++) {
      const L = this.leaders[i];
      if (!L.active) continue;
      const d = Math.hypot(L.x - x, L.y - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  update(dt, eel, worldW, worldH, water, cam, viewW, viewH, foodPts) {
    const t = (this.time += dt);
    this.eelX = eel.x; this.eelY = eel.y;
    this.feast = progress.dial(DIALS.minnowFeast);
    this.greetReady = progress.dial(DIALS.greet) > 0;
    foodPts = foodPts || [];

    this.view = { x0: cam.x, y0: cam.y, x1: cam.x + viewW, y1: cam.y + viewH };
    this.vic = {
      x0: cam.x - VIC_PAD, y0: cam.y - VIC_PAD,
      x1: cam.x + viewW + VIC_PAD, y1: cam.y + viewH + VIC_PAD,
    };
    const inVic = (x, y) =>
      x >= this.vic.x0 && x <= this.vic.x1 && y >= this.vic.y0 && y <= this.vic.y1;
    const bandFrac = band => {
      const o = Math.min(this.view.y1, band[1] * worldH) - Math.max(this.view.y0, band[0] * worldH);
      return clamp(o / (this.view.y1 - this.view.y0), 0, 1);
    };

    // Cull anything long outside the vicinity (never anything visible).
    for (const m of this.minnows) {
      if (!m.alive) continue;
      m.outT = inVic(m.x, m.y) ? 0 : m.outT + dt;
      if (m.outT > CULL_T) this.hideMinnow(m);
    }
    for (const j of this.jellies) {
      if (!j.alive) continue;
      j.outT = inVic(j.x, j.y) ? 0 : j.outT + dt;
      if (j.outT > CULL_T) this.hideJelly(j);
    }

    const mTarget = Math.round(progress.dial(DIALS.minnows) * bandFrac(M_BAND));
    const jTarget = Math.round(progress.dial(DIALS.jellyfish) * bandFrac(J_BAND));

    // Schools: keep ceil(alive/SPLIT_SIZE) leaders (≤ cap) alive in the
    // vicinity; a new leader buds beside the biggest school (a split), and
    // leaders that drift together merge. Minnows re-target occasionally.
    let mAlive = 0;
    for (const m of this.minnows) if (m.alive) mAlive++;
    const wantLeaders = clamp(Math.ceil(Math.max(mAlive, mTarget) / FLOCK.SPLIT_SIZE), 1, FLOCK.MAX_SCHOOLS);
    let nLeaders = 0;
    for (const L of this.leaders) if (L.active) nLeaders++;
    for (const L of this.leaders) {
      if (nLeaders >= wantLeaders) break;
      if (L.active) continue;
      const src = this.leaders.find(o => o.active);
      if (src) {   // bud beside an existing school: a split
        const a = Math.random() * TAU;
        L.x = clamp(src.x + Math.cos(a) * 220, 30, worldW - 30);
        L.y = clamp(src.y + Math.sin(a) * 160, M_BAND[0] * worldH, M_BAND[1] * worldH);
      } else {
        const pt = this.spawnPoint(M_BAND, worldW, worldH)
          || [(this.view.x0 + this.view.x1) / 2, clamp((this.view.y0 + this.view.y1) / 2, M_BAND[0] * worldH, M_BAND[1] * worldH)];
        [L.x, L.y] = pt;
      }
      L.hd = Math.random() * TAU;
      L.active = true;
      nLeaders++;
    }
    while (nLeaders > wantLeaders) {   // retire the extra school
      const L = this.leaders.filter(o => o.active).pop();
      L.active = false;
      nLeaders--;
    }
    for (let i = 0; i < this.leaders.length; i++) {   // merge close schools
      const A = this.leaders[i];
      if (!A.active) continue;
      for (let k = i + 1; k < this.leaders.length; k++) {
        const B = this.leaders[k];
        if (B.active && Math.hypot(A.x - B.x, A.y - B.y) < FLOCK.MERGE_D) B.active = false;
      }
    }
    for (const L of this.leaders) {
      if (!L.active) continue;
      if (!inVic(L.x, L.y)) {
        const pt = this.spawnPoint(M_BAND, worldW, worldH);
        if (pt) [L.x, L.y] = pt;
      }
      L.hd += Math.sin(t * 0.23 + L.phase) * 0.7 * dt;
      if (L.x < this.vic.x0 + M_XPAD) L.hd = expApproach(L.hd, 0, dt, 0.5);
      if (L.x > this.vic.x1 - M_XPAD) L.hd = expApproach(L.hd, Math.PI, dt, 0.5);
      const bandY0 = Math.max(M_BAND[0] * worldH, this.vic.y0);
      const bandY1 = Math.min(M_BAND[1] * worldH, this.vic.y1);
      if (L.y < bandY0 + 80) L.hd = expApproach(L.hd, Math.PI / 2, dt, 0.5);
      if (L.y > bandY1 - 80) L.hd = expApproach(L.hd, -Math.PI / 2, dt, 0.5);
      L.x += Math.cos(L.hd) * L_SPEED * dt;
      L.y += Math.sin(L.hd) * L_SPEED * dt;
    }

    // Population control — spawn offscreen; over-target, retire offscreen only.
    for (const m of this.minnows) {
      if (mAlive >= mTarget) break;
      if (!m.alive && this.spawnMinnow(m, worldW, worldH)) mAlive++;
    }
    if (mAlive > mTarget) {
      for (const m of this.minnows) {
        if (mAlive <= mTarget) break;
        if (m.alive && !this.inView(m.x, m.y, RENDER_PAD)) { this.hideMinnow(m); mAlive--; }
      }
    }
    let jAlive = 0;
    for (const j of this.jellies) if (j.alive) jAlive++;
    for (const j of this.jellies) {
      if (jAlive >= jTarget) break;
      if (!j.alive && this.spawnJelly(j, worldW, worldH)) jAlive++;
    }
    if (jAlive > jTarget) {
      for (const j of this.jellies) {
        if (jAlive <= jTarget) break;
        if (j.alive && !this.inView(j.x, j.y, RENDER_PAD)) { this.hideJelly(j); jAlive--; }
      }
    }

    // Minnow steering: circulate a slot around your school's leader.
    const slotIdx = new Array(this.leaders.length).fill(0);
    const alive = this.minnows.filter(m => m.alive);
    for (let i = 0; i < alive.length; i++) {
      const m = alive[i];
      m.greetCd = Math.max(0, m.greetCd - dt);
      if (Math.random() < FLOCK.RETARGET * dt) m.school = this.nearestLeader(m.x, m.y);
      let L = this.leaders[m.school];
      if (!L || !L.active) { m.school = this.nearestLeader(m.x, m.y); L = this.leaders[m.school]; }
      const si = slotIdx[m.school]++;

      const slotA = t * M_ORBIT_F + si * (TAU / 7) + m.phase * 0.3;
      let txp = L.x + Math.cos(slotA) * (M_ORBIT_R + si * M_ORBIT_STEP);
      let typ = L.y + Math.sin(slotA) * (M_ORBIT_R + si * M_ORBIT_STEP) * 0.6;
      // WORLD MAGIC feast: swarm toward nearby falling food (never eat it)
      if (this.feast > 0 && foodPts.length) {
        let fb = null, fd = M_FEAST_R;
        for (const f of foodPts) {
          const d = Math.hypot(f.x - m.x, f.y - m.y);
          if (d < fd) { fd = d; fb = f; }
        }
        if (fb) {
          const w = this.feast * M_FEAST_W;
          txp = lerp(txp, fb.x, w);
          typ = lerp(typ, fb.y, w);
        }
      }
      const prev = alive[(i + alive.length - 1) % alive.length];
      if (prev !== m) {
        const dx = m.x - prev.x, dy = m.y - prev.y;
        const d = Math.hypot(dx, dy);
        if (d < M_SEP && d > 1e-6) { txp += (dx / d) * M_SEP; typ += (dy / d) * M_SEP; }
      }
      let speedT = M_SPEED, fleeing = false;
      const ex = m.x - eel.x, ey = m.y - eel.y;
      const ed = Math.hypot(ex, ey);
      // greet-range highlight: a pulsing contour stroke on whoever would respond
      const hl = this.greetReady && m.greetCd <= 0 && ed <= GREET.RANGE;
      if (hl !== m.hl) {
        m.hl = hl;
        m.el.setAttribute('class', hl ? 'minnow greetable' : 'minnow');
      }
      if (ed < M_FLEE_R && eel.speedSm > M_FLEE_SPEED) {
        txp = m.x + (ex / ed) * 200;
        typ = m.y + (ey / ed) * 200;
        speedT = M_DART;
        fleeing = true;
      }
      const desired = Math.atan2(typ - m.y, txp - m.x);
      m.hd += clamp(angleDiff(desired, m.hd), -M_TURN * dt, M_TURN * dt);
      m.speed = expApproach(m.speed, speedT, dt, M_TAU_SPEED);
      m.x += Math.cos(m.hd) * m.speed * dt;
      m.y += Math.sin(m.hd) * m.speed * dt;
      m.x = clamp(m.x, 20, worldW - 20);
      m.y = clamp(m.y, 20, worldH - 20);

      m.px[0] = m.x; m.py[0] = m.y;
      const seg = M_LEN / (M_N - 1);
      for (let jp = 1; jp < M_N; jp++) {
        let dx = m.px[jp] - m.px[jp - 1], dy = m.py[jp] - m.py[jp - 1];
        const d = Math.hypot(dx, dy) || 1;
        m.px[jp] = m.px[jp - 1] + (dx / d) * seg;
        m.py[jp] = m.py[jp - 1] + (dy / d) * seg;
      }

      if (fleeing && water && Math.random() < M_BUBBLE_RATE * dt) {
        water.emitBubble(m.x, m.y, 2.4, 0.8);
      }
    }

    for (const j of this.jellies) {
      if (!j.alive) continue;
      j.greetCd = Math.max(0, j.greetCd - dt);
      const jhl = this.greetReady && j.greetCd <= 0
        && Math.hypot(j.x - eel.x, j.y - eel.y) <= GREET.RANGE;
      if (jhl !== j.hl) {
        j.hl = jhl;
        j.bell.setAttribute('class', jhl ? 'jelly-bell greetable' : 'jelly-bell');
      }
      const p = Math.pow(Math.max(0, Math.sin(t * TAU / J_PULSE_T + j.phase)), 2);
      const dp = Math.max(0, p - j.prevP);
      j.prevP = p;
      j.hd += Math.sin(t * J_WANDER_F + j.phase * 1.7) * 0.35 * dt;
      const yf = j.y / worldH;
      if (yf < J_BAND[0]) j.hd = expApproach(j.hd, Math.PI / 2, dt, 0.8);
      if (yf > J_BAND[1]) j.hd = expApproach(j.hd, -Math.PI / 2, dt, 0.8);
      j.vx += Math.cos(j.hd) * J_KICK * dp;
      j.vy += Math.sin(j.hd) * J_KICK * dp;
      const drag = Math.exp(-dt * J_DRAG);
      j.vx *= drag; j.vy *= drag;
      j.x = clamp(j.x + j.vx * dt, 60, worldW - 60);
      j.y = clamp(j.y + j.vy * dt, 60, worldH - 60);
      j.pulse = p;

      const pull = 1 - Math.exp(-dt / J_TENT_TAU);
      for (let k = 0; k < J_TENT_N; k++) {
        const xs = j.tx[k], ys = j.ty[k];
        const rootX = j.x + (k / (J_TENT_N - 1) - 0.5) * J_R * 1.2 * (1 - 0.18 * p);
        const rootY = j.y + J_R * 0.15;
        for (let q = 1; q < J_TENT_PTS; q++) {
          const sway = Math.sin(t * 0.9 + q * 0.8 + k * 1.6 + j.phase) * J_TENT_SWAY * dt;
          xs[q] += sway + (rootX - xs[q]) * pull * 0.3;
          ys[q] += (rootY + q * J_TENT_SEG - ys[q]) * pull;
        }
        xs[0] = rootX; ys[0] = rootY;
        for (let q = 1; q < J_TENT_PTS; q++) {
          let dx = xs[q] - xs[q - 1], dy = ys[q] - ys[q - 1];
          const d = Math.hypot(dx, dy);
          if (d > 1e-6) { dx /= d; dy /= d; } else { dx = 0; dy = 1; }
          xs[q] = xs[q - 1] + dx * J_TENT_SEG;
          ys[q] = ys[q - 1] + dy * J_TENT_SEG;
        }
      }
    }
  }

  greet(eel, hearts) {
    for (const m of this.minnows) {
      if (!m.alive || m.greetCd > 0) continue;
      if (Math.hypot(m.x - eel.x, m.y - eel.y) > GREET.RANGE) continue;
      m.greetCd = CRITTER_GREET_CD;
      hearts.emit(m.x, m.y - 8, { ...MINNOW_HEART, delay: 0.15 + Math.random() * 0.5 });
    }
    for (const j of this.jellies) {
      if (!j.alive || j.greetCd > 0) continue;
      if (Math.hypot(j.x - eel.x, j.y - eel.y) > GREET.RANGE) continue;
      j.greetCd = CRITTER_GREET_CD;
      hearts.emit(j.x, j.y - J_R, JELLY_HEART);
    }
  }

  render() {
    if (!this.view) return;
    const t = this.time;
    const light = progress.value('light');
    const lx = this.mlx, ly = this.mly;

    for (const m of this.minnows) {
      if (!m.alive) continue;
      if (!this.inView(m.x, m.y, RENDER_PAD)) {
        // out of the pad: hide, or the camera could pan back onto stale geometry
        if (m.shown) {
          m.shown = false;
          m.el.setAttribute('display', 'none');
          m.eye.setAttribute('display', 'none');
        }
        continue;
      }
      const seg = M_LEN / (M_N - 1);
      for (let j = 0; j < M_N; j++) {
        const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, M_N - 1);
        let tx = m.px[j1] - m.px[j0], ty = m.py[j1] - m.py[j0];
        const tm = Math.hypot(tx, ty) || 1;
        tx /= tm; ty /= tm;
        const wave = Math.sin(t * 9 + m.phase - j * 1.1) * M_WAVE * (j / (M_N - 1));
        const cx = m.px[j] - ty * wave, cy = m.py[j] + tx * wave;
        lx[j] = cx - ty * M_W[j];
        ly[j] = cy + tx * M_W[j];
        lx[2 * M_N - 1 - j] = cx + ty * M_W[j];
        ly[2 * M_N - 1 - j] = cy - tx * M_W[j];
      }
      m.el.setAttribute('d', closedLoopPath(lx, ly, 2 * M_N));
      const g = Math.pow(Math.max(0, Math.sin(m.hd * 2 + Math.sin(t * 0.7 + m.phase) * 1.4)), 3);
      m.el.setAttribute('fill', rgb(M_COL_A, M_COL_B, g));
      // the little dark eye dot: back along the body, on the upper side
      let ux = Math.sin(m.hd), uy = -Math.cos(m.hd);
      if (uy > 0) { ux = -ux; uy = -uy; }   // stay on the screen-upper side
      m.eye.setAttribute('cx', (m.x - Math.cos(m.hd) * M_EYE_BACK + ux * M_EYE_UP).toFixed(1));
      m.eye.setAttribute('cy', (m.y - Math.sin(m.hd) * M_EYE_BACK + uy * M_EYE_UP).toFixed(1));
      if (!m.shown) {   // first in-pad write of this life: safe to reveal
        m.shown = true;
        m.el.setAttribute('display', 'inline');
        m.eye.setAttribute('display', 'inline');
      }
    }

    for (const j of this.jellies) {
      if (!j.alive) continue;
      // wider pad: tentacles and the glow spill past the bell
      if (!this.inView(j.x, j.y, RENDER_PAD + 90)) {
        if (j.shown) {
          j.shown = false;
          j.g.setAttribute('display', 'none');
          j.glow.setAttribute('display', 'none');
        }
        continue;
      }
      const p = j.pulse || 0;
      const w = J_R * (1 - 0.18 * p);
      const h = J_R * 1.05 * (1 + 0.28 * p);
      j.bell.setAttribute('d',
        `M${(j.x - w).toFixed(1)} ${j.y.toFixed(1)}` +
        `C${(j.x - w).toFixed(1)} ${(j.y - h).toFixed(1)} ${(j.x + w).toFixed(1)} ${(j.y - h).toFixed(1)} ${(j.x + w).toFixed(1)} ${j.y.toFixed(1)}` +
        `C${(j.x + w * 0.55).toFixed(1)} ${(j.y + h * 0.16).toFixed(1)} ${(j.x - w * 0.55).toFixed(1)} ${(j.y + h * 0.16).toFixed(1)} ${(j.x - w).toFixed(1)} ${j.y.toFixed(1)}Z`);
      // the lantern: long soft halo, shy of the approaching eel, with a
      // gentle always-on pulse (opacity and a whisper of radius)
      const shy = clamp((Math.hypot(j.x - this.eelX, j.y - this.eelY) - J_SHY_NEAR)
        / (J_SHY_FAR - J_SHY_NEAR), J_SHY_MIN, 1);
      const glowPulse = 1 + J_GLOW_PULSE_A * Math.sin(t * J_GLOW_PULSE_F + j.phase * 2);
      const rPulse = 1 + J_GLOW_PULSE_R * Math.sin(t * J_GLOW_PULSE_F + j.phase * 2);
      j.glow.setAttribute('cx', j.x.toFixed(1));
      j.glow.setAttribute('cy', (j.y - h * 0.38).toFixed(1));
      j.glow.setAttribute('rx', (w * J_GLOW_SCALE * rPulse).toFixed(1));
      j.glow.setAttribute('ry', (h * J_GLOW_SCALE * 0.8 * rPulse).toFixed(1));
      j.glow.setAttribute('opacity',
        (lerp(J_GLOW_DARK, J_GLOW_LIGHT, light) * (0.8 + 0.2 * p) * glowPulse * shy).toFixed(2));
      // WORLD MAGIC hue, wobbling gently around this jelly's own color
      const hue = j.hue + Math.sin(t * 0.13 + j.phase) * (j.hueWob || 0);
      if (Math.abs(hue - j.lastHue) > 1) {
        j.lastHue = hue;
        const c = `hsl(${hue.toFixed(0)}, ${J_HUE_SAT}%, ${J_HUE_LUM}%)`;
        for (const s of j.stops) s.setAttribute('stop-color', c);
      }
      for (let k = 0; k < J_TENT_N; k++) {
        const xs = j.tx[k], ys = j.ty[k];
        let d = `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
        for (let q = 1; q < J_TENT_PTS; q++) d += `L${xs[q].toFixed(1)} ${ys[q].toFixed(1)}`;
        j.tents[k].setAttribute('d', d);
      }
      if (!j.shown) {   // first in-pad write of this life: safe to reveal
        j.shown = true;
        j.g.setAttribute('display', 'inline');
        j.glow.setAttribute('display', 'inline');
      }
    }
  }
}
