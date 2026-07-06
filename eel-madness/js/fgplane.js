// The front kelp plane (docs/03, docs/09): a SHARP parallax layer slightly in
// front of the player — camera factor LAYERS.FRONT.PF > 1, so it pans faster
// than the world. It's SVG, not GL: the group sits after #eel (occludes it)
// and under the veil, so the single lighting authority holds by construction.
// Strands are chunk-seeded (worldgen), pooled, and swayed with one cheap
// rotate-about-the-root transform per visible strand per frame.

import { lerp } from './math.js';
import { LAYERS, SEA, DIALS, TERRAIN } from './tuning.js';
import { strandsInChunk, terrainShape } from './worldgen.js';
import { progress } from './progress.js';

const REF_H = 1080;            // reference screen height (world sizing unit)
const POOL = 16;               // pooled path elements (≈ visible strand max)
const SPEC = {                 // worldgen strand stream for this plane
  salt: 31, perChunk: 2.6,     // sparse — foreground occluders stay a garnish
  hMin: 0.45, hVar: 0.50,      // heights, fraction of REF_H (tall: it's close)
  wMin: 13, wVar: 10,          // base half-widths, px
};
const SEGS = 8;                // blade segments
const BEND = 0.10;             // static S-curve amplitude vs height
const SWAY_A1 = 2.1, SWAY_F1 = 0.42;   // deg / rad-s — slow primary sway
const SWAY_A2 = 1.2, SWAY_F2 = 0.19;   // secondary
const COL_A = [5, 18, 13];     // blade darks (rgb) — near-silhouette greens
const COL_B = [11, 36, 26];
const PAD = 140;               // px beyond the view before strands (de)pool
const CACHE_MAX = 12;          // cached chunk strand lists
// The front seafloor sliver (P4, docs/10): the lowest terrain of all the
// planes — a thin dark roll occluding the eel's belly at the very bottom.
const TERR_POOL = 8;           // pooled chunk-terrain paths (covers wide windows)
const TERR_SEG = 60;           // px between heightfield samples
const TERR_SINK = 70;          // px the fill extends below the plane floor
const TERR_FILL = '#04100b';   // darkest silhouette — it's the closest plane

export class FrontPlane {
  constructor(svgRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    this.group = svgRoot.querySelector('#fg');
    // terrain paths first: strands draw over the floor sliver
    this.terr = [];
    for (let i = 0; i < TERR_POOL; i++) {
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('display', 'none');
      el.setAttribute('fill', TERR_FILL);
      this.group.appendChild(el);
      this.terr.push({ el, chunk: null });
    }
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('display', 'none');
      this.group.appendChild(el);
      this.pool.push({ el, key: null, strand: null });
    }
    this.cache = new Map();   // chunk → strand records
    this.time = 0;
    this.floorY = 0;
    this.viewW = 0;
    this.viewH = 0;
  }

  resize(viewW, viewH, worldH) {
    this.viewW = viewW;
    this.viewH = viewH;
    // plane floor: meets the window bottom when the camera rests on the world
    // floor (docs/09) — depends on the view height, so strands re-path here
    this.floorY = viewH + (worldH - viewH) * LAYERS.FRONT.PF;
    for (const s of this.pool) s.key = null;   // force re-path with new floor
    for (const tp of this.terr) tp.chunk = null;
    this.cache.clear();
  }

  // One chunk's floor sliver: a low heightfield polygon (docs/10).
  terrainPath(chunk) {
    const x0 = chunk * SEA.CHUNK_W, x1 = (chunk + 1) * SEA.CHUNK_W;
    let d = `M${x0.toFixed(1)} ${(this.floorY + TERR_SINK).toFixed(1)}`;
    for (let x = x0; x <= x1 + 0.1; x += TERR_SEG) {
      const top = this.floorY - TERRAIN.BASE.front
        - terrainShape(x, TERRAIN.SALT.front, TERRAIN.POW.front) * TERRAIN.AMP.front * this.viewH;
      d += `L${x.toFixed(1)} ${top.toFixed(1)}`;
    }
    return d + `L${x1.toFixed(1)} ${(this.floorY + TERR_SINK).toFixed(1)}Z`;
  }

  chunkStrands(chunk) {
    let list = this.cache.get(chunk);
    if (!list) {
      list = strandsInChunk(chunk, SPEC);
      this.cache.set(chunk, list);
      if (this.cache.size > CACHE_MAX) {
        this.cache.delete(this.cache.keys().next().value);   // oldest out
      }
    }
    return list;
  }

  // A static tapered blade with a gentle built-in S-curve, rooted at the
  // plane floor. Sway happens via transform, so d is written once per pooling.
  bladePath(s) {
    const h = s.h * REF_H;
    let d = '';
    const pts = [];
    for (let j = 0; j <= SEGS; j++) {
      const f = j / SEGS;
      const cx = s.x + Math.sin(f * 2.4 + s.ph) * f * f * h * BEND;
      const cy = this.floorY + 4 - h * f;
      const w = s.hw * (1 - 0.82 * f) + 0.8;
      pts.push([cx - w, cy, cx + w, cy]);
    }
    d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let j = 1; j <= SEGS; j++) d += `L${pts[j][0].toFixed(1)} ${pts[j][1].toFixed(1)}`;
    for (let j = SEGS; j >= 0; j--) d += `L${pts[j][2].toFixed(1)} ${pts[j][3].toFixed(1)}`;
    return d + 'Z';
  }

  render(dt, rcam) {
    const t = (this.time += dt);
    const pf = LAYERS.FRONT.PF;
    // the viewBox already subtracts rcam; this leaves rcam·pf — faster pan
    this.group.setAttribute('transform',
      `translate(${((1 - pf) * rcam.x).toFixed(1)} ${((1 - pf) * rcam.y).toFixed(1)})`);

    const x0 = rcam.x * pf - PAD, x1 = rcam.x * pf + this.viewW + PAD;

    // the floor sliver (docs/10): one pooled path per visible chunk — static
    // geometry, so a slot only re-paths when its chunk changes
    const c0 = Math.floor(x0 / SEA.CHUNK_W), c1 = Math.floor(x1 / SEA.CHUNK_W);
    for (let i = 0; i < this.terr.length; i++) {
      const tp = this.terr[i];
      const c = c0 + i;
      if (c > c1) {
        if (tp.chunk !== null) { tp.chunk = null; tp.el.setAttribute('display', 'none'); }
        continue;
      }
      if (tp.chunk !== c) {
        tp.chunk = c;
        tp.el.setAttribute('d', this.terrainPath(c));
        tp.el.setAttribute('display', 'inline');
      }
    }

    // visible strands in plane space — density gated on LIFE like every
    // other kelp plane (DIALS.kelp, docs/09): the barren sea starts bare
    const dial = progress.dial(DIALS.kelp);
    const want = new Map();   // key → strand
    for (let c = Math.floor(x0 / SEA.CHUNK_W); c * SEA.CHUNK_W < x1; c++) {
      const list = this.chunkStrands(c);
      const n = Math.round(list.length * dial);
      for (let i = 0; i < n; i++) {
        const s = list[i];
        if (s.x > x0 && s.x < x1) want.set(`${c}:${i}`, s);
      }
    }

    // free slots whose strand left the pad; then fill new ones
    for (const slot of this.pool) {
      if (slot.key && !want.has(slot.key)) {
        slot.key = null;
        slot.el.setAttribute('display', 'none');
      } else if (slot.key) {
        want.delete(slot.key);   // already onscreen and pooled
      }
    }
    for (const [key, s] of want) {
      const slot = this.pool.find(p => !p.key);
      if (!slot) break;
      slot.key = key;
      slot.strand = s;
      slot.el.setAttribute('d', this.bladePath(s));
      const k = s.shade;
      slot.el.setAttribute('fill',
        `rgb(${Math.round(lerp(COL_A[0], COL_B[0], k))},${Math.round(lerp(COL_A[1], COL_B[1], k))},${Math.round(lerp(COL_A[2], COL_B[2], k))})`);
      slot.el.setAttribute('display', 'inline');
    }

    // sway: one rotate about the root per visible strand
    for (const slot of this.pool) {
      if (!slot.key) continue;
      const s = slot.strand;
      const a = Math.sin(t * SWAY_F1 + s.ph) * SWAY_A1
        + Math.sin(t * SWAY_F2 + s.ph * 1.7) * SWAY_A2;
      slot.el.setAttribute('transform',
        `rotate(${a.toFixed(2)} ${s.x.toFixed(1)} ${this.floorY.toFixed(1)})`);
    }
  }
}
