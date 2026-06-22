/* FLUX ROUTE — level editor (§53–§56).
 *
 * In-game editor opened from the title menu. Sim runs live (win check
 * disabled). Supports polygon, entity, select, and rectangle modes.
 *
 * ## Exports
 *   initEditor(callbacks)      Accept _cb registry from main.js at boot
 *   setEditorCtx(ctx)          Set the 2D overlay canvas context for drawing
 *   openEditor()               Enter editor mode (builds panel, loads blank level)
 *   exitEditor()               Leave editor mode, restore play state
 *   editorPointerDown(e)       Handle mousedown/touchstart in editor
 *   editorPointerMove(e)       Handle mousemove/touchmove in editor
 *   editorPointerUp(e)         Handle mouseup/touchend in editor
 *   drawEditorOverlay(pxFn)    Draw polygon preview, vertex handles, grid on overlay canvas
 *
 * ## Modes
 *   select    Click entity → property panel. Drag to move. Delete key removes.
 *             Click a switch → condition/target editing UI.
 *   entity    Click to place actors (fans, emitters, nests, pickups, etc.)
 *   polygon   Click vertices to build a poly; "close polygon" commits with
 *             the panel's kind (solid/removable/win/drain/media/flow/door/
 *             gel/dynamite/switch) + type-specific properties.
 *   rectangle Drag to commit axis-aligned polys of any kind.
 *
 * ## Export/import
 * Export produces fluxLevel v1 JSON (+ config diff). Import accepts
 * any fluxLevel string via the #ioBox textarea overlay.
 *
 * ## Undo
 * 40-deep JSON snapshots of editData. pushUndo() before structural
 * mutations; Ctrl+Z restores.
 *
 * ## Grid
 * Resolution-independent 480×270 snap grid, anchored at the game window
 * corner. Toggle in panel; hold Alt to bypass.
 *
 * ## Callback pattern (_cb)
 * Uses _cb.loadLevel, _cb.refreshLevelTextures, _cb.buildToolbar,
 * _cb.showToast, _cb.compileEvents from main.js.
 *
 * Dependencies: state.js, config.js, gl-core.js.
 * Imported by: main.js.
 */
import { S, GW, RED, BLUE, GREEN, TOOLS } from './state.js';
import {
  SIM_W, SIM_H, N_ACTORS, params, DEFAULT_PARAMS,
} from './config.js';
import {
  gl, P, canvas,
  cpuActors, freeSlots, writeActor, actorRecord, clearActorSlot,
} from './gl-core.js';
import { curLevel, dataLevel, rasterPoly, LEVELS } from './levels.js';

/* late-bound callbacks from main.js */
let _cb = {};
export function initEditor(callbacks) { _cb = callbacks; }

/* octx: set by main.js so editor overlay can draw */
let octx = null;
export function setEditorCtx(ctx) { octx = ctx; }

/* ==================== LEVEL EDITOR ==================== */
const eState = { mode: "select", entity: "fan", polyKind: "solid",
  angleDeg: 0, strength: 1, powered: false, curl: 2.5, velDiss: 1, dyeDiss: 1,
  placingStart: false, snap: true, gridDiv: 24, amount: 1, rate: -0.1,
  swKind: "volume", swThreshold: 0.5, swHoldSec: 2, swLatch: "dynamic",
  maskR: true, maskG: false, maskB: false, swInhibit: false };
let altHeld = false;
window.addEventListener("keydown", e => { if (e.key === "Alt") altHeld = true; });
window.addEventListener("keyup", e => { if (e.key === "Alt") altHeld = false; });
window.addEventListener("blur", () => { altHeld = false; });   /* alt+tab can eat keyup */
function gridCells() {       /* square cells: N subdivisions of the window's short axis */
  const N = Math.max(4, Math.round(eState.gridDiv));
  const cv = GW.f / N;
  return { cu: cv * 9 / 16, cv };
}
function pointInPoly(uv, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > uv[1]) !== (yj > uv[1]) &&
        uv[0] < (xj - xi) * (uv[1] - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
function eSnap(uv) {
  if (!eState.snap || altHeld) return [uv[0], uv[1]];
  const { cu, cv } = gridCells();
  return [Math.min(GW.u1, Math.max(GW.u0, GW.u0 + Math.round((uv[0] - GW.u0) / cu) * cu)),
          Math.min(GW.v1, Math.max(GW.v0, GW.v0 + Math.round((uv[1] - GW.v0) / cv) * cv))];
}
let editRectA = null, editHover = null;
const undoStack = [];
function pushUndo() {
  editData.actors = snapshotActors();
  undoStack.push({ data: JSON.stringify(editData), pts: editPolyPts.map(p => p.slice()) });
  if (undoStack.length > 100) undoStack.shift();
}
function editorUndo() {
  if (!undoStack.length) { _cb.showToast("nothing to undo"); return; }
  const rec = undoStack.pop();
  editData.actors = snapshotActors();
  if (rec.data === JSON.stringify(editData)) {   /* only vertices changed: cheap path */
    editPolyPts = rec.pts;
    return;
  }
  if (editorGui) { editorGui.destroy(); editorGui = null; editFolder = null; }
  editData = JSON.parse(rec.data);
  if (!editData.win) editData.win = { threshold: 200, holdSec: 4 };
  editPolyPts = rec.pts;
  S.editLevelObj = dataLevel(editData);
  _cb.loadLevel(9999);
  buildEditorGui();
}
window.addEventListener("keydown", e => {
  if (!S.editMode || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
  const tag = (document.activeElement || {}).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  e.preventDefault(); editorUndo();
});
const EDIT_ENTITY_DEFAULTS = {
  "fan": { type: 2, r: 6, strength: 420, angle: 0, rotatable: true },
  "red emitter": { type: 3, r: 5, strength: 450, dye: RED, angle: 0, locked: true, rotatable: true },
  "blue emitter": { type: 3, r: 4, strength: 280, dye: BLUE, angle: 0, locked: true },
  "green emitter": { type: 3, r: 4, strength: 260, dye: GREEN, angle: 0, locked: true },
  "piston": { type: 5, r: 7, amp: 0.16, omega: 1.8, phase: 0, angle: Math.PI / 2 },
  "nest": { type: 7, period: 12, jitter: 0.3, predTtl: 14, predThrust: 0.45 },
  "pickup": { type: 8, r: 5, gives: "fan", count: 1 }
};
const POLY_TINT = { solid: "#ff5a5a", removable: "#8fb7ff", sand: "#d4b87a", slate: "#aab3c5", concrete: "#8a8070", steel: "#e3e9f5", gel: "#7fd0ff", dynamite: "#e0a040",
  sink: "#46e08a", win: "#46e08a", drain: "#ff4040", media: "#b58cff", flow: "#39c8d8", door: "#ffd45a", multiplier: "#e87cff" };
let editData = null, editorGui = null, editFolder = null, modeCtrl = null;
let editPolyPts = [], selectedEdit = -1, selectedPolyIdx = -1, editDragging = false, ioMode = "";

function openEditor(d) {
  editData = d || { fluxLevel: 1, name: "untitled", playerStart: [0.5, 0.5],
    win: { threshold: 200, holdSec: 4 }, budgets: { fan: 8, blue: 3, green: 3 },
    wells: { slate: 2000, concrete: 800, steel: 400, lanes: 1500 }, polys: [], actors: [] };
  if (!editData.win) editData.win = { threshold: 200, holdSec: 4 };
  if (!editData.size) editData.size = "full";
  S.editMode = true;
  S.editLevelObj = dataLevel(editData);
  _cb.loadLevel(9999);
  buildEditorGui();
}
function exitEditor() {
  S.editMode = false; S.editLevelObj = null;
  if (editorGui) { editorGui.destroy(); editorGui = null; editFolder = null; modeCtrl = null; }
  _cb.loadLevel(-1);
}
function snapshotActors() {
  const out = [];
  for (let s = 1; s < N_ACTORS; s++) {
    const a = cpuActors[s];
    if (!a || a.type === 6 || a.type === 1) continue;
    const c = Object.assign({}, a);
    /* read current GPU position so restart doesn't lose moved actors */
    const tx = S.lastTelem[(2 + s) * 4], ty = S.lastTelem[(2 + s) * 4 + 1];
    if (tx || ty) c.pos = [tx, ty];
    else if (a.pos) c.pos = a.pos.slice();
    if (a.dye) c.dye = a.dye.slice();
    if (a._orig != null && a.enabled === false) c.strength = a._orig;
    for (const k of ["slot", "timer", "_orig", "_saved", "dormant", "death"]) delete c[k];
    out.push(c);
  }
  return out;
}
function rebuildEdit() {
  editData.actors = snapshotActors();
  S.editLevelObj = dataLevel(editData);
  _cb.loadLevel(9999);
  rebuildEntityList(); rebuildPolyList(); rebuildSwitchList(); rebuildEventList();
}
function placeEditEntity(uv) {
  if (!freeSlots.length) return;
  pushUndo();
  const dflt = EDIT_ENTITY_DEFAULTS[eState.entity];
  const a = Object.assign({}, dflt, { pos: [uv[0], uv[1]] });
  if (a.dye) a.dye = a.dye.slice();
  const slot = freeSlots.pop();
  writeActor(slot, actorRecord(a));
  cpuActors[slot] = Object.assign({ timer: a.type === 7 ? a.period : 0, slot }, a);
  selectedEdit = slot; buildEntityFolder(slot); rebuildEntityList();
}
function nearestEditActor(uv) {
  let best = -1, bd = 0.08;                     /* radius in UV width units */
  for (let s = 1; s < N_ACTORS; s++) {
    const a = cpuActors[s];
    if (!a || a.type === 6) continue;
    const px2 = S.lastTelem[(2 + s) * 4] || (a.pos && a.pos[0]) || 0;
    const py2 = S.lastTelem[(2 + s) * 4 + 1] || (a.pos && a.pos[1]) || 0;
    const d = Math.hypot(px2 - uv[0], (py2 - uv[1]) * 0.5625);   /* 9/16 aspect */
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function deleteEditActor(slot) {
  if (slot < 1 || !cpuActors[slot]) return;
  pushUndo();
  clearActorSlot(slot); cpuActors[slot] = null; freeSlots.push(slot);
  if (editFolder) { editFolder.destroy(); editFolder = null; }
  selectedEdit = -1;
  rebuildEntityList();
}
function nd(o, k, d) { if (o[k] == null) o[k] = d; }   /* default missing props */
/* angle slider: display degrees, store radians on obj[key] */
function addAngle(F, obj, key, onChange, label) {
  const proxy = { get deg() { return obj[key] * 180 / Math.PI; },
                  set deg(v) { obj[key] = v * Math.PI / 180; } };
  return F.add(proxy, "deg", -180, 180, 1).name(label || key + "°").onChange(onChange);
}
function hoistFolder(F) {                               /* selected folder on top */
  editorGui.$children.insertBefore(F.domElement, editorGui.$children.firstChild);
  F.open();
}
function buildEntityFolder(slot) {
  if (!editorGui) return;
  if (editFolder) { editFolder.destroy(); editFolder = null; }
  const a = cpuActors[slot];
  if (!a) return;
  a.slot = slot;
  const F = editorGui.addFolder("selected " + (EDIT_TYPE_NAMES[a.type] || a.type) + " [slot " + slot + "]");
  addEntityControls(F, a, slot);
  hoistFolder(F);
  editFolder = F;
}
function attachKindProps(p) {
  p.id = nextId(p.kind);  /* all polys get unique ids */
  if (p.kind === "media") { p.curl = eState.curl; p.velDiss = eState.velDiss; p.dyeDiss = eState.dyeDiss; }
  if (p.kind === "flow") { p.angle = eState.angleDeg * Math.PI / 180; p.strength = eState.strength; p.powered = eState.powered; }
  if (p.kind === "gel" || p.kind === "dynamite") p.amount = eState.amount;
  if (p.kind === "multiplier") p.rate = eState.rate;
  return p;
}
function closeEditPoly() {
  if (editPolyPts.length < 3) { _cb.showToast("polygon needs 3+ vertices"); return; }
  pushUndo();
  const p = attachKindProps({ kind: eState.polyKind,
    pts: editPolyPts.map(q => [+q[0].toFixed(4), +q[1].toFixed(4)]) });
  editData.polys.push(p);
  editPolyPts = [];
  rebuildEdit();
}
function commitRect(a, b) {
  const u0 = Math.min(a[0], b[0]), u1 = Math.max(a[0], b[0]);
  const v0 = Math.min(a[1], b[1]), v1 = Math.max(a[1], b[1]);
  if (u1 - u0 < 0.004 || v1 - v0 < 0.004) return;
  pushUndo();
  if (eState.polyKind === "switch") {
    editData.switches = editData.switches || [];
    const id = nextId("switch");
    const sw = { id, rect: [+u0.toFixed(4), +v0.toFixed(4), +u1.toFixed(4), +v1.toFixed(4)],
      kind: eState.swKind, threshold: eState.swThreshold,
      mask: [eState.maskR ? 1 : 0, eState.maskG ? 1 : 0, eState.maskB ? 1 : 0] };
    if (sw.kind === "flow") { sw.holdSec = eState.swHoldSec; sw.latch = eState.swLatch; }
    if (eState.swInhibit) sw.inhibit = true;
    editData.switches.push(sw);
    _cb.showToast("switch " + id + " placed \u2014 targets/wires via JSON or auto-wire by actor id");
  } else {
    editData.polys.push(attachKindProps({ kind: eState.polyKind,
      pts: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(q => [+q[0].toFixed(4), +q[1].toFixed(4)]) }));
  }
  rebuildEdit();
}
const ioBox = document.getElementById("ioBox");
const ioText = document.getElementById("ioText");
function showIO(mode, text) {
  ioMode = mode; ioText.value = text || "";
  document.getElementById("ioApply").style.display = mode === "import" ? "" : "none";
  ioBox.style.display = "flex";
  if (mode === "export") { ioText.select(); try { document.execCommand("copy"); _cb.showToast("level JSON copied"); } catch (e) {} }
}
function paramDiff() {
  const out = {};
  for (const k of Object.keys(DEFAULT_PARAMS)) {
    const t = typeof DEFAULT_PARAMS[k];
    if ((t === "number" || t === "boolean") && params[k] !== DEFAULT_PARAMS[k]) out[k] = params[k];
  }
  return out;
}
function exportEditLevel() {
  editData.actors = snapshotActors();
  editData.config = paramDiff();     /* tuned-away-from-default params travel */
  editData.fluxLevel = 1;
  const RUNTIME_KEYS = new Set(["_cut", "_saved", "_latched", "_frac", "_flux", "_active"]);
  const clean = (k, v) => RUNTIME_KEYS.has(k) ? undefined : v;
  showIO("export", JSON.stringify(editData, clean));
}
document.getElementById("ioClose").onclick = () => { ioBox.style.display = "none"; };
document.getElementById("ioApply").onclick = () => {
  try {
    const d = JSON.parse(ioText.value);
    ioBox.style.display = "none";
    if (editorGui) { editorGui.destroy(); editorGui = null; editFolder = null; }
    openEditor(d);
  } catch (err) { _cb.showToast("bad JSON: " + err.message); }
};
/* ---- collapsible list panels ---- */
let entityListFolder = null, polyListFolder = null, switchListFolder = null, eventListFolder = null;

function entityLabel(a, slot) {
  const name = EDIT_TYPE_NAMES[a.type] || ("type" + a.type);
  const species = a.type === 3 ? (a.dye && a.dye[2] ? " B" : a.dye && a.dye[1] ? " G" : " R") : "";
  const id = a.id ? " " + a.id : "";
  return name + species + id + " [" + slot + "]";
}

function addEntityControls(F, a, slot) {
  const push = () => writeActor(slot, actorRecord(a));
  if (a.type === 2 || a.type === 3) {
    nd(a, "r", 5); nd(a, "angle", 0); nd(a, "strength", 400);
    a.locked = !!a.locked; a.rotatable = !!a.rotatable; a.tunable = !!a.tunable;
    nd(a, "minStrength", 80); nd(a, "maxStrength", 1500); a.id = a.id || "";
    addAngle(F, a, "angle", push);
    F.add(a, "strength", 20, 2000, 5).onChange(push);
    F.add(a, "r", 2, 14, 0.5).onChange(push);
    F.add(a, "locked").onChange(push); F.add(a, "rotatable").onChange(push);
    F.add(a, "tunable").onChange(push);
    a.enabled = a.enabled !== false;
    F.add(a, "enabled").onChange(v => _cb.setActorEnabled(a, v));
    F.add(a, "minStrength", 10, 1000, 5); F.add(a, "maxStrength", 100, 4000, 10);
    F.add(a, "id");
    if (a.type === 3) {
      const pr = { species: a.dye && a.dye[2] ? "BLUE" : a.dye && a.dye[1] ? "GREEN" : "RED" };
      F.add(pr, "species", ["RED", "BLUE", "GREEN"]).onChange(v => {
        a.dye = (v === "BLUE" ? BLUE : v === "GREEN" ? GREEN : RED).slice(); push();
      });
    }
  } else if (a.type === 5) {
    nd(a, "r", 7); nd(a, "angle", Math.PI / 2); nd(a, "amp", 0.16);
    nd(a, "omega", 1.8); nd(a, "phase", 0);
    addAngle(F, a, "angle", push);
    F.add(a, "r", 3, 14, 0.5).onChange(push);
    F.add(a, "amp", 0.02, 0.5, 0.005).onChange(push);
    F.add(a, "omega", 0.2, 8, 0.05).onChange(push);
    F.add(a, "phase", 0, 6.283, 0.05).onChange(push);
  } else if (a.type === 7) {
    a.id = a.id || "";
    nd(a, "period", 12); nd(a, "jitter", 0.3); nd(a, "predTtl", 14); nd(a, "predThrust", 0.45);
    F.add(a, "period", 2, 40, 0.5); F.add(a, "jitter", 0, 1, 0.05);
    F.add(a, "predTtl", 3, 40, 0.5); F.add(a, "predThrust", 0.1, 1.5, 0.05);
    a.enabled = a.enabled !== false;
    F.add(a, "enabled").onChange(v => _cb.setActorEnabled(a, v));
    F.add(a, "id");
  } else if (a.type === 8) {
    nd(a, "gives", "fan"); nd(a, "count", 1); nd(a, "r", 5);
    F.add(a, "gives", ["fan", "blue", "green", "sand", "slate", "concrete", "steel", "lanes", "spin1", "spin2", "spin3"]).onChange(push);
    F.add(a, "count", 1, 1500, 1); F.add(a, "r", 2, 10, 0.5).onChange(push);
  }
  F.add({ del() { deleteEditActor(slot); rebuildEntityList(); } }, "del").name("\u2715 delete");
}

function rebuildEntityList() {
  if (!editorGui) return;
  if (entityListFolder) { entityListFolder.destroy(); entityListFolder = null; }
  let count = 0;
  for (let s = 1; s < N_ACTORS; s++) {
    const a = cpuActors[s];
    if (a && a.type !== 6 && a.type !== 1) count++;
  }
  entityListFolder = editorGui.addFolder("Entities (" + count + ")");
  for (let s = 1; s < N_ACTORS; s++) {
    const a = cpuActors[s];
    if (!a || a.type === 6 || a.type === 1) continue;
    a.slot = s;
    const capturedSlot = s;
    entityListFolder.add({ select() {
      selectedEdit = capturedSlot;
      buildEntityFolder(capturedSlot);
    }}, "select").name(entityLabel(a, s));
  }
  entityListFolder.close();
}

function nextId(kind) {
  const prefix = kind || "item";
  const used = new Set();
  for (const p of (editData.polys || [])) { if (p.id) used.add(p.id); }
  for (const sw of (editData.switches || [])) { if (sw.id) used.add(sw.id); }
  for (let s = 1; s < N_ACTORS; s++) { const a = cpuActors[s]; if (a && a.id) used.add(a.id); }
  for (let n = 1; n < 1000; n++) { const id = prefix + n; if (!used.has(id)) return id; }
  return prefix + "X";
}

function buildPolyFolder(idx) {
  if (!editorGui) return;
  if (editFolder) { editFolder.destroy(); editFolder = null; }
  const p = (editData.polys || [])[idx];
  if (!p) return;
  const F = editorGui.addFolder("selected poly #" + idx + " (" + (p.kind || "solid") + ")");
  F.add(p, "kind", ["solid", "removable", "sand", "slate", "concrete", "steel", "win", "drain", "media", "flow", "door", "gel", "dynamite", "multiplier"])
    .onChange(() => rebuildEdit());
  /* universal: all polys get an id and enabled toggle */
  if (!p.id) p.id = nextId(p.kind || "solid");
  F.add(p, "id").name("id (for switch targeting)").onChange(() => rebuildEdit());
  if (p.enabled === undefined) p.enabled = true;
  F.add(p, "enabled").onChange(() => rebuildEdit());
  /* kind-specific properties */
  if (p.kind === "media") {
    nd(p, "curl", 2.5); nd(p, "velDiss", 1); nd(p, "dyeDiss", 1);
    F.add(p, "curl", 0, 8, 0.1).onChange(() => rebuildEdit());
    F.add(p, "velDiss", 0, 6, 0.1).onChange(() => rebuildEdit());
    F.add(p, "dyeDiss", 0, 6, 0.1).onChange(() => rebuildEdit());
  }
  if (p.kind === "flow") {
    nd(p, "angle", 0); nd(p, "strength", 1); p.powered = !!p.powered;
    addAngle(F, p, "angle", () => rebuildEdit());
    const sp = { get v() { return Math.log10(Math.max(p.strength, 1e-3)); },
                  set v(x) { p.strength = +Math.pow(10, x).toPrecision(3); } };
    F.add(sp, "v", Math.log10(0.001), Math.log10(1.5), 0.005)
      .name("strength = " + p.strength.toPrecision(3))
      .onChange(() => { rebuildEdit(); });

    F.add(p, "powered").onChange(() => rebuildEdit());
  }
  if (p.kind === "gel" || p.kind === "dynamite") {
    nd(p, "amount", 1);
    F.add(p, "amount", 0.1, 1.5, 0.05).onChange(() => rebuildEdit());
  }
  if (p.kind === "multiplier") {
    nd(p, "rate", -0.1);
    const mp = { get dilute() { return p.rate < 0; },
                 set dilute(b) { p.rate = (b ? -1 : 1) * Math.abs(p.rate || 0.1); rebuildEdit(); },
                 get v() { return Math.log10(Math.max(Math.abs(p.rate), 1e-7)); },
                 set v(x) { p.rate = (p.rate < 0 ? -1 : 1) * Math.pow(10, x); } };
    F.add(mp, "dilute").name("dilute (vs concentrate)");
    F.add(mp, "v", -6, 0, 0.05)
      .name("magnitude (10^v)")
      .onChange(() => rebuildEdit());
  }
  F.add({ del() {
    pushUndo(); editData.polys.splice(idx, 1); rebuildEdit();
  } }, "del").name("\u2715 delete");
  hoistFolder(F);
  editFolder = F;
}

function rebuildPolyList() {
  if (!editorGui) return;
  if (polyListFolder) { polyListFolder.destroy(); polyListFolder = null; }
  const polys = editData.polys || [];
  polyListFolder = editorGui.addFolder("Polygons (" + polys.length + ")");
  polys.forEach((p, i) => {
    const capturedIdx = i;
    polyListFolder.add({ select() { buildPolyFolder(capturedIdx); } }, "select")
      .name((p.kind || "solid") + " #" + i + " \u2014 " + (p.pts ? p.pts.length : 0) + " verts");
  });
  polyListFolder.close();
}

function rebuildSwitchList() {
  if (!editorGui) return;
  if (switchListFolder) { switchListFolder.destroy(); switchListFolder = null; }
  const sws = editData.switches || [];
  if (!sws.length) return;
  switchListFolder = editorGui.addFolder("Switches (" + sws.length + ")");
  sws.forEach((sw, i) => {
    const id = sw.id || String.fromCharCode(65 + i);
    const tgtCount = (sw.targets || []).length;
    const label = "switch " + id + " (" + sw.kind + ", " + tgtCount + " target" + (tgtCount !== 1 ? "s" : "") + ")";
    const capturedSw = sw;
    switchListFolder.add({ select() { buildSwitchFolder(capturedSw); } }, "select")
      .name(label);
  });
  switchListFolder.close();
}

/* ---- event editor ---- */
function buildEventFolder(idx) {
  if (!editorGui) return;
  if (editFolder) { editFolder.destroy(); editFolder = null; }
  editData.events = editData.events || [];
  const ev = editData.events[idx];
  if (!ev) return;
  const F = editorGui.addFolder("event #" + idx);
  /* timing */
  const timing = { mode: ev.after != null ? "after" : "at", value: ev.after != null ? ev.after : (ev.at || 0) };
  F.add(timing, "mode", ["at", "after"]).name("timing mode").onChange(v => {
    if (v === "at") { ev.at = timing.value; delete ev.after; }
    else { ev.after = timing.value; delete ev.at; }
  });
  F.add(timing, "value", 0, 120, 0.1).name("time (sec)").onChange(v => {
    if (timing.mode === "at") ev.at = v; else ev.after = v;
  });
  if (ev.once !== undefined) F.add(ev, "once").name("once only");
  /* actions list */
  ev.do = ev.do || [];
  ev.do.forEach((act, ai) => {
    const af = F.addFolder("action #" + ai + actionLabel(act));
    if (act.callout) {
      const co = act.callout;
      nd(co, "text", ""); nd(co, "dur", 3); nd(co, "size", 1.5);
      if (!co.at) co.at = [0.5, 0.5];
      af.add(co, "text").name("text (* = bold)");
      af.add(co.at, "0", 0, 1, 0.005).name("x");
      af.add(co.at, "1", 0, 1, 0.005).name("y");
      af.add(co, "dur", 0.5, 15, 0.1).name("duration");
      af.add(co, "size", 0.5, 4, 0.1).name("text size");
    }
    if (act.emphasize) {
      const em = act.emphasize;
      nd(em, "dur", 2); nd(em, "level", "high");
      if (em.id) af.add(em, "id").name("actor id");
      else if (em.poly) af.add(em, "poly").name("poly id");
      else { em.id = ""; af.add(em, "id").name("target id (actor)"); }
      af.add(em, "dur", 0.5, 15, 0.1).name("duration");
      af.add(em, "level", ["low", "high"]).name("intensity");
    }
    if (act.enable !== undefined) af.add(act, "enable").name("enable actor id");
    if (act.disable !== undefined) af.add(act, "disable").name("disable actor id");
    af.add({ del() {
      ev.do.splice(ai, 1); buildEventFolder(idx);
    } }, "del").name("\u2715 remove action");
    af.close();
  });
  /* add action */
  const addAct = {
    callout() { ev.do.push({ callout: { text: "new text", at: [0.5, 0.5], dur: 3, size: 1.5 } }); buildEventFolder(idx); },
    emphasize() { ev.do.push({ emphasize: { id: "", dur: 2, level: "high" } }); buildEventFolder(idx); },
    enable() { ev.do.push({ enable: "" }); buildEventFolder(idx); },
    disable() { ev.do.push({ disable: "" }); buildEventFolder(idx); }
  };
  const addF = F.addFolder("+ add action");
  for (const k of Object.keys(addAct)) addF.add(addAct, k).name("+ " + k);
  addF.close();
  F.add({ del() {
    pushUndo(); editData.events.splice(idx, 1); rebuildEventList();
    if (editFolder) { editFolder.destroy(); editFolder = null; }
  } }, "del").name("\u2715 delete event");
  hoistFolder(F);
  editFolder = F;
}
function actionLabel(act) {
  if (act.callout) return " \u2014 callout";
  if (act.emphasize) return " \u2014 emphasize";
  if (act.enable !== undefined) return " \u2014 enable";
  if (act.disable !== undefined) return " \u2014 disable";
  if (act.pulse) return " \u2014 pulse";
  if (act.setParams) return " \u2014 setParams";
  return "";
}
function rebuildEventList() {
  if (!editorGui) return;
  if (eventListFolder) { eventListFolder.destroy(); eventListFolder = null; }
  editData.events = editData.events || [];
  const evts = editData.events;
  eventListFolder = editorGui.addFolder("Events (" + evts.length + ")");
  evts.forEach((ev, i) => {
    const label = (ev.after != null ? "after " + ev.after.toFixed(1) : "at " + (ev.at || 0).toFixed(1)) + "s" +
      (ev.do && ev.do.length ? " (" + ev.do.length + " action" + (ev.do.length !== 1 ? "s" : "") + ")" : "");
    const capturedIdx = i;
    eventListFolder.add({ select() { buildEventFolder(capturedIdx); } }, "select")
      .name(label);
  });
  eventListFolder.add({ add() {
    pushUndo();
    editData.events.push({ after: 3, do: [{ callout: { text: "new text", at: [0.5, 0.5], dur: 3, size: 1.5 } }] });
    rebuildEventList();
  }}, "add").name("+ add event");
  eventListFolder.close();
}

function buildEditorGui() {
  if (editorGui) editorGui.destroy();
  editFolder = null; entityListFolder = null; polyListFolder = null; switchListFolder = null; eventListFolder = null;
  editorGui = new window.lil.GUI({ title: "LEVEL EDITOR", width: 300 });
  modeCtrl = editorGui.add(eState, "mode", ["select", "polygon", "rectangle", "entity"]);
  editorGui.add(eState, "snap").name("snap to grid (Alt bypasses)");
  editorGui.add(eState, "gridDiv", 4, 100, 1).name("grid subdivisions");
  editorGui.add(eState, "entity", Object.keys(EDIT_ENTITY_DEFAULTS));
  editorGui.add(eState, "polyKind", ["solid", "removable", "sand", "slate", "concrete", "steel", "win", "drain", "media", "flow", "door", "gel", "dynamite", "multiplier", "switch"]).name("poly/rect kind");
  const pf = editorGui.addFolder("polygon properties");
  pf.add(eState, "angleDeg", -180, 180, 1).name("flow angle\u00b0");
  const spp = { get v() { return Math.log10(Math.max(eState.strength, 1e-3)); },
                set v(x) { eState.strength = +Math.pow(10, x).toPrecision(3); } };
  pf.add(spp, "v", Math.log10(0.001), Math.log10(5), 0.005).name("flow strength (log)");
  pf.add(eState, "powered").name("flow: red-powered");
  pf.add(eState, "curl", 0, 8, 0.1); pf.add(eState, "velDiss", 0, 6, 0.1); pf.add(eState, "dyeDiss", 0, 6, 0.1);
  pf.add(eState, "amount", 0.1, 1.5, 0.05).name("gel/dyn amount");
  const mpp = { get dilute() { return eState.rate < 0; },
                set dilute(b) { eState.rate = (b ? -1 : 1) * Math.abs(eState.rate || 0.1); },
                get v() { return Math.log10(Math.max(Math.abs(eState.rate), 1e-7)); },
                set v(x) { eState.rate = (eState.rate < 0 ? -1 : 1) * Math.pow(10, x); } };
  pf.add(mpp, "dilute").name("mult: dilute");
  pf.add(mpp, "v", -6, 0, 0.05).name("mult: magnitude (10^v)");
  pf.close();
  const sf = editorGui.addFolder("switch (rectangle kind)");
  sf.add(eState, "swKind", ["volume", "flow", "pressure"]);
  sf.add(eState, "swThreshold", 0.01, 120, 0.01).name("threshold");
  sf.add(eState, "swHoldSec", 0.5, 12, 0.5).name("holdSec (flow)");
  sf.add(eState, "swLatch", ["dynamic", "static"]).name("latch (flow)");
  sf.add(eState, "maskR"); sf.add(eState, "maskG"); sf.add(eState, "maskB");
  sf.add(eState, "swInhibit").name("inhibits win");
  sf.close();
  const lf = editorGui.addFolder("level");
  lf.add(editData, "name");
  lf.add(editData, "size", ["small", "medium", "large", "full"]).onChange(() => rebuildEdit());
  lf.add(editData.win, "threshold", 1, 10000, 1).name("win flow threshold");
  lf.add(editData.win, "holdSec", 1, 20, 0.5).name("win hold sec");
  lf.close();
  const acts = {
    "\u2713 close polygon (Enter)": closeEditPoly,
    "delete last polygon": () => { pushUndo(); editData.polys.pop(); rebuildEdit(); },
    "undo (Ctrl+Z)": editorUndo,
    "set player start (click)": () => { eState.placingStart = true; _cb.showToast("click the map to set player start"); },
    "restart sim (R)": rebuildEdit,
    "tuning panel": _cb.togglePanel,
    "export JSON": exportEditLevel,
    "import JSON": () => showIO("import", ""),
    "exit editor": exitEditor
  };
  for (const k of Object.keys(acts)) editorGui.add(acts, k);
  /* ---- property inspector lists ---- */
  rebuildEntityList();
  rebuildPolyList();
  rebuildSwitchList();
  rebuildEventList();
  const TIPS_E = {
    mode: "select: click entities/switches to edit, drag to move. polygon: click vertices. rectangle: drag a box. entity: click to place.",
    snap: "Snap editor input to the design grid. Hold Alt to bypass.",
    gridDiv: "Square grid: N subdivisions of the game window\u0027s short axis. Ragged cells on the long axis clamp to the window edge.",
    size: "Game window size \u2014 the playable sub-rect of the frame. Menus anchor outside it.",
    entity: "Entity placed by clicks in entity mode.",
    polyKind: "What polygon/rectangle commits create. 'switch' (rectangle only) places a sensor; 'door' is a wall tied to a switch id; 'multiplier' scales dye concentration over time.",
    angleDeg: "Flow polys: force direction in degrees.",
    strength: "Flow polys: force multiplier on laneForce.",
    powered: "Flow polys: thrust scales with red present (the old amp behavior).",
    curl: "Media polys: vorticity multiplier.", velDiss: "Media polys: velocity dissipation multiplier.",
    dyeDiss: "Media polys: dye dissipation multiplier.",
    amount: "Gel/dynamite polys: deposited field density.",
    dilute: "Multiplier polys: checked = dye decays (dilute), unchecked = dye grows (concentrate).",
    v: "Multiplier polys: magnitude exponent. rate = \u00b110^v. v=-6 is barely noticeable, v=0 is strong (~2\u00d7/sec).",
    swKind: "volume = tank fills once; flow = sustained rate; pressure = blast detector.",
    swThreshold: "Fire level: mean dye (volume/flow) or |pressure| (pressure).",
    swHoldSec: "Flow: seconds the rate must hold.", swLatch: "static = remembers forever; dynamic = decays when starved.",
    maskR: "Sense red dye.", maskG: "Sense green dye.", maskB: "Sense blue dye.",
    swInhibit: "While ON, the win condition is blocked (amber fault).",
    enabled: "Entity starts active? Disabled entities sit dark until a switch or event enables them.",
    threshold: "Win: absolute delivery rate (dye-units/sec) to sustain.", holdSec: "Seconds the capture must be sustained.",
    name: "Level name (serialized).",
    target: "Entity or wall poly this switch will affect.",
    action: "enable: on while switch on. disable: off while on. delete: removed when fired. modify: applies the S.state below.",
    kind: "Switch sensing type.", latch: "Flow latch mode.", inhibit: "Blocks win while ON."
  };
  editorGui.controllersRecursive().forEach(c => {
    const t = TIPS_E[c.property];
    if (t) c.domElement.title = t;
  });
}
function editorPointerDown(raw) {
  const uv = eSnap(raw);
  if (eState.placingStart) {
    eState.placingStart = false;
    pushUndo();
    editData.playerStart = [uv[0], uv[1]];
    rebuildEdit(); return;
  }
  if (eState.mode === "polygon") { pushUndo(); editPolyPts.push([uv[0], uv[1]]); }
  else if (eState.mode === "rectangle") editRectA = uv;
  else if (eState.mode === "entity") placeEditEntity(uv);
  else {
    const swHit = (editData.switches || []).find(sw =>
      Math.hypot((sw.rect[0] + sw.rect[2]) / 2 - raw[0], (sw.rect[1] + sw.rect[3]) / 2 - raw[1]) < 0.05);
    if (swHit) { selectedEdit = -1; selectedPolyIdx = -1; buildSwitchFolder(swHit); return; }
    const s = nearestEditActor(raw);
    if (s >= 1) {
      selectedEdit = s; selectedPolyIdx = -1; buildEntityFolder(s); editDragging = true;
      const a2 = cpuActors[s];
      _cb.showToast("selected " + (EDIT_TYPE_NAMES[a2.type] || a2.type) + (a2.id ? " " + a2.id : "") + " \u2014 properties in panel");
    } else {
      /* check polygons (reverse order = topmost wins) */
      const polys = editData.polys || [];
      let hitPoly = -1;
      for (let i = polys.length - 1; i >= 0; i--) {
        if (polys[i].pts && pointInPoly(raw, polys[i].pts)) { hitPoly = i; break; }
      }
      if (hitPoly >= 0) {
        selectedEdit = -1; selectedPolyIdx = hitPoly;
        buildPolyFolder(hitPoly);
        _cb.showToast("selected poly #" + hitPoly + " (" + (polys[hitPoly].kind || "solid") + ") \u2014 properties in panel");
      } else {
        selectedEdit = -1; selectedPolyIdx = -1;
        if (editFolder) { editFolder.destroy(); editFolder = null; }
      }
    }
  }
}
const EDIT_TYPE_NAMES = { 1: "player", 2: "fan", 3: "emitter", 5: "piston", 7: "nest", 8: "pickup" };
function buildSwitchFolder(sw) {
  if (!editorGui) return;
  if (editFolder) { editFolder.destroy(); editFolder = null; }
  const F = editorGui.addFolder("selected switch " + sw.id);
  F.add(sw, "kind", ["volume", "flow", "pressure"]);
  F.add(sw, "threshold", 0.01, 120, 0.01);
  sw.holdSec = sw.holdSec || 2;
  F.add(sw, "holdSec", 0.5, 12, 0.5);
  sw.latch = sw.latch || "dynamic";
  F.add(sw, "latch", ["dynamic", "static"]);
  sw.inhibit = !!sw.inhibit;
  F.add(sw, "inhibit").name("inhibits win");
  /* target builder: pick an entity or wall poly, pick the effect */
  const MODIFIABLE_NUM = ["angle", "strength", "r", "amp", "omega", "phase",
    "minStrength", "maxStrength", "period", "jitter", "predTtl", "predThrust", "count",
    "curl", "velDiss", "dyeDiss", "amount"];
  const MODIFIABLE_BOOL = ["enabled", "locked", "rotatable", "tunable", "powered"];
  const cand = {};
  for (let s2 = 1; s2 < N_ACTORS; s2++) {
    const c = cpuActors[s2];
    if (!c || c.type === 6 || c.type === 1) continue;
    if (!c.id) c.id = nextId(EDIT_TYPE_NAMES[c.type] || "entity");
    cand[(EDIT_TYPE_NAMES[c.type] || c.type) + " " + c.id] = { id: c.id, slot: s2 };
  }
  ((editData.polys) || []).forEach((p, i) => {
    if (p.kind === "solid" || p.kind === "win" || p.kind === "drain" || p.kind === "sink") return;
    if (!p.id) p.id = nextId(p.kind || "solid");
    cand["poly " + p.id + " (" + p.kind + ")"] = { poly: p.id, polyIdx: i };
  });
  const candKeys = Object.keys(cand).length ? Object.keys(cand) : ["(none)"];
  const ts = { target: candKeys[0], action: "enable" };
  /* state for dynamic property picker */
  const modState = {};  /* accumulates {propName: value} */
  let propFolder = null;
  function getTargetProps() {
    const c = cand[ts.target];
    if (!c) return {};
    const props = {};
    /* entity target */
    if (c.slot) {
      const a = cpuActors[c.slot];
      if (!a) return {};
      for (const k of MODIFIABLE_NUM) if (a[k] != null) props[k] = { type: "number", value: a[k] };
      for (const k of MODIFIABLE_BOOL) if (a[k] != null) props[k] = { type: "boolean", value: a[k] };
    }
    /* poly target */
    if (c.polyIdx != null) {
      const p = (editData.polys || [])[c.polyIdx];
      if (!p) return {};
      for (const k of MODIFIABLE_NUM) if (p[k] != null) props[k] = { type: "number", value: p[k] };
      for (const k of MODIFIABLE_BOOL) if (p[k] != null) props[k] = { type: "boolean", value: p[k] };
    }
    return props;
  }
  function rebuildPropPicker() {
    if (propFolder) { propFolder.destroy(); propFolder = null; }
    if (ts.action !== "modify") return;
    const props = getTargetProps();
    const propNames = Object.keys(props);
    if (!propNames.length) return;
    propFolder = F.addFolder("modify properties");
    /* show current accumulated state */
    for (const [k, v] of Object.entries(modState)) {
      propFolder.add({ remove() { delete modState[k]; rebuildPropPicker(); } }, "remove")
        .name(k + " = " + v + " \u2715");
    }
    /* add-property controls */
    const addProp = { prop: propNames[0] };
    propFolder.add(addProp, "prop", propNames).name("property");
    const valProxy = { num: props[addProp.prop]?.value || 0, bool: !!props[addProp.prop]?.value };
    let valCtrl = null;
    function rebuildValCtrl() {
      if (valCtrl) { valCtrl.destroy(); valCtrl = null; }
      const info = props[addProp.prop];
      if (!info) return;
      if (info.type === "boolean") {
        valProxy.bool = !!info.value;
        valCtrl = propFolder.add(valProxy, "bool").name("value");
      } else {
        valProxy.num = info.value;
        valCtrl = propFolder.add(valProxy, "num").name("value");
      }
    }
    rebuildValCtrl();
    propFolder.controllers.find(c => c.property === "prop")
      ?.onChange(() => rebuildValCtrl());
    propFolder.add({ set() {
      const info = props[addProp.prop];
      if (!info) return;
      modState[addProp.prop] = info.type === "boolean" ? valProxy.bool : valProxy.num;
      rebuildPropPicker();
    } }, "set").name("+ set property");
    propFolder.open();
  }
  F.add(ts, "target", candKeys).onChange(() => { Object.keys(modState).forEach(k => delete modState[k]); rebuildPropPicker(); });
  F.add(ts, "action", ["enable", "disable", "delete", "modify"]).onChange(() => rebuildPropPicker());
  F.add({ add() {
    const c = cand[ts.target];
    if (!c) { _cb.showToast("no target candidates"); return; }
    pushUndo();
    const tgt = c.poly ? { poly: c.poly } : { id: c.id };
    if (ts.action === "disable") tgt.invert = true;
    if (ts.action === "delete") tgt.action = "delete";
    if (ts.action === "modify") {
      tgt.action = "modify";
      tgt.state = Object.assign({}, modState);
      if (!Object.keys(tgt.state).length) { _cb.showToast("no properties set for modify"); return; }
    }
    sw.targets = sw.targets || [];
    sw.targets.push(tgt);
    _cb.showToast("target added to switch " + sw.id + " (" + sw.targets.length + " total)");
    buildSwitchFolder(sw);  /* rebuild to show new target in list */
  } }, "add").name("+ add target");
  /* show existing targets */
  if (sw.targets && sw.targets.length) {
    const tf = F.addFolder("targets (" + sw.targets.length + ")");
    sw.targets.forEach((t, ti) => {
      const label = (t.id || t.poly || "?") + " " + (t.action || (t.invert ? "disable" : "enable"));
      tf.add({ remove() { pushUndo(); sw.targets.splice(ti, 1); buildSwitchFolder(sw); } }, "remove")
        .name(label + " \u2715");
    });
    tf.open();
  }
  F.add({ clr() { pushUndo(); sw.targets = []; buildSwitchFolder(sw); } }, "clr").name("clear targets");
  F.add({ del() {
    pushUndo();
    editData.switches.splice(editData.switches.indexOf(sw), 1);
    F.destroy(); editFolder = null; rebuildEdit();
  } }, "del").name("\u2715 delete switch");
  hoistFolder(F);
  editFolder = F;
}
function editorPointerMove(raw) {
  editHover = eSnap(raw);
  if (editDragging && selectedEdit >= 1) {
    const a = cpuActors[selectedEdit];
    if (a) { a.pos = eSnap(raw); writeActor(a.slot, actorRecord(a)); }
  }
}
function editorPointerUp() {
  editDragging = false;
  if (editRectA && editHover) { commitRect(editRectA, editHover); }
  editRectA = null;
}
canvas.addEventListener("mousedown", e => {
  if (!S.editMode || e.shiftKey || e.button !== 0 || S.state !== "PLAY") return;
  altHeld = e.altKey;                          /* self-correct stuck alt */
  editorPointerDown(_cb.canvasUV(e));
});
canvas.addEventListener("mousemove", e => {
  if (!S.editMode) return;
  altHeld = e.altKey;
  editorPointerMove(_cb.canvasUV(e));
});
window.addEventListener("mouseup", () => { if (S.editMode) editorPointerUp(); });
const MODE_KEYS = { j: "select", i: "entity", l: "rectangle", k: "polygon" };
window.addEventListener("keydown", e => {
  if (!S.editMode) return;
  const tag = (document.activeElement || {}).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const k = e.key.toLowerCase();
  if ((e.key === "Delete" || e.key === "Backspace") && selectedEdit >= 1) deleteEditActor(selectedEdit);
  if (e.key === "Enter") { e.preventDefault(); closeEditPoly(); }
  if (k === "r" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); rebuildEdit(); }
  if (k === "y") {
    if (editorGui) editorGui.domElement.style.display =
      editorGui.domElement.style.display === "none" ? "" : "none";
  }
  if (MODE_KEYS[k]) {
    eState.mode = MODE_KEYS[k];
    if (modeCtrl) modeCtrl.updateDisplay();
    _cb.showToast(eState.mode + " mode");
  }
});
function drawEditorOverlay(px) {
  if (eState.snap) {                       /* render the design grid */
    const { cu, cv } = gridCells();
    octx.strokeStyle = "#ffffff14"; octx.lineWidth = 1;
    octx.beginPath();
    for (let u = GW.u0; u <= GW.u1 + 1e-6; u += cu) {
      const uu = Math.min(u, GW.u1);
      const a2 = px(uu, GW.v0), b2 = px(uu, GW.v1);
      octx.moveTo(a2[0], a2[1]); octx.lineTo(b2[0], b2[1]);
    }
    for (let v = GW.v0; v <= GW.v1 + 1e-6; v += cv) {
      const a2 = px(GW.u0, v), b2 = px(GW.u1, v);
      octx.moveTo(a2[0], a2[1]); octx.lineTo(b2[0], b2[1]);
    }
    octx.stroke();
  }
  octx.lineWidth = 1.5;
  for (const p of (editData && editData.polys) || []) {
    octx.beginPath();
    const q0 = px(p.pts[0][0], p.pts[0][1]);
    octx.moveTo(q0[0], q0[1]);
    for (let k = 1; k < p.pts.length; k++) { const q = px(p.pts[k][0], p.pts[k][1]); octx.lineTo(q[0], q[1]); }
    octx.closePath();
    octx.strokeStyle = POLY_TINT[p.kind] || "#888";
    octx.globalAlpha = 0.7; octx.stroke(); octx.globalAlpha = 1;
  }
  /* draw switch rects */
  for (const sw of (editData && editData.switches) || []) {
    if (!sw.rect) continue;
    const a = px(sw.rect[0], sw.rect[1]), b = px(sw.rect[2], sw.rect[3]);
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
    const w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    octx.strokeStyle = "#7fe8ff"; octx.lineWidth = 1.5;
    octx.setLineDash([4, 3]); octx.strokeRect(x, y, w, h); octx.setLineDash([]);
    /* label */
    const tgtCount = (sw.targets || []).length;
    octx.fillStyle = "#7fe8ff"; octx.font = "bold 11px monospace";
    octx.fillText(sw.id + (tgtCount ? " (" + tgtCount + ")" : ""), x + 3, y + 12);
  }
  if (editPolyPts.length) {
    octx.beginPath();
    const q0 = px(editPolyPts[0][0], editPolyPts[0][1]);
    octx.moveTo(q0[0], q0[1]);
    for (let k = 1; k < editPolyPts.length; k++) { const q = px(editPolyPts[k][0], editPolyPts[k][1]); octx.lineTo(q[0], q[1]); }
    octx.strokeStyle = "#ffffff"; octx.setLineDash([4, 3]); octx.stroke(); octx.setLineDash([]);
    for (const v of editPolyPts) { const q = px(v[0], v[1]); octx.fillStyle = "#fff"; octx.fillRect(q[0] - 2, q[1] - 2, 4, 4); }
    if (editHover && eState.mode === "polygon") {
      const last = editPolyPts[editPolyPts.length - 1];
      const a2 = px(last[0], last[1]), h2 = px(editHover[0], editHover[1]);
      octx.beginPath(); octx.moveTo(a2[0], a2[1]); octx.lineTo(h2[0], h2[1]);
      octx.strokeStyle = "#ffffffaa"; octx.setLineDash([3, 4]); octx.stroke();
      if (editPolyPts.length >= 2) {              /* faint closure preview */
        const f2 = px(editPolyPts[0][0], editPolyPts[0][1]);
        octx.beginPath(); octx.moveTo(h2[0], h2[1]); octx.lineTo(f2[0], f2[1]);
        octx.strokeStyle = "#ffffff38"; octx.stroke();
      }
      octx.setLineDash([]);
    }
  }
  if (editHover && (eState.mode === "polygon" || eState.mode === "rectangle" || eState.mode === "entity")) {
    const q = px(editHover[0], editHover[1]);
    octx.strokeStyle = POLY_TINT[eState.polyKind] || "#fff";
    octx.lineWidth = 1;
    octx.beginPath(); octx.moveTo(q[0] - 7, q[1]); octx.lineTo(q[0] + 7, q[1]);
    octx.moveTo(q[0], q[1] - 7); octx.lineTo(q[0], q[1] + 7); octx.stroke();
  }
  if (editRectA && editHover) {
    const a2 = px(editRectA[0], editRectA[1]), b2 = px(editHover[0], editHover[1]);
    octx.strokeStyle = eState.polyKind === "switch" ? "#7fe8ff" : (POLY_TINT[eState.polyKind] || "#fff");
    octx.setLineDash([5, 4]);
    octx.strokeRect(Math.min(a2[0], b2[0]), Math.min(a2[1], b2[1]), Math.abs(b2[0] - a2[0]), Math.abs(b2[1] - a2[1]));
    octx.setLineDash([]);
  }
  if (selectedEdit >= 1 && cpuActors[selectedEdit]) {
    const sx = S.lastTelem[(2 + selectedEdit) * 4], sy = S.lastTelem[(2 + selectedEdit) * 4 + 1];
    if (sx || sy) {
      const q = px(sx, sy);
      octx.beginPath(); octx.arc(q[0], q[1], 16, 0, 6.2832);
      octx.strokeStyle = "#ffe27a"; octx.lineWidth = 2; octx.setLineDash([5, 4]); octx.stroke(); octx.setLineDash([]);
    }
  }
  if (selectedPolyIdx >= 0 && editData.polys && editData.polys[selectedPolyIdx]) {
    const sp = editData.polys[selectedPolyIdx];
    octx.beginPath();
    const sq0 = px(sp.pts[0][0], sp.pts[0][1]);
    octx.moveTo(sq0[0], sq0[1]);
    for (let k = 1; k < sp.pts.length; k++) { const sq = px(sp.pts[k][0], sp.pts[k][1]); octx.lineTo(sq[0], sq[1]); }
    octx.closePath();
    octx.strokeStyle = "#ffe27a"; octx.lineWidth = 2.5; octx.setLineDash([5, 4]); octx.stroke(); octx.setLineDash([]);
  }
}
document.getElementById("btnEditor").onclick = () => openEditor();

export {
  openEditor, exitEditor,
  editorPointerDown, editorPointerMove, editorPointerUp,
  drawEditorOverlay,
};
