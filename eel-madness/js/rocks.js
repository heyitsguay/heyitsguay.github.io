// Shatterable rocks + the dressing shaker (P4, docs/10).
//
// Seeded boulders (worldgen.rocksInChunk) sit on the MAIN-plane seafloor
// terrain. A boost-charging eel (boost01 + speed past ROCKS.SMASH_*) whose
// head hits one shatters it and reveals the DRESSING SHAKER — a little item
// that pops out, bobs, and grants the greens buff on contact (main.js owns
// the buff timer). Shattered rocks persist in localStorage as [x, timestamp]
// pairs and respawn after ROCKS.RESPAWN_H hours; reset clears the list.
//
// Rocks are pooled SVG paths in <g id="rocks"> (sprite layer, under the veil,
// behind the eel). They pool in/out strictly beyond the view pad, so they
// never pop. The shaker lives on the GLOW layer — a reward the deep dark
// can't hide.

import { TAU, clamp } from './math.js';
import { ROCKS, SEA } from './tuning.js';
import { rocksInChunk, mainFloorY, hash01 } from './worldgen.js';

const POOL = 8;
const STORE_KEY = 'eel-madness:rocks:v1';
const PAD = 200;               // px beyond the view before rocks (de)pool
const ROCK_VERTS = 9;
const ROCK_SQUASH = 0.72;      // rocks sit, they don't balloon
const SMASH_PAD = 12;          // px forgiveness on the head-hit radius

// the shaker
const SHAKER_HOP = 150;        // px/s pop-out velocity
const SHAKER_G = 300;          // px/s² settle
const SHAKER_BOB_A = 4;        // px idle bob
const SHAKER_BOB_F = 1.7;      // rad/s
const SHAKER_R = 36;           // px collect radius around the eel head
// Matt's art (2026-07-05): assets/modifier_dressing.png is 235×595 — drawn
// at 2.5× the old procedural placeholder's footprint, aspect preserved.
const SHAKER_H = 54;
const SHAKER_W = SHAKER_H * 235 / 595;
const SHAKER_LIFE = 45;        // s before an uncollected shaker fades out
const SHAKER_FADE = 1.2;       // s of that fade

export class Rocks {
  constructor(svgRoot, glowRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    this.group = svgRoot.querySelector('#rocks');
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('display', 'none');
      this.group.appendChild(el);
      this.pool.push({ el, key: null, x: 0, y: 0, r: 0 });
    }

    // The shaker: Matt's dressing art, on the glow layer so the reward reads
    // even in black water.
    const glows = glowRoot.querySelector('#glows');
    this.shaker = { alive: false, x: 0, y: 0, restY: 0, vy: 0, age: 0 };
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('display', 'none');
    const img = document.createElementNS(NS, 'image');
    img.setAttribute('href', 'assets/modifier_dressing.png');
    img.setAttribute('width', SHAKER_W.toFixed(1));
    img.setAttribute('height', SHAKER_H);
    img.setAttribute('x', (-SHAKER_W / 2).toFixed(1));
    img.setAttribute('y', -SHAKER_H / 2);
    g.appendChild(img);
    glows.appendChild(g);
    this.shakerEl = g;

    // Shattered-rock persistence (docs/10): [x, timestamp] pairs, pruned on
    // load — a rock older than RESPAWN_H hours simply exists again.
    this.smashed = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      const cutoff = Date.now() - ROCKS.RESPAWN_H * 3600 * 1000;
      if (Array.isArray(saved)) {
        for (const [x, ts] of saved) if (ts > cutoff) this.smashed.set(x, ts);
      }
    } catch { /* fresh sea */ }
  }

  save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...this.smashed]));
    } catch { /* private mode */ }
  }

  // Blank-slate reset (docs/08 + docs/10): every rock back, shaker gone.
  clear() {
    this.smashed.clear();
    try { localStorage.removeItem(STORE_KEY); } catch { /* private mode */ }
    for (const s of this.pool) {
      if (s.key) { s.key = null; s.el.setAttribute('display', 'none'); }
    }
    this.hideShaker();
  }

  hideShaker() {
    this.shaker.alive = false;
    this.shakerEl.setAttribute('display', 'none');
  }

  // The rock's resting surface: the top of the main-plane terrain (docs/10 —
  // worldgen.mainFloorY is the shared authority).
  floorY(x, viewH, worldH) {
    return mainFloorY(x, viewH, worldH);
  }

  // Where a rock of radius r actually SITS at x: the lowest terrain top under
  // its footprint (three samples), so it stays planted on dune slopes instead
  // of perching on the center-line height and hovering (Matt, 2026-07-05).
  restY(x, r, viewH, worldH) {
    return Math.max(
      this.floorY(x - r * 0.6, viewH, worldH),
      this.floorY(x, viewH, worldH),
      this.floorY(x + r * 0.6, viewH, worldH));
  }

  // An irregular boulder polygon, deterministic per rock.
  rockPath(rock) {
    const kx = Math.round(rock.x);
    let d = '';
    for (let k = 0; k < ROCK_VERTS; k++) {
      const a = (k / ROCK_VERTS) * TAU;
      const jit = 0.72 + 0.5 * hash01(kx + k * 7, ROCKS.SALT + 5);
      const px = Math.cos(a) * rock.r * jit;
      const py = Math.sin(a) * rock.r * jit * ROCK_SQUASH;
      d += `${k ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
    }
    return d + 'Z';
  }

  // Returns { shattered: [{x, y}], collected: {x, y} | null } for main's FX,
  // shake, and the greens buff. ephemeral = sandbox mode (docs/08): smashes
  // land in memory for the session but never touch the persistent store.
  update(dt, eel, cam, viewW, viewH, worldH, ephemeral = false) {
    const out = { shattered: [], collected: null };
    const t = (this.time = (this.time || 0) + dt);

    // Pool seeded rocks around the camera (strictly beyond the view pad).
    const x0 = cam.x - PAD, x1 = cam.x + viewW + PAD;
    const want = new Map();
    for (let c = Math.floor(x0 / SEA.CHUNK_W); c * SEA.CHUNK_W < x1; c++) {
      for (const r of rocksInChunk(c)) {
        if (r.x < x0 || r.x > x1) continue;
        if (this.smashed.has(Math.round(r.x))) continue;
        want.set(Math.round(r.x), r);
      }
    }
    for (const slot of this.pool) {
      if (slot.key !== null && !want.has(slot.key)) {
        slot.key = null;
        slot.el.setAttribute('display', 'none');
      } else if (slot.key !== null) {
        want.delete(slot.key);
      }
    }
    for (const [key, r] of want) {
      const slot = this.pool.find(p => p.key === null);
      if (!slot) break;
      slot.key = key;
      slot.x = r.x;
      slot.r = r.r;
      // center sits just above the LOWEST nearby terrain top — the polygon's
      // underside (≥ 0.52 r below center) buries solidly into the dune
      slot.y = this.restY(r.x, r.r, viewH, worldH) - r.r * ROCK_SQUASH * 0.15;
      slot.el.setAttribute('d', this.rockPath(r));
      // a seeded shade per rock, so the field isn't a clone row — bright-ish
      // grays on purpose: the abyss veil crushes everything down here
      const sh = 0.8 + 0.5 * hash01(key, ROCKS.SALT + 9);
      slot.el.setAttribute('fill',
        `rgb(${Math.round(72 * sh)}, ${Math.round(80 * sh)}, ${Math.round(92 * sh)})`);
      slot.el.setAttribute('transform',
        `translate(${slot.x.toFixed(1)} ${slot.y.toFixed(1)})`);
      slot.el.setAttribute('display', 'inline');
    }

    // The smash: a boost-charging eel's head against a rock (docs/10).
    if (eel.boost01 > ROCKS.SMASH_BOOST && eel.speed > ROCKS.SMASH_SPEED) {
      for (const slot of this.pool) {
        if (slot.key === null) continue;
        if (Math.hypot(eel.x - slot.x, eel.y - slot.y) > slot.r + SMASH_PAD) continue;
        this.smashed.set(slot.key, Date.now());
        if (!ephemeral) this.save();
        out.shattered.push({ x: slot.x, y: slot.y });
        // the reveal: the shaker pops out of the rubble with a hop
        this.shaker.alive = true;
        this.shaker.x = slot.x;
        this.shaker.restY = slot.y - slot.r * ROCK_SQUASH - 10;
        this.shaker.y = this.shaker.restY;
        this.shaker.vy = -SHAKER_HOP;
        this.shaker.age = 0;
        this.shakerEl.setAttribute('display', 'inline');
        slot.key = null;
        slot.el.setAttribute('display', 'none');
      }
    }

    // The shaker: hop, settle, bob; collected on eel-head contact.
    const sh = this.shaker;
    if (sh.alive) {
      sh.age += dt;
      if (sh.vy !== 0) {
        sh.vy += SHAKER_G * dt;
        sh.y += sh.vy * dt;
        if (sh.vy > 0 && sh.y >= sh.restY) { sh.y = sh.restY; sh.vy = 0; }
      }
      const bobY = sh.vy === 0 ? Math.sin(t * SHAKER_BOB_F) * SHAKER_BOB_A : 0;
      const tilt = Math.sin(t * SHAKER_BOB_F * 0.7) * 7;
      this.shakerEl.setAttribute('transform',
        `translate(${sh.x.toFixed(1)} ${(sh.y + bobY).toFixed(1)}) rotate(${tilt.toFixed(1)})`);
      const left = SHAKER_LIFE - sh.age;
      this.shakerEl.setAttribute('opacity',
        clamp(left / SHAKER_FADE, 0, 1).toFixed(2));
      if (left <= 0) this.hideShaker();
      else if (Math.hypot(eel.x - sh.x, eel.y - (sh.y + bobY)) < SHAKER_R) {
        out.collected = { x: sh.x, y: sh.y + bobY };
        this.hideShaker();
      }
    }

    return out;
  }
}
