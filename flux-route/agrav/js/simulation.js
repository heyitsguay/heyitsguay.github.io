/* FLUX ROUTE — simulation substep, splat, readback, runReduce.
 *
 * The GPU physics engine. substep() executes one DT=1/120s tick of the
 * full fluid simulation (§7) plus all game-mechanic passes.
 *
 * ## Substep pass order (must not be reordered)
 *  1. actorUpdate   — player physics, predator AI, piston springs, collisions
 *  2. splatMask     — rasterize actor boundaries into dynMask (cleared first)
 *  3. gelUpdate     — R+B precipitation, dissolve, erosion (if GEL_ON)
 *  4. obstacleCompose — merge level SDF + dynMask + gel + walls → obstacle (§19)
 *  5. splatForce    — fans/emitters/predator suction → velocity (additive)
 *  6. splatDye      — emitter injection / predator eating → dye (additive)
 *  7. splatWake + wakeUpdate — predator wake deposit then decay → wake.swap()
 *  8. advect velocity — semi-Lagrangian with species-dependent dissipation
 *  9. curl + vorticity — confinement with media/wake/species modulation
 * 10. reactForce    — exo R×G, dynamite detonation, lane/amp forces
 * 11. divergence → copy(warmStart) → jacobi×N → gradientSubtract — pressure projection (§7.5-7.6)
 * 12. advect dye    — at DYE resolution
 * 13. dyePost       — zone absorption, solid decay, gel/dynamite chemistry
 * 14. scoreAccum    — accumulate delivered dye (reads PRE-absorption dye)
 *     dye.swap()    — dye.read becomes POST-absorption for rendering
 *
 * ## Splat mechanism (§9.3)
 * splat(prog, target, rt, extentMul) draws N_ACTORS instanced quads into
 * the target texture with additive blending. The vertex shader culls
 * instances whose type doesn't write the current target. Four target
 * types: 0=velocity force, 1=dye, 2=dynMask boundary, 3=wake.
 *
 * ## ReadbackChannel (§10.2)
 * Ring of 3 PBOs with fence sync. kick() issues async readPixels from
 * telemetry + swState + matSum into one PBO. poll() checks fences and
 * copies completed data into S.lastTelem.
 * INVARIANT: S.lastTelem must be the same Float32Array that the
 * ReadbackChannel constructor stored. Never reassign S.lastTelem.
 *
 * ## Input bridge
 * simulation.js cannot import input.js (would create a circular dep).
 * Instead, input.js calls setInputRef() at boot, passing a reference
 * object with inputVec and spinInput that simulation reads each substep.
 *
 * ## Exports
 *   setInputRef(ref)    Accept input bridge reference from main.js boot
 *   substep()           Run one DT tick of the full sim pipeline
 *   splat(prog,tgt,rt,ext)  Instanced splat pass (used by main.js for wallPaint too)
 *   simUniforms(p)      Set uSimTexel on a program (shared helper)
 *   readback             ReadbackChannel singleton
 *   ReadbackChannel      Class (exported for type, not construction)
 *   runReduce(srcTex)   Generic 2×2 sum-reduction to 1×1
 *
 * Dependencies: state.js, config.js, gl-core.js.
 * Imported by: main.js only.
 */
import { S, GW, SPIN_TIER_DAMP } from './state.js';
import {
  SIM_W, SIM_H, DT, GEL_ON, SIM_TEXEL, RES_SCALE, TELEM_W,
  N_ACTORS, params, PV, effScale, PRESSURE_ITERS,
} from './config.js';
import {
  gl, P, U, runFS, drawTo, bindTex, clearRT, fullscreen,
  velocity, pressure, divergence, curlTex, dye, dynMask, obstacle,
  gel, level, wake, walls, actors, scoreAcc, sensorRT, scoreOne,
  dyn, regionsTex, mediaTex, telemetry, swState, matPackRT, matSum,
  reduceChain, quadVAO,
  cpuActors, freeSlots, writeActor,
  SCORE_SCALE, F32,
} from './gl-core.js';

/* inputVec and spinInput are local to input.js; we need them here.
 * Rather than importing (circular dep), we read from state or accept them as args.
 * The original code had them as module-scoped lets in the same file.
 * Simplest fix: we read them via a late-bind reference. */
let _inputRef = { inputVec: [0, 0], spinInput: 0 };
export function setInputRef(ref) { _inputRef = ref; }

/* ---------- substep ---------- */
function splat(prog, target, rt, extentMul) {
  drawTo(rt);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  gl.useProgram(prog);
  bindTex(prog, "uActors", actors.read.tex, 0);
  gl.uniform1i(U(prog, "uTarget"), target);
  gl.uniform2f(U(prog, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]);
  gl.uniform1f(U(prog, "uExtentMul"), extentMul);
  gl.uniform1f(U(prog, "uEntityScale"), effScale());
  gl.uniform1f(U(prog, "uResScale"), RES_SCALE);
  gl.uniform1f(U(prog, "uDt"), DT);
  if (prog === P.splatDye) {
    gl.uniform1f(U(prog, "uEmitScale"), params.emitScale);
    gl.uniform1f(U(prog, "uEatRate"), PV("eatRate"));
    gl.uniform1f(U(prog, "uTempEmitScale"), PV("tempEmitScale"));
  }
  if (prog === P.splatForce) gl.uniform1f(U(prog, "uPredSuck"), PV("predSuck"));
  if (prog === P.splatWake) gl.uniform1f(U(prog, "uWakeDeposit"), PV("wakeDeposit"));
  gl.bindVertexArray(quadVAO);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, N_ACTORS);
  gl.bindVertexArray(null);
  gl.disable(gl.BLEND);
}
function simUniforms(p) { gl.uniform2f(U(p, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]); }

function substep() {
  const ambientT = params.tempAmbient * params.tempMax;  /* 0-1 slider × tempMax */
  runFS(P.actorUpdate, actors.write, p => {
    bindTex(p, "uActors", actors.read.tex, 0);
    bindTex(p, "uVelocity", velocity.read.tex, 1);
    bindTex(p, "uLevel", level.tex, 2);
    bindTex(p, "uDye", dye.read.tex, 3);
    bindTex(p, "uWalls", walls.read.tex, 4);
    bindTex(p, "uGel", gel.read.tex, 5);
    gl.uniform1f(U(p, "uGelSolid"), PV("gelSolid"));
    gl.uniform1f(U(p, "uPredSense"), params.predSense * RES_SCALE);
    gl.uniform1f(U(p, "uPredGreed"), PV("predGreed"));
    gl.uniform1f(U(p, "uGelDrag"), PV("gelDrag"));
    simUniforms(p);
    gl.uniform1f(U(p, "uDt"), DT);
    gl.uniform1f(U(p, "uTime"), S.simTime);
    gl.uniform4f(U(p, "uInput"), _inputRef.inputVec[0], _inputRef.inputVec[1], _inputRef.spinInput, 0);
    gl.uniform1f(U(p, "uThrust"), params.thrust);
    gl.uniform1f(U(p, "uDragK"), params.dragK);
    gl.uniform1f(U(p, "uLinDamp"), params.linDamp);
    gl.uniform1f(U(p, "uSpinAccel"), params.spinAccel);
    gl.uniform1f(U(p, "uSpinDamp"), params.spinDamp * SPIN_TIER_DAMP[S.spinTier]);
    gl.uniform1f(U(p, "uSpinKick"), params.spinKick);
    gl.uniform1f(U(p, "uEntityScale"), effScale());
    bindTex(p, "uDyn", dyn.read.tex, 11);
    gl.uniform1f(U(p, "uMassPlayer"), params.playerMass);
    gl.uniform1f(U(p, "uMassPred"), params.predMass);
    gl.uniform1f(U(p, "uMassPiston"), params.pistonMass);
    gl.uniform1f(U(p, "uRestitution"), params.restitution);
    gl.uniform1f(U(p, "uPistonSpring"), params.pistonSpring);
    gl.uniform1f(U(p, "uPistonDamp"), params.pistonDamp);
    gl.uniform1f(U(p, "uFlowPush"), params.flowPush);
    gl.uniform1f(U(p, "uBounceFloor"), params.bounceFloor * RES_SCALE);
    if (S.pendingSpawn) {
      gl.uniform4f(U(p, "uSpawn"), S.pendingSpawn.slot, S.pendingSpawn.type,
        S.pendingSpawn.offset[0], S.pendingSpawn.offset[1]);
      gl.uniform4f(U(p, "uSpawnParams"), S.pendingSpawn.params[0], S.pendingSpawn.params[1],
        S.pendingSpawn.params[2], S.pendingSpawn.params[3]);
      gl.uniform4f(U(p, "uSpawnDye"), S.pendingSpawn.dye[0], S.pendingSpawn.dye[1], S.pendingSpawn.dye[2], 0);
    } else {
      gl.uniform4f(U(p, "uSpawn"), -1, 0, 0, 0);
      gl.uniform4f(U(p, "uSpawnParams"), 0, 0, 0, 0);
      gl.uniform4f(U(p, "uSpawnDye"), 0, 0, 0, 0);
    }
  });
  actors.swap();
  S.pendingSpawn = null;

  clearRT(dynMask);
  splat(P.splatMask, 2, dynMask, 1.1);

  if (GEL_ON) {
    runFS(P.gelUpdate, gel.write, p => {
      bindTex(p, "uGel", gel.read.tex, 0);
      bindTex(p, "uDye", dye.read.tex, 1);
      bindTex(p, "uVelocity", velocity.read.tex, 2);
      gl.uniform1f(U(p, "uGelReact"), PV("gelReact"));
      gl.uniform1f(U(p, "uGelDissolve"), PV("gelDissolve"));
      gl.uniform1f(U(p, "uGelErode"), PV("gelErode") / RES_SCALE);
      gl.uniform1f(U(p, "uGelTempK"), params.gelTempK);
      gl.uniform1f(U(p, "uGelSelfCat"), params.gelSelfCat);
      gl.uniform1f(U(p, "uGelHotThresh"), params.gelHotThresh);
      gl.uniform1f(U(p, "uDt"), DT);
    });
    gel.swap();
  }

  runFS(P.obstacleCompose, obstacle, p => {
    bindTex(p, "uLevel", level.tex, 0);
    bindTex(p, "uDynMask", dynMask.tex, 1);
    bindTex(p, "uGel", gel.read.tex, 2);
    bindTex(p, "uWalls", walls.read.tex, 3);
    bindTex(p, "uDyn", dyn.read.tex, 4);
    gl.uniform1f(U(p, "uGelSolid"), PV("gelSolid"));
  });

  splat(P.splatForce, 0, velocity.read, 3.0);
  splat(P.splatDye, 1, dye.read, 3.0);
  splat(P.splatWake, 3, wake.read, 3.0);
  runFS(P.wakeUpdate, wake.write, p => {
    bindTex(p, "uWake", wake.read.tex, 0);
    gl.uniform1f(U(p, "uWakeSlow"), PV("wakeSlow"));
    gl.uniform1f(U(p, "uWakeFast"), PV("wakeFast"));
    gl.uniform1f(U(p, "uWakeKnee"), PV("wakeKnee"));
    gl.uniform1f(U(p, "uDt"), DT);
  });
  wake.swap();

  runFS(P.advect, velocity.write, p => {
    bindTex(p, "uVelocity", velocity.read.tex, 0);
    bindTex(p, "uSource", velocity.read.tex, 1);
    bindTex(p, "uMedia", mediaTex, 2);
    bindTex(p, "uWake", wake.read.tex, 3);
    bindTex(p, "uDye", dye.read.tex, 4);
    gl.uniform3f(U(p, "uViscMul"), PV("viscRed"), PV("viscGreen"), PV("viscBlue"));
    gl.uniform1f(U(p, "uWakeDiss"), PV("wakeDiss"));
    gl.uniform1f(U(p, "uMediaChan"), 1);
    simUniforms(p);
    gl.uniform1f(U(p, "uDt"), DT);
    gl.uniform1f(U(p, "uDissipation"), params.velDiss);
    gl.uniform1f(U(p, "uViscTempK"), params.viscTempK);
    gl.uniform1f(U(p, "uColdDamp"), params.coldDamp);
    gl.uniform1f(U(p, "uColdScale"), params.coldScale);
    gl.uniform1f(U(p, "uTempAmbient"), ambientT);
    gl.uniform1f(U(p, "uTempDiss"), 0);  /* not used for velocity */
  });
  velocity.swap();

  runFS(P.curl, curlTex, p => {
    bindTex(p, "uVelocity", velocity.read.tex, 0);
    simUniforms(p);
  });
  runFS(P.vorticity, velocity.write, p => {
    bindTex(p, "uVelocity", velocity.read.tex, 0);
    bindTex(p, "uCurl", curlTex.tex, 1);
    bindTex(p, "uMedia", mediaTex, 2);
    bindTex(p, "uDye", dye.read.tex, 3);
    bindTex(p, "uWake", wake.read.tex, 4);
    gl.uniform3f(U(p, "uCurlMul"), PV("curlRed"), PV("curlGreen"), PV("curlBlue"));
    gl.uniform1f(U(p, "uWakeCurl"), PV("wakeCurl"));
    gl.uniform1f(U(p, "uTempCurlBoost"), params.tempCurlBoost);
    simUniforms(p);
    gl.uniform1f(U(p, "uCurlStrength"), params.curl);
    gl.uniform1f(U(p, "uDt"), DT);
  });
  velocity.swap();

  runFS(P.reactForce, velocity.write, p => {
    bindTex(p, "uVelocity", velocity.read.tex, 0);
    bindTex(p, "uDye", dye.read.tex, 1);
    simUniforms(p);
    gl.uniform1f(U(p, "uExoForce"), PV("exoForce") * RES_SCALE);
    gl.uniform1f(U(p, "uExoKnee"), PV("exoKnee"));
    gl.uniform1f(U(p, "uStagBoost"), PV("stagBoost"));
    gl.uniform1f(U(p, "uStagSpeed"), PV("stagSpeed") * RES_SCALE);
    gl.uniform1f(U(p, "uActivation"), params.activation);
    gl.uniform1f(U(p, "uArrhScale"), params.arrhScale);
    gl.uniform1f(U(p, "uReactFloor"), params.reactFloor);
    bindTex(p, "uDyn", dyn.read.tex, 3);
    gl.uniform1f(U(p, "uDynForce"), PV("dynForce") * RES_SCALE);
    gl.uniform1f(U(p, "uLaneForce"), PV("laneForce") * RES_SCALE);
    gl.uniform1f(U(p, "uDynTrigger"), PV("dynTrigger"));
    gl.uniform1f(U(p, "uDt"), DT);
  });
  velocity.swap();

  runFS(P.divergence, divergence, p => {
    bindTex(p, "uVelocity", velocity.read.tex, 0);
    bindTex(p, "uObstacle", obstacle.tex, 1);
    simUniforms(p);
  });
  runFS(P.copy, pressure.write, p => {
    bindTex(p, "uSrc", pressure.read.tex, 0);
    gl.uniform1f(U(p, "uMul"), params.warmStart);
  });
  pressure.swap();
  for (let i = 0; i < PRESSURE_ITERS; i++) {
    runFS(P.jacobi, pressure.write, p => {
      bindTex(p, "uPressure", pressure.read.tex, 0);
      bindTex(p, "uDivergence", divergence.tex, 1);
      bindTex(p, "uObstacle", obstacle.tex, 2);
      simUniforms(p);
    });
    pressure.swap();
  }
  runFS(P.gradientSubtract, velocity.write, p => {
    bindTex(p, "uPressure", pressure.read.tex, 0);
    bindTex(p, "uVelocity", velocity.read.tex, 1);
    bindTex(p, "uObstacle", obstacle.tex, 2);
    simUniforms(p);
    gl.uniform1f(U(p, "uGelDrag"), PV("gelDrag"));
    gl.uniform1f(U(p, "uDt"), DT);
  });
  velocity.swap();

  runFS(P.advect, dye.write, p => {
    bindTex(p, "uVelocity", velocity.read.tex, 0);
    bindTex(p, "uSource", dye.read.tex, 1);
    bindTex(p, "uMedia", mediaTex, 2);
    bindTex(p, "uWake", wake.read.tex, 3);
    bindTex(p, "uDye", dye.read.tex, 4);
    gl.uniform3f(U(p, "uViscMul"), PV("viscRed"), PV("viscGreen"), PV("viscBlue"));
    gl.uniform1f(U(p, "uWakeDiss"), PV("wakeDiss"));
    gl.uniform1f(U(p, "uMediaChan"), 2);
    simUniforms(p);
    gl.uniform1f(U(p, "uDt"), DT);
    gl.uniform1f(U(p, "uDissipation"), params.dyeDiss);
    gl.uniform1f(U(p, "uViscTempK"), 0);      /* temperature does NOT modulate dye dissipation */
    gl.uniform1f(U(p, "uColdDamp"), 0);
    gl.uniform1f(U(p, "uColdScale"), 0);
    gl.uniform1f(U(p, "uTempAmbient"), ambientT);
    gl.uniform1f(U(p, "uTempDiss"), params.tempDiss);  /* temperature-specific dissipation */
  });
  dye.swap();   // dye.read is PRE-absorption

  runFS(P.dyePost, dye.write, p => {
    bindTex(p, "uDye", dye.read.tex, 0);
    bindTex(p, "uRegions", regionsTex, 1);
    bindTex(p, "uObstacle", obstacle.tex, 2);
    bindTex(p, "uVelocity", velocity.read.tex, 3);
    gl.uniform1f(U(p, "uStagBoost2"), PV("stagBoost"));
    gl.uniform1f(U(p, "uStagSpeed2"), PV("stagSpeed") * RES_SCALE);
    bindTex(p, "uDyn", dyn.read.tex, 4);
    gl.uniform1f(U(p, "uDynForm"), PV("dynForm"));
    gl.uniform1f(U(p, "uDynTrigger"), PV("dynTrigger"));
    gl.uniform1f(U(p, "uDynTempTrigger"), PV("dynTempTrigger"));
    gl.uniform1f(U(p, "uDynBurn"), PV("dynBurn"));
    gl.uniform1f(U(p, "uDynRed"), PV("dynRed"));
    gl.uniform1f(U(p, "uAbsorbRate"), params.absorb);
    gl.uniform1f(U(p, "uDrainRate"), params.drainRate);
    gl.uniform1f(U(p, "uSolidDecay"), params.solidDecay);
    gl.uniform1f(U(p, "uExoConsume"), PV("exoConsume"));
    gl.uniform1f(U(p, "uGelConsume"), PV("gelConsume"));
    gl.uniform1f(U(p, "uGelHotThresh"), params.gelHotThresh);
    gl.uniform1f(U(p, "uActivation"), params.activation);
    bindTex(p, "uMedia", mediaTex, 5);
    gl.uniform1f(U(p, "uTempHeatRate"), PV("tempHeatRate"));
    gl.uniform1f(U(p, "uGelHeatAbsorb"), PV("gelHeatAbsorb"));
    gl.uniform1f(U(p, "uDynHeat"), PV("dynHeat"));
    gl.uniform1f(U(p, "uTempCoolLinear"), params.tempCoolLinear);
    gl.uniform1f(U(p, "uTempCoolQuad"), params.tempCoolQuad);
    gl.uniform1f(U(p, "uTempAmbient"), ambientT);
    gl.uniform1f(U(p, "uTempAmbientRestore"), params.tempAmbientRestore);
    gl.uniform1f(U(p, "uTempMax"), params.tempMax);
    gl.uniform1f(U(p, "uTempZoneRate"), params.tempZoneRate);
    gl.uniform1f(U(p, "uTempScale"), PV("tempScale"));
    gl.uniform1f(U(p, "uDt"), DT);
  });

  /* dynamite charge evolution — runs per-substep for fast chain reactions */
  runFS(P.dynUpdate, dyn.write, p => {
    bindTex(p, "uDye", dye.read.tex, 0);
    bindTex(p, "uDyn", dyn.read.tex, 1);
    gl.uniform1f(U(p, "uDynForm"), PV("dynForm"));
    gl.uniform1f(U(p, "uDynTrigger"), PV("dynTrigger"));
    gl.uniform1f(U(p, "uDynTempTrigger"), PV("dynTempTrigger"));
    gl.uniform1f(U(p, "uDynBurn"), PV("dynBurn"));
    gl.uniform2f(U(p, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]);
    gl.uniform1f(U(p, "uDt"), DT);
  });
  dyn.swap();

  runFS(P.scoreAccum, scoreAcc.write, p => {
    bindTex(p, "uScoreAcc", scoreAcc.read.tex, 0);
    bindTex(p, "uDye", dye.read.tex, 1);
    bindTex(p, "uRegions", regionsTex, 2);
    gl.uniform1f(U(p, "uAbsorbRate"), params.absorb);
    gl.uniform1f(U(p, "uDrainRate"), params.drainRate);
    gl.uniform1f(U(p, "uDt"), DT);
    gl.uniform1f(U(p, "uActive"), SCORE_SCALE);
  });
  scoreAcc.swap();
  dye.swap();

  S.emittedRed += S.emitRate * DT;
  S.simTime += DT;
}

/* ---------- readback ---------- */
class ReadbackChannel {
  constructor() {
    this.slots = [];
    for (let i = 0; i < 3; i++) {
      const pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, (TELEM_W + 9) * 4 * 4, gl.STREAM_READ);
      this.slots.push({ pbo, fence: null });
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.cursor = 0;
    if (!S.lastTelem) S.lastTelem = new Float32Array((TELEM_W + 9) * 4);
    this.latest = S.lastTelem;
    this.ageFrames = 0;
  }
  kick(fbo) {
    const s = this.slots[this.cursor];
    if (s.fence) return;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo);
    gl.readPixels(0, 0, TELEM_W, 1, gl.RGBA, gl.FLOAT, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, swState.read.fbo);
    gl.readPixels(0, 0, 8, 1, gl.RGBA, gl.FLOAT, TELEM_W * 16);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, matSum.fbo);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, (TELEM_W + 8) * 16);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    s.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    this.cursor = (this.cursor + 1) % this.slots.length;
  }
  poll() {
    this.ageFrames++;
    for (const s of this.slots) {
      if (!s.fence) continue;
      if (gl.getSyncParameter(s.fence, gl.SYNC_STATUS) === gl.SIGNALED) {
        gl.deleteSync(s.fence); s.fence = null;
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, s.pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.latest);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        this.ageFrames = 0;
      }
    }
    return this.latest;
  }
}
const readback = new ReadbackChannel();


function runReduce(srcTex) {
  let tex = srcTex, sw = SIM_W, sh = SIM_H;
  for (const rt of reduceChain) {
    runFS(P.reduce, rt, p => {
      bindTex(p, "uSrc", tex, 0);
      gl.uniform2i(U(p, "uSrcSize"), sw, sh);
    });
    tex = rt.tex; sw = rt.w; sh = rt.h;
  }
  return reduceChain[reduceChain.length - 1];
}

export { splat, simUniforms, substep, ReadbackChannel, readback, runReduce };
