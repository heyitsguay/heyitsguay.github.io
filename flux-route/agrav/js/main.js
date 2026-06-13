/* FLUX ROUTE — main entry point: loadLevel, frame loop, HUD, events, overlays, boot.
 *
 * The orchestration layer. Boots the engine, runs the frame loop, and owns
 * all game-level logic: level loading, scoring, switches, events, callouts,
 * rendering, and HUD updates.
 *
 * ## Boot sequence (module scope, runs once)
 * 1. Import all modules, create overlay canvas (octx)
 * 2. Register _cb callbacks into input.js, editor.js, panel.js
 * 3. Wire inputRef bridge: simulation.setInputRef(input.inputRef)
 * 4. Build toolbar, detect touch/portrait
 * 5. loadLevel(startIdx) → requestAnimationFrame(frame)
 *
 * ## Frame loop (frame(now))
 * 1. readInput()                    — poll keyboard/touch state
 * 2. Substep accumulator: while(acc >= DT) substep()
 * 3. updateNests/checkPickups       — CPU-timed spawning, item collection
 * 4. Wall/lane painting             — continuous while shift+drag held
 * 5. Overlays: wires, gauges, callouts, menu wash
 * 6. updateSelection/updateGhost    — tool preview positioning
 * 7. renderFrame(now)               — GPU render + telemetry + HUD
 *
 * ## Scoring pipeline (renderFrame)
 * runReduce(scoreAcc) → copy to scoreOne → sensor pass → reduce →
 * telemetry gather → readback.kick() → readback.poll() → S.lastTelem →
 * updateHUD() computes captureEMA and checks win condition.
 *
 * ## Level loading (loadLevel(idx))
 * Full reset: clear all fields, call L.paint(gateState), upload level/
 * region/media textures, run JFA for SDF, spawn actors from L.actors,
 * compile events/switches, apply per-level param overrides, build wells.
 *
 * ## Switch system (§41)
 * evalSwitches() reads switch state from S.lastTelem, evaluates
 * volume/flow/pressure conditions with hysteresis, fires
 * setTargetEnabled() on actor/wall targets, refreshes level textures
 * on gate state changes.
 *
 * ## Event system (§43)
 * compileEvents() parses condition strings at level load.
 * checkEvents() evaluates per frame: time>=N, capture>=X,
 * switch:ID:on/off → fires pulse/setParams/callout/enable/disable actions.
 *
 * Dependencies: all other modules (this is the root).
 * Imported by: index.html (type="module").
 */
import { S, GW, RED, BLUE, GREEN, TOOLS, SPIN_TIER_DAMP } from './state.js';
import {
  SIM_W, SIM_H, DYE_W, DYE_H, DT, MAX_SUBSTEPS, N_ACTORS, TELEM_W,
  SIM_TEXEL, RES_SCALE, EMIT_K, GEL_ON, PRESSURE_ITERS, BLUR_PASSES,
  QUALITY_PRESETS, qualityName, SIZE_F,
  DEFAULT_PARAMS, params, dirtyKeys, dirtyVals, budgetOverrides,
  pulses, pulseParam, PV, anyPulseActive, effScale, mulberry32,
} from './config.js';
import {
  gl, canvas, P, U, runFS, drawTo, bindTex, clearRT, fullscreen, fatal,
  SCORE_SCALE, F32, HALF_FALLBACK,
  velocity, pressure, divergence, curlTex, dye, dynMask, obstacle,
  gel, level, distRT, seeds, seedSolid, seedEmpty,
  actors, scoreAcc, sensorRT, scoreOne, telemetry,
  bloomA, bloomB, regionsTex, levelPngTex, mediaTex,
  wake, walls, swState, dyn, matPackRT, matSum, maskTex,
  reduceChain, runJFA, quadVAO,
  cpuActors, freeSlots, writeActor, actorRecord, clearActorSlot,
  getLevelData, setLevelData,
} from './gl-core.js';
import {
  LEVELS, ATTRACT_LEVEL, curLevel, dataLevel,
  pxRect, pxPoly, border, base, pipHit, rasterPoly,
  lvCtx, lvCanvas, SOLID_C,
} from './levels.js';
import { substep, splat, simUniforms, readback, runReduce, setInputRef } from './simulation.js';
import {
  keys, readInput, paintLane, paintWall,
  placeTool, deleteSelected, rotateSelected,
  updateSelection, updateGhost, refreshToolbar, buildToolbar,
  canvasUV, clampToReach, placementValid, initInput,
  inputRef,
} from './input.js';
import {
  buildPanel, togglePanel, syncSliders, syncBudgetInputs,
  applyParamsForLevel, initPanel,
} from './panel.js';
import {
  openEditor, exitEditor,
  editorPointerDown, editorPointerMove, editorPointerUp,
  drawEditorOverlay, initEditor, setEditorCtx,
} from './editor.js';

/* S.lastTelem is initialized by ReadbackChannel in simulation.js */

function rasterZones(zones, fill, write) {
  // build directly in GL orientation (v-up); no flip needed
  for (const z of zones || []) {
    const [u0, v0, u1, v1] = z.rect;
    const i0 = Math.max(0, Math.floor(u0 * SIM_W)), i1 = Math.min(SIM_W, Math.ceil(u1 * SIM_W));
    const j0 = Math.max(0, Math.floor(v0 * SIM_H)), j1 = Math.min(SIM_H, Math.ceil(v1 * SIM_H));
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++) write(z, (j * SIM_W + i));
  }
  return fill;
}
function refreshLevelTextures() {
  const L = curLevel();
  L.paint(S.gateState);
  if (GW.f < 1) {                /* game window: solid beyond its bounds */
    pxRect(SOLID_C, 0, 0, 1, GW.v0);
    pxRect(SOLID_C, 0, GW.v1, 1, 1);
    pxRect(SOLID_C, 0, 0, GW.u0, 1);
    pxRect(SOLID_C, GW.u1, 0, 1, 1);
  }
  const img = lvCtx.getImageData(0, 0, SIM_W, SIM_H);
  setLevelData(img.data);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.bindTexture(gl.TEXTURE_2D, levelPngTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SIM_W, SIM_H, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array(img.data.buffer.slice(0)));
  const n = SIM_W * SIM_H, reg = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const gv = img.data[i * 4 + 1], bv = img.data[i * 4 + 2];
    const g = gv > 127, bHigh = bv > 191, bLow = bv > 63 && bv <= 191;
    reg[i * 4]     = (g && !bHigh) ? 255 : 0;       // sink   (#00ff00)
    reg[i * 4 + 1] = (bHigh && !g) ? 255 : 0;       // drain  (#0000ff)
    reg[i * 4 + 2] = (g && bHigh) ? 255 : 0;        // trigger (#00ffff)
    reg[i * 4 + 3] = (bLow && !g) ? 255 : 0;        // sensor (#000080)
  }
  gl.bindTexture(gl.TEXTURE_2D, regionsTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SIM_W, SIM_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, reg);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  // media + amp fields (data, not art)
  const med = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { med[i * 4] = 1; med[i * 4 + 1] = 1; med[i * 4 + 2] = 1; }
  rasterZones(L.mediaZones, med, (z, i) => {
    med[i * 4] = z.curl != null ? z.curl : 1;
    med[i * 4 + 1] = z.velDiss != null ? z.velDiss : 1;
    med[i * 4 + 2] = z.dyeDiss != null ? z.dyeDiss : 1;
  });
  for (const p of (L.data && L.data.polys) || [])
    if (p.kind === "media") rasterPoly(p.pts, i => {
      med[i * 4] = p.curl != null ? p.curl : 1;
      med[i * 4 + 1] = p.velDiss != null ? p.velDiss : 1;
      med[i * 4 + 2] = p.dyeDiss != null ? p.dyeDiss : 1;
    });
  gl.bindTexture(gl.TEXTURE_2D, mediaTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, SIM_W, SIM_H, 0, gl.RGBA, gl.FLOAT, med);
  runJFA();
}

/* flow polys + legacy ampZones rasterize into the lane buffer at load:
 * one buffer is the in-level truth; polygons are the design-time truth. */
function initDynField(L) {
  const n = SIM_W * SIM_H, df = new Float32Array(n * 4);
  for (const p of (L.data && L.data.polys) || []) {
    if (p.kind !== "flow") continue;
    const st = p.strength != null ? p.strength : 1;
    const gx = Math.cos(p.angle || 0) * st, gy = Math.sin(p.angle || 0) * st;
    const pw = p.powered ? 1 : 0;
    rasterPoly(p.pts, i => { df[i * 4 + 1] = gx; df[i * 4 + 2] = gy; df[i * 4 + 3] = pw; });
  }
  for (const p of (L.data && L.data.polys) || [])
    if (p.kind === "dynamite")
      rasterPoly(p.pts, i => { df[i * 4] = p.amount != null ? p.amount : 1; });
  rasterZones(L.ampZones, df, (z, i) => {    /* legacy amps: red-powered flow */
    const st = (z.gain || 800) / 700;
    df[i * 4 + 1] = Math.cos(z.angle) * st; df[i * 4 + 2] = Math.sin(z.angle) * st;
    df[i * 4 + 3] = 1;
  });
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  for (const rt of [dyn.a, dyn.b]) {
    gl.bindTexture(gl.TEXTURE_2D, rt.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, SIM_W, SIM_H, 0, gl.RGBA, gl.FLOAT, df);
  }
}
/* ---------- game window: levels can occupy a centered sub-rect ---------- */
function setGameWindow(L) {
  const f = SIZE_F[L.size] || 1;
  const m = (1 - f) / 2;
  GW.f = f; GW.u0 = m; GW.v0 = m; GW.u1 = 1 - m; GW.v1 = 1 - m;
}
function layoutChrome() {     /* anchor HUD/toolbar just outside the window */
  const hud = document.getElementById("hud"), tb = document.getElementById("toolbar");
  if (!hud || !tb) return;
  if (GW.f >= 1 || S.IS_PORTRAIT) {
    hud.style.top = ""; hud.style.left = "";
    tb.style.left = ""; tb.style.top = ""; tb.style.bottom = "";
    return;
  }
  const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 6;
  const r = canvas.getBoundingClientRect();
  const sc = Math.min(r.width / 16, r.height / 9), w = sc * 16, h = sc * 9;
  const x0 = r.left + (r.width - w) / 2, y0 = r.top + (r.height - h) / 2;
  const wx0 = x0 + GW.u0 * w;
  const wyTop = y0 + (1 - GW.v1) * h, wyBot = y0 + (1 - GW.v0) * h;
  hud.style.left = Math.max(ui, wx0) + "px";
  hud.style.top = Math.max(ui * 0.7, wyTop - ui * 5) + "px";
  tb.style.left = Math.max(ui, wx0) + "px";
  tb.style.bottom = "auto";
  tb.style.top = Math.min(window.innerHeight - ui * 10, wyBot + ui * 1.7) + "px";
}
window.addEventListener("resize", layoutChrome);

function loadLevel(idx) {
  S.levelIdx = idx < 0 ? -1 : Math.max(0, Math.min(LEVELS.length - 1, idx));
  const L = curLevel();
  setGameWindow(curLevel());
  S.gateState = {}; S.simTime = 0;
  clearRT(swState.a); clearRT(swState.b); initDynField(curLevel());
  compileEvents();
  pendingCallouts = (curLevel().callouts || [])
    .filter(c => c.t != null).map(c => Object.assign({ fired: false }, c));
  if (calloutBox) { calloutBox.innerHTML = ""; liveCallouts = []; }
  emphases = [];
  S.rng = mulberry32(S.levelIdx * 1337 + 7);
  applyParamsForLevel();
  refreshLevelTextures();
  for (const rt of [velocity.a, velocity.b, pressure.a, pressure.b, dye.a, dye.b,
                    scoreAcc.a, scoreAcc.b, dynMask, divergence, curlTex, gel.a, gel.b, wake.a, wake.b,
                    actors.a, actors.b]) clearRT(rt);
  {   /* pre-placed gel from polys */
    const gp = ((curLevel().data || {}).polys || []).filter(p => p.kind === "gel");
    if (gp.length) {
      const gf = new Float32Array(SIM_W * SIM_H);
      for (const p of gp) rasterPoly(p.pts, i => { gf[i] = p.amount != null ? p.amount : 1; });
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      for (const rt of [gel.a, gel.b]) {
        gl.bindTexture(gl.TEXTURE_2D, rt.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, SIM_W, SIM_H, 0, gl.RED, gl.FLOAT, gf);
      }
    }
  }
  cpuActors.fill(null);
  freeSlots.length = 0;
  for (let s = N_ACTORS - 1; s >= 1; s--) freeSlots.push(s);
  if (L.playerStart[0] >= 0) {
    writeActor(0, actorRecord({ type: 1, pos: L.playerStart, r: 5 }));
    cpuActors[0] = { type: 1, r: 5 };
  }
  for (const a of L.actors) {
    const slot = freeSlots.pop();
    writeActor(slot, actorRecord(a));
    cpuActors[slot] = Object.assign({ timer: a.type === 7 ? a.period : 0, slot }, a);
    if (a.enabled === false) setActorEnabled(cpuActors[slot], false);
  }
  for (const sw of L.switches || [])
    for (const tgt of sw.targets || []) setTargetEnabled(tgt, false);
  const ov = budgetOverrides[S.levelIdx] || {};
  S.budget = Object.assign({ fan: 0, blue: 0, green: 0 }, L.budgets, ov);
  S.wells = Object.assign({ slate: 0, lanes: 0, steel: 0 }, L.wells);
  S.wallPxUsed = 0; S.lanePxUsed = 0; S.lanePrev = null; S.rightPaint = false;
  layoutChrome();
  S.emitRate = redEmitRate();
  {  /* removable level walls live in the dynamic walls field (survive gate repaints) */
    const wf = new Float32Array(SIM_W * SIM_H * 2);
    rasterZones(L.removableWalls, wf, (z, i) => { wf[i * 2] = 1; });
    for (const p of (L.data && L.data.polys) || []) {
      if (p.kind === "removable" || p.kind === "slate") rasterPoly(p.pts, i => { wf[i * 2] = 1; });
      if (p.kind === "steel") rasterPoly(p.pts, i => { wf[i * 2 + 1] = 1; });
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const rt of [walls.a, walls.b]) {
      gl.bindTexture(gl.TEXTURE_2D, rt.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, SIM_W, SIM_H, 0, gl.RG, gl.FLOAT, wf);
    }
  }
  S.state = S.levelIdx < 0 ? "ATTRACT" : "PLAY"; S.paused = false;
  S.emittedRed = 0; S.winHoldT = 0; S.prevDelivered = 0; S.captureEMA = 0; S.sensorEMA = 0;
  S.scoreOffset = 0;
  S.sinkHueDrift = 0; S.spinTier = 0;
  S.pendingSpawn = null; S.selectedSlot = -1;
  document.getElementById("win").style.display = "none";
  document.getElementById("menu").style.display = S.levelIdx < 0 ? "flex" : "none";
  document.getElementById("options").style.display = "none";
  if (typeof S.rotateModeSlot !== "undefined") {
    S.rotateModeSlot = -1; S.aimEngaged = false; S.touchSteer = null;
    S.touchPaint = false; S.touchSpinG = null; S.touchSpin = 0;
  }
  const inGame = S.levelIdx >= 0 ? "" : "none";
  hudEl.style.display = inGame; statsEl.style.display = inGame;
  document.getElementById("keys").style.display = S.IS_TOUCH ? "none" : inGame;
  document.getElementById("toolbar").style.display =
    (S.IS_TOUCH && S.levelIdx >= 0) ? "flex" : "none";
  syncBudgetInputs();
  updateHUDStatic();
}

function redEmitRate() {
  let r = 0;
  for (const a of cpuActors)
    if (a && a.type === 3 && a.dye)
      r += (a.strength || 0) * params.emitScale * EMIT_K *
        a.r * a.r * effScale() * effScale() * a.dye[0];
  return r;
}

/* ---------- render ---------- */
function renderFrame(now) {
  const r1 = runReduce(scoreAcc.read.tex);
  runFS(P.copy, scoreOne, p => {
    bindTex(p, "uSrc", r1.tex, 0);
    gl.uniform1f(U(p, "uMul"), 1.0);
  });
  runFS(P.sensor, sensorRT, p => {
    bindTex(p, "uDye", dye.read.tex, 0);
    bindTex(p, "uVelocity", velocity.read.tex, 1);
    bindTex(p, "uRegions", regionsTex, 2);
  });
  const r2 = runReduce(sensorRT.tex);
  runFS(P.telemetry, telemetry, p => {
    bindTex(p, "uScoreOne", scoreOne.tex, 0);
    bindTex(p, "uSensorReduced", r2.tex, 1);
    bindTex(p, "uActors", actors.read.tex, 2);
  });
  readback.kick(telemetry.fbo);
  const t = readback.poll();

  runFS(P.bright, bloomA, p => {
    bindTex(p, "uDye", dye.read.tex, 0);
    gl.uniform1f(U(p, "uThreshold"), params.bloomThr);
    gl.uniform3f(U(p, "uBloomW"), 1.0, 0.5, 0.6);
  });
  let bsrc = bloomA, bdst = bloomB;
  for (let i = 0; i < BLUR_PASSES; i++) {
    const dir = i % 2 === 0 ? [SIM_TEXEL[0], 0] : [0, SIM_TEXEL[1]];
    runFS(P.blur, bdst, p => {
      bindTex(p, "uSrc", bsrc.tex, 0);
      gl.uniform2f(U(p, "uDir"), dir[0], dir[1]);
    });
    const tmp = bsrc; bsrc = bdst; bdst = tmp;
  }

  drawTo(null);
  const C = P.composite;
  gl.useProgram(C);
  bindTex(C, "uDye", dye.read.tex, 0);
  bindTex(C, "uLevel", level.tex, 1);
  bindTex(C, "uRegions", regionsTex, 2);
  bindTex(C, "uBloom", bsrc.tex, 3);
  bindTex(C, "uVelocity", velocity.read.tex, 4);
  bindTex(C, "uPressure", pressure.read.tex, 5);
  bindTex(C, "uDivergence", divergence.tex, 6);
  bindTex(C, "uCurl", curlTex.tex, 7);
  bindTex(C, "uObstacle", obstacle.tex, 8);
  bindTex(C, "uScoreAcc", scoreAcc.read.tex, 9);
  bindTex(C, "uGel", gel.read.tex, 10);
  bindTex(C, "uMedia", mediaTex, 11);
  bindTex(C, "uWake", wake.read.tex, 13);
  gl.uniform4f(U(C, "uWin"), GW.u0, GW.v0, GW.u1, GW.v1);
  bindTex(C, "uWalls", walls.read.tex, 14);
  simUniforms(C);
  gl.uniform1i(U(C, "uDebugMode"), S.debugMode);
  gl.uniform1f(U(C, "uTime"), now / 1000);
  gl.uniform1f(U(C, "uTonemapK"), params.tonemapK);
  gl.uniform1f(U(C, "uBloomStrength"), params.bloomStr);
  gl.uniform1f(U(C, "uSinkHeat"), S.sinkHeat);
  gl.uniform1f(U(C, "uTriggerHeat"), S.trigHeat);
  gl.uniform1f(U(C, "uSinkHueDrift"), S.sinkHueDrift);
  gl.uniform1f(U(C, "uDynTrig"), PV("dynTrigger"));
  bindTex(C, "uDyn", dyn.read.tex, 15);
  gl.uniform1f(U(C, "uPulsePhase"), S.pulsePhase);
  gl.uniform1f(U(C, "uPulseAmp"), S.pulseAmp);
  gl.uniform1f(U(C, "uHueShift"), params.hueShift);
  gl.uniform1f(U(C, "uFlowGlow"), params.flowGlow);
  gl.uniform1f(U(C, "uStreak"), params.streak);
  gl.uniform1f(U(C, "uCurlTint"), params.curlTint);
  gl.uniform1f(U(C, "uSchlieren"), params.schlieren);
  gl.uniform1f(U(C, "uSpeciesFx"), params.speciesFx);
  gl.uniform1f(U(C, "uResScale"), RES_SCALE);
  gl.uniform1f(U(C, "uGelGlow"), params.gelGlow);
  fullscreen();

  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(P.glyph);
  bindTex(P.glyph, "uActors", actors.read.tex, 0);
  gl.uniform2f(U(P.glyph, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]);
  gl.uniform1f(U(P.glyph, "uExtentMul"), 1.8);
  gl.uniform1f(U(P.glyph, "uEntityScale"), effScale());
  gl.uniform1f(U(P.glyph, "uGhost"), 0);
  gl.uniform1f(U(P.glyph, "uGhostValid"), 0);
  gl.uniform1i(U(P.glyph, "uSelected"), S.selectedSlot);
  gl.uniform1f(U(P.glyph, "uPaintGlow"), S.wallPaintGlow);
  gl.uniform1f(U(P.glyph, "uTime"), S.simTime);
  gl.bindVertexArray(quadVAO);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N_ACTORS);
  if (S.selectedTool >= 0 && keys.has("shift") && S.state !== "ATTRACT" && (S.lastTelem[8] || S.lastTelem[9])) {
    const tool = TOOLS[S.selectedTool];
    gl.useProgram(P.ghost);
    gl.uniform2f(U(P.ghost, "uGhostPos"), S.ghostPos[0], S.ghostPos[1]);
    gl.uniform1f(U(P.ghost, "uGhostRadius"), tool.r);
    gl.uniform1f(U(P.ghost, "uGhostAngle"), S.ghostAngle);
    gl.uniform1f(U(P.ghost, "uGhostType"), tool.type);
    const d = tool.dye || [1, 1, 1];
    gl.uniform4f(U(P.ghost, "uGhostDye"), d[0], d[1], d[2], 0);   /* type 9: raw color */
    gl.uniform2f(U(P.ghost, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]);
    gl.uniform1f(U(P.ghost, "uExtentMul"), 1.8);
    gl.uniform1f(U(P.ghost, "uEntityScale"), effScale());
    gl.uniform1f(U(P.ghost, "uGhost"), 1);
    gl.uniform1f(U(P.ghost, "uGhostValid"), placementValid(S.ghostPos) ? 1 : 0);
    gl.uniform1i(U(P.ghost, "uSelected"), -1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  gl.bindVertexArray(null);
  gl.disable(gl.BLEND);

  updateHUD(t, now);
}


/* ---------- nests (CPU-timed spawning, seeded; GPU never spawns) ---------- */
function updateNests(steps) {
  if (!steps) return;
  for (const a of cpuActors) {
    if (!a || a.type !== 7 || a.dormant) continue;
    a.timer -= steps * DT;
    if (a.timer <= 0) {
      if (freeSlots.length) {
        const slot = freeSlots.pop();
        writeActor(slot, actorRecord({ type: 6, pos: a.pos, r: 6,
          predThrust: a.predThrust, predTtl: a.predTtl }));
        cpuActors[slot] = { slot, type: 6, death: S.simTime + (a.predTtl || params.predTtl || 14) + 0.5 };
      }
      a.timer = a.period * (1 + (a.jitter || 0) * (S.rng() * 2 - 1));
    }
    const f = actorRecord(a);
    f[11] = Math.max(0, Math.min(1, a.timer / a.period));   // iris arm fraction
    writeActor(a.slot, f);
  }
  for (let s = 1; s < N_ACTORS; s++) {
    const a = cpuActors[s];
    if (a && a.type === 6 && a.death != null && S.simTime > a.death) {
      cpuActors[s] = null; freeSlots.push(s);               // GPU TTL already zeroed it
    }
  }
}


/* ---------- pickups, messages, toasts ---------- */
const calloutBox = document.getElementById("callouts");
let liveCallouts = [];
function uvToScreen(u, v) {
  const r = canvas.getBoundingClientRect();
  if (S.IS_PORTRAIT) {
    const sc = Math.min(r.width / 9, r.height / 16), w = sc * 9, h = sc * 16;
    return [r.left + (r.width - w) / 2 + v * w, r.top + (r.height - h) / 2 + u * h];
  }
  const sc = Math.min(r.width / 16, r.height / 9), w = sc * 16, h = sc * 9;
  return [r.left + (r.width - w) / 2 + u * w, r.top + (r.height - h) / 2 + (1 - v) * h];
}
function calloutHTML(t) {       /* *x* = fx-title, ~x~ = fx-soft */
  const esc = String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*([^*]+)\*/g, '<span class="fx-title">$1</span>')
            .replace(/~([^~]+)~/g, '<span class="fx-soft">$1</span>');
}
function spawnCallout(c) {
  if (!calloutBox) return;
  const at = c.at || [0.5, GW.v0 + (GW.v1 - GW.v0) * 0.84];   /* default: window top-center */
  const el = document.createElement("div");
  el.className = "co";
  el._at = at;
  el.innerHTML = calloutHTML((S.IS_TOUCH && c.textTouch) ? c.textTouch : c.text);
  /* size relative to game area, not viewport — prevents UHD phones from
     showing disproportionately large callouts vs. the game content */
  const r = canvas.getBoundingClientRect();
  const gameH = S.IS_PORTRAIT
    ? Math.min(r.width / 9, r.height / 16) * 9
    : Math.min(r.width / 16, r.height / 9) * 9;
  const basePx = gameH / 60;            /* ≈ 2.2 * 6 = 13.2 at desktop 1080p */
  el.style.fontSize = (basePx * (c.size || 1)).toFixed(1) + "px";
  calloutBox.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  liveCallouts.push({ el, at, until: S.simTime + (c.dur || 5) });
}
function updateCallouts() {
  liveCallouts = liveCallouts.filter(c => {
    if (S.simTime > c.until || S.state === "ATTRACT") { c.el.remove(); return false; }
    c.el.classList.toggle("fading", S.simTime > c.until - 0.7);
    if (c.at) {
      const p = uvToScreen(c.at[0], c.at[1]);
      c.el.style.left = p[0] + "px"; c.el.style.top = p[1] + "px";
    }
    return true;
  });
}
/* ---------- switch gauges + wires overlay (2D canvas; rotates with #gl) ---------- */
const ovc = document.getElementById("ovc");
const octx = ovc ? ovc.getContext("2d") : null;
function maskTint(m) {
  if (m[0] && !m[1] && !m[2]) return "#ff6a3a";
  if (m[1] && !m[0] && !m[2]) return "#3ae07a";
  if (m[2] && !m[0] && !m[1]) return "#5a86ff";
  return "#cfd8ea";
}
function drawOverlay() {
  if (!octx) return;
  const cw = ovc.clientWidth, ch = ovc.clientHeight;
  if (!cw || !ch) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (ovc.width !== (cw * dpr | 0)) { ovc.width = cw * dpr | 0; ovc.height = ch * dpr | 0; }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, cw, ch);
  if (S.state === "ATTRACT") return;
  const sws = curLevel().switches || [];
  const sc = Math.min(cw / 16, ch / 9), W = sc * 16, H = sc * 9;
  const x0 = (cw - W) / 2, y0 = (ch - H) / 2;
  const px = (u, v) => [x0 + u * W, y0 + (1 - v) * H];
  if (S.editMode) drawEditorOverlay(px);
  drawEmphases(px, sc);
  for (const sw of sws) {
    const on = !!S.gateState[sw.id];
    const dead = !!sw._latched;                    /* settled: fade to gray */
    if (dead) octx.globalAlpha = 0.22;
    const P0 = px((sw.rect[0] + sw.rect[2]) / 2, (sw.rect[1] + sw.rect[3]) / 2);
    for (const wire of dead ? [] : sw.wires || []) {   /* wires vanish */
      octx.beginPath(); octx.moveTo(P0[0], P0[1]);
      for (const pt of wire) { const q = px(pt[0], pt[1]); octx.lineTo(q[0], q[1]); }
      octx.lineWidth = 2;
      if (on) {
        octx.strokeStyle = sw.inhibit ? "#ffb347" : "#5fd8ff";
        octx.setLineDash([6, 5]); octx.lineDashOffset = -S.simTime * 30;
      } else { octx.strokeStyle = "#2a3550"; octx.setLineDash([]); }
      octx.stroke(); octx.setLineDash([]); octx.lineDashOffset = 0;
    }
    if (!dead && (!sw.wires || !sw.wires.length))     /* auto-wire to actor targets */
      for (const tgt of sw.targets || [])
        for (const c of cpuActors) {
          if (!c || c.id !== tgt.id) continue;
          const tx = S.lastTelem[(2 + c.slot) * 4] || (c.pos && c.pos[0]);
          const ty = S.lastTelem[(2 + c.slot) * 4 + 1] || (c.pos && c.pos[1]);
          if (tx == null) continue;
          const q = px(tx, ty);
          octx.beginPath(); octx.moveTo(P0[0], P0[1]); octx.lineTo(q[0], q[1]);
          octx.lineWidth = 2;
          if (on) { octx.strokeStyle = sw.inhibit ? "#ffb347" : "#5fd8ff";
            octx.setLineDash([6, 5]); octx.lineDashOffset = -S.simTime * 30; }
          else { octx.strokeStyle = "#2a3550"; octx.setLineDash([]); }
          octx.stroke(); octx.setLineDash([]); octx.lineDashOffset = 0;
        }
    const R = Math.max(9, sc * 0.5);
    octx.lineWidth = 3;
    octx.beginPath(); octx.arc(P0[0], P0[1], R, 0, 6.2832);
    octx.strokeStyle = "#1a2236"; octx.stroke();
    octx.beginPath();                              /* gauge: tank/timer fill */
    octx.arc(P0[0], P0[1], R, -Math.PI / 2, -Math.PI / 2 + 6.2832 * Math.min(sw._frac || 0, 1));
    octx.strokeStyle = dead ? "#8a93a6" : on ? (sw.inhibit ? "#ffb347" : "#7fe8ff") : maskTint(sw.mask || [0, 0, 0]);
    octx.stroke();
    octx.beginPath(); octx.arc(P0[0], P0[1], R + 5, 0, 6.2832);
    octx.lineWidth = 1.6;                          /* dashed = forgets */
    if (sw.kind === "flow" && sw.latch !== "static") octx.setLineDash([4, 4]);
    octx.strokeStyle = dead ? "#6b7484" : on ? (sw.inhibit ? "#ffd28a" : "#bdf3ff") : "#3a4663";
    octx.stroke(); octx.setLineDash([]);
    octx.globalAlpha = 1;
  }
}
const menuWash = document.getElementById("menuWash");
function updateMenuWash() {
  if (!menuWash) return;
  const z = (ATTRACT_LEVEL.mediaZones && ATTRACT_LEVEL.mediaZones[0].rect) || [0.34, 0.28, 0.66, 0.72];
  const a = uvToScreen(z[0], z[1]), b = uvToScreen(z[2], z[3]);
  menuWash.style.left = Math.min(a[0], b[0]) + "px";
  menuWash.style.top = Math.min(a[1], b[1]) + "px";
  menuWash.style.width = Math.abs(b[0] - a[0]) + "px";
  menuWash.style.height = Math.abs(b[1] - a[1]) + "px";
}
const msgEl = document.getElementById("msg");
const toastEl = document.getElementById("toast");
let toastUntil = 0;
function showToast(text) { toastEl.textContent = text; toastUntil = performance.now() / 1000 + 2.6; }
function updateOverlays(now) {
  const L = curLevel();
  let active = null;
  for (const m of L.messages || [])
    if (S.simTime >= m.t && S.simTime < m.t + m.dur) { active = m; break; }
  if (active) msgEl.textContent = active.text;
  msgEl.style.opacity = active ? 1 : 0;
  toastEl.style.opacity = now / 1000 < toastUntil ? 1 : 0;
}
function checkPickups() {
  if (S.state === "ATTRACT") return;
  const px = S.lastTelem[8], py = S.lastTelem[9];          // player = telemetry pixel 2
  if (!px && !py) return;
  for (let s = 1; s < N_ACTORS; s++) {
    const a = cpuActors[s];
    if (!a || a.type !== 8) continue;
    const reach = (5 + (a.r || 5)) * effScale() * Math.max(SIM_TEXEL[0], SIM_TEXEL[1]);
    if (Math.hypot(px - a.pos[0], py - a.pos[1]) < reach) {
      if (a.gives === "slate" || a.gives === "lanes" || a.gives === "steel") {
        S.wells[a.gives] += a.count || 200;
        showToast("+" + (a.count || 200) + " px " + ({ slate: "SLATE", lanes: "LANE", steel: "STEEL" })[a.gives] + " WELL");
      } else if (/^spin[123]$/.test(a.gives)) {
        const t = +a.gives[4];
        if (t > S.spinTier) { S.spinTier = t; showToast("SPIN MOTOR " + ["", "I", "II", "III"][t] + " \u2014 max spin raised"); }
        else showToast("spare motor part \u2014 already at tier " + S.spinTier);
      } else {
        S.budget[a.gives] = (S.budget[a.gives] || 0) + (a.count || 1);
        const LBL = { fan: "FAN", blue: "BLUE EMITTER", green: "GREEN EMITTER",
          wallAdd: "FABRICATOR SECONDS", wallErase: "DISSOLVER SECONDS" };
        showToast("+" + (a.count || 1) + " " + (LBL[a.gives] || a.gives.toUpperCase()) + " collected");
      }
      clearActorSlot(s); cpuActors[s] = null; freeSlots.push(s);
      syncBudgetInputs();
    }
  }
}


/* ---------- HUD, gates, win ---------- */
const hudEl = document.getElementById("hud");
const statsEl = document.getElementById("stats");
function updateHUDStatic() {
  hudEl.textContent = curLevel().name;
}
function evalSwitches() {
  const L = curLevel();
  S.winInhibited = false;
  if (!L.switches || !L.switches.length) { S.trigHeat = 0; return; }
  let changed = false;
  L.switches.forEach((sw, i) => {
    const o = (TELEM_W + i) * 4;
    const bank = S.lastTelem[o], timer = S.lastTelem[o + 1], latched = S.lastTelem[o + 2] > 0.5;
    const on = latched || (sw.kind !== "flow"          /* volume + pressure read st.x */
      ? bank >= sw.threshold : timer >= (sw.holdSec || 1));
    sw._frac = sw.kind !== "flow"
      ? Math.min(bank / Math.max(sw.threshold, 1e-6), 1)
      : Math.min(timer / Math.max(sw.holdSec || 1, 1e-3), 1);
    sw._flux = S.lastTelem[o + 3];
    sw._latched = latched || (on && (sw.kind !== "flow" || sw.latch === "static"));
    if (sw.inhibit && on) S.winInhibited = true;
    if (!!S.gateState[sw.id] !== on) {
      S.gateState[sw.id] = on; changed = true;
      fireEvent("switch:" + sw.id + ":" + (on ? "on" : "off"));
      for (const tgt of sw.targets || []) setTargetEnabled(tgt, on);
    }
  });
  if (changed) refreshLevelTextures();
  S.trigHeat = L.switches[0] ? L.switches[0]._frac : 0;
}
function setActorEnabled(c, want) {
  c.enabled = !!want;
  if (c.type === 7) c.dormant = !want;
  else if (c.type === 2 || c.type === 3) {
    if (c._orig == null) c._orig = c.strength;
    c.strength = want ? c._orig : 0;
    writeActor(c.slot, actorRecord(c));
    S.emitRate = redEmitRate();   /* capture% denominator must track live emitters */
  }
}
function cutWallPoly(polyId) {
  const polys = (curLevel().data || {}).polys || [];
  const p = polys.find(q => q.id === polyId);
  if (!p) return;
  const mf = new Float32Array(SIM_W * SIM_H);
  rasterPoly(p.pts, i => { mf[i] = 1; });
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, SIM_W, SIM_H, 0, gl.RED, gl.FLOAT, mf);
  runFS(P.wallCut, walls.write, pr => {
    bindTex(pr, "uWalls", walls.read.tex, 0);
    bindTex(pr, "uMask", maskTex, 1);
    gl.uniform1f(U(pr, "uChan"), p.kind === "steel" ? 1 : 0);
  });
  walls.swap();
}
function setTargetEnabled(tgt, on) {
  const want = tgt.invert ? !on : on;
  if (tgt.poly) {                          /* removable-wall polys: deletion */
    if (want && !tgt._cut) { tgt._cut = true; cutWallPoly(tgt.poly); }
    return;
  }
  for (const c of cpuActors) {
    if (!c || c.id !== tgt.id) continue;
    if (tgt.action === "delete") {
      if (want && c.slot >= 1) { clearActorSlot(c.slot); cpuActors[c.slot] = null; freeSlots.push(c.slot); }
    } else if (tgt.action === "modify") {
      if (want) {
        if (!c._saved) {
          c._saved = {};
          for (const k of Object.keys(tgt.state || {})) c._saved[k] = c[k];
        }
        Object.assign(c, tgt.state || {});
      } else if (c._saved) { Object.assign(c, c._saved); c._saved = null; }
      writeActor(c.slot, actorRecord(c));
    } else setActorEnabled(c, want);     /* enable/disable toggle */
  }
}

/* ---------- events ---------- */
let emphases = [];
function addEmphasis(spec) {
  emphases.push(Object.assign({ t0: S.simTime, dur: spec.dur || 2, level: spec.level || "regular" }, spec));
}
function emphGeom(em) {                      /* resolved per frame: tracks motion */
  if (em.id) {
    for (const c of cpuActors) {
      if (!c || c.id !== em.id) continue;
      const u = S.lastTelem[(2 + c.slot) * 4] || (c.pos && c.pos[0]) || 0;
      const v = S.lastTelem[(2 + c.slot) * 4 + 1] || (c.pos && c.pos[1]) || 0;
      return { circle: true, u, v, r: c.r || 5 };
    }
    return null;
  }
  if (em.poly) {
    const p = ((curLevel().data || {}).polys || []).find(q => q.id === em.poly);
    return p ? { pts: p.pts } : null;
  }
  if (em.at) return { circle: true, u: em.at[0], v: em.at[1], r: em.r || 6 };
  return null;
}
function drawEmphases(px, sc) {
  emphases = emphases.filter(em => S.simTime < em.t0 + em.dur);
  for (const em of emphases) {
    const geo = emphGeom(em);
    if (!geo) continue;
    const hi = em.level === "high";
    const period = hi ? 0.85 : 1.2, rings = hi ? 2 : 1;
    const fade = Math.min(1, (em.t0 + em.dur - S.simTime) / 0.5);
    for (let k = 0; k < rings; k++) {
      const ph = ((S.simTime - em.t0) / period + k * 0.5) % 1;
      const alpha = (1 - ph) * (hi ? 0.8 : 0.45) * fade;
      if (alpha <= 0.01) continue;
      const grow = ph * (hi ? 26 : 16);
      octx.lineWidth = 2.6 - 1.6 * ph;
      if (geo.circle) {
        const q = px(geo.u, geo.v);
        const r0 = geo.r * sc / 30 + 7;          /* glyph radius -> screen px */
        octx.strokeStyle = (hi ? "rgba(255,224,150," : "rgba(127,232,255,") + alpha.toFixed(3) + ")";
        octx.beginPath(); octx.arc(q[0], q[1], r0 + grow, 0, 6.2832); octx.stroke();
      } else {
        octx.save();
        octx.shadowColor = hi ? "#ffe096" : "#7fe8ff";
        octx.shadowBlur = 5 + grow;
        octx.strokeStyle = (hi ? "rgba(255,224,150," : "rgba(127,232,255,") + alpha.toFixed(3) + ")";
        octx.beginPath();
        const q0 = px(geo.pts[0][0], geo.pts[0][1]);
        octx.moveTo(q0[0], q0[1]);
        for (let i = 1; i < geo.pts.length; i++) { const q = px(geo.pts[i][0], geo.pts[i][1]); octx.lineTo(q[0], q[1]); }
        octx.closePath(); octx.stroke();
        octx.restore();
      }
    }
  }
}
let levelEvents = [], pendingCallouts = [];
function eventDur(e) {            /* longest callout duration in a step's actions */
  let d = 0;
  for (const a of e.do || []) if (a.callout) d = Math.max(d, a.callout.dur || 5);
  return d;
}
function compileEvents() {
  let cursor = 0;                /* running end-time of the prior timeline step */
  levelEvents = (curLevel().events || []).map(e => {
    const c = Object.assign({ fired: false }, e);
    if (c.after != null && c.at == null) c.at = cursor + c.after;
    if (c.at != null && c.on == null) {
      c.on = "time>=" + c.at;    /* timeline sugar */
      cursor = c.at; // + eventDur(c);
    }
    return c;
  });
}
function fireEvent(tag) {
  for (const e of levelEvents)
    if (!(e.fired && e.once !== false) && e.on === tag) runEventActions(e);
}
function checkEvents() {
  for (const e of levelEvents) {
    if ((e.fired && e.once !== false) || typeof e.on !== "string") continue;
    let m;
    if ((m = e.on.match(/^time>=([\d.]+)$/))) { if (S.simTime >= +m[1]) runEventActions(e); }
    else if ((m = e.on.match(/^capture>=([\d.]+)$/))) { if (S.captureEMA >= +m[1]) runEventActions(e); }
  }
}
function runEventActions(e) {
  e.fired = true;
  for (const a of e.do || []) {
    if (a.pulse) pulseParam(a.pulse.key, a.pulse.value, a.pulse.dur || 1);
    if (a.setParams) { Object.assign(params, a.setParams); S.emitRate = redEmitRate(); syncSliders(); }
    if (a.callout) spawnCallout(a.callout);
    if (a.enable) for (const c of cpuActors) { if (c && c.id === a.enable) setActorEnabled(c, true); }
    if (a.disable) for (const c of cpuActors) { if (c && c.id === a.disable) setActorEnabled(c, false); }
    if (a.emphasize) addEmphasis(a.emphasize);
  }
}
function updateHUD(t, now) {
  const tNow = now / 1000;
  const pdt = Math.max(1e-3, Math.min(0.25, tNow - S.lastPulseT));
  S.lastPulseT = tNow;
  if (S.state === "ATTRACT") { S.pulsePhase += pdt * 3; return; }
  const L = curLevel();
  const rawDelivered = t[0] / SCORE_SCALE;
  const delivered = rawDelivered + (S.scoreOffset || 0);
  const sensorRaw = t[4];
  if (!S.paused) {
    const inst = Math.max(0, Math.min(2, (delivered - S.prevDelivered) / pdt / Math.max(S.emitRate, 1e-6)));
    const k = 1 - Math.exp(-pdt / 0.5);
    S.captureEMA += k * (inst - S.captureEMA);
    const k2 = 1 - Math.exp(-pdt / 0.4);
    S.sensorEMA += k2 * (sensorRaw / RES_SCALE / Math.max(S.emitRate, 1e-6) - S.sensorEMA);
    evalSwitches();
    checkEvents();
  }
  S.prevDelivered = delivered;
  /* prevent half-float overflow: reset GPU accumulator before reduce chain saturates */
  if (rawDelivered > 500) {
    clearRT(scoreAcc.a); clearRT(scoreAcc.b);
    S.scoreOffset += rawDelivered;
  }

  const need = L.winFraction * params.winScale;
  if (S.state === "PLAY" && !S.paused && !S.editMode) {
    if (S.captureEMA >= need && !S.winInhibited) {
      S.winHoldT += pdt;
      S.sinkHueDrift += pdt * (0.9 + 2.6 * Math.min(S.captureEMA / Math.max(need, 1e-3), 2));
      if (S.winHoldT >= (L.winHoldSec || 4)) {
        S.state = "WIN";
        document.getElementById("win").style.display = "flex";
      }
    } else {
      S.winHoldT = Math.max(0, S.winHoldT - pdt * 2);
      S.sinkHueDrift = Math.max(0, S.sinkHueDrift * Math.exp(-pdt * 1.6));
    }
  }
  S.sinkHeat = Math.min(S.captureEMA / Math.max(need, 1e-3), 1);
  S.pulsePhase += pdt * (2 + 9 * S.sinkHeat);
  S.pulseAmp = 0.10 + 0.55 * S.sinkHeat;

  const cum = S.emittedRed > 1e-6 ? delivered / S.emittedRed : 0;
  let txt = L.name +
    "  \u2502  capture " + (S.captureEMA * 100).toFixed(0) + "% / need " + (need * 100).toFixed(0) + "%" +
    "  \u2502  hold " + S.winHoldT.toFixed(1) + "/" + (L.winHoldSec || 4) + "s" +
    "  \u2502  total " + (cum * 100).toFixed(1) + "%";
  if (L.gates) {
    const gtxt = L.gates.map(g => g.id + (S.gateState[g.id] ? "\u25cf" : "\u25cb")).join(" ");
    txt += "  \u2502  locks " + gtxt;
    const fsw = (L.switches || []).find(s => s.kind === "flow");
    if (fsw) txt += " (flux " + (fsw._flux || 0).toFixed(2) + ")";
    if (S.winInhibited) txt += "  \u26a0 FLOW FAULT";
  }
  txt += "\nF" + (S.budget.fan | 0) + " B" + (S.budget.blue | 0) + " G" + (S.budget.green | 0) +
    " SLATE " + S.wallPxUsed.toFixed(0) + "/" + (S.wells.slate | 0) + " STEEL " + S.steelPxUsed.toFixed(0) + "/" + (S.wells.steel | 0) + " LANE " + S.lanePxUsed.toFixed(0) + "/" + (S.wells.lanes | 0) +
    "  \u2502  spin " + ["base", "I", "II", "III"][S.spinTier] +
    "  \u2502  tool [" + (S.selectedTool >= 0 ? TOOLS[S.selectedTool].label : "none") + "]" +
    (S.paused ? "  \u2502  \u23f8 PAUSED" : "") +
    (anyPulseActive() ? "  \u2502  \u2697 DESTABILIZED" : "") +
    (S.state === "WIN" ? "  \u2502  \u2713 SUSTAINED \u2014 " +
      (S.IS_TOUCH ? "double-tap for next" : "N for next") : "");
  hudEl.textContent = txt;
  statsEl.textContent = S.fps.toFixed(0) + " fps \u00b7 " + S.lastSubsteps + " sub \u00b7 telem age " +
    readback.ageFrames + " \u00b7 emit " + S.emitRate.toFixed(0) + " \u00b7 dbg " + S.debugMode;
}


/* ---------- main loop ---------- */
let lastT = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtW = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  readInput();
  let steps = 0;
  if (!S.paused && document.visibilityState !== "hidden") {
    acc += dtW;
    while (acc >= DT && steps < MAX_SUBSTEPS) { substep(); acc -= DT; steps++; }
    if (steps === MAX_SUBSTEPS) acc = 0;
  } else acc = 0;
  S.lastSubsteps = steps;
  if (S.touchSpin !== 0 && S.state === "PLAY")
  S.wallPaintGlow = 0;
  const wtool = S.selectedTool >= 0 ? TOOLS[S.selectedTool] : null;
  if (wtool && (wtool.type === 9 || wtool.type === 12) && S.state === "PLAY" && steps > 0 &&
      ((S.paintingMouse && keys.has("shift")) || (S.rightPaint && keys.has("shift")) || S.touchPaint)) {
    const adding = S.touchPaint ? !S.touchErase : !S.rightPaint;
    const isLane = wtool.type === 12;
    /* the well invariant: extant material may not exceed capacity. Erasing
     * is always free — the sum drops and the refund is exact by construction. */
    const mat = isLane ? "lanes" : wtool.key === "steel" ? "steel" : "slate";
    const used = isLane ? S.lanePxUsed : wtool.key === "steel" ? S.steelPxUsed : S.wallPxUsed;
    if (!adding || used < (S.wells[mat] || 0)) {
      S.wallPaintGlow = adding ? 1 : 2;
      const at = S.touchPaint ? clampToReach(S.touchPaintPos) : S.ghostPos;
      if (isLane) paintLane(at, adding); else paintWall(at, adding, wtool.key === "steel" ? 1 : 0);
    } else {
      if (S.touchPaint) S.touchPaint = false;
      if (S.simTime - S.lastWellToast > 1.5) {
        S.lastWellToast = S.simTime;
        showToast(mat + " well empty \u2014 erase to reclaim matter");
      }
    }
  } else S.lanePrev = null;
  if (steps > 0) {
    runFS(P.dynUpdate, dyn.write, p => {
      bindTex(p, "uDye", dye.read.tex, 0);
      bindTex(p, "uDyn", dyn.read.tex, 1);
      gl.uniform1f(U(p, "uDynForm"), PV("dynForm"));
      gl.uniform1f(U(p, "uDynTrigger"), PV("dynTrigger"));
      gl.uniform1f(U(p, "uDynBurn"), PV("dynBurn"));
      gl.uniform1f(U(p, "uDt"), steps * DT);
    });
    dyn.swap();
    runFS(P.wallErode, walls.write, p => {   /* blasts carve slate per-pixel */
      bindTex(p, "uWalls", walls.read.tex, 0);
      bindTex(p, "uPressure", pressure.read.tex, 1);
      gl.uniform2f(U(p, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]);
      gl.uniform1f(U(p, "uWallTough"), PV("wallTough"));
    });
    walls.swap();
    runFS(P.matPack, matPackRT, p => {     /* wells: extant-material invariant */
      bindTex(p, "uWalls", walls.read.tex, 0);
      bindTex(p, "uDyn", dyn.read.tex, 1);
    });
    const rM = runReduce(matPackRT.tex);
    runFS(P.copy, matSum, p => {
      bindTex(p, "uSrc", rM.tex, 0);
      gl.uniform1f(U(p, "uMul"), 1.0);
    });
  }
  const mo = (TELEM_W + 8) * 4;            /* sums in reference-res pixels */
  S.wallPxUsed = S.lastTelem[mo] / (RES_SCALE * RES_SCALE);
  S.lanePxUsed = S.lastTelem[mo + 1] / (RES_SCALE * RES_SCALE);
  S.steelPxUsed = S.lastTelem[mo + 2] / (RES_SCALE * RES_SCALE);
  const Lsw = curLevel().switches;
  if (Lsw && Lsw.length && steps > 0) {
    runFS(P.switchSense, swState.write, p => {
      bindTex(p, "uDye", dye.read.tex, 0);
      bindTex(p, "uState", swState.read.tex, 1);
      bindTex(p, "uPressure", pressure.read.tex, 2);
      gl.uniform1i(U(p, "uSwCount"), Lsw.length);
      const rect = new Float32Array(32), mask = new Float32Array(32), cfg = new Float32Array(32);
      Lsw.forEach((sw, i) => {
        const mk = sw.mask || [0, 0, 0];
        rect.set(sw.rect, i * 4);
        mask.set([mk[0], mk[1], mk[2], sw.kind === "flow" ? 1 : sw.kind === "pressure" ? 2 : 0], i * 4);
        cfg.set([sw.threshold, sw.holdSec || 1,
          (sw.kind === "volume" || sw.latch === "static") ? 1 : 0, 0], i * 4);
      });
      gl.uniform4fv(U(p, "uSwRect[0]"), rect);
      gl.uniform4fv(U(p, "uSwMask[0]"), mask);
      gl.uniform4fv(U(p, "uSwCfg[0]"), cfg);
      gl.uniform1f(U(p, "uDtF"), steps * DT);
    });
    swState.swap();
  }
  updateNests(steps);
  checkPickups();
  for (const c of pendingCallouts) {
    if (!c.fired && S.simTime >= c.t) { c.fired = true; spawnCallout(c); }
  }
  updateCallouts();
  updateMenuWash();
  drawOverlay();
  updateOverlays(now);
  updateSelection();
  updateGhost();
  S.fps += (1 / Math.max(dtW, 1e-4) - S.fps) * 0.05;
  renderFrame(now);
}

document.getElementById("btnPlay").onclick = () => loadLevel(0);
document.getElementById("btnOptions").onclick = () => {
  document.getElementById("options").style.display = "flex";
};
document.getElementById("optClose").onclick = () => {
  document.getElementById("options").style.display = "none";
};
document.getElementById("optTune").onclick = () => {
  document.getElementById("options").style.display = "none";
  togglePanel();
};
{
  const q = document.getElementById("optQual");
  q.innerHTML = Object.keys(QUALITY_PRESETS).map(n =>
    '<option value="' + n + '"' + (n === qualityName ? " selected" : "") + ">" + n + "</option>").join("");
  q.onchange = e => {
    try { localStorage.setItem("fluxroute.quality", e.target.value); } catch (er) {}
    location.reload();
  };
}


/* ---------- boot ---------- */
setInputRef(inputRef);
setEditorCtx(octx);
initInput({
  loadLevel, showToast, syncBudgetInputs, redEmitRate, togglePanel,
  editorPointerDown, editorPointerMove, editorPointerUp,
});
initPanel({ curLevel, redEmitRate, syncSliders, applyParamsForLevel });
initEditor({
  loadLevel, showToast, togglePanel, syncBudgetInputs,
  setActorEnabled, setTargetEnabled, canvasUV,
  rebuildEdit: function(data) {
    S.editLevelObj = dataLevel(data);
    loadLevel(9999);
  }
});

buildPanel();
buildToolbar();

loadLevel(-1);
requestAnimationFrame(frame);
