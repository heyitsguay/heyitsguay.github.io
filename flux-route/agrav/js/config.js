/* FLUX ROUTE — configuration and constants.
 *
 * Quality presets, simulation constants, the live params object, and the
 * pulse system for event-driven temporary overrides.
 *
 * Quality is stored in localStorage and determines SIM/DYE resolution,
 * Jacobi iterations, blur passes, and gel on/off. Changing quality
 * triggers a page reload (all textures must be reallocated).
 *
 * RES_SCALE (= SIM_H / 270) is the critical normalization factor:
 * every tunable is defined at the reference grid (480×270). Entity
 * sizes, jet reach, and traversal times are quality-invariant because
 * all physics multiply by RES_SCALE where needed. See §26 in the plan.
 *
 * The params object is a mutable copy of DEFAULT_PARAMS. Live-editing
 * via the tuning panel mutates params directly. Per-level overrides
 * are applied at loadLevel() and reverted on reset.
 *
 * Pulses: pulseParam("exoConsume", 0.15, 2.5) overrides a param for
 * 2.5 sim-seconds. PV("exoConsume") returns the pulse value while
 * active, otherwise params.exoConsume. Used by events for spectacles.
 *
 * Dependencies: state.js only.
 * Imported by: gl-core, simulation, input, levels, main, panel, editor.
 */
import { S } from './state.js';

function simTimeRef() { return S.simTime; }

/* ---------- quality presets (changing quality reloads the page) ---------- */
const QUALITY_PRESETS = {
  low: { simW: 320, simH: 180, dyeW: 960, dyeH: 540, iters: 20, blur: 2, gel: false },
  medium: { simW: 480, simH: 270, dyeW: 1440, dyeH: 810, iters: 24, blur: 4, gel: true },
  high: { simW: 480, simH: 270, dyeW: 1920, dyeH: 1080, iters: 30, blur: 4, gel: true },
  ultra: { simW: 640, simH: 360, dyeW: 1920, dyeH: 1080, iters: 30, blur: 4, gel: true },
  cray: { simW: 960, simH: 540, dyeW: 1920, dyeH: 1080, iters: 30, blur: 4, gel: true },
  unreasonable: { simW: 1440, simH: 810, dyeW: 1920, dyeH: 1080, iters: 30, blur: 4, gel: true },
  maxx: { simW: 1920, simH: 1080, dyeW: 1920, dyeH: 1080, iters: 30, blur: 4, gel: true },
};
let qualityName = "ultra";
try { qualityName = localStorage.getItem("fluxroute.quality") || "high"; } catch (e) { }
if (!QUALITY_PRESETS[qualityName]) qualityName = "ultra";
const Q = QUALITY_PRESETS[qualityName];

const SIM_W = Q.simW, SIM_H = Q.simH, DYE_W = Q.dyeW, DYE_H = Q.dyeH;
const N_ACTORS = 64, ACTOR_ROWS = 4;
const DT = 1 / 120, MAX_SUBSTEPS = 4, PRESSURE_ITERS = Q.iters, BLUR_PASSES = Q.blur;
const GEL_ON = Q.gel;
const SIM_TEXEL = [1 / SIM_W, 1 / SIM_H];
/* normalized length scale: every tunable is defined at the reference grid
 * (480x270). RES_SCALE converts to the active grid so all quality presets
 * exhibit IDENTICAL physics — entity sizes, jet reach, traversal times. */
const RES_SCALE = SIM_H / 270;
const TELEM_W = 2 + N_ACTORS;
// emission constant: gaussian integral 0.694 * (3r·ratio)² dye texels / ratio² downsample = 6.25r²
const EMIT_K = 6.25;

/* wall toughness constants: walls.r = log(pressure threshold).
 * Positive = erodible at that threshold; negative = indestructible.
 * Sand → slate → concrete → steel is ~10× toughness per tier. */
const SAND_TOUGH     = Math.log(90);     // ≈ 3.00
const SLATE_TOUGH    = Math.log(316);     // ≈ 4.38
const CONCRETE_TOUGH = Math.log(800);    // ≈ 6.68
const STEEL_TOUGH    = Math.log(8000);   // ≈ 8.99
const WALL_INDESTRUCTIBLE = -1;          // convention: < 0 = never erodes

const DEFAULT_PARAMS = {
  curl: 4.5, velDiss: 0.04, dyeDiss: 0.005, absorb: 6, solidDecay: 0, drainRate: 15.8,
  viscRed: 1.0, viscGreen: 10.0, viscBlue: 0.1,
  curlRed: 1.0, curlGreen: 0.01, curlBlue: 4.0,
  fanStrength: 451.9, emitScale: 0.051, blueEmitStrength: 350, greenEmitStrength: 716.1,
  entityScale: 1.0,
  thrust: 2.0, dragK: 4.65, flowPush: 1.0, linDamp: 2.5,
  spinAccel: 20.5, spinDamp: 0.05, spinKick: 0.05, spinHeat: 5,
  playerMass: 1.5, predMass: 1.6, pistonMass: 8, restitution: 0.9, bounceFloor: 30,
  pistonSpring: 90, pistonDamp: 5, predSuck: 1200, predSense: 12, predGreed: 30, predTtl: 14,
  wakeDeposit: 12.0, wakeDiss: 20.0, wakeCurl: 8.0, wakeSlow: 0.07, wakeFast: 1.6, wakeKnee: 0.5,
  gelReact: 0.86398, gelDissolve: 0.04, gelErode: 0.3, gelDrag: 12.9, gelSolid: 1.0, gelConsume: 0.4, gelSelfCat: 6.9, gelHotThresh: 3.75, gelMeltRate: 4.0,
  exoForce: 9638, exoKnee: 0.45, stagBoost: 32.6, stagSpeed: 0.3319, exoConsume: 0.35, eatRate: 12.0,
  dynForm: 6, dynTrigger: 0.06, dynForce: 7413, dynBurn: 60, dynRed: 0.06325,
  laneForce: 700, laneBrush: 5,
  sandFloor: 3.7,       /* log-threshold separating sand from slate in matPack */
  concreteFloor: 5.5,  /* log-threshold separating slate from concrete in matPack */
  steelFloor: 7.8,     /* log-threshold separating concrete from steel in matPack */
  wallBrush: 7,
  warmStart: 0.8, tonemapK: 0.08, bloomStr: 0.16, bloomThr: 2.85, redBloomBoost: 0.85,
  hueShift: 0.01, flowGlow: 2.0, streak: 2.62, curlTintRed: 0.19, curlTintGreen: 0.25, curlTintBlue: 1.8, schlieren: 0.52, speciesFx: 0.1,
  gelGlow: 1.5,
  winScale: 1.0,
  /* temperature evolution */
  tempDiss: 0.01641, tempDiffuse: 0.5, tempHeatRate: 1.738,
  gelHeatAbsorb: 2.0, dynHeat: 20.0,
  tempCoolLinear: 0.1413, tempCoolQuad: 0.1318,
  tempAmbient: 0.1, tempAmbientRestore: 0.5,
  tempMax: 10.0, tempEmitScale: 1.0, tempZoneRate: 5.0, tempScale: 1.9,
  multClamp: 200,   /* multiplier zone max dye intensity; 0 = unlimited */
  /* temperature → physics couplings */
  activation: 1.23, arrhScale: 2.1, reactFloor: 0.2, viscTempK: 2.4,
  coldDamp: 4.5, coldScale: 7.6,
  tempCurlBoost: 0.2, gelTempK: 1.0,
  dynTempTrigger: 1.5,
  /* temperature → rendering */
  thermalVis: 1.04, thermalFloor: 0.82
};
const params = Object.assign({}, DEFAULT_PARAMS);
/* parameter pulses: event-driven temporary overrides (auto-restoring).
 * pulseParam("exoConsume", 0.15, 2.5) -> spectacular R+G explosions for 2.5 s.
 * Levels/gates can call pulseParam; also on window.fluxPulse for console play. */
const pulses = {};
function pulseParam(key, value, durSec) { pulses[key] = { value, until: simTimeRef() + durSec }; }
function PV(k) { const p = pulses[k]; return (p && simTimeRef() < p.until) ? p.value : params[k]; }
function anyPulseActive() {
  for (const k in pulses) if (simTimeRef() < pulses[k].until) return true;
  return false;
}
try { window.fluxPulse = pulseParam; } catch (e) { }
function effScale() { return params.entityScale * RES_SCALE; }
const dirtyKeys = new Set();   // slider keys the user touched this session
export {
  QUALITY_PRESETS, qualityName, Q,
  SIM_W, SIM_H, DYE_W, DYE_H, N_ACTORS, ACTOR_ROWS,
  DT, MAX_SUBSTEPS, PRESSURE_ITERS, BLUR_PASSES, GEL_ON,
  SIM_TEXEL, RES_SCALE, TELEM_W, EMIT_K,
  SAND_TOUGH, SLATE_TOUGH, CONCRETE_TOUGH, STEEL_TOUGH, WALL_INDESTRUCTIBLE,
  DEFAULT_PARAMS, params, dirtyKeys,
  pulses, pulseParam, PV, anyPulseActive, effScale
};

export const SIZE_F = { small: 0.4, medium: 0.5, large: 0.75, full: 1 };

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const budgetOverrides = {};
export const dirtyVals = {};
