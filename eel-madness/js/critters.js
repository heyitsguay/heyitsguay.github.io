// Fauna (docs/07, docs/09): minnows, jellyfish, reef fish, seahorses,
// octopuses (+ the giant), anglerfish. Every species spawns through the SPAWN TENSOR
// (docs/09): attempts/s × arrival dial, candidates strictly offscreen in the
// vicinity, accepted with depth-band weight × the seeded x hotspot field ×
// the damping factor c^N. Populations emerge; no caps beyond the element
// pools. Every critter answers a greet through the shared heart emitter in
// its own style — and a greet needs a subject: main gates on anyGreetable().
//
// THE VICINITY PRINCIPLE (docs/00 pillar 5, docs/07): fauna is simulated
// around the camera, not globally. Anything distant for CULL_T seconds
// despawns (plus a small offscreen retire rate so idle scenes keep flux),
// and offscreen critters skip their DOM writes. NO POPS: spawns are strictly
// offscreen (a spawn with no valid offscreen point just waits), and
// over-population only ever resolves offscreen.

import { TAU, clamp, lerp, expApproach, angleDiff } from './math.js';
import { GREET, SPONT, FLOCK, FOLLOW, SPECIES, SEA, KELP_GROWTH, DIALS, lightParams } from './tuning.js';
import { progress } from './progress.js';
import { xWeight, bandW, dampC, kelpAnchors } from './worldgen.js';

const REF_H = 1080;

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
const M_FOLLOW_R = 46;          // px — befriended orbit radius around the eel
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
const J_TENT_N = 4;
const J_TENT_PTS = 6;
const J_TENT_SEG = 9;           // px per tentacle segment
const J_TENT_SWAY = 6;          // px/s ambient tentacle sway
const J_TENT_TAU = 1.4;         // s — rest pull toward hanging down
const J_FOLLOW_T = 9.3;         // s — a greeted jelly leans your way (+33%, 2026-07-05)
const J_FOLLOW_TURN = 1.3;      // rad/s — how hard it leans toward you
const J_FOLLOW_NEAR = 90;       // px — close enough; resume ambient wander
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
const J_HUE_BASE = 196;         // deg — cyan, every lantern's home color
// WORLD MAGIC hue PULSES (docs/09): eased excursions away from cyan whose
// magnitude AND frequency grow with the jellyHue dial. sin³ shaping keeps
// lanterns dwelling at cyan and blooming into color — pulse discipline.
const J_PULSE_HUE = 150;        // deg — max excursion at full dial
const J_PULSE_F0 = 0.22;        // rad/s pulse rate at dial → 0...
const J_PULSE_F1 = 0.85;        // ...and at dial = 1
const J_HUE_SAT = 95;           // % — vivid, not pastel
const J_HUE_LUM = 70;           // %
// greeted: the shy-dim suspends and the lantern beats like a heart —
// th-thump (pause) th-thump (pause) — for a while (docs/07).
// Brighter + longer per Matt (2026-07-05): greet responses should LAND.
const J_BEAT_T = 8;             // s of heartbeat after a greet (+33%)
const J_BEAT_P = 1.5;           // s per beat cycle
const J_BEAT_A = 1.1;           // opacity swell per thump (brighter)...
const J_BEAT_R = 0.2;           // ...and radius

// ---- Reef fish (docs/09): solo, banded color, minnow-style wiggle ----
const R_N = 8;                  // spine points
const R_LEN = 44;               // body length, px (× per-fish size)
// deep body, THICK caudal peduncle (no pinch at the tail joint), then the
// caudal-fin flare — the fin is part of the outline
const R_W = [1.8, 5.8, 8.4, 8.2, 6.2, 3.2, 1.9, 6.4];
const R_SPEED = 66;             // px/s wander
const R_DART = 190;             // px/s spooked
const R_TURN = 2.6;             // rad/s
const R_TAU_SPEED = 0.55;
const R_FLEE_R = 150;
const R_FLEE_SPEED = 0.5;       // eel speed01 that spooks (bolder than minnows)
const R_FOLLOW_R = 62;          // befriended orbit radius
const R_HUE_BASE = 330;         // deg — the aesthetic cluster: pinks → oranges
const R_HUE_VAR = 55;           //   → violets; per-fish draw within ±this
const R_BRIGHT_SAT = 76, R_BRIGHT_LUM = 58;   // the bright bands...
const R_SILVER = 'hsl(210, 16%, 84%)';        // ...and the silvery ones
const R_WAVE = 1.8;             // px — tail-wave amplitude (the wiggle)
const R_WAVE_F = 7.5;           // rad/s
const R_EYE_BACK = 4.5, R_EYE_UP = 3.4, R_EYE_R = 1.7;
const R_FLOCK = { r: 130, coh: 0.25, align: 0.7, sep: 28 };   // loose shoals
const R_PULSE_T = 1.3;          // s — one shimmer pulse
const R_PULSE_GAP = [6, 14];    // s between pulses at full dial

// ---- Seahorses (docs/09): kelp-anchored bobbers ----
const S_BOB_A = 8;              // px vertical bob
const S_SWAY_A = 10;            // px lateral drift around home
const S_BOB_F = 0.8;            // rad/s
const S_TILT = 8;               // deg lean with the bob
const S_PAIR_P = 0.5;           // chance a high-LIFE spawn brings a partner
const S_PAIR_LIFE = 0.75;       // LIFE value where pairs begin
const S_PAIR_D = 16;            // px — a pair drifts to this separation
const S_PAIR_HEART = 0.03;      // per-second chance a curled pair pops a heart
const S_HUE = [40, 95];         // deg range — golds into soft greens
// greeted: a delighted pirouette — clockwise, slow → fast → slow (docs/07)
const S_SPIN_T = 3.5;           // s (+33%, 2026-07-05)
const S_SPIN_TURNS = 2;         // full clockwise rotations

// ---- Octopuses (docs/09) ----
const O_R = 20;                 // head radius, px (giant multiplies this)
const O_TENT_N = 6;
const O_TENT_PTS = 6;
const O_TENT_SEG = 0.56;        // segment length, × head radius — long reach
const O_TENT_W0 = 0.44;         // tentacle half-width at the root, × R — THICK
const O_TENT_W1 = 0.13;         // ...and still substantial at the tip (no whisker)
const O_TENT_SPREAD = 0.55;     // root splay across the head's underside —
                                // narrow enough that the OUTERMOST ribbon
                                // (half-width O_TENT_W0·R) stays inside the
                                // head silhouette; the flare fans the arms
                                // along their length, never the roots
const O_TENT_STIFF = 0.78;      // tentacles ride the body's motion (advection) —
                                // an octopus diving takes its arms DOWN with it,
                                // no jellyfish flail
const O_TENT_TAU = 0.7;         // s — fast settle toward hanging (stiffness)
const O_IDLE_SWAY = 6;          // px/s — soft, coordinated idle wiggle
// the jet animation: arms FLARE outward before each kick, then TUCK inward as
// the jet fires. Experimental — set O_FLARE and O_TUCK to 0 to remove it.
const O_FLARE = 0.55;
const O_TUCK = 0.35;
const O_PULSE_T = 3.6;          // s per jet cycle
const O_KICK = 26;              // px/s impulse per contraction
const O_DRAG = 0.5;             // 1/s
const O_WANDER_F = 0.09;        // rad/s heading wander (horizontal bias)
const O_HUE = 335;              // deg — pinkish octopus, ±22 per individual
const O_SAT = 48, O_LUM = 46;
// greeted: octo-camouflage — the body paints itself the color of the water
// right behind it (a true color match, not transparency) and fades back
const O_CAMO_T = 4.7;           // s (+33%, 2026-07-05; the giant: ×1.6)
// a fast eel in its space startles it: it jets away in a puff of bubbles
// (the ink CLOUD was cut — looked bad; the dodge stays, docs/07)
const O_STARTLE_R = 120;        // px
const O_STARTLE_SPEED = 0.55;   // eel speedSm that startles
const O_STARTLE_CD = 9;         // s per octopus
const O_JET_AWAY = 130;         // px/s dodge impulse
const GIANT_SCALE = 3.4;        // the giant: same rig, majestic
const GIANT_PULSE_T = 6.5;      // slower jet cycle

// ---- Roaming fish (docs/09): one spine-fish framework, three species ----
// Muted organic tones, minnow-style wiggle, greet-and-follow like reef fish.
const ROAMERS = {
  salmon: {   // the honest average fish: shiny pinkish silver, muted; FLOCKS
    N: 9, len: 52, w: [1.6, 3.8, 5.2, 5.6, 5.2, 4.4, 3.2, 1.6, 4.6],
    speed: 78, dart: 200, turn: 2.4, fleeR: 160, fleeS: 0.45,
    flock: { r: 150, coh: 0.4, align: 1.1, sep: 24 },
    wave: 1.5, waveF: 6.5, eyeBack: 4.2, eyeUp: 2.8, eyeR: 1.3,
    colA: [0.62, 0.54, 0.54], colB: [0.92, 0.84, 0.85],
    heart: { color: '#ffc9cf', size: 9, count: 3, pattern: 'scatter', spread: 14, delay: 0.1 },
  },
  barracuda: {   // long and skinny, steel-green, bold
    N: 10, len: 88, w: [1.2, 2.2, 3.0, 3.3, 3.4, 3.2, 2.8, 2.2, 1.3, 3.4],
    speed: 105, dart: 260, turn: 1.9, fleeR: 120, fleeS: 0.65,
    wave: 1.2, waveF: 5.5, eyeBack: 5, eyeUp: 1.9, eyeR: 1.4,
    colA: [0.44, 0.52, 0.49], colB: [0.80, 0.88, 0.84],
    heart: { color: '#cfe8e0', size: 9, count: 2, pattern: 'scatter', spread: 16, delay: 0.15 },
  },
  swordfish: {   // the late-game patroller: the first widths are the bill,
    // the mid spike is the dorsal + ventral fin pair (symmetric outline)
    N: 10, len: 150, w: [0.7, 0.9, 1.2, 5.5, 11, 6.8, 5.6, 3.8, 1.8, 7],
    speed: 130, dart: 300, turn: 1.4, fleeR: 0, fleeS: 9,   // fears nothing
    wave: 1.6, waveF: 4.5, eyeBack: 52, eyeUp: 4.2, eyeR: 1.8,
    // subtle shine: a tight steel range, never dipping dark
    colA: [0.54, 0.60, 0.68], colB: [0.74, 0.80, 0.88],
    heart: { color: '#cdddf2', size: 12, count: 4, pattern: 'fan', spread: 24, delay: 0.2 },
  },
};
const ROAMER_MAXN = 10;         // scratch sizing (max N above)
const ROAMER_FOLLOW_R = 72;     // befriended orbit radius
for (const v of Object.values(ROAMERS)) v.wMax = Math.max(...v.w);

// ---- Anglerfish (docs/09): deep prowler, glow-layer lure ----
const A_SPEED = 26;             // px/s prowl
const A_LURE_TIP = [17, -14];   // local lure-tip offset from center
const A_SCALE = 2;              // the anglerfish deserves presence — 2× base
const A_LURE_R = 8;             // px glow radius — a light you can FIND
const A_LURE_DARK = 0.95;       // lure opacity in the dark...
const A_LURE_LIGHT = 0.35;      // ...and in full light
const A_LURE_PULSE_F = 1.4;     // rad/s slow throb
const A_FLARE_T = 2.0;          // s — greeted lure flare (+33%, 2026-07-05)
const A_BODY = 'M14 1 C12 -5, 6 -8, -2 -7.4 C-8 -7, -12 -3.6, -13.5 0 '
  + 'C-12 3.9, -7 7, 0 6.8 C7 6.6, 12 4.6, 14 1 Z '
  + 'M-13.5 0 L-19.5 -4.5 C-20.8 -0.2, -20.8 0.6, -19.3 4.6 Z';
const A_TEETH = 'M13 1.8 L11.2 3.2 L10.4 1.9 L8.6 3.5 L7.8 2.1 L6 3.7';
const A_STALK = 'M6 -6.6 Q10 -13.5, 16.5 -13.8';
const A_EYE = [6.8, -2.6, 1.5];

// (The surface drift-vines were built here and CUT — they read as another
// jellyfish, not flora. Surface flora is an open slot; see docs/07 catalog.)

const CRITTER_GREET_CD = 6;     // s per critter

// Every critter draws an individual scale at spawn — the sea is not a clone
// factory. (The giant octopus's ×3.4 is a species scale on top of this.)
const sizeJit = () => 0.8 + Math.random() * 0.4;   // ±20%

// Greet-range highlight (docs/07): pulsing corner BRACKETS in the eel-heart
// pink around any critter that would answer — a bounding-box corner set
// framed from the critter's live geometry, instead of stroking whatever
// outline the critter happens to have. Glow layer, so they read in the dark.
const BRK_POOL = 10;
const BRK_PAD = 6;             // px beyond the bbox
const BRK_PULSE_F = 4.5;       // rad/s opacity pulse
const BRK_ALPHA = 0.8;         // peak opacity — present, not shouting

// The vicinity (docs/07)
const VIC_PAD = 340;            // px beyond the view that still "exists"
const CULL_T = 5;               // s outside the vicinity before a critter despawns
const RENDER_PAD = 120;         // px beyond the view where DOM writes still happen

// Greeting signatures (hearts.emit specs). Everyone in radius responds — no
// responder cap; the heart pool is the natural ceiling.
const MINNOW_HEART = { color: '#dff3f7', size: 8.25, count: 2, pattern: 'scatter', spread: 10 };
const JELLY_HEART = { color: '#a8ecff', size: 12, count: 10, pattern: 'ring', spread: 26, delay: 0.35 };
const REEF_HEART = { size: 9.75, count: 3, pattern: 'scatter', spread: 14, delay: 0.1 };
const SEAHORSE_HEART = { color: '#ffc7e0', size: 7.5, count: 4, pattern: 'ring', spread: 12, delay: 0.2 };
const OCTO_HEART = { color: '#d9b8ff', size: 13.5, count: 5, pattern: 'fan', spread: 20, delay: 0.2 };
const GIANT_HEART = { color: '#d9b8ff', size: 24, count: 12, pattern: 'ring', spread: 64, delay: 0.3 };
const ANGLER_HEART = { color: '#9fd8ff', size: 10.5, count: 3, pattern: 'scatter', spread: 16, delay: 0.25 };
const PAIR_HEART = { color: '#ffd7e8', size: 6.75, count: 1, pattern: 'single' };

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

// A tapered ribbon around a point chain (octopus tentacles): down one side,
// back the other. The taper is SLOW (pow > 1 holds width through the middle)
// and floors at w1 — the tip keeps a real cross-section, never a whisker —
// and the outline runs through the Catmull-Rom smoother, so edges and the
// tip read as flesh, not polyline.
function taperedChainPath(xs, ys, n, w0, w1) {
  const lx = new Array(2 * n), ly = new Array(2 * n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, n - 1);
    let tx = xs[i1] - xs[i0], ty = ys[i1] - ys[i0];
    const tm = Math.hypot(tx, ty) || 1;
    tx /= tm; ty /= tm;
    const w = w0 + (w1 - w0) * Math.pow(i / (n - 1), 1.4);
    lx[i] = xs[i] - ty * w; ly[i] = ys[i] + tx * w;
    lx[2 * n - 1 - i] = xs[i] + ty * w; ly[2 * n - 1 - i] = ys[i] - tx * w;
  }
  return closedLoopPath(lx, ly, 2 * n);
}

const rgb = (a, b, t) =>
  `rgb(${Math.round(lerp(a[0], b[0], t) * 255)},${Math.round(lerp(a[1], b[1], t) * 255)},${Math.round(lerp(a[2], b[2], t) * 255)})`;

function hslRgb(h, s, l) {   // → [r, g, b] in 0..1
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

// Seahorse silhouette: a curled S-spine swept with tapering widths (built
// once per slot — the per-frame cost is one group transform).
const S_SPINE = [[0, -11], [2.5, -9.5], [3.6, -7], [3.4, -4.2], [2.2, -1.6],
  [0.6, 1], [0, 3.6], [0.8, 6.2], [2.6, 8.2], [3.4, 10], [2.4, 11.4],
  [0.6, 11.2], [-0.4, 9.8]];
const S_WIDTHS = [1.2, 2.2, 3.0, 3.4, 3.2, 2.8, 2.4, 2.0, 1.6, 1.2, 0.9, 0.6, 0.4];
function seahorsePath(scale) {
  const n = S_SPINE.length;
  const lx = new Array(2 * n), ly = new Array(2 * n);
  for (let i = 0; i < n; i++) {
    const [x, y] = S_SPINE[i];
    const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, n - 1);
    let tx = S_SPINE[i1][0] - S_SPINE[i0][0], ty = S_SPINE[i1][1] - S_SPINE[i0][1];
    const tm = Math.hypot(tx, ty) || 1;
    tx /= tm; ty /= tm;
    const w = S_WIDTHS[i] * scale;
    lx[i] = x * scale - ty * w; ly[i] = y * scale + tx * w;
    lx[2 * n - 1 - i] = x * scale + ty * w; ly[2 * n - 1 - i] = y * scale - tx * w;
  }
  return closedLoopPath(lx, ly, 2 * n);
}
// gentle cross-body stripes: short perpendicular ticks along the spine
function seahorseStripes(scale) {
  let d = '';
  for (const i of [2, 4, 6, 8]) {
    const [x, y] = S_SPINE[i];
    const i0 = i - 1, i1 = i + 1;
    let tx = S_SPINE[i1][0] - S_SPINE[i0][0], ty = S_SPINE[i1][1] - S_SPINE[i0][1];
    const tm = Math.hypot(tx, ty) || 1;
    tx /= tm; ty /= tm;
    const w = S_WIDTHS[i] * scale * 0.8;
    d += `M${(x * scale - ty * w).toFixed(1)} ${(y * scale + tx * w).toFixed(1)}`
      + `L${(x * scale + ty * w).toFixed(1)} ${(y * scale - tx * w).toFixed(1)}`;
  }
  return d;
}
// the face: a proper tube-mouth protuberance (eye sits up by the crown)
const S_SNOUT = 'M1.8 -9.3 C4 -10.1, 6.4 -9.9, 8.7 -9 C9 -8.6, 8.9 -8.2, 8.4 -8.1 '
  + 'C6.2 -8.5, 3.9 -8.2, 2 -7.6 Z';
const S_EYE = [1.9, -9.8, 0.85];

export class Critters {
  // svgRoot: the sprite layer (under the veil). glowRoot: the glow layer above
  // it — emissive parts (jelly glows, anglerfish lures) live there.
  constructor(svgRoot, glowRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    const group = svgRoot.querySelector('#critters');
    const glows = glowRoot.querySelector('#glows');
    this.time = 0;
    this.dt = 1 / 60;
    this.eelX = 0; this.eelY = 0;

    // Wander-leaders: schools split and join through these (docs/07).
    this.leaders = [];
    for (let i = 0; i < FLOCK.MAX_SCHOOLS; i++) {
      this.leaders.push({ active: false, x: 0, y: 0, hd: 0, phase: Math.random() * TAU });
    }

    // Species registry: name → { cfg (tuning.SPECIES record), list }.
    this.species = {};
    const reg = (name, list) => {
      this.species[name] = { cfg: SPECIES[name], list };
      return list;
    };

    this.minnows = reg('minnow', []);
    for (let i = 0; i < SPECIES.minnow.pool; i++) {
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
    this.rlx = new Float64Array(2 * R_N);   // reef outline scratch
    this.rly = new Float64Array(2 * R_N);
    this.olx = new Float64Array(2 * ROAMER_MAXN);   // roamer outline scratch
    this.oly = new Float64Array(2 * ROAMER_MAXN);

    // Roaming fish (salmon / barracuda / swordfish): one framework.
    this.roamers = [];
    for (const [key, vis] of Object.entries(ROAMERS)) {
      const list = reg(key, []);
      for (let i = 0; i < SPECIES[key].pool; i++) {
        const el = document.createElementNS(NS, 'path');
        el.setAttribute('class', 'roamer');
        el.setAttribute('display', 'none');
        group.appendChild(el);
        const eye = document.createElementNS(NS, 'circle');
        eye.setAttribute('class', 'roamer-eye');
        eye.setAttribute('display', 'none');
        group.appendChild(eye);
        list.push({
          el, eye, alive: false, x: 0, y: 0, hd: 0, speed: 0, greetCd: 0,
          outT: 0, size: 1, px: new Float64Array(vis.N), py: new Float64Array(vis.N),
          phase: Math.random() * TAU,
        });
      }
      this.roamers.push({ key, vis, list });
    }

    // greet-range corner brackets (glow layer — they read in the dark)
    this.brackets = [];
    for (let i = 0; i < BRK_POOL; i++) {
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('class', 'greet-bracket');
      el.setAttribute('display', 'none');
      glows.appendChild(el);
      this.brackets.push({ el, shown: false });
    }

    this.jellies = reg('jelly', []);
    for (let i = 0; i < SPECIES.jelly.pool; i++) {
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
        lastHue: -999, hueDir: 1, beatT: 0,
        phase: Math.random() * TAU, prevP: 0,
        tx: [], ty: [],
      });
    }

    this.reefs = reg('reef', []);
    for (let i = 0; i < SPECIES.reef.pool; i++) {
      // banded skin: a per-fish repeating gradient — bright hue alternating
      // with silvery grey-white, soft transitions (docs/07 feedback)
      const grad = document.createElementNS(NS, 'linearGradient');
      grad.setAttribute('id', `rgrad${i}`);
      grad.setAttribute('spreadMethod', 'repeat');
      grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
      grad.setAttribute('x2', '0.26'); grad.setAttribute('y2', '0.055');
      const stops = [];
      for (const [off, bright] of [[0, 1], [0.42, 1], [0.58, 0], [0.92, 0], [1, 1]]) {
        const s = document.createElementNS(NS, 'stop');
        s.setAttribute('offset', `${off * 100}%`);
        stops.push({ el: s, bright });
        grad.appendChild(s);
      }
      group.appendChild(grad);
      const el = document.createElementNS(NS, 'path');
      el.setAttribute('class', 'reef');
      el.setAttribute('fill', `url(#rgrad${i})`);
      el.setAttribute('display', 'none');
      group.appendChild(el);
      const eye = document.createElementNS(NS, 'circle');
      eye.setAttribute('class', 'reef-eye');
      eye.setAttribute('r', R_EYE_R);
      eye.setAttribute('display', 'none');
      group.appendChild(eye);
      this.reefs.push({
        el, eye, stops, alive: false, x: 0, y: 0, hd: 0, speed: 0, greetCd: 0,
        outT: 0, hue: 0, size: 1, px: new Float64Array(R_N), py: new Float64Array(R_N),
        phase: Math.random() * TAU, pulseIn: 1e9, pulseAge: 1e9, lastBright: '',
      });
    }

    this.seahorses = reg('seahorse', []);
    for (let i = 0; i < SPECIES.seahorse.pool; i++) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('display', 'none');
      const body = document.createElementNS(NS, 'path');
      body.setAttribute('class', 'seahorse');
      const stripes = document.createElementNS(NS, 'path');
      stripes.setAttribute('class', 'seahorse-stripes');
      const snout = document.createElementNS(NS, 'path');
      snout.setAttribute('class', 'seahorse');
      snout.setAttribute('d', S_SNOUT);
      const eye = document.createElementNS(NS, 'circle');
      eye.setAttribute('class', 'seahorse-eye');
      eye.setAttribute('cx', S_EYE[0]);
      eye.setAttribute('cy', S_EYE[1]);
      eye.setAttribute('r', S_EYE[2]);
      g.appendChild(body);
      g.appendChild(stripes);
      g.appendChild(snout);
      g.appendChild(eye);
      group.appendChild(g);
      this.seahorses.push({
        g, body, stripes, snout, alive: false, x: 0, y: 0, hx: 0, hy: 0,
        greetCd: 0, outT: 0, flip: 1, pair: -1, spinAge: 1e9,
        phase: Math.random() * TAU,
      });
    }

    this.octos = reg('octopus', []);
    this.giants = reg('giantOcto', []);
    const buildOcto = (list, scale) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('display', 'none');
      const tents = [];
      for (let k = 0; k < O_TENT_N; k++) {
        const t = document.createElementNS(NS, 'path');
        t.setAttribute('class', 'octo-tent');
        g.appendChild(t);
        tents.push(t);
      }
      // a rounder head, with proper eye protuberances: two bumps on the
      // crown, each carrying a pupil
      const head = document.createElementNS(NS, 'ellipse');
      head.setAttribute('class', 'octo-body');
      const bumpL = document.createElementNS(NS, 'circle');
      const bumpR = document.createElementNS(NS, 'circle');
      const pupL = document.createElementNS(NS, 'circle');
      const pupR = document.createElementNS(NS, 'circle');
      for (const b of [bumpL, bumpR]) b.setAttribute('class', 'octo-body');
      for (const p of [pupL, pupR]) p.setAttribute('class', 'octo-pupil');
      g.appendChild(bumpL);
      g.appendChild(bumpR);
      g.appendChild(head);
      g.appendChild(pupL);
      g.appendChild(pupR);
      group.appendChild(g);
      list.push({
        g, head, bumpL, bumpR, pupL, pupR, tents, scale,
        alive: false, x: 0, y: 0, vx: 0, vy: 0, hd: 0, greetCd: 0, outT: 0,
        hue: O_HUE, camoT: 0, startleCd: 0, baseRgb: [1, 1, 1],
        phase: Math.random() * TAU, prevP: 0, lastFill: '', tx: [], ty: [],
      });
    };
    for (let i = 0; i < SPECIES.octopus.pool; i++) buildOcto(this.octos, 1);
    for (let i = 0; i < SPECIES.giantOcto.pool; i++) buildOcto(this.giants, GIANT_SCALE);

    this.anglers = reg('angler', []);
    for (let i = 0; i < SPECIES.angler.pool; i++) {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('display', 'none');
      const body = document.createElementNS(NS, 'path');
      body.setAttribute('class', 'angler');
      body.setAttribute('d', A_BODY);
      const teeth = document.createElementNS(NS, 'path');
      teeth.setAttribute('class', 'angler-teeth');
      teeth.setAttribute('d', A_TEETH);
      const stalk = document.createElementNS(NS, 'path');
      stalk.setAttribute('class', 'angler-stalk');
      stalk.setAttribute('d', A_STALK);
      const eye = document.createElementNS(NS, 'circle');
      eye.setAttribute('class', 'angler-eye');
      eye.setAttribute('cx', A_EYE[0]);
      eye.setAttribute('cy', A_EYE[1]);
      eye.setAttribute('r', A_EYE[2]);
      g.appendChild(body);
      g.appendChild(teeth);
      g.appendChild(stalk);
      g.appendChild(eye);
      group.appendChild(g);
      const lure = document.createElementNS(NS, 'circle');
      lure.setAttribute('class', 'angler-lure');
      lure.setAttribute('fill', 'url(#glow-grad)');
      lure.setAttribute('display', 'none');
      glows.appendChild(lure);
      this.anglers.push({
        g, body, lure, alive: false, x: 0, y: 0, hd: 0, greetCd: 0, outT: 0,
        flareT: 0, phase: Math.random() * TAU,
      });
    }

  }

  inView(x, y, pad = 0) {
    const v = this.view;
    return x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad;
  }

  // ---- The spawn tensor (docs/09) -----------------------------------------

  // One candidate attempt for a banded species. Strictly-offscreen point in
  // the vicinity ∩ band range (× an optional x window — the fast-travel
  // backfill confines candidates to the freshly swept strip), accepted with
  // bandW · f_x · c^N. Returns the point or null (the attempt just waits).
  bandCandidate(sp, pAccept, worldH, xr) {
    const bands = sp.bands;
    let yLo = 1, yHi = 0;
    for (const [a, b] of bands) { yLo = Math.min(yLo, a); yHi = Math.max(yHi, b); }
    const y0 = Math.max(this.vic.y0, yLo * worldH, 20);
    const y1 = Math.min(this.vic.y1, yHi * worldH, worldH - 20);
    if (y1 <= y0) return null;
    const xLo = xr ? xr[0] : this.vic.x0;
    const xHi = xr ? xr[1] : this.vic.x1;
    for (let tries = 0; tries < 8; tries++) {
      const x = xLo + Math.random() * (xHi - xLo);
      const y = y0 + Math.random() * (y1 - y0);
      if (this.inView(x, y)) continue;
      const w = bandW(bands, y / worldH) * xWeight(x, sp) * pAccept;
      if (Math.random() < w) return [x, y];
      return null;   // one weighted roll per attempt — the field stays honest
    }
    return null;
  }

  // One full spawn attempt for a species (slot, damping, candidate, spawn).
  attempt(S, arrive, worldH, spawnFn, xr) {
    const slot = S.list.find(c => !c.alive);
    if (!slot) return;
    let n = 0;
    for (const c of S.list) if (c.alive) n++;
    const pN = Math.pow(dampC(S.cfg, arrive), n);
    if (S.cfg.kelp) {   // seahorses: the kelp field replaces bands/hotspots
      const life = progress.value('life');
      const dens = progress.dial(DIALS.kelp) * (1 + KELP_GROWTH.DENSITY * life);
      const tall = 1 + KELP_GROWTH.HEIGHT * life;
      const anchors = kelpAnchors(xr ? xr[0] : this.vic.x0, xr ? xr[1] : this.vic.x1, dens);
      for (let tries = 0; tries < 6; tries++) {
        const a = anchors[(Math.random() * anchors.length) | 0];
        if (!a) break;
        // the home strand roots on the TERRAIN now (docs/10)
        const rootY = (this.fl ? this.fl(a.x) : worldH + 4) + 6;
        const perch = rootY - a.h * REF_H * tall * (0.35 + Math.random() * 0.5);
        const x = a.x + (Math.random() - 0.5) * 26;
        if (perch < this.vic.y0 || perch > this.vic.y1) continue;   // stay in the vicinity
        if (this.inView(x, perch)) continue;
        if (Math.random() < pN) spawnFn(slot, x, perch, a);
        return;
      }
      return;
    }
    const pt = this.bandCandidate(S.cfg, pN, worldH, xr);
    if (pt) spawnFn(slot, pt[0], pt[1]);
  }

  // Per-species spawn tick: attempts arrive at rate·arrive/s; each accepted
  // candidate goes to spawnFn(slot, x, y, extra).
  spawnTick(name, worldH, spawnFn) {
    const S = this.species[name];
    const arrive = progress.dial(S.cfg.arrive);
    if (arrive <= 0) return;
    if (Math.random() >= S.cfg.rate * arrive * this.dt) return;
    this.attempt(S, arrive, worldH, spawnFn, null);
  }

  // Shared spawn bookkeeping: alive, hidden until the renderer's first
  // in-pad write (docs/07 "no pops" — stale-geometry reveals were a real bug).
  wake(c, x, y) {
    c.alive = true;
    c.outT = 0;
    c.shown = false;
    c.x = x; c.y = y;
    c.greetCd = 0;
    c.followT = 0;
  }

  // ---- Per-species spawners ------------------------------------------------

  spawnMinnow(m, x, y, worldH) {
    // JOIN_BIAS (docs/07): most new minnows appear beside an existing school
    // (still strictly offscreen and inside the band — otherwise keep the
    // tensor's point).
    const active = this.leaders.filter(L => L.active);
    if (active.length && Math.random() < FLOCK.JOIN_BIAS) {
      const L = active[(Math.random() * active.length) | 0];
      const band = SPECIES.minnow.bands;
      for (let tries = 0; tries < 8; tries++) {
        const a = Math.random() * TAU, r = 120 + Math.random() * 160;
        const nx = L.x + Math.cos(a) * r;
        const ny = clamp(L.y + Math.sin(a) * r,
          band[0][0] * worldH + 20, band[band.length - 1][1] * worldH - 20);
        if (!this.inView(nx, ny)) { x = nx; y = ny; break; }
      }
    }
    this.wake(m, x, y);
    m.school = this.nearestLeader(x, y);
    m.hd = Math.random() * TAU;
    m.speed = M_SPEED;
    m.size = sizeJit();
    m.eye.setAttribute('r', (M_EYE_R * m.size).toFixed(2));
    for (let j = 0; j < M_N; j++) {
      m.px[j] = m.x - Math.cos(m.hd) * j * (M_LEN * m.size / (M_N - 1));
      m.py[j] = m.y - Math.sin(m.hd) * j * (M_LEN * m.size / (M_N - 1));
    }
  }

  spawnJelly(j, x, y) {
    this.wake(j, x, y);
    j.vx = 0; j.vy = 0;
    j.hd = -Math.PI / 2;
    j.size = sizeJit();
    j.hueDir = Math.random() < 0.5 ? -1 : 1;   // this lantern's pulse direction
    j.lastHue = -999;
    j.beatT = 0;
    j.tx = []; j.ty = [];
    for (let k = 0; k < J_TENT_N; k++) {
      const xs = new Float64Array(J_TENT_PTS), ys = new Float64Array(J_TENT_PTS);
      const rx = j.x + (k / (J_TENT_N - 1) - 0.5) * J_R * j.size * 1.2;
      for (let p = 0; p < J_TENT_PTS; p++) { xs[p] = rx; ys[p] = j.y + p * J_TENT_SEG * j.size; }
      j.tx.push(xs); j.ty.push(ys);
    }
  }

  spawnReef(r, x, y) {
    this.wake(r, x, y);
    r.hd = Math.random() * TAU;
    r.speed = R_SPEED;
    r.size = sizeJit();
    r.hue = R_HUE_BASE + (Math.random() * 2 - 1) * R_HUE_VAR;
    r.pulseIn = 2 + Math.random() * 8;
    r.pulseAge = 1e9;
    r.lastBright = '';
    const seg = R_LEN * r.size / (R_N - 1);
    for (let j = 0; j < R_N; j++) {
      r.px[j] = r.x - Math.cos(r.hd) * j * seg;
      r.py[j] = r.y - Math.sin(r.hd) * j * seg;
    }
    this.reefStops(r, 0);
  }

  // Paint a reef fish's band gradient: bright stops carry the fish's hue
  // (lightening under a shimmer pulse), silver stops stay neutral.
  reefStops(r, env) {
    const bright = `hsl(${r.hue.toFixed(0)}, ${(R_BRIGHT_SAT + 18 * env).toFixed(0)}%, ${(R_BRIGHT_LUM + 24 * env).toFixed(0)}%)`;
    if (bright === r.lastBright) return;
    r.lastBright = bright;
    for (const s of r.stops) {
      s.el.setAttribute('stop-color', s.bright ? bright : R_SILVER);
    }
  }

  spawnSeahorse(s, x, y) {
    this.wake(s, x, y);
    s.hx = x; s.hy = y;             // home perch
    s.flip = Math.random() < 0.5 ? -1 : 1;
    s.spinAge = 1e9;
    s.pair = -1;
    s.hue = S_HUE[0] + Math.random() * (S_HUE[1] - S_HUE[0]);
    const scale = sizeJit();
    s.sc = scale;
    s.body.setAttribute('d', seahorsePath(scale));
    s.stripes.setAttribute('d', seahorseStripes(scale));
    s.body.setAttribute('fill', `hsl(${s.hue.toFixed(0)}, 55%, 52%)`);
    // the pair vignette (docs/07 catalog): at high LIFE, love arrives with you
    if (progress.value('life') > S_PAIR_LIFE && Math.random() < S_PAIR_P) {
      const idx = this.seahorses.indexOf(s);
      const mate = this.seahorses.find(o => !o.alive && o !== s);
      if (mate) {
        this.wake(mate, x + 22 * s.flip, y + 4);
        mate.hx = mate.x; mate.hy = mate.y;
        mate.flip = -s.flip;         // face each other
        mate.spinAge = 1e9;
        mate.hue = S_HUE[0] + Math.random() * (S_HUE[1] - S_HUE[0]);
        const mScale = sizeJit();
        mate.sc = mScale;
        mate.body.setAttribute('d', seahorsePath(mScale));
        mate.stripes.setAttribute('d', seahorseStripes(mScale));
        mate.body.setAttribute('fill', `hsl(${mate.hue.toFixed(0)}, 55%, 52%)`);
        mate.pair = idx;
        s.pair = this.seahorses.indexOf(mate);
      }
    }
  }

  spawnOcto(o, x, y) {
    this.wake(o, x, y);
    o.vx = 0; o.vy = 0;
    o.hd = Math.random() < 0.5 ? 0 : Math.PI;
    o.size = sizeJit();
    o.hue = O_HUE + (Math.random() * 2 - 1) * 22;
    o.baseRgb = hslRgb(o.hue, O_SAT, O_LUM);
    o.camoT = 0;
    o.startleCd = 0;
    o.lastFill = '';
    o.tx = []; o.ty = [];
    const R = O_R * o.scale * o.size;
    for (let k = 0; k < O_TENT_N; k++) {
      const xs = new Float64Array(O_TENT_PTS), ys = new Float64Array(O_TENT_PTS);
      const rx = o.x + (k / (O_TENT_N - 1) - 0.5) * R * O_TENT_SPREAD;
      for (let p = 0; p < O_TENT_PTS; p++) { xs[p] = rx; ys[p] = o.y + R * 0.4 + p * R * O_TENT_SEG; }
      o.tx.push(xs); o.ty.push(ys);
    }
  }

  spawnAngler(a, x, y) {
    this.wake(a, x, y);
    a.hd = Math.random() < 0.5 ? 0 : Math.PI;
    a.size = sizeJit();
    a.flareT = 0;
  }

  spawnRoamer(f, vis, x, y) {
    this.wake(f, x, y);
    f.hd = Math.random() < 0.5 ? 0 : Math.PI;   // roamers travel laterally
    f.speed = vis.speed;
    f.size = sizeJit();
    f.eye.setAttribute('r', (vis.eyeR * f.size).toFixed(2));
    const seg = vis.len * f.size / (vis.N - 1);
    for (let j = 0; j < vis.N; j++) {
      f.px[j] = f.x - Math.cos(f.hd) * j * seg;
      f.py[j] = f.y - Math.sin(f.hd) * j * seg;
    }
  }

  hide(c) {
    c.alive = false;
    c.shown = false;
    (c.g || c.el).setAttribute('display', 'none');
    if (c.eye) c.eye.setAttribute('display', 'none');
    if (c.glow) c.glow.setAttribute('display', 'none');
    if (c.lure) c.lure.setAttribute('display', 'none');
    if (c.pair >= 0) {   // widowed partner unpairs, keeps bobbing
      const mate = this.seahorses[c.pair];
      if (mate) mate.pair = -1;
      c.pair = -1;
    }
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

  // Greet-highlight bookkeeping: stamp the rising edge so the bracket can
  // announce itself and then politely fade (docs/07).
  setHl(c, hl) {
    if (hl && !c.hl) c.hlT0 = this.time;
    c.hl = hl;
  }

  // Bracket opacity envelope: full for the first third-second, then a quick
  // smooth drop to 15% by the half-second mark (still pulsing throughout).
  hlEnv(c) {
    const a = this.time - (c.hlT0 || 0);
    if (a <= 1 / 3) return 1;
    const u = clamp((a - 1 / 3) / (0.5 - 1 / 3), 0, 1);
    return lerp(1, 0.15, u * u * (3 - 2 * u));
  }

  // Lightweight same-species flocking (docs/09): cohesion toward the local
  // centroid, alignment with the local mean heading, close-range separation.
  // O(n²) within a species — pools are small, this is cheap.
  flockNudge(list, f, cfg) {
    let cx = 0, cy = 0, hx = 0, hy = 0, n = 0, sepX = 0, sepY = 0;
    for (const o of list) {
      if (o === f || !o.alive) continue;
      const dx = o.x - f.x, dy = o.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d > cfg.r) continue;
      cx += o.x; cy += o.y;
      hx += Math.cos(o.hd); hy += Math.sin(o.hd);
      n++;
      if (d < cfg.sep && d > 1e-6) { sepX -= dx / d; sepY -= dy / d; }
    }
    if (!n) return null;
    return { cx: cx / n, cy: cy / n, mh: Math.atan2(hy, hx), sepX, sepY };
  }

  // Befriended-follow rubberbanding (docs/07): slightly faster than the eel
  // when far, easing to slightly slower up close — a drifting escort.
  followSpeed(eel, d) {
    const k = clamp((d - FOLLOW.NEAR) / (FOLLOW.FAR - FOLLOW.NEAR), 0, 1);
    return Math.max(FOLLOW.MIN, eel.speed * lerp(FOLLOW.SLOW, FOLLOW.FAST, k));
  }

  // Blank-slate reset (docs/08): every critter out, schools disbanded. Since
  // the tensor has no population targets, dial-zero alone would leave the
  // in-vicinity fauna alive indefinitely — reset must evict explicitly.
  clear() {
    for (const S of Object.values(this.species)) {
      for (const c of S.list) if (c.alive) this.hide(c);
    }
    for (const L of this.leaders) L.active = false;
  }

  // Would anyone answer a greeting right now? main gates the greet on this —
  // no subject in range, no greet.
  anyGreetable(eel) {
    const near = (c, extra = 0) => c.alive && c.greetCd <= 0
      && Math.hypot(c.x - eel.x, c.y - eel.y) <= GREET.RANGE + extra;
    for (const m of this.minnows) if (near(m)) return true;
    for (const j of this.jellies) if (near(j)) return true;
    for (const r of this.reefs) if (near(r)) return true;
    for (const s of this.seahorses) if (near(s)) return true;
    for (const o of this.octos) if (near(o)) return true;
    for (const o of this.giants) if (near(o, 60)) return true;
    for (const a of this.anglers) if (near(a)) return true;
    for (const R of this.roamers) for (const f of R.list) if (near(f)) return true;
    return false;
  }

  // floorAt (optional, docs/10): the solid main-terrain surface — species
  // bottom clamps ride it (each keeps its old clearance margin), so deep
  // dwellers cruise over the dunes instead of through them.
  update(dt, eel, worldH, water, cam, viewW, viewH, foodPts, floorAt) {
    const t = (this.time += dt);
    this.dt = dt;
    this.fl = floorAt || (() => worldH);
    const fl = this.fl;
    this.eelX = eel.x; this.eelY = eel.y;
    this.feast = progress.dial(DIALS.minnowFeast);
    this.jellyPulse = progress.dial(DIALS.jellyHue);
    this.reefPulse = progress.dial(DIALS.reefPulse);
    this.greetReady = progress.dial(DIALS.greet) > 0;
    foodPts = foodPts || [];

    this.view = { x0: cam.x, y0: cam.y, x1: cam.x + viewW, y1: cam.y + viewH };
    this.vic = {
      x0: cam.x - VIC_PAD, y0: cam.y - VIC_PAD,
      x1: cam.x + viewW + VIC_PAD, y1: cam.y + viewH + VIC_PAD,
    };
    const inVic = (x, y) =>
      x >= this.vic.x0 && x <= this.vic.x1 && y >= this.vic.y0 && y <= this.vic.y1;

    // Cull anything long outside the vicinity (never anything visible), and
    // let a small offscreen retire rate keep flux under an idle camera.
    for (const S of Object.values(this.species)) {
      for (const c of S.list) {
        if (!c.alive) continue;
        c.outT = inVic(c.x, c.y) ? 0 : c.outT + dt;
        if (c.outT > CULL_T) { this.hide(c); continue; }
        if (!this.inView(c.x, c.y, RENDER_PAD) && Math.random() < SEA.RETIRE * dt) {
          this.hide(c);
        }
      }
    }

    // Spawns: one tensor tick per species (docs/09).
    const spawnFns = {
      minnow: (m, x, y) => this.spawnMinnow(m, x, y, worldH),
      jelly: (j, x, y) => this.spawnJelly(j, x, y),
      reef: (r, x, y) => this.spawnReef(r, x, y),
      seahorse: (s, x, y) => this.spawnSeahorse(s, x, y),
      octopus: (o, x, y) => this.spawnOcto(o, x, y),
      giantOcto: (o, x, y) => this.spawnOcto(o, x, y),
      angler: (a, x, y) => this.spawnAngler(a, x, y),
    };
    for (const R of this.roamers) {
      spawnFns[R.key] = (f, x, y) => this.spawnRoamer(f, R.vis, x, y);
    }
    for (const name of Object.keys(this.species)) {
      this.spawnTick(name, worldH, spawnFns[name]);
    }

    // FAST-TRAVEL BACKFILL (docs/09): a boosting eel sweeps fresh water into
    // the vicinity faster than the ambient attempt rate can populate it —
    // without this, outrunning the spawns means empty ocean until it refills.
    // Every swept view-width owes each species SEA.CATCHUP seconds' worth of
    // extra attempts, confined to the freshly entered offscreen strip (still
    // strictly no-pops; damping still shapes the accepted density).
    const prevCamX = this.lastCamX ?? cam.x;
    this.lastCamX = cam.x;
    const swept = Math.abs(cam.x - prevCamX);
    if (swept > 1.5 && swept < viewW * 2) {   // teleports don't owe spawns
      const xr = cam.x > prevCamX
        ? [this.view.x1, this.vic.x1] : [this.vic.x0, this.view.x0];
      const owed = Math.min(2, swept / viewW) * SEA.CATCHUP;
      for (const [name, S] of Object.entries(this.species)) {
        const arrive = progress.dial(S.cfg.arrive);
        if (arrive <= 0) continue;
        const a = S.cfg.rate * arrive * owed;
        let n = Math.min(6, Math.floor(a) + (Math.random() < a % 1 ? 1 : 0));
        while (n-- > 0) this.attempt(S, arrive, worldH, spawnFns[name], xr);
      }
    }

    // Schools: keep ceil(alive/SPLIT_SIZE) leaders (≤ cap) alive in the
    // vicinity; a new leader buds beside the biggest school (a split), and
    // leaders that drift together merge. Minnows re-target occasionally.
    let mAlive = 0;
    for (const m of this.minnows) if (m.alive) mAlive++;
    const mBand = SPECIES.minnow.bands;
    const bandY0 = () => Math.max(mBand[0][0] * worldH, this.vic.y0);
    const bandY1 = () => Math.min(mBand[mBand.length - 1][1] * worldH, this.vic.y1);
    const wantLeaders = clamp(Math.ceil(Math.max(mAlive, 1) / FLOCK.SPLIT_SIZE), 1, FLOCK.MAX_SCHOOLS);
    let nLeaders = 0;
    for (const L of this.leaders) if (L.active) nLeaders++;
    for (const L of this.leaders) {
      if (nLeaders >= wantLeaders) break;
      if (L.active) continue;
      const src = this.leaders.find(o => o.active);
      if (src) {   // bud beside an existing school: a split
        const a = Math.random() * TAU;
        L.x = src.x + Math.cos(a) * 220;
        L.y = clamp(src.y + Math.sin(a) * 160, mBand[0][0] * worldH, mBand[mBand.length - 1][1] * worldH);
      } else {
        L.x = this.vic.x0 + Math.random() * (this.vic.x1 - this.vic.x0);
        L.y = clamp((this.view.y0 + this.view.y1) / 2,
          mBand[0][0] * worldH, mBand[mBand.length - 1][1] * worldH);
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
      if (!inVic(L.x, L.y)) {   // snapped back when the camera outruns it
        L.x = this.vic.x0 + Math.random() * (this.vic.x1 - this.vic.x0);
        L.y = clamp(this.vic.y0 + Math.random() * (this.vic.y1 - this.vic.y0),
          mBand[0][0] * worldH, mBand[mBand.length - 1][1] * worldH);
      }
      L.hd += Math.sin(t * 0.23 + L.phase) * 0.7 * dt;
      if (L.x < this.vic.x0 + M_XPAD) L.hd = expApproach(L.hd, 0, dt, 0.5);
      if (L.x > this.vic.x1 - M_XPAD) L.hd = expApproach(L.hd, Math.PI, dt, 0.5);
      if (L.y < bandY0() + 80) L.hd = expApproach(L.hd, Math.PI / 2, dt, 0.5);
      if (L.y > bandY1() - 80) L.hd = expApproach(L.hd, -Math.PI / 2, dt, 0.5);
      L.x += Math.cos(L.hd) * L_SPEED * dt;
      L.y += Math.sin(L.hd) * L_SPEED * dt;
    }

    // ---- Minnow steering: circulate a slot around your school's leader.
    const slotIdx = new Array(this.leaders.length).fill(0);
    const alive = this.minnows.filter(m => m.alive);
    for (let i = 0; i < alive.length; i++) {
      const m = alive[i];
      m.greetCd = Math.max(0, m.greetCd - dt);
      if (Math.random() < FLOCK.RETARGET * dt) m.school = this.nearestLeader(m.x, m.y);
      let L = this.leaders[m.school];
      if (!L || !L.active) { m.school = this.nearestLeader(m.x, m.y); L = this.leaders[m.school]; }
      const si = slotIdx[m.school]++;

      // Greeted minnows swarm the eel (docs/07) — rubberbanding to its pace,
      // to any depth (band-keeping is the school's job, and they've left it).
      m.followT = Math.max(0, (m.followT || 0) - dt);
      const following = m.followT > 0;
      const slotA = t * M_ORBIT_F * (following ? 1.1 : 1) + si * (TAU / 7) + m.phase * 0.3;
      let txp, typ;
      if (following) {
        txp = eel.x + Math.cos(slotA) * (M_FOLLOW_R + si * 3);
        typ = eel.y + Math.sin(slotA) * (M_FOLLOW_R + si * 3) * 0.7;
      } else {
        txp = L.x + Math.cos(slotA) * (M_ORBIT_R + si * M_ORBIT_STEP);
        typ = L.y + Math.sin(slotA) * (M_ORBIT_R + si * M_ORBIT_STEP) * 0.6;
      }
      // WORLD MAGIC feast: swarm toward nearby falling food (never eat it)
      if (!following && this.feast > 0 && foodPts.length) {
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
      const ex = m.x - eel.x, ey = m.y - eel.y;
      const ed = Math.hypot(ex, ey);
      let speedT = following ? this.followSpeed(eel, ed) : M_SPEED;
      let fleeing = false;
      // greet-range highlight: the bracket pass frames whoever would respond
      this.setHl(m, this.greetReady && m.greetCd <= 0 && ed <= GREET.RANGE);
      if (!following && ed < M_FLEE_R && eel.speedSm > M_FLEE_SPEED) {
        txp = m.x + (ex / ed) * 200;
        typ = m.y + (ey / ed) * 200;
        speedT = M_DART;
        fleeing = true;
      }
      const desired = Math.atan2(typ - m.y, txp - m.x);
      const mTurn = M_TURN * (following ? FOLLOW.TURN : 1);
      m.hd += clamp(angleDiff(desired, m.hd), -mTurn * dt, mTurn * dt);
      m.speed = expApproach(m.speed, speedT, dt, M_TAU_SPEED);
      m.x += Math.cos(m.hd) * m.speed * dt;
      m.y += Math.sin(m.hd) * m.speed * dt;
      m.y = clamp(m.y, 20, fl(m.x) - 20);

      m.px[0] = m.x; m.py[0] = m.y;
      const seg = M_LEN * (m.size || 1) / (M_N - 1);
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

    // ---- Jellyfish
    const jBand = SPECIES.jelly.bands;
    for (const j of this.jellies) {
      if (!j.alive) continue;
      j.greetCd = Math.max(0, j.greetCd - dt);
      j.beatT = Math.max(0, j.beatT - dt);
      this.setHl(j, this.greetReady && j.greetCd <= 0
        && Math.hypot(j.x - eel.x, j.y - eel.y) <= GREET.RANGE);
      const p = Math.pow(Math.max(0, Math.sin(t * TAU / J_PULSE_T + j.phase)), 2);
      const dp = Math.max(0, p - j.prevP);
      j.prevP = p;
      j.hd += Math.sin(t * J_WANDER_F + j.phase * 1.7) * 0.35 * dt;
      // a greeted jelly leans its pulses toward you — a gentle, hopeless chase
      j.followT = Math.max(0, (j.followT || 0) - dt);
      if (j.followT > 0) {
        const jd = Math.hypot(eel.x - j.x, eel.y - j.y);
        if (jd > J_FOLLOW_NEAR) {
          const want = Math.atan2(eel.y - j.y, eel.x - j.x);
          j.hd += clamp(angleDiff(want, j.hd), -J_FOLLOW_TURN * dt, J_FOLLOW_TURN * dt);
        }
      }
      // band-keeping, suspended while following — a smitten jelly may
      // briefly leave its comfort zone to chase you
      if (j.followT <= 0) {
        const yf = j.y / worldH;
        if (yf < jBand[0][0]) j.hd = expApproach(j.hd, Math.PI / 2, dt, 0.8);
        if (yf > jBand[jBand.length - 1][1]) j.hd = expApproach(j.hd, -Math.PI / 2, dt, 0.8);
      }
      j.vx += Math.cos(j.hd) * J_KICK * dp;
      j.vy += Math.sin(j.hd) * J_KICK * dp;
      const drag = Math.exp(-dt * J_DRAG);
      j.vx *= drag; j.vy *= drag;
      j.x += j.vx * dt;
      j.y = clamp(j.y + j.vy * dt, 60, fl(j.x) - 60);
      j.pulse = p;

      const pull = 1 - Math.exp(-dt / J_TENT_TAU);
      const js = j.size || 1;
      for (let k = 0; k < J_TENT_N; k++) {
        const xs = j.tx[k], ys = j.ty[k];
        const rootX = j.x + (k / (J_TENT_N - 1) - 0.5) * J_R * js * 1.2 * (1 - 0.18 * p);
        const rootY = j.y + J_R * js * 0.15;
        const seg = J_TENT_SEG * js;
        for (let q = 1; q < J_TENT_PTS; q++) {
          const sway = Math.sin(t * 0.9 + q * 0.8 + k * 1.6 + j.phase) * J_TENT_SWAY * dt;
          xs[q] += sway + (rootX - xs[q]) * pull * 0.3;
          ys[q] += (rootY + q * seg - ys[q]) * pull;
        }
        xs[0] = rootX; ys[0] = rootY;
        for (let q = 1; q < J_TENT_PTS; q++) {
          let dx = xs[q] - xs[q - 1], dy = ys[q] - ys[q - 1];
          const d = Math.hypot(dx, dy);
          if (d > 1e-6) { dx /= d; dy /= d; } else { dx = 0; dy = 1; }
          xs[q] = xs[q - 1] + dx * seg;
          ys[q] = ys[q - 1] + dy * seg;
        }
      }
    }

    // ---- Reef fish: solo wanderers with a shimmer in them
    const rBand = SPECIES.reef.bands;
    for (const r of this.reefs) {
      if (!r.alive) continue;
      r.greetCd = Math.max(0, r.greetCd - dt);
      r.followT = Math.max(0, (r.followT || 0) - dt);
      const following = r.followT > 0;
      const ex = r.x - eel.x, ey = r.y - eel.y;
      const ed = Math.hypot(ex, ey);
      this.setHl(r, this.greetReady && r.greetCd <= 0 && ed <= GREET.RANGE);
      let txp, typ, speedT;
      if (following) {
        const a = t * 0.5 + r.phase;
        txp = eel.x + Math.cos(a) * R_FOLLOW_R;
        typ = eel.y + Math.sin(a) * R_FOLLOW_R * 0.7;
        speedT = this.followSpeed(eel, ed);
      } else {
        r.hd += (Math.sin(t * 0.31 + r.phase) + Math.sin(t * 0.13 + r.phase * 2.1)) * 0.5 * dt;
        txp = r.x + Math.cos(r.hd) * 60;
        typ = r.y + Math.sin(r.hd) * 60;
        speedT = R_SPEED;
        const yf = r.y / worldH;   // band-keeping
        if (yf < rBand[0][0]) typ = r.y + 120;
        if (yf > rBand[rBand.length - 1][1]) typ = r.y - 120;
        if (ed < R_FLEE_R && eel.speedSm > R_FLEE_SPEED) {
          txp = r.x + (ex / (ed || 1)) * 200;
          typ = r.y + (ey / (ed || 1)) * 200;
          speedT = R_DART;
        } else {
          // loose shoals (docs/09): reef fish drift together
          const fl = this.flockNudge(this.reefs, r, R_FLOCK);
          if (fl) {
            txp = lerp(txp, fl.cx, R_FLOCK.coh);
            typ = lerp(typ, fl.cy, R_FLOCK.coh);
            r.hd += angleDiff(fl.mh, r.hd) * Math.min(1, R_FLOCK.align * dt);
            txp += fl.sepX * R_FLOCK.sep;
            typ += fl.sepY * R_FLOCK.sep;
          }
        }
      }
      const desired = Math.atan2(typ - r.y, txp - r.x);
      const rTurn = R_TURN * (following ? FOLLOW.TURN : 1);
      r.hd += clamp(angleDiff(desired, r.hd), -rTurn * dt, rTurn * dt);
      r.speed = expApproach(r.speed, speedT, dt, R_TAU_SPEED);
      // wiggle clock rides speed; amplitude stays damped (see render)
      r.wph = (r.wph || 0) + dt * R_WAVE_F * (0.6 + 0.9 * Math.min(2.6, r.speed / R_SPEED));
      r.x += Math.cos(r.hd) * r.speed * dt;
      r.y = clamp(r.y + Math.sin(r.hd) * r.speed * dt, 20, fl(r.x) - 20);
      // the spine trails the head — the wiggle rides this chain at render
      r.px[0] = r.x; r.py[0] = r.y;
      const seg = R_LEN * r.size / (R_N - 1);
      for (let jp = 1; jp < R_N; jp++) {
        let dx = r.px[jp] - r.px[jp - 1], dy = r.py[jp] - r.py[jp - 1];
        const d = Math.hypot(dx, dy) || 1;
        r.px[jp] = r.px[jp - 1] + (dx / d) * seg;
        r.py[jp] = r.py[jp - 1] + (dy / d) * seg;
      }
      // the WORLD MAGIC shimmer pulse (pulse discipline: rare, eased)
      if (this.reefPulse > 0) {
        r.pulseIn -= dt * (0.35 + 0.65 * this.reefPulse);
        if (r.pulseIn <= 0) {
          r.pulseIn = R_PULSE_GAP[0] + Math.random() * (R_PULSE_GAP[1] - R_PULSE_GAP[0]);
          r.pulseAge = 0;
        }
      }
      if (r.pulseAge < R_PULSE_T) r.pulseAge += dt;
    }

    // ---- Seahorses: bob at home; pairs drift together and curl
    for (const s of this.seahorses) {
      if (!s.alive) continue;
      s.greetCd = Math.max(0, s.greetCd - dt);
      if (s.spinAge < S_SPIN_T) s.spinAge += dt;
      this.setHl(s, this.greetReady && s.greetCd <= 0
        && Math.hypot(s.x - eel.x, s.y - eel.y) <= GREET.RANGE);
      const mate = s.pair >= 0 ? this.seahorses[s.pair] : null;
      if (mate && mate.alive) {
        // pair magnetism: homes ease together until the tails can touch
        const dx = mate.hx - s.hx;
        const gap = Math.abs(dx) - S_PAIR_D;
        if (gap > 0) s.hx += Math.sign(dx) * Math.min(gap, 6 * dt);
        s.flip = dx >= 0 ? 1 : -1;   // face your partner
        if (Math.abs(dx) < S_PAIR_D * 1.6 && water
            && Math.random() < S_PAIR_HEART * dt) {
          // the vignette: curled tails, a tiny shared heart (render pops it)
          s.pairHeart = true;
        }
      }
      s.x = s.hx + Math.sin(t * 0.31 + s.phase * 1.7) * S_SWAY_A;
      s.y = s.hy + Math.sin(t * S_BOB_F + s.phase) * S_BOB_A;
    }

    // ---- Octopuses (and the giant): slow jets, camouflage, startle dodge
    const octoBands = { octopus: SPECIES.octopus.bands, giantOcto: SPECIES.giantOcto.bands };
    for (const [name, list] of [['octopus', this.octos], ['giantOcto', this.giants]]) {
      const bands = octoBands[name];
      const giant = name === 'giantOcto';
      const pulseT = giant ? GIANT_PULSE_T : O_PULSE_T;
      for (const o of list) {
        if (!o.alive) continue;
        o.greetCd = Math.max(0, o.greetCd - dt);
        o.startleCd = Math.max(0, o.startleCd - dt);
        o.camoT = Math.max(0, o.camoT - dt);
        const ex = o.x - eel.x, ey = o.y - eel.y;
        const ed = Math.hypot(ex, ey);
        this.setHl(o, this.greetReady && o.greetCd <= 0 && ed <= GREET.RANGE + (giant ? 60 : 0));
        // the startle dodge: a fast eel in its space and it jets away in a
        // puff of bubbles (the giant is above such things — docs/09)
        if (!giant && o.startleCd <= 0 && ed < O_STARTLE_R && eel.speedSm > O_STARTLE_SPEED) {
          o.startleCd = O_STARTLE_CD;
          const push = O_JET_AWAY / (ed || 1);
          o.vx += ex * push;
          o.vy += ey * push;
          if (water) water.burst(o.x, o.y, 5);
        }
        const p = Math.pow(Math.max(0, Math.sin(t * TAU / pulseT + o.phase)), 2);
        const dp = Math.max(0, p - o.prevP);
        o.prevP = p;
        o.pulse = p;
        o.hd += Math.sin(t * O_WANDER_F + o.phase * 1.9) * 0.4 * dt;
        // horizontal bias + band-keeping
        const yf = o.y / worldH;
        if (yf < bands[0][0]) o.hd = expApproach(o.hd, Math.PI / 2, dt, 0.9);
        if (yf > bands[bands.length - 1][1]) o.hd = expApproach(o.hd, -Math.PI / 2, dt, 0.9);
        o.vx += Math.cos(o.hd) * O_KICK * o.scale * dp;
        o.vy += Math.sin(o.hd) * O_KICK * o.scale * dp * 0.6;
        const drag = Math.exp(-dt * O_DRAG);
        o.vx *= drag; o.vy *= drag;
        o.x += o.vx * dt;
        o.y = clamp(o.y + o.vy * dt, 60, fl(o.x) - 40);

        // tentacles: STIFF chains — advected with the body's motion (a diving
        // octopus takes its arms down with it), fast settle toward hanging,
        // and a soft COORDINATED idle wiggle (small per-arm phase offsets).
        // Before each jet the arms flare outward, then tuck as the kick fires.
        const R = O_R * o.scale * (o.size || 1);
        const pull = 1 - Math.exp(-dt / O_TENT_TAU);
        const theta = t * TAU / pulseT + o.phase;          // the jet cycle
        const flareA = Math.max(0, Math.sin(theta + 1.1)) * (1 - p);
        const spread = 1 + O_FLARE * flareA - O_TUCK * p;
        for (let k = 0; k < O_TENT_N; k++) {
          const xs = o.tx[k], ys = o.ty[k];
          const splayBase = (k / (O_TENT_N - 1) - 0.5) * O_TENT_SPREAD;
          const splay = splayBase * spread;   // flare fans the ARMS, not roots
          const rootX = o.x + splayBase * R * (1 - 0.15 * p);
          const rootY = o.y + R * 0.35;       // anchored under the mantle
          const seg = R * O_TENT_SEG;
          for (let q = 1; q < O_TENT_PTS; q++) {
            xs[q] += o.vx * dt * O_TENT_STIFF;   // ride the body — stiffness
            ys[q] += o.vy * dt * O_TENT_STIFF;
            const sway = Math.sin(t * 1.15 + q * 0.55 + k * 0.35 + o.phase)
              * O_IDLE_SWAY * o.scale * dt;
            xs[q] += sway + (rootX + splay * q * seg * 0.5 - xs[q]) * pull * 0.5;
            ys[q] += (rootY + q * seg - ys[q]) * pull;
          }
          xs[0] = rootX; ys[0] = rootY;
          for (let q = 1; q < O_TENT_PTS; q++) {
            let dx = xs[q] - xs[q - 1], dy = ys[q] - ys[q - 1];
            const d = Math.hypot(dx, dy);
            if (d > 1e-6) { dx /= d; dy /= d; } else { dx = 0; dy = 1; }
            xs[q] = xs[q - 1] + dx * seg;
            ys[q] = ys[q - 1] + dy * seg;
          }
        }
      }
    }

    // ---- Roaming fish: wander, band-keep, flee (mostly), follow when greeted
    for (const R of this.roamers) {
      const vis = R.vis;
      const bands = SPECIES[R.key].bands;
      for (const f of R.list) {
        if (!f.alive) continue;
        f.greetCd = Math.max(0, f.greetCd - dt);
        f.followT = Math.max(0, (f.followT || 0) - dt);
        const following = f.followT > 0;
        const ex = f.x - eel.x, ey = f.y - eel.y;
        const ed = Math.hypot(ex, ey);
        this.setHl(f, this.greetReady && f.greetCd <= 0 && ed <= GREET.RANGE);
        let txp, typ, speedT;
        if (following) {
          const a = t * 0.45 + f.phase;
          txp = eel.x + Math.cos(a) * ROAMER_FOLLOW_R;
          typ = eel.y + Math.sin(a) * ROAMER_FOLLOW_R * 0.7;
          speedT = this.followSpeed(eel, ed);
        } else {
          f.hd += (Math.sin(t * 0.27 + f.phase) + Math.sin(t * 0.11 + f.phase * 2.3)) * 0.4 * dt;
          txp = f.x + Math.cos(f.hd) * 80;
          typ = f.y + Math.sin(f.hd) * 80;
          speedT = vis.speed;
          const yf = f.y / worldH;   // band-keeping
          if (yf < bands[0][0]) typ = f.y + 140;
          if (yf > bands[bands.length - 1][1]) typ = f.y - 140;
          if (vis.fleeR > 0 && ed < vis.fleeR && eel.speedSm > vis.fleeS) {
            txp = f.x + (ex / (ed || 1)) * 220;
            typ = f.y + (ey / (ed || 1)) * 220;
            speedT = vis.dart;
          } else if (vis.flock) {
            // shoaling: drift toward the local school, match its heading
            const fl = this.flockNudge(R.list, f, vis.flock);
            if (fl) {
              txp = lerp(txp, fl.cx, vis.flock.coh);
              typ = lerp(typ, fl.cy, vis.flock.coh);
              f.hd += angleDiff(fl.mh, f.hd) * Math.min(1, vis.flock.align * dt);
              txp += fl.sepX * vis.flock.sep;
              typ += fl.sepY * vis.flock.sep;
            }
          }
        }
        const desired = Math.atan2(typ - f.y, txp - f.x);
        const fTurn = vis.turn * (following ? FOLLOW.TURN : 1);
        f.hd += clamp(angleDiff(desired, f.hd), -fTurn * dt, fTurn * dt);
        f.speed = expApproach(f.speed, speedT, dt, 0.6);
        // the wiggle CLOCK rides speed (fast fish beat faster); its AMPLITUDE
        // stays damped at speed — see the render wave
        f.wph = (f.wph || 0) + dt * vis.waveF * (0.6 + 0.9 * Math.min(2.6, f.speed / vis.speed));
        f.x += Math.cos(f.hd) * f.speed * dt;
        f.y = clamp(f.y + Math.sin(f.hd) * f.speed * dt, 20, fl(f.x) - 20);
        f.px[0] = f.x; f.py[0] = f.y;
        const seg = vis.len * f.size / (vis.N - 1);
        for (let jp = 1; jp < vis.N; jp++) {
          let dx = f.px[jp] - f.px[jp - 1], dy = f.py[jp] - f.py[jp - 1];
          const d = Math.hypot(dx, dy) || 1;
          f.px[jp] = f.px[jp - 1] + (dx / d) * seg;
          f.py[jp] = f.py[jp - 1] + (dy / d) * seg;
        }
      }
    }

    // ---- Anglerfish: slow deep prowl
    const aBand = SPECIES.angler.bands;
    for (const a of this.anglers) {
      if (!a.alive) continue;
      a.greetCd = Math.max(0, a.greetCd - dt);
      a.flareT = Math.max(0, a.flareT - dt);
      this.setHl(a, this.greetReady && a.greetCd <= 0
        && Math.hypot(a.x - eel.x, a.y - eel.y) <= GREET.RANGE);
      a.hd += Math.sin(t * 0.14 + a.phase * 1.3) * 0.3 * dt;
      const yf = a.y / worldH;
      if (yf < aBand[0][0]) a.hd = expApproach(a.hd, Math.PI / 2, dt, 1.2);
      if (yf > aBand[aBand.length - 1][1]) a.hd = expApproach(a.hd, -Math.PI / 2, dt, 1.2);
      // keep it a lateral prowler: relax pitch toward horizontal
      const flat = Math.abs(angleDiff(a.hd, 0)) < Math.PI / 2 ? 0 : Math.PI;
      a.hd += angleDiff(flat, a.hd) * clamp(dt * 0.25, 0, 1);
      a.x += Math.cos(a.hd) * A_SPEED * dt;
      a.y = clamp(a.y + Math.sin(a.hd) * A_SPEED * dt, 40, fl(a.x) - 30);
    }

  }

  // One critter answers a greeting: hearts + the species' in-character
  // response. follow = false for SPONTANEOUS greets (docs/10) — the critter
  // says hello first but doesn't drop its routine to escort you.
  respond(kind, c, hearts, follow, vis) {
    c.greetCd = CRITTER_GREET_CD;
    switch (kind) {
      case 'minnow':
        if (follow) c.followT = FOLLOW.T;
        hearts.emit(c.x, c.y - 8, { ...MINNOW_HEART, delay: 0.15 + Math.random() * 0.5 });
        break;
      case 'jelly':
        if (follow) c.followT = J_FOLLOW_T;
        c.beatT = J_BEAT_T;   // the lantern beats like a heart (render)
        hearts.emit(c.x, c.y - J_R, JELLY_HEART);
        break;
      case 'reef':
        if (follow) c.followT = FOLLOW.T;
        hearts.emit(c.x, c.y - 10, {
          ...REEF_HEART, color: `hsl(${c.hue.toFixed(0)}, 85%, 72%)`,
        });
        break;
      case 'seahorse':
        c.spinAge = 0;   // the delighted pirouette (render)
        hearts.emit(c.x, c.y - 14, SEAHORSE_HEART);
        break;
      case 'octopus':
        c.camoT = O_CAMO_T;   // vanishes into the water color (render)
        hearts.emit(c.x, c.y - O_R * 1.4, OCTO_HEART);
        break;
      case 'giantOcto':
        c.camoT = O_CAMO_T * 1.6;   // a long, deliberate vanishing
        hearts.emit(c.x, c.y - O_R * GIANT_SCALE * 1.3, GIANT_HEART);
        break;
      case 'angler':
        c.flareT = A_FLARE_T;   // the lure flares
        hearts.emit(c.x, c.y - 16, ANGLER_HEART);
        break;
      default:   // roamers (salmon / barracuda / swordfish)
        if (follow) c.followT = FOLLOW.T;
        hearts.emit(c.x, c.y - 12, vis.heart);
    }
  }

  // Returns the responder count — main grants LOVE per responder (docs/10).
  greet(eel, hearts) {
    const inRange = (c, extra = 0) =>
      c.alive && c.greetCd <= 0 && Math.hypot(c.x - eel.x, c.y - eel.y) <= GREET.RANGE + extra;
    let n = 0;
    for (const m of this.minnows) if (inRange(m)) { this.respond('minnow', m, hearts, true); n++; }
    for (const j of this.jellies) if (inRange(j)) { this.respond('jelly', j, hearts, true); n++; }
    for (const r of this.reefs) if (inRange(r)) { this.respond('reef', r, hearts, true); n++; }
    for (const s of this.seahorses) if (inRange(s)) { this.respond('seahorse', s, hearts, true); n++; }
    for (const o of this.octos) if (inRange(o)) { this.respond('octopus', o, hearts, true); n++; }
    for (const o of this.giants) if (inRange(o, 60)) { this.respond('giantOcto', o, hearts, true); n++; }
    for (const a of this.anglers) if (inRange(a)) { this.respond('angler', a, hearts, true); n++; }
    for (const R of this.roamers) {
      for (const f of R.list) if (inRange(f)) { this.respond(R.key, f, hearts, true, R.vis); n++; }
    }
    return n;
  }

  // Spontaneous greeting (docs/10, the LOVE spontGreet dial): an on-screen,
  // off-cooldown critter near the eel may greet FIRST — the full in-character
  // response, but no befriend-follow (and main grants no LOVE for it).
  spontaneous(dt, eel, hearts, dial) {
    if (dial <= 0) return;
    const p = SPONT.RATE * dial * dt;
    const roll = (kind, c, vis, extra = 0) => {
      if (!c.alive || c.greetCd > 0 || Math.random() >= p) return;
      if (Math.hypot(c.x - eel.x, c.y - eel.y) > SPONT.RANGE + extra) return;
      if (!this.inView(c.x, c.y)) return;   // hellos from offscreen are noise
      this.respond(kind, c, hearts, false, vis);
    };
    for (const m of this.minnows) roll('minnow', m);
    for (const j of this.jellies) roll('jelly', j);
    for (const r of this.reefs) roll('reef', r);
    for (const s of this.seahorses) roll('seahorse', s);
    for (const o of this.octos) roll('octopus', o);
    for (const o of this.giants) roll('giantOcto', o, null, 60);
    for (const a of this.anglers) roll('angler', a);
    for (const R of this.roamers) for (const f of R.list) roll(R.key, f, R.vis);
  }

  render(hearts) {
    if (!this.view) return;
    const t = this.time;
    const light = progress.value('light');
    const lp = lightParams(light);   // octopus camouflage samples this
    const show = (c, pad, els) => {
      // the renderer owns visibility (docs/07 "no pops"): hide out of pad,
      // reveal only on the first in-pad write of this life
      if (!this.inView(c.x, c.y, pad)) {
        if (c.shown) {
          c.shown = false;
          for (const el of els) el.setAttribute('display', 'none');
        }
        return false;
      }
      return true;
    };
    const reveal = (c, els) => {
      if (!c.shown) {
        c.shown = true;
        for (const el of els) el.setAttribute('display', 'inline');
      }
    };

    const mlx = this.mlx, mly = this.mly;
    for (const m of this.minnows) {
      if (!m.alive) continue;
      if (!show(m, RENDER_PAD, [m.el, m.eye])) continue;
      const ms = m.size || 1;
      for (let j = 0; j < M_N; j++) {
        const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, M_N - 1);
        let tx = m.px[j1] - m.px[j0], ty = m.py[j1] - m.py[j0];
        const tm = Math.hypot(tx, ty) || 1;
        tx /= tm; ty /= tm;
        const wave = Math.sin(t * 9 + m.phase - j * 1.1) * M_WAVE * ms * (j / (M_N - 1));
        const cx = m.px[j] - ty * wave, cy = m.py[j] + tx * wave;
        mlx[j] = cx - ty * M_W[j] * ms;
        mly[j] = cy + tx * M_W[j] * ms;
        mlx[2 * M_N - 1 - j] = cx + ty * M_W[j] * ms;
        mly[2 * M_N - 1 - j] = cy - tx * M_W[j] * ms;
      }
      m.el.setAttribute('d', closedLoopPath(mlx, mly, 2 * M_N));
      const g = Math.pow(Math.max(0, Math.sin(m.hd * 2 + Math.sin(t * 0.7 + m.phase) * 1.4)), 3);
      m.el.setAttribute('fill', rgb(M_COL_A, M_COL_B, g));
      // the little dark eye dot: back along the body, on the upper side
      let ux = Math.sin(m.hd), uy = -Math.cos(m.hd);
      if (uy > 0) { ux = -ux; uy = -uy; }   // stay on the screen-upper side
      m.eye.setAttribute('cx', (m.x - Math.cos(m.hd) * M_EYE_BACK * ms + ux * M_EYE_UP * ms).toFixed(1));
      m.eye.setAttribute('cy', (m.y - Math.sin(m.hd) * M_EYE_BACK * ms + uy * M_EYE_UP * ms).toFixed(1));
      reveal(m, [m.el, m.eye]);
    }

    for (const j of this.jellies) {
      if (!j.alive) continue;
      // wider pad: tentacles and the glow spill past the bell
      if (!show(j, RENDER_PAD + 90, [j.g, j.glow])) continue;
      const p = j.pulse || 0;
      const w = J_R * (j.size || 1) * (1 - 0.18 * p);
      const h = J_R * (j.size || 1) * 1.05 * (1 + 0.28 * p);
      j.bell.setAttribute('d',
        `M${(j.x - w).toFixed(1)} ${j.y.toFixed(1)}` +
        `C${(j.x - w).toFixed(1)} ${(j.y - h).toFixed(1)} ${(j.x + w).toFixed(1)} ${(j.y - h).toFixed(1)} ${(j.x + w).toFixed(1)} ${j.y.toFixed(1)}` +
        `C${(j.x + w * 0.55).toFixed(1)} ${(j.y + h * 0.16).toFixed(1)} ${(j.x - w * 0.55).toFixed(1)} ${(j.y + h * 0.16).toFixed(1)} ${(j.x - w).toFixed(1)} ${j.y.toFixed(1)}Z`);
      // the lantern: long soft halo, shy of the approaching eel, with a
      // gentle always-on pulse — or, freshly greeted, a HEARTBEAT:
      // th-thump (pause) th-thump, shyness suspended (docs/07)
      let shy = clamp((Math.hypot(j.x - this.eelX, j.y - this.eelY) - J_SHY_NEAR)
        / (J_SHY_FAR - J_SHY_NEAR), J_SHY_MIN, 1);
      let glowPulse = 1 + J_GLOW_PULSE_A * Math.sin(t * J_GLOW_PULSE_F + j.phase * 2);
      let rPulse = 1 + J_GLOW_PULSE_R * Math.sin(t * J_GLOW_PULSE_F + j.phase * 2);
      if (j.beatT > 0) {
        shy = 1;
        const tp = (J_BEAT_T - j.beatT) % J_BEAT_P;
        const beat = Math.exp(-Math.pow((tp - 0.10) / 0.075, 2))
          + 0.85 * Math.exp(-Math.pow((tp - 0.38) / 0.075, 2));
        glowPulse = 1 + J_BEAT_A * beat;
        rPulse = 1 + J_BEAT_R * beat;
      }
      j.glow.setAttribute('cx', j.x.toFixed(1));
      j.glow.setAttribute('cy', (j.y - h * 0.38).toFixed(1));
      j.glow.setAttribute('rx', (w * J_GLOW_SCALE * rPulse).toFixed(1));
      j.glow.setAttribute('ry', (h * J_GLOW_SCALE * 0.8 * rPulse).toFixed(1));
      j.glow.setAttribute('opacity',
        (lerp(J_GLOW_DARK, J_GLOW_LIGHT, light) * (0.8 + 0.2 * p) * glowPulse * shy).toFixed(2));
      // WORLD MAGIC hue PULSE (docs/09): sin³-shaped excursions away from
      // cyan, magnitude and frequency both riding the dial
      const dial = this.jellyPulse || 0;
      const freq = lerp(J_PULSE_F0, J_PULSE_F1, dial);
      const s3 = Math.pow(Math.sin(t * freq + j.phase * 3), 3);
      const hue = J_HUE_BASE + j.hueDir * J_PULSE_HUE * dial * s3;
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
      reveal(j, [j.g, j.glow]);
    }

    // reef fish: the minnow wiggle at reef scale, banded skin, caudal flare
    const rlx = this.rlx, rly = this.rly;
    for (const r of this.reefs) {
      if (!r.alive) continue;
      if (!show(r, RENDER_PAD, [r.el, r.eye])) continue;
      for (let j = 0; j < R_N; j++) {
        const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, R_N - 1);
        let tx = r.px[j1] - r.px[j0], ty = r.py[j1] - r.py[j0];
        const tm = Math.hypot(tx, ty) || 1;
        tx /= tm; ty /= tm;
        const wave = Math.sin((r.wph || 0) + r.phase - j * 1.05)
          * R_WAVE * r.size * (j / (R_N - 1))
          * (0.65 + 0.35 * Math.min(1, r.speed / R_SPEED));
        const cx = r.px[j] - ty * wave, cy = r.py[j] + tx * wave;
        const w = R_W[j] * r.size;
        rlx[j] = cx - ty * w;
        rly[j] = cy + tx * w;
        rlx[2 * R_N - 1 - j] = cx + ty * w;
        rly[2 * R_N - 1 - j] = cy - tx * w;
      }
      r.el.setAttribute('d', closedLoopPath(rlx, rly, 2 * R_N));
      // shimmer pulse: eased brightness bloom in the bright bands (docs/09)
      const pu = r.pulseAge < R_PULSE_T ? Math.sin((r.pulseAge / R_PULSE_T) * Math.PI) : 0;
      this.reefStops(r, pu * pu * (3 - 2 * pu) * (this.reefPulse || 0));
      let ux = Math.sin(r.hd), uy = -Math.cos(r.hd);
      if (uy > 0) { ux = -ux; uy = -uy; }
      r.eye.setAttribute('cx', (r.x - Math.cos(r.hd) * R_EYE_BACK + ux * R_EYE_UP * r.size).toFixed(1));
      r.eye.setAttribute('cy', (r.y - Math.sin(r.hd) * R_EYE_BACK + uy * R_EYE_UP * r.size).toFixed(1));
      reveal(r, [r.el, r.eye]);
    }

    for (const s of this.seahorses) {
      if (!s.alive) continue;
      if (!show(s, RENDER_PAD, [s.g])) continue;
      const mate = s.pair >= 0 ? this.seahorses[s.pair] : null;
      let tilt = Math.sin(t * S_BOB_F + s.phase + 1) * S_TILT;
      if (mate && mate.alive && Math.abs(mate.hx - s.hx) < S_PAIR_D * 1.6) {
        tilt += 10 * s.flip;   // the curl: lean into your partner
      }
      // the greeted pirouette: clockwise, slow → fast → slow (smoothstep)
      if (s.spinAge < S_SPIN_T) {
        const u = s.spinAge / S_SPIN_T;
        tilt += S_SPIN_TURNS * 360 * u * u * (3 - 2 * u);
      }
      // rotate BEFORE the flip so the spin reads clockwise on screen
      s.g.setAttribute('transform',
        `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${tilt.toFixed(1)}) scale(${s.flip} 1)`);
      if (s.pairHeart && hearts) {
        s.pairHeart = false;
        hearts.emit((s.x + (mate ? mate.x : s.x)) / 2, s.y - 16, PAIR_HEART);
      } else {
        s.pairHeart = false;
      }
      reveal(s, [s.g]);
    }

    for (const list of [this.octos, this.giants]) {
      for (const o of list) {
        if (!o.alive) continue;
        const R = O_R * o.scale * (o.size || 1);
        if (!show(o, RENDER_PAD + R * 3, [o.g])) continue;
        const p = o.pulse || 0;
        // the camouflage (docs/07): fill becomes the color of the water right
        // behind it — a true color match sampled off the background gradient
        const camoT = o.scale > 1 ? O_CAMO_T * 1.6 : O_CAMO_T;
        const env = o.camoT > 0 ? Math.sin((1 - o.camoT / camoT) * Math.PI) : 0;
        const depth = Math.pow(clamp(o.y / 3240, 0, 1), 0.85);
        const water = [lerp(lp.surface[0], lp.deep[0], depth),
                       lerp(lp.surface[1], lp.deep[1], depth),
                       lerp(lp.surface[2], lp.deep[2], depth)];
        const bl = [lerp(o.baseRgb[0], water[0], env),
                    lerp(o.baseRgb[1], water[1], env),
                    lerp(o.baseRgb[2], water[2], env)];
        const fill = `rgb(${Math.round(bl[0] * 255)},${Math.round(bl[1] * 255)},${Math.round(bl[2] * 255)})`;
        if (fill !== o.lastFill) {
          o.lastFill = fill;
          // tentacle edge = the fill LIGHTENED 30% toward white — a rim, not
          // a shadow. (Multiplying the fill down always read near-black once
          // the veil multiplied it again in deep water; lightening can never
          // go darker than the fill.) It still camouflages along.
          const edge = `rgb(${Math.round((bl[0] + (1 - bl[0]) * 0.3) * 255)},${Math.round((bl[1] + (1 - bl[1]) * 0.3) * 255)},${Math.round((bl[2] + (1 - bl[2]) * 0.3) * 255)})`;
          o.head.setAttribute('fill', fill);
          o.bumpL.setAttribute('fill', fill);
          o.bumpR.setAttribute('fill', fill);
          for (const tp of o.tents) {
            tp.setAttribute('fill', fill);
            tp.setAttribute('stroke', edge);
          }
        }
        // a rounder head, breathing gently with the jet pulse
        o.head.setAttribute('cx', o.x.toFixed(1));
        o.head.setAttribute('cy', o.y.toFixed(1));
        o.head.setAttribute('rx', (R * 0.96 * (1 - 0.05 * p)).toFixed(1));
        o.head.setAttribute('ry', (R * (1 + 0.08 * p)).toFixed(1));
        // eye protuberances on the crown, each carrying a pupil
        const bx = R * 0.48, by = R * 0.82;
        o.bumpL.setAttribute('cx', (o.x - bx).toFixed(1));
        o.bumpL.setAttribute('cy', (o.y - by).toFixed(1));
        o.bumpL.setAttribute('r', (R * 0.3).toFixed(1));
        o.bumpR.setAttribute('cx', (o.x + bx).toFixed(1));
        o.bumpR.setAttribute('cy', (o.y - by).toFixed(1));
        o.bumpR.setAttribute('r', (R * 0.3).toFixed(1));
        o.pupL.setAttribute('cx', (o.x - bx).toFixed(1));
        o.pupL.setAttribute('cy', (o.y - by - R * 0.04).toFixed(1));
        o.pupL.setAttribute('r', (R * 0.115).toFixed(1));
        o.pupR.setAttribute('cx', (o.x + bx).toFixed(1));
        o.pupR.setAttribute('cy', (o.y - by - R * 0.04).toFixed(1));
        o.pupR.setAttribute('r', (R * 0.115).toFixed(1));
        // tentacles: thick at the root, tapering gradually — the tip keeps
        // a real cross-section
        for (let k = 0; k < O_TENT_N; k++) {
          o.tents[k].setAttribute('d',
            taperedChainPath(o.tx[k], o.ty[k], O_TENT_PTS, R * O_TENT_W0, R * O_TENT_W1));
        }
        reveal(o, [o.g]);
      }
    }

    // roaming fish: the shared spine-fish look, muted shimmering tones
    const olx = this.olx, oly = this.oly;
    for (const R of this.roamers) {
      const vis = R.vis;
      for (const f of R.list) {
        if (!f.alive) continue;
        if (!show(f, RENDER_PAD + vis.len * 0.5, [f.el, f.eye])) continue;
        for (let j = 0; j < vis.N; j++) {
          const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, vis.N - 1);
          let tx = f.px[j1] - f.px[j0], ty = f.py[j1] - f.py[j0];
          const tm = Math.hypot(tx, ty) || 1;
          tx /= tm; ty /= tm;
          const wave = Math.sin((f.wph || 0) + f.phase - j * 1.05)
            * vis.wave * f.size * (j / (vis.N - 1))
            * (0.65 + 0.35 * Math.min(1, f.speed / vis.speed));
          const cx = f.px[j] - ty * wave, cy = f.py[j] + tx * wave;
          const w = vis.w[j] * f.size;
          olx[j] = cx - ty * w;
          oly[j] = cy + tx * w;
          olx[2 * vis.N - 1 - j] = cx + ty * w;
          oly[2 * vis.N - 1 - j] = cy - tx * w;
        }
        f.el.setAttribute('d', closedLoopPath(olx, oly, 2 * vis.N));
        // muted shimmer: they catch the light when they turn (minnow trick)
        const g = Math.pow(Math.max(0, Math.sin(f.hd * 2 + Math.sin(t * 0.6 + f.phase) * 1.4)), 3);
        f.el.setAttribute('fill', rgb(vis.colA, vis.colB, g));
        let ux = Math.sin(f.hd), uy = -Math.cos(f.hd);
        if (uy > 0) { ux = -ux; uy = -uy; }
        f.eye.setAttribute('cx', (f.x - Math.cos(f.hd) * vis.eyeBack * f.size + ux * vis.eyeUp * f.size).toFixed(1));
        f.eye.setAttribute('cy', (f.y - Math.sin(f.hd) * vis.eyeBack * f.size + uy * vis.eyeUp * f.size).toFixed(1));
        reveal(f, [f.el, f.eye]);
      }
    }

    for (const a of this.anglers) {
      if (!a.alive) continue;
      if (!show(a, RENDER_PAD + 40, [a.g, a.lure])) continue;
      const deg = a.hd * 180 / Math.PI;
      const flip = Math.cos(a.hd) < 0 ? -1 : 1;
      const as = (a.size || 1) * A_SCALE;
      a.g.setAttribute('transform',
        `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${deg.toFixed(1)}) scale(${as} ${(as * flip).toFixed(2)})`);
      // the lure: a glow-layer light riding the stalk tip (docs/09 — no veil
      // hole; the glow layer is the single emissive channel)
      const ca = Math.cos(a.hd), sa = Math.sin(a.hd);
      const tipX = A_LURE_TIP[0] * as, tipY = A_LURE_TIP[1] * as * flip;
      const wx = a.x + tipX * ca - tipY * sa;
      const wy = a.y + tipX * sa + tipY * ca + Math.sin(t * 1.1 + a.phase) * 2.5;
      const flare = a.flareT > 0 ? Math.sin((1 - a.flareT / A_FLARE_T) * Math.PI) : 0;
      const throb = 0.8 + 0.2 * Math.sin(t * A_LURE_PULSE_F + a.phase);
      a.lure.setAttribute('cx', wx.toFixed(1));
      a.lure.setAttribute('cy', wy.toFixed(1));
      a.lure.setAttribute('r', (A_LURE_R * as * (1 + 1.2 * flare)).toFixed(1));
      a.lure.setAttribute('opacity',
        (lerp(A_LURE_DARK, A_LURE_LIGHT, light) * throb * (1 + 0.6 * flare)).toFixed(2));
      reveal(a, [a.g, a.lure]);
    }

    // ---- greet brackets (docs/07): pulsing bounding-box corners in the
    // eel-heart pink around everyone who would answer a greeting. Bboxes come
    // from live geometry (chain vertex min/max + width margins) — no attempt
    // to stroke whatever outline the critter happens to have.
    let bi = 0;
    const pulse = (0.55 + 0.45 * Math.sin(t * BRK_PULSE_F)) * BRK_ALPHA;
    const frame = (x0, y0, x1, y1, env) => {
      if (bi >= this.brackets.length) return;
      x0 -= BRK_PAD; y0 -= BRK_PAD; x1 += BRK_PAD; y1 += BRK_PAD;
      const L = clamp(Math.min(x1 - x0, y1 - y0) * 0.3, 6, 20);
      const b = this.brackets[bi++];
      b.el.setAttribute('d',
        `M${(x0 + L).toFixed(1)} ${y0.toFixed(1)}L${x0.toFixed(1)} ${y0.toFixed(1)}L${x0.toFixed(1)} ${(y0 + L).toFixed(1)}`
        + `M${(x1 - L).toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${(y0 + L).toFixed(1)}`
        + `M${(x0 + L).toFixed(1)} ${y1.toFixed(1)}L${x0.toFixed(1)} ${y1.toFixed(1)}L${x0.toFixed(1)} ${(y1 - L).toFixed(1)}`
        + `M${(x1 - L).toFixed(1)} ${y1.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}L${x1.toFixed(1)} ${(y1 - L).toFixed(1)}`);
      b.el.setAttribute('opacity', (pulse * (env ?? 1)).toFixed(2));
      if (!b.shown) { b.shown = true; b.el.setAttribute('display', 'inline'); }
    };
    const chainBox = (xs, ys, n, m, env) => {
      let x0 = xs[0], x1 = xs[0], y0 = ys[0], y1 = ys[0];
      for (let i = 1; i < n; i++) {
        if (xs[i] < x0) x0 = xs[i]; else if (xs[i] > x1) x1 = xs[i];
        if (ys[i] < y0) y0 = ys[i]; else if (ys[i] > y1) y1 = ys[i];
      }
      frame(x0 - m, y0 - m, x1 + m, y1 + m, env);
    };
    for (const m of this.minnows) {
      if (m.alive && m.shown && m.hl) chainBox(m.px, m.py, M_N, 2.4 * (m.size || 1), this.hlEnv(m));
    }
    for (const r of this.reefs) {
      if (r.alive && r.shown && r.hl) chainBox(r.px, r.py, R_N, 8.6 * r.size, this.hlEnv(r));
    }
    for (const R of this.roamers) {
      for (const f of R.list) {
        if (f.alive && f.shown && f.hl) chainBox(f.px, f.py, R.vis.N, R.vis.wMax * f.size, this.hlEnv(f));
      }
    }
    for (const j of this.jellies) {
      if (!j.alive || !j.shown || !j.hl) continue;
      const js = j.size || 1;
      let x0 = j.x - J_R * js, x1 = j.x + J_R * js;
      let y0 = j.y - J_R * js * 1.4, y1 = j.y;
      for (const ys of j.ty) { const e = ys[J_TENT_PTS - 1]; if (e > y1) y1 = e; }
      for (const xs of j.tx) {
        for (let q = 0; q < J_TENT_PTS; q++) {
          if (xs[q] < x0) x0 = xs[q]; else if (xs[q] > x1) x1 = xs[q];
        }
      }
      frame(x0, y0, x1, y1, this.hlEnv(j));
    }
    for (const s of this.seahorses) {
      if (!s.alive || !s.shown || !s.hl) continue;
      const sc = s.sc || 1;
      frame(s.x - 12 * sc, s.y - 13 * sc, s.x + 12 * sc, s.y + 13 * sc, this.hlEnv(s));
    }
    for (const list of [this.octos, this.giants]) {
      for (const o of list) {
        if (!o.alive || !o.shown || !o.hl) continue;
        const R = O_R * o.scale * (o.size || 1);
        let x0 = o.x - R, x1 = o.x + R, y1 = o.y + R * 0.5;
        const y0 = o.y - R * 1.18;
        for (let k = 0; k < O_TENT_N; k++) {
          const xs = o.tx[k], ys = o.ty[k];
          for (let q = 0; q < O_TENT_PTS; q++) {
            if (xs[q] < x0) x0 = xs[q]; else if (xs[q] > x1) x1 = xs[q];
            if (ys[q] > y1) y1 = ys[q];
          }
        }
        frame(x0, y0, x1, y1, this.hlEnv(o));
      }
    }
    for (const a of this.anglers) {
      if (!a.alive || !a.shown || !a.hl) continue;
      const as = (a.size || 1) * A_SCALE;
      frame(a.x - 22 * as, a.y - 16 * as, a.x + 19 * as, a.y + 11 * as, this.hlEnv(a));
    }
    for (; bi < this.brackets.length; bi++) {
      const b = this.brackets[bi];
      if (b.shown) { b.shown = false; b.el.setAttribute('display', 'none'); }
    }
  }
}
