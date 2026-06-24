/* FLUX ROUTE — input handling: keyboard, mouse, touch, toolbar, tools.
 *
 * All user interaction flows through this module. Handles WASD/arrows
 * (player steering), U/O (spin), tool selection (number keys), Shift+click
 * (placement/painting), and the full touch control suite.
 *
 * ## Exports
 *   initInput(callbacks)   Accept _cb registry from main.js at boot
 *   inputRef               Shared {inputVec, spinInput} object for simulation.js
 *   keys                   Set<string> of currently-held key names
 *   readInput()            Per-frame: poll WASD/arrows/UO → inputVec, spinInput
 *   updateGhost()          Position placement preview, clamped to GHOST_ARM from player
 *   updateSelection()      Find nearest adjustable actor to cursor, set S.selectedSlot
 *   placeTool(uv)          Validate position → allocate slot → write actor to GPU
 *   placementValid(uv)     Check if UV is in-bounds, not in solid, within reach
 *   deleteSelected()       Remove the currently selected actor
 *   rotateSelected(delta)  Rotate selected actor angle by delta radians
 *   paintWall(uv, add, chan)  Paint/erase slate(0) or steel(1) at UV
 *   paintLane(uv, add)     Paint/erase directional lane at UV
 *   canvasUV(e)            Convert mouse/touch event → UV (handles portrait rotation)
 *   clampToReach(uv)       Clamp UV to GHOST_ARM reach from player position
 *   nearestAdjustable()    Return the closest rotatable/tunable actor to mouse
 *   aimSlotAt(slot, uv)    Point actor at slot toward UV (for touch aim)
 *   buildToolbar()         Create toolbar buttons for current level's budget
 *   refreshToolbar()       Update toolbar active/count state after budget changes
 *
 * ## Callback pattern (_cb)
 * This module can't import main.js (circular dep). Functions like
 * loadLevel, refreshLevelTextures, redEmitRate, showToast are registered
 * into _cb by main.js at boot time. All calls to main.js logic go
 * through _cb.functionName().
 *
 * ## Input bridge (inputRef)
 * simulation.js needs inputVec/spinInput but can't import this module.
 * At boot, main.js calls setInputRef(inputRef) to give simulation.js a
 * shared reference object. readInput() mutates inputRef.inputVec and
 * inputRef.spinInput each frame; simulation reads them in substep().
 *
 * ## Touch support
 * Portrait detection rotates the canvas 90° CW via CSS. canvasUV()
 * maps touch/mouse events to UV coordinates in both orientations.
 * Double-tap: place item. Hold: steer toward finger. Two-finger twist:
 * player spin. Toolbar provides erase toggle for touch (no right-click).
 *
 * Dependencies: state.js, config.js, gl-core.js.
 * Imported by: main.js.
 */
import { S, GW, TOOLS, SPIN_TIER_DAMP } from './state.js';
import {
  SIM_W, SIM_H, DT, SIM_TEXEL, RES_SCALE, N_ACTORS, params, PV, effScale,
  pulseParam,
} from './config.js';
import {
  gl, P, U, runFS, bindTex, canvas,
  cpuActors, freeSlots, writeActor, actorRecord, clearActorSlot,
  dyn, walls, getLevelData,
} from './gl-core.js';

/* late-bound callbacks from main.js */
let _cb = {};
export function initInput(callbacks) { _cb = callbacks; }

function paintLane(uv, add) {
  if (S.lanePrev) {                       /* tangent smoothed over recent drag */
    const dx = (uv[0] - S.lanePrev[0]) * 16, dy = (uv[1] - S.lanePrev[1]) * 9;
    const l = Math.hypot(dx, dy);
    if (l > 1e-3) {
      const k = 0.45;
      S.laneDir = [S.laneDir[0] + (dx / l - S.laneDir[0]) * k, S.laneDir[1] + (dy / l - S.laneDir[1]) * k];
      const n = Math.hypot(S.laneDir[0], S.laneDir[1]) || 1;
      S.laneDir = [S.laneDir[0] / n, S.laneDir[1] / n];
    }
  }
  const a = S.lanePrev || uv;
  runFS(P.lanePaint, dyn.write, p => {
    bindTex(p, "uDyn", dyn.read.tex, 0);
    gl.uniform2f(U(p, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]);
    gl.uniform2f(U(p, "uSegA"), a[0], a[1]);
    gl.uniform2f(U(p, "uSegB"), uv[0], uv[1]);
    gl.uniform2f(U(p, "uDir"), S.laneDir[0], S.laneDir[1]);
    gl.uniform1f(U(p, "uPaintR"), params.laneBrush * RES_SCALE);
    gl.uniform1f(U(p, "uPaintMode"), add ? 1 : 0);
  });
  dyn.swap();
  S.lanePrev = uv;
}
/* ---------- input state ---------- */
const keys = new Set();
let inputVec = [0, 0], spinInput = 0;
export const inputRef = { inputVec, spinInput };  /* shared ref for simulation.js */
function readInput() {
  let x = 0, y = 0;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  if (keys.has("s") || keys.has("arrowdown")) y -= 1;
  if (keys.has("w") || keys.has("arrowup")) y += 1;
  const l = Math.hypot(x, y);
  inputVec = l > 0 ? [x / l, y / l] : [0, 0];
  inputRef.inputVec = inputVec;
  spinInput = (keys.has("u") ? 1 : 0) - (keys.has("o") ? 1 : 0);
  if (S.touchSpin) spinInput = S.touchSpin;
  inputRef.spinInput = spinInput;
  if (S.touchSteer && S.rotateModeSlot < 0 && S.state === "PLAY") {
    const px = S.lastTelem[8], py = S.lastTelem[9];
    const dxp = (S.touchSteer[0] - px) * 16, dyp = (S.touchSteer[1] - py) * 9;
    const l = Math.hypot(dxp, dyp);
    inputVec = l > 0.5 ? [dxp / l, dyp / l] : [0, 0];
    inputRef.inputVec = inputVec;
  }
}

/* ---------- placement / tools ---------- */
function placementValid(uv) {
  if (S.selectedTool < 0) return false;
  const tool = TOOLS[S.selectedTool];
  if (uv[0] < 0.02 || uv[0] > 0.98 || uv[1] < 0.02 || uv[1] > 0.98) return false;
  if (tool.type === 9 || tool.type === 12) return true;   /* painting gated by S.wells in the executor */
  if ((S.budget[tool.key] | 0) <= 0) return false;
  const ld = getLevelData();
  if (!ld) return false;
  const px = Math.min(SIM_W - 1, Math.max(0, Math.floor(uv[0] * SIM_W)));
  const py = Math.min(SIM_H - 1, Math.max(0, Math.floor((1 - uv[1]) * SIM_H)));
  return ld[(py * SIM_W + px) * 4] < 128;   // not inside a solid
}
function toolRecord(tool, pos, angle) {
  const strength = params[tool.strengthKey];
  return tool.type === 2
    ? { type: 2, pos, angle, r: tool.r, strength, toolKey: tool.key }
    : { type: 3, pos, angle, r: tool.r, strength, dye: tool.dye, toolKey: tool.key };
}
function placeTool(uv) {
  if (!placementValid(uv) || !freeSlots.length) return;
  const tool = TOOLS[S.selectedTool];
  const slot = freeSlots.pop();
  const rec = toolRecord(tool, [uv[0], uv[1]], S.ghostAngle);
  writeActor(slot, actorRecord(rec));
  cpuActors[slot] = Object.assign({ slot }, rec);
  S.budget[tool.key]--;
  S.emitRate = _cb.redEmitRate();
  _cb.syncBudgetInputs();
}
function spawnAtPlayer() {
  const tool = TOOLS[S.selectedTool];
  if ((S.budget[tool.key] | 0) <= 0 || !freeSlots.length || S.pendingSpawn) return;
  const slot = freeSlots.pop();
  const strength = params[tool.strengthKey];
  S.pendingSpawn = {
    slot, type: tool.type, offset: [0.06, 0],
    params: [tool.r, strength, S.ghostAngle, -1],
    dye: tool.dye || [0, 0, 0]
  };
  cpuActors[slot] = { slot, type: tool.type, r: tool.r, strength, angle: S.ghostAngle,
    dye: tool.dye, toolKey: tool.key, pos: null };
  S.budget[tool.key]--;
  S.emitRate = _cb.redEmitRate();
  _cb.syncBudgetInputs();
}
function paintWall(uv, add, tough) {
  runFS(P.wallPaint, walls.write, p => {
    bindTex(p, "uWalls", walls.read.tex, 0);
    gl.uniform2f(U(p, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]);
    gl.uniform2f(U(p, "uPaintPos"), uv[0], uv[1]);
    gl.uniform1f(U(p, "uPaintR"), params.wallBrush * RES_SCALE);
    gl.uniform1f(U(p, "uPaintMode"), add ? 1 : 0);
    gl.uniform1f(U(p, "uPaintTough"), tough);
  });
  walls.swap();
}
function toolKeyOf(a) {
  return a.toolKey || (a.type === 2 ? "fan" : (a.dye && a.dye[2] > 0.5 ? "blue" : "green"));
}
function deleteSelected() {
  if (S.selectedSlot < 1) return;
  const a = cpuActors[S.selectedSlot];
  if (!a || a.locked || (a.type !== 2 && a.type !== 3)) return;
  clearActorSlot(S.selectedSlot);
  cpuActors[S.selectedSlot] = null;
  freeSlots.push(S.selectedSlot);
  S.budget[toolKeyOf(a)] = (S.budget[toolKeyOf(a)] | 0) + 1;
  S.selectedSlot = -1;
  S.emitRate = _cb.redEmitRate();
  _cb.syncBudgetInputs();
}
function rotateSelected(dir) {
  const a = cpuActors[S.selectedSlot];
  if (!a || (a.locked && !a.rotatable)) return;
  a.angle = (a.angle || 0) + dir * Math.PI / 12;
  const px = S.lastTelem[(2 + S.selectedSlot) * 4], py = S.lastTelem[(2 + S.selectedSlot) * 4 + 1];
  if (px || py) a.pos = [px, py];
  if (!a.pos) return;            // telemetry hasn't reported it yet; try next tick
  writeActor(S.selectedSlot, actorRecord(a));
}
function updateSelection() {
  if (S.rotateModeSlot >= 1) {
    S.selectedSlot = cpuActors[S.rotateModeSlot] ? S.rotateModeSlot : (S.rotateModeSlot = -1);
    if (S.rotateModeSlot >= 1) return;
  }
  S.selectedSlot = -1;
  if (!S.mouseInCanvas || S.state === "ATTRACT") return;
  const plx = S.lastTelem[8], ply = S.lastTelem[9];
  let bestD = 0.05;
  for (let s = 1; s < N_ACTORS; s++) {
    const a = cpuActors[s];
    if (!a || (a.type !== 2 && a.type !== 3)) continue;
    if (a.locked && !a.rotatable) continue;
    const px = S.lastTelem[(2 + s) * 4], py = S.lastTelem[(2 + s) * 4 + 1];
    if (!px && !py) continue;
    const rdx = (px - plx) * 16, rdy = (py - ply) * 9;
    if (Math.hypot(rdx, rdy) > GHOST_ARM) continue;
    const d = Math.hypot(px - S.mouseUV[0], py - S.mouseUV[1]);
    if (d < bestD) { bestD = d; S.selectedSlot = s; }
  }
}

/* ---------- events ---------- */
function updateOrientation() {
  S.IS_PORTRAIT = window.innerHeight > window.innerWidth;
  document.body.classList.toggle("portrait", S.IS_PORTRAIT);
}
window.addEventListener("resize", updateOrientation);
window.addEventListener("orientationchange", updateOrientation);
updateOrientation();
function canvasUV(e) {
  const r = canvas.getBoundingClientRect();
  if (S.IS_PORTRAIT) {
    /* canvas is CSS-rotated 90deg CW: game u runs down the screen, v runs right */
    const sc = Math.min(r.width / 9, r.height / 16);
    const w = sc * 9, h = sc * 16;
    const x0 = r.left + (r.width - w) / 2, y0 = r.top + (r.height - h) / 2;
    return [(e.clientY - y0) / h, (e.clientX - x0) / w];
  }
  const sc = Math.min(r.width / 16, r.height / 9);
  const w = sc * 16, h = sc * 9;
  const x0 = r.left + (r.width - w) / 2, y0 = r.top + (r.height - h) / 2;
  return [(e.clientX - x0) / w, 1 - (e.clientY - y0) / h];
}
canvas.addEventListener("mousemove", e => {
  const uv = canvasUV(e);
  S.mouseUV = uv;
  S.mouseInCanvas = uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1;
});
canvas.addEventListener("mouseleave", () => { S.mouseInCanvas = false; });
canvas.addEventListener("contextmenu", e => e.preventDefault());
/* the placement ghost sits AT the cursor, clamped to a disc around the
 * player; heading aims along player->ghost (physical space, aspect-true) */
const GHOST_ARM = 2.0;           /* max reach, screen-height units (world 16x9) */
function updateGhost() {
  if (S.selectedTool < 0 || S.state === "ATTRACT") return;
  const px = S.lastTelem[8], py = S.lastTelem[9];
  if (!px && !py) return;
  let dx = (S.mouseUV[0] - px) * 16, dy = (S.mouseUV[1] - py) * 9;
  const l = Math.hypot(dx, dy);
  if (l > GHOST_ARM) { dx *= GHOST_ARM / l; dy *= GHOST_ARM / l; }
  S.ghostPos = [px + dx / 16, py + dy / 9];
  if (l > 1e-4) S.ghostAngle = Math.atan2(dy, dx);
}
canvas.addEventListener("mousedown", e => {
  if (!e.shiftKey || S.state === "ATTRACT") return;
  if (e.button === 0) {
    const t = S.selectedTool >= 0 ? TOOLS[S.selectedTool] : null;
    if (t && (t.type === 9 || t.type === 12)) { S.paintingMouse = true; S.lanePrev = null; }
    else placeTool(S.ghostPos);
    e.preventDefault();
  } else if (e.button === 2) {
    const t2 = S.selectedTool >= 0 ? TOOLS[S.selectedTool] : null;
    if (t2 && (t2.type === 9 || t2.type === 12)) { S.rightPaint = true; S.lanePrev = null; }
    else deleteSelected();
    e.preventDefault();
  }
});
window.addEventListener("mouseup", e => { if (e.button === 0) { S.paintingMouse = false; S.lanePrev = null; } if (e.button === 2) { S.rightPaint = false; S.lanePrev = null; } });
/* ---------- touch: hold = steer toward finger; double-tap = place item /
 * enter aim mode on an item (tap to point it, double-tap anywhere exits) */
function physPt(uv) { return [uv[0] * 16, uv[1] * 9]; }
let lastTap = { t: 0, x: 0, y: 0 };
function clampToReach(uv) {
  const px = S.lastTelem[8], py = S.lastTelem[9];
  if (!px && !py) return uv;
  let dx = (uv[0] - px) * 16, dy = (uv[1] - py) * 9;
  const l = Math.hypot(dx, dy);
  if (l > GHOST_ARM) { dx *= GHOST_ARM / l; dy *= GHOST_ARM / l; }
  return [px + dx / 16, py + dy / 9];
}
function nearestAdjustable(uv, maxD) {
  let best = -1, bd = maxD;
  for (let s = 1; s < N_ACTORS; s++) {
    const a = cpuActors[s];
    if (!a || (a.type !== 2 && a.type !== 3)) continue;
    if (a.locked && !a.rotatable && !a.tunable) continue;
    const px = S.lastTelem[(2 + s) * 4], py = S.lastTelem[(2 + s) * 4 + 1];
    if (!px && !py) continue;
    const d = Math.hypot(px - uv[0], py - uv[1]);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function aimSlotAt(slot, uv) {
  const a = cpuActors[slot];
  if (!a || (a.locked && !a.rotatable && !a.tunable)) return;
  const sx = S.lastTelem[(2 + slot) * 4], sy = S.lastTelem[(2 + slot) * 4 + 1];
  if (sx || sy) a.pos = [sx, sy];
  if (!a.pos) return;
  const dx = (uv[0] - a.pos[0]) * 16, dy = (uv[1] - a.pos[1]) * 9;
  if (!a.locked || a.rotatable) a.angle = Math.atan2(dy, dx);
  if (a.tunable) {                       /* finger distance throttles it */
    const f = Math.min(1, Math.max(0, (Math.hypot(dx, dy) - 0.3) / (GHOST_ARM - 0.3)));
    a.strength = (a.minStrength || 80) + f * ((a.maxStrength || 1500) - (a.minStrength || 80));
  }
  writeActor(slot, actorRecord(a));
}
canvas.addEventListener("wheel", e => {            /* desktop throttle */
  if (S.selectedSlot < 1) return;
  const a = cpuActors[S.selectedSlot];
  if (!a || !a.tunable) return;
  e.preventDefault();
  a.strength = Math.min(a.maxStrength || 1500, Math.max(a.minStrength || 80,
    a.strength * (e.deltaY < 0 ? 1.08 : 0.926)));
  writeActor(a.slot, actorRecord(a));
}, { passive: false });
function handleDoubleTap(uv) {
  const tool = S.selectedTool >= 0 ? TOOLS[S.selectedTool] : null;
  /* wall tool selected: double-tap ARMS the brush; the drag paints */
  if (tool && (tool.type === 9 || tool.type === 12) && S.state === "PLAY") {
    const adding = !S.touchErase;
    const isLane = tool.type === 12;
    const mat = isLane ? "lanes" : tool.key === "steel" ? "steel" : "slate";
    const used = isLane ? S.lanePxUsed : tool.key === "steel" ? S.steelPxUsed : S.wallPxUsed;
    if (!adding || used < (S.wells[mat] || 0)) {
      S.touchPaint = true;
      S.touchPaintPos = uv;
      S.lanePrev = null;
      if (isLane) paintLane(clampToReach(uv), adding);
      else paintWall(clampToReach(uv), adding, tool.key === "steel" ? 1 : 0);
    } else {
      _cb.showToast(mat + " well empty \u2014 erase to reclaim matter");
    }
    return;
  }
  const s = nearestAdjustable(uv, 0.06);
  if (s >= 1) { S.rotateModeSlot = s; S.aimEngaged = false; return; }
  if (!tool || S.state !== "PLAY") return;
  const px = S.lastTelem[8], py = S.lastTelem[9];
  if (!px && !py) return;
  const pos = clampToReach(uv);
  const dx = (pos[0] - px) * 16, dy = (pos[1] - py) * 9;
  if (Math.hypot(dx, dy) > 1e-4) S.ghostAngle = Math.atan2(dy, dx);
  S.ghostPos = pos;
  placeTool(pos);
}
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  if (S.editMode && e.touches.length === 1) { _cb.editorPointerDown(canvasUV(e.touches[0])); return; }
  if (e.touches.length === 2) {            /* two-finger twist = spin */
    S.touchSpinG = {
      id0: e.touches[0].identifier, id1: e.touches[1].identifier,
      a0: physPt(canvasUV(e.touches[0])), b0: physPt(canvasUV(e.touches[1]))
    };
    S.touchSteer = null; S.touchPaint = false; S.touchSpin = 0;
    lastTap.t = 0;                         /* second finger is not a tap */
    return;
  }
  const uv = canvasUV(e.changedTouches[0]);
  if (S.rotateModeSlot >= 1) {               /* press-drag points the item */
    S.aimEngaged = true;
    aimSlotAt(S.rotateModeSlot, uv);
    return;
  }
  const now = performance.now();
  const isDouble = (now - lastTap.t < 350) &&
    Math.hypot(uv[0] - lastTap.x, uv[1] - lastTap.y) < 0.07;
  lastTap = { t: now, x: uv[0], y: uv[1] };
  if (S.state === "WIN") { if (isDouble) _cb.loadLevel(S.levelIdx + 1); return; }
  if (S.state === "ATTRACT") return;
  if (isDouble) { lastTap.t = 0; S.touchSteer = null; handleDoubleTap(uv); return; }
  S.touchSteer = uv;
}, { passive: false });
canvas.addEventListener("touchmove", e => {
  e.preventDefault();
  if (S.editMode && e.touches.length === 1) { _cb.editorPointerMove(canvasUV(e.touches[0])); return; }
  if (S.touchSpinG && e.touches.length >= 2) {
    let pa = null, pb = null;
    for (const t of e.touches) {
      if (t.identifier === S.touchSpinG.id0) pa = physPt(canvasUV(t));
      if (t.identifier === S.touchSpinG.id1) pb = physPt(canvasUV(t));
    }
    if (pa && pb) {
      const v1 = [pa[0] - S.touchSpinG.a0[0], pa[1] - S.touchSpinG.a0[1]];
      const v2 = [pb[0] - S.touchSpinG.b0[0], pb[1] - S.touchSpinG.b0[1]];
      const d = v1[0] * v2[0] + v1[1] * v2[1];
      if (d < 0) {       /* opposed motion: twist */
        const m1 = Math.hypot(v1[0], v1[1]), m2 = Math.hypot(v2[0], v2[1]);
        const c0 = [(S.touchSpinG.a0[0] + S.touchSpinG.b0[0]) / 2,
                    (S.touchSpinG.a0[1] + S.touchSpinG.b0[1]) / 2];
        const cr = (S.touchSpinG.a0[0] - c0[0]) * v1[1] - (S.touchSpinG.a0[1] - c0[1]) * v1[0]
                 + (S.touchSpinG.b0[0] - c0[0]) * v2[1] - (S.touchSpinG.b0[1] - c0[1]) * v2[0];
        S.touchSpin = Math.sign(cr) * Math.min(1, Math.min(m1, m2) * (-d) * 0.8);
      } else S.touchSpin = 0;
    }
    return;
  }
  if (S.rotateModeSlot >= 1) {
    if (S.aimEngaged) aimSlotAt(S.rotateModeSlot, canvasUV(e.changedTouches[0]));
    return;
  }
  if (S.touchPaint) { S.touchPaintPos = canvasUV(e.changedTouches[0]); return; }
  S.touchSteer = canvasUV(e.changedTouches[0]);
}, { passive: false });
canvas.addEventListener("touchend", e => {
  e.preventDefault();
  if (S.editMode) { _cb.editorPointerUp(); if (e.touches.length) return; }
  if (S.touchSpinG && e.touches.length < 2) { S.touchSpinG = null; S.touchSpin = 0; }
  if (S.rotateModeSlot >= 1 && S.aimEngaged && e.touches.length === 0) {
    S.rotateModeSlot = -1; S.aimEngaged = false;   /* lift = aim done */
  }
  if (e.touches.length === 0) { S.touchSteer = null; S.touchPaint = false; }
}, { passive: false });
/* ---------- touch toolbar ---------- */
function refreshToolbar() {
  document.querySelectorAll("#toolbar button[data-tool]").forEach(b =>
    b.classList.toggle("act", parseInt(b.dataset.tool) === S.selectedTool));
}
function buildToolbar() {
  if (!S.IS_TOUCH) return;
  const el = document.getElementById("toolbar");
  const items = [["\u00d7", -1], ["FAN", 0], ["BLU", 1], ["GRN", 2], ["W", 3], ["ST", 4], ["L", 5]];
  el.innerHTML = items.map(([l, i]) => '<button data-tool="' + i + '">' + l + "</button>").join("") +
    '<button data-act="erase">\u232b</button><button data-act="pause">\u23f8</button><button data-act="reset">R</button>' +
    '<button data-act="menu">\u2630</button>';
  el.querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      if (b.dataset.tool !== undefined) S.selectedTool = parseInt(b.dataset.tool);
      else if (b.dataset.act === "erase") { S.touchErase = !S.touchErase; b.classList.toggle("act", S.touchErase); }
      else if (b.dataset.act === "pause") S.paused = !S.paused;
      else if (b.dataset.act === "reset") _cb.loadLevel(S.levelIdx);
      else if (b.dataset.act === "menu") _cb.loadLevel(-1);
      refreshToolbar();
    };
  });
  refreshToolbar();
}
/* ---------- developer mode: secret keypress sequence ---------- */
const DEV_SEQ = "bullfrog";
let devSeqPos = 0;

window.addEventListener("keydown", e => {
  const tag = (e.target.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  const k = e.key.toLowerCase();
  keys.add(k);
  /* secret sequence: track at title screen regardless of other key handling */
  if (S.levelIdx < 0 && !S.devMode && k.length === 1) {
    if (k === DEV_SEQ[devSeqPos]) {
      devSeqPos++;
      if (devSeqPos >= DEV_SEQ.length) {
        S.devMode = true;
        devSeqPos = 0;
        if (_cb.devFlash) _cb.devFlash();
      }
    } else {
      devSeqPos = (k === DEV_SEQ[0]) ? 1 : 0;
    }
  }
  if (k === "escape") {
    if (S.editMode) { _cb.exitEditor(); }
    else if (S.levelIdx >= 0) _cb.loadLevel(-1);
    return;
  }
  if (S.levelIdx < 0 && k !== "t" && k !== "tab" && k !== "/" && e.key !== "?") return;
  const digit = e.code && e.code.indexOf("Digit") === 0 ? e.code.slice(5) : null;
  if (digit === "1") { S.selectedTool = 0; refreshToolbar(); }
  else if (digit === "2") { S.selectedTool = 1; refreshToolbar(); }
  else if (digit === "3") { S.selectedTool = 2; refreshToolbar(); }
  else if (digit === "4") { S.selectedTool = 3; refreshToolbar(); }
  else if (digit === "5") { S.selectedTool = 4; refreshToolbar(); }
  else if (digit === "6") { S.selectedTool = 5; refreshToolbar(); }
  else if (digit === "0") { S.selectedTool = -1; refreshToolbar(); }
  else if (k === "[") { if (S.selectedSlot >= 1) rotateSelected(1); }
  else if (k === "]") { if (S.selectedSlot >= 1) rotateSelected(-1); }
  else if (k === "r" && !S.editMode) _cb.loadLevel(S.levelIdx);
  else if (k === "," && S.devMode) _cb.loadLevel(S.levelIdx - 1);
  else if (k === "." && S.devMode) _cb.loadLevel(S.levelIdx + 1);
  else if (k === "n" && S.state === "WIN" && S.devMode) _cb.loadLevel(S.levelIdx + 1);
  else if (k === " ") { S.paused = !S.paused; e.preventDefault(); }
  else if (k === "tab") { S.debugMode = (S.debugMode + 1) % 11; e.preventDefault(); }
  else if (k === "t" && S.devMode) _cb.togglePanel();
  else if (k === "x") {           /* demo of event-driven chemistry pulses */
    pulseParam("exoConsume", 0.15, 2.5);
    pulseParam("exoForce", params.exoForce * 3, 2.5);
  }
  if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
  if (e.key === "?" || e.key === "/") toggleShortcutHelp();
});
window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));

/* ---------- unified shortcut help overlay ---------- */
const shortcutEl = document.getElementById("shortcutHelp");
let shortcutOpen = false;
function K(key, desc) { return `<span class="sk">${key}</span>${desc}`; }
function buildShortcutHelp() {
  const lines = [
    '<div class="sh">MOVEMENT</div>',
    K("W A S D", "move"), K("U / O", "spin CW / CCW"),
    K("Arrows", "move (alt)"),
    '', '<div class="sh">TOOLS</div>',
    K("1-3", "fan / blue / green"), K("4-5", "slate / steel walls"),
    K("6", "flow lane"), K("0", "deselect tool"),
    K("[ ]", "rotate hovered"),
    K("Shift", "aim mode"), K("Shift+Click", "place / paint"),
    K("Shift+RClick", "delete hovered"),
    '', '<div class="sh">GAME</div>',
    K("R", "reset level"),
    K("Space", "pause"), K("ESC", "menu"),
  ];
  if (S.devMode) {
    lines.push('', '<div class="sh">DEVELOPER</div>');
    lines.push(K("T", "tuning panel"), K("Tab", "cycle debug view"));
    lines.push(K("N", "next level (after win)"), K(", .", "prev / next level"));
    lines.push(K("X", "chemistry pulse demo"));
  }
  if (S.editMode) {
    lines.push('', '<div class="sh">EDITOR MODES</div>');
    lines.push(K("J", "select"), K("I", "entity (place)"));
    lines.push(K("L", "rectangle (box)"), K("K", "polygon"));
    lines.push('', '<div class="sh">EDITOR ACTIONS</div>');
    lines.push(K("Enter", "close polygon"), K("R", "restart simulation"));
    lines.push(K("Del", "delete selected"), K("Ctrl+Z", "undo"));
    lines.push(K("Y", "toggle editor panel"));
  }
  lines.push('', '<div class="sd">press / to close</div>');
  shortcutEl.innerHTML = lines.join("\n");
}
function toggleShortcutHelp() {
  shortcutOpen = !shortcutOpen;
  if (shortcutOpen) buildShortcutHelp();
  shortcutEl.style.display = shortcutOpen ? "block" : "none";
}
function hideShortcutHelp() {
  shortcutOpen = false;
  shortcutEl.style.display = "none";
}

export {
  keys, readInput,
  paintLane, paintWall,
  placeTool, deleteSelected, rotateSelected,
  updateSelection, updateGhost,
  refreshToolbar, buildToolbar,
  canvasUV, clampToReach, nearestAdjustable, aimSlotAt,
  placementValid, hideShortcutHelp,
};
