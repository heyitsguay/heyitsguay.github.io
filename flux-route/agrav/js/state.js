/* FLUX ROUTE — shared mutable game state.
 *
 * The single source of truth for all runtime game state. Every module
 * imports S and reads/writes S.xxx directly — there are no getters or
 * setters; the object IS the API.
 *
 * Also exports:
 *   GW             Game window rect {f, u0, v0, u1, v1}. Set by
 *                  setGameWindow() in main.js from L.size at level load.
 *   SPIN_TIER_DAMP Damping multipliers [8,4,2,1] per spin tier.
 *   RED/BLUE/GREEN Pure species vectors for level/actor definitions.
 *   TOOLS          Tool array defining type, key, radius, dye color.
 *
 * Imported by: every module. No dependencies (leaf of the dep graph).
 *
 * Key fields in S:
 *   lastTelem      Float32Array populated by ReadbackChannel in
 *                  simulation.js. MUST NOT be reassigned after the
 *                  ReadbackChannel constructor stores a reference to it.
 *   ghostPos       [u,v] of the placement preview. Defaults [0.5,0.5];
 *                  updated each frame by updateGhost() in input.js.
 *   emitRate       Current red emission rate, recalculated whenever
 *                  emitters are enabled/disabled (setActorEnabled).
 */

export const S = {
  /* game flow */
  levelIdx: 0, state: "PLAY", paused: false,
  simTime: 0, emittedRed: 0, gateState: {}, debugMode: 0, devMode: false,
  /* player / tool */
  selectedSlot: -1, selectedTool: 0,
  ghostAngle: 0, ghostPos: [0.5, 0.5],
  mouseUV: [0.5, 0.5], mouseInCanvas: false,
  pendingSpawn: null,
  /* HUD / scoring */
  prevDelivered: 0, captureEMA: 0, sensorEMA: 0,
  pulsePhase: 0, pulseAmp: 0.1,
  sinkHeat: 0, trigHeat: 0, winHoldT: 0, winInhibited: false,
  sinkHueDrift: 0, lastPulseT: performance.now() / 1000,
  emitRate: 0, fps: 60, lastSubsteps: 0,
  /* painting */
  wells: { slate: 0, concrete: 0, steel: 0, lanes: 0 },
  budget: { fan: 0, blue: 0, green: 0 },
  wallPxUsed: 0, concretePxUsed: 0, steelPxUsed: 0, lanePxUsed: 0,
  lastWellToast: 0, lanePrev: null, laneDir: [1, 0],
  rightPaint: false, spinTier: 0,
  wallPaintGlow: 0, paintingMouse: false,
  /* touch */
  touchSteer: null, rotateModeSlot: -1, aimEngaged: false,
  touchPaint: false, touchPaintPos: [0.5, 0.5],
  touchErase: false, touchSpinG: null, touchSpin: 0,
  /* system */
  IS_PORTRAIT: false, IS_TOUCH: false,
  editMode: false, editLevelObj: null,
  /* data (initialized later) */
  lastTelem: null,
  rng: null,
};

/* game window (mutable but structured) */
export const GW = { f: 1, u0: 0, v0: 0, u1: 1, v1: 1 };

export const SPIN_TIER_DAMP = [8, 4, 2, 1];

// PURE species vectors
export const RED = [1, 0, 0], BLUE = [0, 0, 1], GREEN = [0, 1, 0];

export const TOOLS = [
  { key: "fan", label: "FAN", type: 2, r: 6, dye: null, strengthKey: "fanStrength" },
  { key: "blue", label: "BLU", type: 3, r: 5, dye: BLUE, strengthKey: "blueEmitStrength" },
  { key: "green", label: "GRN", type: 3, r: 5, dye: GREEN, strengthKey: "greenEmitStrength" },
  { key: "sand", label: "SAND", type: 9, r: 7, dye: [0.85, 0.75, 0.55], tough: "sand" },
  { key: "wall", label: "SLATE", type: 9, r: 7, dye: [1, 0.72, 0.25], tough: "slate" },
  { key: "concrete", label: "CONC", type: 9, r: 7, dye: [0.55, 0.52, 0.48], tough: "concrete" },
  { key: "steel", label: "STEEL", type: 9, r: 7, dye: [0.7, 0.75, 0.85], tough: "steel" },
  { key: "lane", label: "LANE", type: 12, r: 6, dye: [0.2, 0.7, 0.8] }
];
