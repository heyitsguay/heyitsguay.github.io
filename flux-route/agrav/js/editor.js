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
  doorId: "A", placingStart: false, snap: true, gridDiv: 24, amount: 1,
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
  if (!editData.win) editData.win = { fraction: 0.15, holdSec: 4 };
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
const POLY_TINT = { solid: "#ff5a5a", removable: "#8fb7ff", slate: "#aab3c5", steel: "#e3e9f5", gel: "#7fd0ff", dynamite: "#e0a040",
  sink: "#46e08a", win: "#46e08a", drain: "#ff4040", media: "#b58cff", flow: "#39c8d8", door: "#ffd45a" };
let editData = null, editorGui = null, editFolder = null;
let editPolyPts = [], selectedEdit = -1, editDragging = false, ioMode = "";

function openEditor(d) {
  editData = d || { fluxLevel: 1, name: "untitled", playerStart: [0.5, 0.5],
    win: { fraction: 0.15, holdSec: 4 }, budgets: { fan: 8, blue: 3, green: 3 },
    wells: { slate: 1500, steel: 800, lanes: 1500 }, polys: [], actors: [] };
  if (!editData.win) editData.win = { fraction: 0.15, holdSec: 4 };
  if (!editData.size) editData.size = "full";
  S.editMode = true;
  S.editLevelObj = dataLevel(editData);
  _cb.loadLevel(9999);
  buildEditorGui();
}
function exitEditor() {
  S.editMode = false; S.editLevelObj = null;
  if (editorGui) { editorGui.destroy(); editorGui = null; editFolder = null; }
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
  rebuildEntityList(); rebuildPolyList(); rebuildSwitchList();
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
  if (p.kind === "media") { p.curl = eState.curl; p.velDiss = eState.velDiss; p.dyeDiss = eState.dyeDiss; }
  if (p.kind === "flow") { p.angle = eState.angleDeg * Math.PI / 180; p.strength = eState.strength; p.powered = eState.powered; }
  if (p.kind === "door") p.id = eState.doorId;
  if (p.kind === "gel" || p.kind === "dynamite") p.amount = eState.amount;
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
    const id = String.fromCharCode(65 + editData.switches.length);   /* A, B, ... */
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
  showIO("export", JSON.stringify(editData));
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
let entityListFolder = null, polyListFolder = null, switchListFolder = null;

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
    F.add(a, "angle", -3.1416, 3.1416, 0.01).onChange(push);
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
    F.add(a, "angle", -3.1416, 3.1416, 0.01).onChange(push);
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
    F.add(a, "gives", ["fan", "blue", "green", "slate", "steel", "lanes", "spin1", "spin2", "spin3"]).onChange(push);
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
    const sub = entityListFolder.addFolder(entityLabel(a, s));
    const capturedSlot = s;
    sub.domElement.querySelector(".title").addEventListener("click", () => {
      selectedEdit = capturedSlot;
      if (editFolder) { editFolder.destroy(); editFolder = null; }
    });
    addEntityControls(sub, a, s);
    sub.close();
  }
  entityListFolder.close();
}

function rebuildPolyList() {
  if (!editorGui) return;
  if (polyListFolder) { polyListFolder.destroy(); polyListFolder = null; }
  const polys = editData.polys || [];
  polyListFolder = editorGui.addFolder("Polygons (" + polys.length + ")");
  polys.forEach((p, i) => {
    const label = (p.kind || "solid") + " #" + i + " \u2014 " + (p.pts ? p.pts.length : 0) + " verts";
    const sub = polyListFolder.addFolder(label);
    sub.add(p, "kind", ["solid", "removable", "slate", "steel", "win", "drain", "media", "flow", "door", "gel", "dynamite"])
      .onChange(() => rebuildEdit());
    if (p.kind === "media") {
      nd(p, "curl", 2.5); nd(p, "velDiss", 1); nd(p, "dyeDiss", 1);
      sub.add(p, "curl", 0, 8, 0.1).onChange(() => rebuildEdit());
      sub.add(p, "velDiss", 0, 6, 0.1).onChange(() => rebuildEdit());
      sub.add(p, "dyeDiss", 0, 6, 0.1).onChange(() => rebuildEdit());
    }
    if (p.kind === "flow") {
      nd(p, "angle", 0); nd(p, "strength", 1); p.powered = !!p.powered;
      sub.add(p, "angle", -3.1416, 3.1416, 0.01).onChange(() => rebuildEdit());
      sub.add(p, "strength", 0.1, 3, 0.05).onChange(() => rebuildEdit());
      sub.add(p, "powered").onChange(() => rebuildEdit());
    }
    if (p.kind === "door") {
      p.id = p.id || "A";
      sub.add(p, "id").onChange(() => rebuildEdit());
    }
    if (p.kind === "gel" || p.kind === "dynamite") {
      nd(p, "amount", 1);
      sub.add(p, "amount", 0.1, 1.5, 0.05).onChange(() => rebuildEdit());
    }
    if (p.kind === "removable" || p.kind === "slate" || p.kind === "steel") {
      p.id = p.id || "";
      sub.add(p, "id").name("id (for switch targeting)");
    }
    sub.add({ del() {
      pushUndo(); editData.polys.splice(i, 1); rebuildEdit();
    } }, "del").name("\u2715 delete");
    sub.close();
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
    const sub = switchListFolder.addFolder("switch " + (sw.id || String.fromCharCode(65 + i)));
    sub.add(sw, "kind", ["volume", "flow", "pressure"]);
    sub.add(sw, "threshold", 0.01, 120, 0.01);
    nd(sw, "holdSec", 2); sub.add(sw, "holdSec", 0.5, 12, 0.5);
    nd(sw, "latch", "dynamic"); sub.add(sw, "latch", ["dynamic", "static"]);
    sw.inhibit = !!sw.inhibit; sub.add(sw, "inhibit").name("inhibits win");
    sub.add({ del() {
      pushUndo(); editData.switches.splice(i, 1); rebuildEdit();
    } }, "del").name("\u2715 delete");
    sub.close();
  });
  switchListFolder.close();
}

function buildEditorGui() {
  if (editorGui) editorGui.destroy();
  editFolder = null; entityListFolder = null; polyListFolder = null; switchListFolder = null;
  editorGui = new window.lil.GUI({ title: "LEVEL EDITOR", width: 300 });
  editorGui.add(eState, "mode", ["select", "polygon", "rectangle", "entity"]);
  editorGui.add(eState, "snap").name("snap to grid (Alt bypasses)");
  editorGui.add(eState, "gridDiv", 4, 100, 1).name("grid subdivisions");
  editorGui.add(eState, "entity", Object.keys(EDIT_ENTITY_DEFAULTS));
  editorGui.add(eState, "polyKind", ["solid", "removable", "slate", "steel", "win", "drain", "media", "flow", "door", "gel", "dynamite", "switch"]).name("poly/rect kind");
  const pf = editorGui.addFolder("polygon properties");
  pf.add(eState, "angleDeg", -180, 180, 1).name("flow angle\u00b0");
  pf.add(eState, "strength", 0.1, 3, 0.05).name("flow strength");
  pf.add(eState, "powered").name("flow: red-powered");
  pf.add(eState, "curl", 0, 8, 0.1); pf.add(eState, "velDiss", 0, 6, 0.1); pf.add(eState, "dyeDiss", 0, 6, 0.1);
  pf.add(eState, "doorId").name("door switch id");
  pf.add(eState, "amount", 0.1, 1.5, 0.05).name("gel/dyn amount");
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
  lf.add(editData.win, "fraction", 0.02, 1, 0.01).name("win fraction");
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
  const TIPS_E = {
    mode: "select: click entities/switches to edit, drag to move. polygon: click vertices. rectangle: drag a box. entity: click to place.",
    snap: "Snap editor input to the design grid. Hold Alt to bypass.",
    gridDiv: "Square grid: N subdivisions of the game window\u0027s short axis. Ragged cells on the long axis clamp to the window edge.",
    size: "Game window size \u2014 the playable sub-rect of the frame. Menus anchor outside it.",
    entity: "Entity placed by clicks in entity mode.",
    polyKind: "What polygon/rectangle commits create. 'switch' (rectangle only) places a sensor; 'door' is a wall tied to a switch id.",
    angleDeg: "Flow polys: force direction in degrees.",
    strength: "Flow polys: force multiplier on laneForce.",
    powered: "Flow polys: thrust scales with red present (the old amp behavior).",
    curl: "Media polys: vorticity multiplier.", velDiss: "Media polys: velocity dissipation multiplier.",
    dyeDiss: "Media polys: dye dissipation multiplier.",
    doorId: "Door polys: the switch id that opens this wall.",
    amount: "Gel/dynamite polys: deposited field density.",
    swKind: "volume = tank fills once; flow = sustained rate; pressure = blast detector.",
    swThreshold: "Fire level: mean dye (volume/flow) or |pressure| (pressure).",
    swHoldSec: "Flow: seconds the rate must hold.", swLatch: "static = remembers forever; dynamic = decays when starved.",
    maskR: "Sense red dye.", maskG: "Sense green dye.", maskB: "Sense blue dye.",
    swInhibit: "While ON, the win condition is blocked (amber fault).",
    enabled: "Entity starts active? Disabled entities sit dark until a switch or event enables them.",
    fraction: "Capture fraction required to win.", holdSec: "Seconds the capture must be sustained.",
    name: "Level name (serialized).",
    target: "Entity or wall poly this switch will affect.",
    action: "enable: on while switch on. disable: off while on. delete: removed when fired. modify: applies the S.state below.",
    kind: "Switch sensing type.", threshold: "Switch fire level.", latch: "Flow latch mode.", inhibit: "Blocks win while ON."
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
    if (swHit) { selectedEdit = -1; buildSwitchFolder(swHit); return; }
    const s = nearestEditActor(raw);
    if (s >= 1) {
      selectedEdit = s; buildEntityFolder(s); editDragging = true;
      const a2 = cpuActors[s];
      _cb.showToast("selected " + (EDIT_TYPE_NAMES[a2.type] || a2.type) + (a2.id ? " " + a2.id : "") + " \u2014 properties in panel");
    }
    else { selectedEdit = -1; if (editFolder) { editFolder.destroy(); editFolder = null; } }
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
  const cand = {};
  for (let s2 = 1; s2 < N_ACTORS; s2++) {
    const c = cpuActors[s2];
    if (!c || c.type === 6 || c.type === 1) continue;
    if (!c.id) c.id = "E" + s2;
    cand[(EDIT_TYPE_NAMES[c.type] || c.type) + " " + c.id] = { id: c.id };
  }
  ((editData.polys) || []).forEach((p, i) => {
    if (p.kind === "removable" || p.kind === "slate" || p.kind === "steel") {
      if (!p.id) p.id = "P" + i;
      cand["wall " + p.id + " (" + p.kind + ")"] = { poly: p.id };
    }
  });
  const ts = { target: Object.keys(cand)[0] || "(none)",
    action: "enable", angle: 0, strength: 450 };
  F.add(ts, "target", Object.keys(cand).length ? Object.keys(cand) : ["(none)"]);
  F.add(ts, "action", ["enable", "disable", "delete", "modify"]);
  F.add(ts, "angle", -3.1416, 3.1416, 0.01).name("modify: angle");
  F.add(ts, "strength", 0, 2000, 5).name("modify: strength");
  F.add({ add() {
    const c = cand[ts.target];
    if (!c) { _cb.showToast("no target candidates"); return; }
    pushUndo();
    const tgt = Object.assign({}, c);
    if (ts.action === "disable") tgt.invert = true;
    if (ts.action === "delete") tgt.action = "delete";
    if (ts.action === "modify") { tgt.action = "modify"; tgt.state = { angle: ts.angle, strength: ts.strength }; }
    sw.targets = sw.targets || [];
    sw.targets.push(tgt);
    _cb.setTargetEnabled(tgt, !!S.gateState[sw.id]);
    _cb.showToast("target added to switch " + sw.id + " (" + sw.targets.length + " total)");
  } }, "add").name("+ add target");
  F.add({ clr() { pushUndo(); sw.targets = []; } }, "clr").name("clear targets");
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
window.addEventListener("keydown", e => {
  if (!S.editMode) return;
  const tag = (document.activeElement || {}).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if ((e.key === "Delete" || e.key === "Backspace") && selectedEdit >= 1) deleteEditActor(selectedEdit);
  if (e.key === "Enter") { e.preventDefault(); closeEditPoly(); }
  if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); rebuildEdit(); }
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
}
document.getElementById("btnEditor").onclick = () => openEditor();

export {
  openEditor, exitEditor,
  editorPointerDown, editorPointerMove, editorPointerUp,
  drawEditorOverlay,
};
