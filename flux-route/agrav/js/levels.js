/* FLUX ROUTE — level definitions, painting, curLevel().
 *
 * Contains the LEVELS array and all level-authoring utilities.
 *
 * ## Two authoring paths
 * 1. Paint-function levels: hand-coded objects with paint(gateState)
 *    that draw to the shared 2D canvas using pxRect/pxPoly helpers.
 * 2. Serialized levels: dataLevel(json, extra) converts fluxLevel v1
 *    JSON into a LEVELS entry, generating paint() from polys.
 *
 * ## Exports
 *   LEVELS               Array of level objects (ordered by progression)
 *   ATTRACT_LEVEL        Idle-mode level shown on the title screen
 *   curLevel()           Returns LEVELS[S.levelIdx] (or ATTRACT_LEVEL for -1)
 *   dataLevel(json, extra)  Convert fluxLevel v1 JSON → LEVELS-compatible entry
 *   pxRect(color, u0, v0, u1, v1)  Paint a UV-rect to the level canvas
 *   pxPoly(color, pts)   Paint a polygon (pts = [[u,v],...]) to the level canvas
 *   border()             Paint the standard 3px solid border
 *   base()               Clear canvas black + call border()
 *   pipHit(pts, u, v)    Point-in-polygon test (used by placement validation)
 *   rasterPoly(pts, write)  CPU rasterizer: calls write(flatIndex) for each
 *                         pixel inside the polygon (GL orientation, v-up)
 *   lvCtx                2D context of the level canvas (SIM_W×SIM_H)
 *   lvCanvas             The underlying HTMLCanvasElement
 *   SOLID_C              "#ff0000" — solid wall paint color constant
 *
 * ## Canvas painting pipeline
 * pxRect and pxPoly draw to lvCtx. Colors encode zone types:
 *   SOLID_C (#ff0000)  — solid wall (R channel ≥128)
 *   SINK_C  (#00ff00)  — intake zone (G high, B low)
 *   DRAIN_C (#0000ff)  — drain (B high, G low)
 *   TRIG_C  (#00ffff)  — trigger gate (G high, B high)
 *   SENSOR_C (#000080) — sensor zone (B mid-range, G low)
 * Note: SINK_C through SENSOR_C are module-local; only SOLID_C is exported
 * (used by main.js for removableWall rasterization).
 *
 * ## rasterPoly(pts, write)
 * CPU point-in-polygon rasterizer for arbitrary convex/concave polys.
 * Used to fill walls, media, gel, dynamite fields at level load.
 * Coordinates are UV [0,1]², rasterized to SIM_W×SIM_H. The write
 * callback receives a flat index j*SIM_W+i in GL orientation (v-up).
 *
 * Dependencies: state.js, config.js.
 * Imported by: main.js, editor.js.
 */
import { S, RED, BLUE, GREEN } from './state.js';
import { SIM_W, SIM_H } from './config.js';

/* ---------- template levels ----------
 * Paint colors -> zones: solid #ff0000 | sink #00ff00 | drain #0000ff |
 * trigger #00ffff | sensor #000080 (low-blue, avoids the JFA solid channel).
 * These are FEATURE TEMPLATES exercising every mechanic; fine design is the
 * level author's job. budgets = player tool counts {fan, blue, green}. */
const lvCanvas = document.createElement("canvas");
lvCanvas.width = SIM_W; lvCanvas.height = SIM_H;
const lvCtx = lvCanvas.getContext("2d", { willReadFrequently: true });
function pxRect(style, u0, v0, u1, v1) {
  lvCtx.fillStyle = style;
  lvCtx.fillRect(Math.round(u0 * SIM_W), Math.round((1 - v1) * SIM_H),
    Math.round((u1 - u0) * SIM_W), Math.round((v1 - v0) * SIM_H));
}
const SOLID_C = "#ff0000", SINK_C = "#00ff00", DRAIN_C = "#0000ff",
      TRIG_C = "#00ffff", SENSOR_C = "#000080";
function border() {
  pxRect(SOLID_C, 0, 0, 1, 3 / SIM_H); pxRect(SOLID_C, 0, 1 - 3 / SIM_H, 1, 1);
  pxRect(SOLID_C, 0, 0, 3 / SIM_W, 1); pxRect(SOLID_C, 1 - 3 / SIM_W, 0, 1, 1);
}
function base() { lvCtx.fillStyle = "#000000"; lvCtx.fillRect(0, 0, SIM_W, SIM_H); border(); }
// PURE species vectors — chemistry reads channels as species; display colors
// live in the shaders (speciesToDisplay). Mixed-channel "colors" here would
// make red emitters self-react (R*B gel shell entombs the emitter).


/* ---------- polygons + serializable data levels (fluxLevel v1) ---------- */
function pxPoly(style, pts) {
  if (!pts || pts.length < 3) return;
  lvCtx.fillStyle = style;
  lvCtx.beginPath();
  lvCtx.moveTo(pts[0][0] * SIM_W, (1 - pts[0][1]) * SIM_H);
  for (let k = 1; k < pts.length; k++) lvCtx.lineTo(pts[k][0] * SIM_W, (1 - pts[k][1]) * SIM_H);
  lvCtx.closePath(); lvCtx.fill();
}
function pipHit(pts, u, v) {
  let inside = false;
  for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
    const xa = pts[a][0], ya = pts[a][1], xb = pts[b][0], yb = pts[b][1];
    if ((ya > v) !== (yb > v) && u < (xb - xa) * (v - ya) / (yb - ya + 1e-12) + xa) inside = !inside;
  }
  return inside;
}
function rasterPoly(pts, write) {            /* GL orientation, like rasterZones */
  let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
  for (const p of pts) { u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); v0 = Math.min(v0, p[1]); v1 = Math.max(v1, p[1]); }
  const i0 = Math.max(0, Math.floor(u0 * SIM_W)), i1 = Math.min(SIM_W, Math.ceil(u1 * SIM_W));
  const j0 = Math.max(0, Math.floor(v0 * SIM_H)), j1 = Math.min(SIM_H, Math.ceil(v1 * SIM_H));
  for (let j = j0; j < j1; j++)
    for (let i = i0; i < i1; i++)
      if (pipHit(pts, (i + 0.5) / SIM_W, (j + 0.5) / SIM_H)) write(j * SIM_W + i);
}
/* dataLevel: a level entirely from serializable data. Poly kinds:
 * solid | removable | slate | sink | drain | media | flow | door.
 * "flow" rasterizes into the lane buffer (gb dir*strength, a = red-powered);
 * amps and lanes are ONE in-level mechanism now. `extra` lets source code
 * extend a serialized level declaratively (events, custom paint, ...). */
function dataLevel(d, extra) {
  return Object.assign({
    name: d.name || "custom",
    size: d.size || "full",
    winFraction: d.win && d.win.fraction != null ? d.win.fraction : 0.2,
    winHoldSec: (d.win && d.win.holdSec) || 4,
    playerStart: d.playerStart || [0.25, 0.5],
    budgets: d.budgets || {}, wells: d.wells || {}, config: d.config || {},
    actors: d.actors || [], switches: d.switches || [],
    events: d.events || [], callouts: d.callouts || [],
    mediaZones: d.mediaZones || [], removableWalls: d.removableWalls || [],
    data: d,
    paint(gs) {
      gs = gs || {}; base();
      for (const p of d.polys || []) {
        if (p.kind === "solid") pxPoly(SOLID_C, p.pts);
        else if (p.kind === "sink" || p.kind === "win") pxPoly(SINK_C, p.pts);
        else if (p.kind === "drain") pxPoly(DRAIN_C, p.pts);
        else if (p.kind === "door" && !gs[p.id]) pxPoly(SOLID_C, p.pts);
      }
    }
  }, extra || {});
}
window.fluxLevelFromJSON = (json, extra) =>
  dataLevel(typeof json === "string" ? JSON.parse(json) : json, extra);

/* ---------- E1-T0: serialized in the editor, sequenced in code ---------- */
const E1_T0 = dataLevel({
  fluxLevel: 1, name: "E1 - T0: Welcome",
  playerStart: [0.6156, 0.5],
  win: { fraction: 0.25, holdSec: 6 },
  budgets: { fan: 8, blue: 3, green: 3 },
  wells: { slate: 1500, steel: 800, lanes: 1500 },
  size: "medium",
  polys: [{ kind: "win", id: "W",
    pts: [[0.6438, 0.35], [0.7, 0.35], [0.7, 0.65], [0.6438, 0.65]] }],
  actors: [{ type: 3, r: 5, strength: 260, dye: [1, 0, 0], angle: 0,
    locked: true, rotatable: true, tunable: false, minStrength: 80, maxStrength: 1500,
    pos: [0.2781, 0.5], id: "E1", enabled: false }]
}, {
  events: [
    { at: 1.2, do: [{ callout: { text: "This is *FLUX ROUTE*", at: [0.5, 0.69], dur: 3.0, size: 1.6 } }] },
    { after: 3.2, do: [{ callout: { text: "a game of moving fluids from", at: [0.5, 0.69], dur: 2.4, size: 1.6 } }] },
    { after: 2.6, do: [
      { callout: { text: "*A*", at: [0.278, 0.58], dur: 4.5, size: 1.6 } },
      { enable: "E1" },
      { emphasize: { id: "E1", dur: 2.6, level: "high" } }
    ] },
    { after: 1, do: [{ callout: { text: "to", at: [0.47, 0.53], dur: 4.5, size: 1.6 } }] },
    { after: 1, do: [
      { callout: { text: "*B*", at: [0.672, 0.58], dur: 4.9, size: 1.6 } },
      { emphasize: { poly: "W", dur: 2.6, level: "high" } }
    ] }
  ]
});
const LEVELS = [
  E1_T0,
  {
    name: "T1 \u00b7 basics", winFraction: 0.25, winHoldSec: 4,
    messages: [
      { t: 1, dur: 7, text: "Guide the red flux to the green basin. WASD to swim \u2014 your wake is a tool." },
      { t: 9, dur: 7, text: "Click places a fan (key 1). Hover + wheel rotates. Hold the capture % to win." }
    ],
    budgets: { fan: 3, blue: 0, green: 0 }, wells: { slate: 450 }, allowNudge: true,
    removableWalls: [{ rect: [0.44, 0.55, 0.48, 0.78] }],
    playerStart: [0.25, 0.78],
    actors: [{ type: 3, pos: [0.07, 0.60], angle: 0, r: 5, strength: 430, dye: RED, locked: true, rotatable: true }],
    paint() {
      base();
      pxRect(SOLID_C, 0.44, 0.0, 0.48, 0.55);
      pxRect(DRAIN_C, 0.50, 0.03, 0.80, 0.10);
      pxRect(SINK_C, 0.88, 0.52, 0.96, 0.78);
    }
  },
  {
    name: "T2 \u00b7 blue / gel", winFraction: 0.20, winHoldSec: 4,
    messages: [{ t: 1, dur: 8, text: "Red + blue precipitates GEL. Dam the leaking gap \u2014 but keep blue out of your main stream." }],
    budgets: { fan: 1, blue: 2, green: 0 }, allowNudge: true,
    playerStart: [0.50, 0.30],
    actors: [
      { type: 3, pos: [0.06, 0.62], angle: 0, r: 5, strength: 440, dye: RED, locked: true, rotatable: true },
      // fixed blue jet firing ACROSS the red duct gap: red that drifts into it gels
      { type: 3, pos: [0.48, 0.20], angle: Math.PI / 2, r: 4, strength: 300, dye: BLUE, locked: true }
    ],
    paint() {
      base();
      pxRect(SOLID_C, 0.08, 0.68, 0.84, 0.72);
      pxRect(SOLID_C, 0.08, 0.50, 0.40, 0.54);
      pxRect(SOLID_C, 0.58, 0.50, 0.84, 0.54);          // gap 0.40..0.58: dam it with gel
      pxRect(DRAIN_C, 0.34, 0.05, 0.64, 0.26);
      pxRect(SINK_C, 0.87, 0.50, 0.95, 0.72);
    }
  },
  {
    name: "T3 \u00b7 green / blast", winFraction: 0.20, winHoldSec: 4,
    budgets: { fan: 1, blue: 0, green: 1 }, allowNudge: true,
    playerStart: [0.30, 0.30],
    messages: [
      { t: 1, dur: 8, text: "Red + green reacts violently, blasting both apart. Throw the red around the corner." },
      { t: 10, dur: 6, text: "A spare green emitter is cached below \u2014 touch it to collect." }
    ],
    actors: [
      { type: 3, pos: [0.06, 0.70], angle: 0, r: 5, strength: 440, dye: RED, locked: true, rotatable: true },
      { type: 8, pos: [0.50, 0.85], r: 5, gives: "green", count: 1 }
    ],
    paint() {
      base();
      pxRect(DRAIN_C, 0.70, 0.62, 0.96, 0.80);          // straight path ends in a drain
      pxRect(SOLID_C, 0.50, 0.36, 0.54, 0.58);
      pxRect(SINK_C, 0.86, 0.08, 0.95, 0.34);           // must turn the corner: blast it
    }
  },
  {
    name: "T4 \u00b7 media + amp", winFraction: 0.25, winHoldSec: 4,
    budgets: { fan: 2, blue: 0, green: 0 }, allowNudge: true,
    playerStart: [0.25, 0.30],
    actors: [{ type: 3, pos: [0.06, 0.55], angle: 0, r: 5, strength: 430, dye: RED, locked: true, rotatable: true }],
    mediaZones: [
      { rect: [0.30, 0.35, 0.50, 0.75], curl: 3.5, velDiss: 1, dyeDiss: 1 },   // storm cell
      { rect: [0.55, 0.10, 0.75, 0.45], curl: 1, velDiss: 1, dyeDiss: 5 }      // fog: dye thins
    ],
    ampZones: [
      { rect: [0.62, 0.52, 0.80, 0.66], angle: 0, gain: 900 }                  // red-powered booster
    ],
    paint() { base(); pxRect(SINK_C, 0.88, 0.46, 0.96, 0.70); }
  },
  {
    name: "T5 \u00b7 locks", winFraction: 0.18, winHoldSec: 4,
    budgets: { fan: 3, blue: 1, green: 0 }, allowNudge: true,
    playerStart: [0.25, 0.30],
    actors: [{ type: 3, pos: [0.06, 0.50], angle: 0, r: 5, strength: 450, dye: RED, locked: true, rotatable: true }],
    switches: [
      { id: "A", rect: [0.24, 0.72, 0.37, 0.90], kind: "volume", threshold: 0.8,
        mask: [1, 0, 0], wires: [[[0.34, 0.66], [0.42, 0.50]]] },
      { id: "B", rect: [0.55, 0.40, 0.60, 0.60], kind: "flow", latch: "dynamic",
        threshold: 0.06, holdSec: 2, mask: [1, 0, 0], wires: [[[0.66, 0.50], [0.72, 0.50]]] }
    ],
    paint(gs) {
      gs = gs || {};
      base();
      pxRect(SOLID_C, 0.40, 0.66, 0.44, 1.0);           // gate-A wall stubs
      pxRect(SOLID_C, 0.40, 0.0, 0.44, 0.34);
      if (!gs.A) pxRect(SOLID_C, 0.40, 0.34, 0.44, 0.66); // door A (pay the tank)
      pxRect(SOLID_C, 0.70, 0.62, 0.74, 1.0);           // gate-B wall stubs
      pxRect(SOLID_C, 0.70, 0.0, 0.74, 0.38);
      if (!gs.B) pxRect(SOLID_C, 0.70, 0.38, 0.74, 0.62); // gate B (held open by flux)
      pxRect(SINK_C, 0.87, 0.38, 0.95, 0.62);
    }
  },
  {
    name: "T6 \u00b7 predators + spin", winFraction: 0.22, winHoldSec: 5,
    budgets: { fan: 2, blue: 0, green: 1 }, allowNudge: true,
    playerStart: [0.50, 0.50],
    actors: [
      { type: 3, pos: [0.06, 0.50], angle: 0, r: 5, strength: 450, dye: RED, locked: true, rotatable: true },
      { type: 7, pos: [0.50, 0.86], period: 9, jitter: 0.3, predTtl: 14, predThrust: 0.45 },
      { type: 7, pos: [0.50, 0.14], period: 11, jitter: 0.3, predTtl: 14, predThrust: 0.45 }
    ],
    paint() { base(); pxRect(SINK_C, 0.88, 0.38, 0.96, 0.62); }
  },
  {
    name: "T7 \u00b7 full kit", winFraction: 0.15, winHoldSec: 5,
    budgets: { fan: 2, blue: 2, green: 2 }, allowNudge: true,
    playerStart: [0.20, 0.50],
    actors: [
      { type: 3, pos: [0.06, 0.76], angle: 0, r: 5, strength: 450, dye: RED, locked: true, rotatable: true },
      { type: 3, pos: [0.36, 0.96], angle: -Math.PI / 2, r: 4, strength: 280, dye: BLUE, locked: true },
      { type: 7, pos: [0.82, 0.84], period: 12, jitter: 0.4, predTtl: 12, predThrust: 0.42 },
      { type: 5, pos: [0.56, 0.50], angle: Math.PI / 2, r: 7, amp: 0.16, omega: 1.8, phase: 0 }
    ],
    switches: [
      { id: "S", rect: [0.44, 0.55, 0.49, 0.75], kind: "flow", latch: "dynamic",
        threshold: 0.05, holdSec: 2, mask: [1, 0, 0],
        wires: [[[0.60, 0.65], [0.70, 0.41], [0.76, 0.41]]] },
      { id: "D", rect: [0.29, 0.02, 0.35, 0.32], kind: "pressure", threshold: 60 }
    ],
    ampZones: [{ rect: [0.66, 0.18, 0.82, 0.30], angle: 0, gain: 800 }],
    paint(gs) {
      gs = gs || {};
      base();
      pxRect(SOLID_C, 0.30, 0.30, 0.34, 1.0);
      if (!gs.D) pxRect(SOLID_C, 0.30, 0.04, 0.34, 0.30);  // blast plug (pressure-rated)
      pxRect(DRAIN_C, 0.36, 0.04, 0.70, 0.12);
      pxRect(SOLID_C, 0.74, 0.56, 0.78, 1.0);
      if (!gs.S) pxRect(SOLID_C, 0.74, 0.26, 0.78, 0.56);
      pxRect(SINK_C, 0.88, 0.24, 0.96, 0.52);
    }
  }
];

/* attract mode: the machine dreaming. No player, no zones, no HUD. */
const ATTRACT_LEVEL = {
  name: "", winFraction: 99, winHoldSec: 1e9,
  budgets: { fan: 0, blue: 0, green: 0 },
  playerStart: [-1, -1],
  config: { dyeDiss: 0.06, schlieren: 0.9, curlTint: 0.45 },
  actors: [
    { type: 3, pos: [0.16, 0.50], angle: 0, r: 6, strength: 480, dye: RED, locked: true },
    { type: 3, pos: [0.84, 0.50], angle: Math.PI, r: 6, strength: 480, dye: RED, locked: true },
    { type: 3, pos: [0.50, 0.10], angle: Math.PI / 2, r: 5, strength: 280, dye: GREEN, locked: true },
    { type: 3, pos: [0.50, 0.90], angle: -Math.PI / 2, r: 4, strength: 220, dye: BLUE, locked: true },
    { type: 7, pos: [0.10, 0.12], period: 15, jitter: 0.5, predTtl: 16, predThrust: 0.5 }
  ],
  mediaZones: [{ rect: [0.34, 0.28, 0.66, 0.72], curl: 2.5, velDiss: 1, dyeDiss: 1 }],
  paint() { base(); }
};
function curLevel() {
  if (S.editMode && S.editLevelObj) return S.editLevelObj;
  return S.levelIdx < 0 ? ATTRACT_LEVEL : LEVELS[S.levelIdx];
}

export {
  LEVELS, ATTRACT_LEVEL, curLevel, dataLevel,
  pxRect, pxPoly, border, base, pipHit, rasterPoly,
  lvCtx, lvCanvas, SOLID_C,
};

