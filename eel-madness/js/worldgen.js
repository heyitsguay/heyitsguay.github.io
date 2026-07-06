// The seeded infinite sea (docs/09): deterministic streams for flora, terrain,
// and the spawn tensor's x hotspot field. Same seed ⇒ same sea, every session.
// Nothing in here rolls Math.random — world STRUCTURE is seeded; behavioral
// jitter (wander phases, heart scatter) stays random in its own modules.
//
// Everything is keyed by integer lattice indices (chunk of CHUNK_W px, cell of
// CELL_W px), so the world never has to exist anywhere the camera isn't.

import { TAU, lerp } from './math.js';
import { SEA, TIERS, ROCKS, TERRAIN } from './tuning.js';

// ---- Kelp strand streams (shared: water.js geometry + seahorse anchors) ----
// Main-plane kelp, per chunk. perChunk is the FULL-LIFE strand count; callers
// slice the deterministic full set down to the current density, so LIFE growth
// adds strands without reshuffling the ones already there (docs/09).
const KELP_PER_CHUNK = 11;          // base strands per chunk (22 / ref screen)
const KELP_FAR_FRAC = 12 / 22;      // fraction in the dimmer/shorter back layer
export const KELP_H_FAR = [0.35, 0.30];    // [min, var] heights, fraction of REF_H
export const KELP_H_NEAR = [0.55, 0.40];
const KELP_W_FAR = [6, 4];          // base half-widths, px
const KELP_W_NEAR = [9, 7];

// murmur-style finalizer over (index, salt, world seed) → uint32
function mix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
const key = (i, salt) =>
  mix((i | 0) + Math.imul(salt | 0, 0x9e3779b1) + Math.imul(SEA.SEED | 0, 0x85ebca77));

// One deterministic uniform in [0, 1) per (lattice index, salt).
export const hash01 = (i, salt) => key(i, salt) / 4294967296;

// A seeded PRNG stream for per-chunk sequences (mulberry32).
export function chunkRng(chunk, salt) {
  let a = key(chunk, salt) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generic strand stream: the chunk's full-density strand set for one layer.
// spec: { salt, perChunk, hMin, hVar, wMin, wVar } — h is a fraction of REF_H.
// densMul > 1 grows the full set (LIFE density growth is part of the max).
export function strandsInChunk(chunk, spec, densMul = 1) {
  const rng = chunkRng(chunk, spec.salt);
  const n = Math.max(0, Math.round(spec.perChunk * densMul));
  const out = [];
  for (let k = 0; k < n; k++) {
    out.push({
      x: (chunk + rng()) * SEA.CHUNK_W,
      h: spec.hMin + rng() * spec.hVar,
      hw: spec.wMin + rng() * spec.wVar,
      ph: rng() * TAU,
      shade: rng(),
    });
  }
  return out;
}

// Kelp strand TYPES (P4, docs/10): drawn from a SIDE hash-stream keyed by
// (chunk, index) — NOT extra chunk-RNG draws, so the strand stream (and with
// it determinism, growth supersets, and seahorse anchors) stays byte-
// identical to pre-P4. Types only land on near-layer strands (the far layer
// is a dim backdrop). hMul scales the strand's height; every consumer must
// use h · hMul (water geometry, lanterns skip typed strands entirely).
const KELP_TYPE_SALT = 61;
const KELP_SPINDLE_P = 0.08;    // very tall, very narrow, grassy growth nodes
const KELP_SINUOUS_P = 0.18;    // longer, ribbony, static S-curve
export const KELP_HMUL = { norm: 1, sinuous: 1.35, spindle: 1.6 };

function strandType(chunk, k, far) {
  if (far) return 'norm';
  const t = hash01(chunk * 131 + k, KELP_TYPE_SALT);
  if (t < KELP_SPINDLE_P) return 'spindle';
  if (t < KELP_SPINDLE_P + KELP_SINUOUS_P) return 'sinuous';
  return 'norm';
}

// Main-plane kelp for one chunk at a given LIFE density multiplier: the
// full-growth set, sliced to round(base · dens). far = back layer strand.
export function kelpStrands(chunk, dens = 1) {
  const rng = chunkRng(chunk, 3);
  const maxN = Math.round(KELP_PER_CHUNK * (1 + 1)); // headroom past full growth
  const all = [];
  for (let k = 0; k < maxN; k++) {
    const far = rng() < KELP_FAR_FRAC;
    const [hMin, hVar] = far ? KELP_H_FAR : KELP_H_NEAR;
    const [wMin, wVar] = far ? KELP_W_FAR : KELP_W_NEAR;
    const type = strandType(chunk, k, far);
    all.push({
      x: (chunk + rng()) * SEA.CHUNK_W,
      far,
      h: hMin + rng() * hVar,
      hw: wMin + rng() * wVar,
      ph: rng() * TAU,
      shade: far ? 0.15 + rng() * 0.2 : 0.75 + rng() * 0.25,
      type,
      hMul: KELP_HMUL[type],
    });
  }
  return all.slice(0, Math.max(0, Math.round(KELP_PER_CHUNK * dens)));
}

// Kelp anchors for a world-x range (seahorse homes): the near-layer strands of
// every chunk touching [x0, x1], with their heights. dens as in kelpStrands.
export function kelpAnchors(x0, x1, dens = 1) {
  const c0 = Math.floor(x0 / SEA.CHUNK_W), c1 = Math.floor(x1 / SEA.CHUNK_W);
  const out = [];
  for (let c = c0; c <= c1; c++) {
    for (const s of kelpStrands(c, dens)) {
      if (s.x >= x0 && s.x <= x1) out.push(s);
    }
  }
  return out;
}

// Smooth 1D value noise in [0, 1] on a lattice of `step` px.
export function vnoise(x, step, salt) {
  const i = Math.floor(x / step);
  const f = x / step - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash01(i, salt), hash01(i + 1, salt), u);
}

// Rolling seafloor height in [0, 1] (docs/09) — two octaves, plane-space x.
const TERRAIN_STEP = 980;    // px — main undulation wavelength (long, smooth)
export function terrain01(x, salt) {
  return 0.72 * vnoise(x, TERRAIN_STEP, salt)
       + 0.28 * vnoise(x, TERRAIN_STEP * 0.41, salt + 7);
}

// The shaped floor profile: mostly a low roll, with occasional tall swells —
// callers scale by their plane's TERRAIN.AMP (a fraction of the view height)
// and shape it with their plane's TERRAIN.POW (docs/10 follow-up: the main
// floor uses a lower pow for visible rolling dunes).
const TERRAIN_SHAPE_POW = 2.6;
export function terrainShape(x, salt, pow = TERRAIN_SHAPE_POW) {
  return Math.pow(terrain01(x, salt), pow);
}

// The main-plane seafloor SURFACE (docs/10): world y of the terrain top at x.
// The one authority — eel/fish collision, kelp/seagrass roots, lantern bulbs,
// and rock resting all derive from this. Heights are fractions of the view
// height (same as the rendering), so the surface shifts slightly on resize.
export function mainFloorY(x, viewH, worldH) {
  return worldH + 4 - TERRAIN.BASE.main
    - terrainShape(x, TERRAIN.SALT.main, TERRAIN.POW.main) * TERRAIN.AMP.main * viewH;
}

// ---- Rocks on the main-plane seafloor (P4, docs/10) ------------------------
// Seeded boulders, ~one per ROCKS.EVERY px: deterministic place/size/shape
// per chunk from their own stream. rocks.js builds the polygon from `seed`
// and keys shatter persistence by the (rounded) x.
export function rocksInChunk(chunk) {
  const rng = chunkRng(chunk, ROCKS.SALT);
  const out = [];
  if (rng() < SEA.CHUNK_W / ROCKS.EVERY) {
    out.push({
      x: (chunk + rng()) * SEA.CHUNK_W,
      r: ROCKS.R[0] + rng() * (ROCKS.R[1] - ROCKS.R[0]),
      seed: rng(),
    });
  }
  return out;
}

// ---- The spawn tensor's x factor (docs/09) --------------------------------
// x is divided into CELL_W cells; a cell is a HOTSPOT with probability
// CELL_W / hotEvery (so hotspots average `hotEvery` px apart). Acceptance
// weight is 1 in a hot cell, baseW elsewhere. hotEvery 0 ⇒ uniform (f_x ≡ 1).
export function xWeight(x, sp) {
  if (!sp.hotEvery) return 1;
  const cell = Math.floor(x / SEA.CELL_W);
  return hash01(cell, sp.salt + 101) < SEA.CELL_W / sp.hotEvery ? 1 : sp.baseW;
}

// Depth-band weight at a world-height fraction (bands: [[y0, y1, tier], ...]).
export function bandW(bands, yFrac) {
  for (const [a, b, tier] of bands) {
    if (yFrac >= a && yFrac < b) return TIERS[tier];
  }
  return 0;
}

// The spawn damping factor c for a species (docs/09): each live member
// multiplies the next acceptance by c. LIFE grows populations by walking
// 1 − c down a LOG scale from damp[0] (at arrival) to damp[1] (at LIFE = 1).
export function dampC(sp, arrive01) {
  const [d0, d1] = sp.damp;
  return 1 - Math.exp(lerp(Math.log(1 - d0), Math.log(1 - d1), arrive01));
}
