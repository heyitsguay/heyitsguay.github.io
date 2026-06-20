/* FLUX ROUTE — level loading, painting, curLevel().
 *
 * Levels are loaded from JSON files listed in LEVEL_MANIFEST.
 * loadLevels() fetches each JSON and calls dataLevel() to produce
 * LEVELS entries with auto-generated paint() from polygon data.
 *
 * ## Exports
 *   LEVELS               Array of level objects (populated by loadLevels)
 *   EPOCHS               Array of epoch groups [{id, name, levels: [idx,...]}]
 *   ATTRACT_LEVEL        Idle-mode level shown on the title screen
 *   curLevel()           Returns LEVELS[S.levelIdx] (or ATTRACT_LEVEL for -1)
 *   dataLevel(json, extra)  Convert fluxLevel v1 JSON → LEVELS-compatible entry
 *   loadLevels()         Async: fetch all level JSONs, populate LEVELS & EPOCHS
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
    tempZones: d.tempZones || [],
    data: d,
    paint(gs) {
      gs = gs || {}; base();
      for (const p of d.polys || []) {
        if (p._active === false) continue;
        if (p.kind === "solid" || p.kind === "door") pxPoly(SOLID_C, p.pts);
        else if (p.kind === "sink" || p.kind === "win") pxPoly(SINK_C, p.pts);
        else if (p.kind === "drain") pxPoly(DRAIN_C, p.pts);
      }
    }
  }, extra || {});
}
window.fluxLevelFromJSON = (json, extra) =>
  dataLevel(typeof json === "string" ? JSON.parse(json) : json, extra);

/* ---------- level manifest: epochs → JSON files ---------- */
const LEVEL_MANIFEST = [
  {
    id: "E1", name: "Epoch 1: Foundations", files: [
      "levels/e1-t1_welcome.json",
    ]
  },
  {
    id: "D1", name: "Developer Levels", files: [
      "levels/d1-t1_reaction-chambers.json",
    ]
  },
];

const LEVELS = [];
const EPOCHS = [];   /* populated by loadLevels: [{id, name, levels: [{idx, thumb},...]}] */

async function loadLevels() {
  LEVELS.length = 0;
  EPOCHS.length = 0;
  for (const ep of LEVEL_MANIFEST) {
    const epochEntry = { id: ep.id, name: ep.name, levels: [] };
    for (const file of ep.files) {
      const resp = await fetch(file);
      if (!resp.ok) { console.error("failed to load level:", file); continue; }
      const json = await resp.json();
      const idx = LEVELS.length;
      const level = dataLevel(json);
      level.thumb = file.replace(/\.json$/, ".png");
      LEVELS.push(level);
      epochEntry.levels.push({ idx, thumb: level.thumb });
    }
    EPOCHS.push(epochEntry);
  }
}

/* attract mode: the machine dreaming. No player, no zones, no HUD. */
const ATTRACT_LEVEL = {
  name: "", winFraction: 99, winHoldSec: 1e9,
  budgets: { fan: 0, blue: 0, green: 0 },
  playerStart: [-1, -1],
  config: { dyeDiss: 0.06, schlieren: 0.9, curlTint: 0.45, tempAmbient: 0.25, tempMax: 1, tonemapK: 0.25, bloomStr: 0.2 },
  actors: [
    { type: 3, pos: [0.16, 0.50], angle: 0, r: 6, strength: 480, dye: RED, locked: true },
    { type: 3, pos: [0.84, 0.50], angle: Math.PI, r: 6, strength: 480, dye: RED, locked: true },
    { type: 3, pos: [0.50, 0.10], angle: Math.PI / 2, r: 5, strength: 380, dye: GREEN, locked: true },
    { type: 3, pos: [0.50, 0.90], angle: -Math.PI / 2, r: 4, strength: 220, dye: BLUE, locked: true },
    { type: 7, pos: [0.10, 0.12], period: 15, jitter: 0.5, predTtl: 16, predThrust: 0.5 }
  ],
  mediaZones: [{ rect: [0.34, 0.28, 0.66, 0.72], curl: 7.5, velDiss: 1, dyeDiss: 1 }],
  paint() { base(); }
};
function curLevel() {
  if (S.editMode && S.editLevelObj) return S.editLevelObj;
  return S.levelIdx < 0 ? ATTRACT_LEVEL : LEVELS[S.levelIdx];
}

export {
  LEVELS, EPOCHS, ATTRACT_LEVEL, curLevel, dataLevel, loadLevels,
  pxRect, pxPoly, border, base, pipHit, rasterPoly,
  lvCtx, lvCanvas, SOLID_C,
};

