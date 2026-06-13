/* FLUX ROUTE — tuning panel, config management.
 *
 * Builds a lil-gui panel for live parameter adjustment. All sliders
 * mutate the params object directly and mark keys in dirtyKeys.
 *
 * ## Exports
 *   initPanel(callbacks)       Accept _cb registry from main.js at boot
 *   buildPanel()               Create the lil-gui panel DOM (called once at boot)
 *   togglePanel()              Show/hide the panel (bound to 'T' key)
 *   syncSliders()              Refresh all lil-gui controllers from params values
 *   syncBudgetInputs()         Update budget display after pickup/placement changes
 *   applyParamsForLevel(L)     Apply level.config with dirty-key precedence (§26)
 *   saveConfigAs(name)         Save current params to localStorage
 *   persistConfigs()           Flush config store to localStorage
 *   rebuildConfigSelect()      Rebuild the saved-config dropdown after save/delete
 *
 * ## Config persistence
 * Named configs saved to localStorage["fluxroute.configs"]. Save/load/
 * delete/export/import via the panel UI. Export produces JSON that can
 * be pasted back via import.
 *
 * ## Quality presets
 * Selector triggers localStorage write + page reload (all GPU textures
 * must be reallocated at the new resolution).
 *
 * ## Per-level config precedence (§26)
 * defaults → level.config → user's dirtyKeys. A level can demand
 * specific physics while respecting the user's explicit slider changes.
 *
 * ## Callback pattern (_cb)
 * Uses _cb.loadLevel, _cb.showToast, _cb.applyParamsForLevel from main.js.
 *
 * Dependencies: state.js, config.js. Uses window.lil (UMD, loaded before modules).
 * Imported by: main.js.
 */
import { S, TOOLS } from './state.js';
import {
  QUALITY_PRESETS, qualityName, DEFAULT_PARAMS, params, dirtyKeys, dirtyVals,
  RES_SCALE, effScale, budgetOverrides,
} from './config.js';

/* late-bound callbacks from main.js */
let _cb = {};
export function initPanel(callbacks) { _cb = callbacks; }

/* ---------- config management (localStorage: per-origin, GitHub-Pages safe) ---------- */
let configs = {}, activeName = "";
try {
  configs = JSON.parse(localStorage.getItem("fluxroute.configs") || "{}");
  activeName = localStorage.getItem("fluxroute.active") || "";
} catch (e) {}

function persistConfigs() {
  try {
    localStorage.setItem("fluxroute.configs", JSON.stringify(configs));
    localStorage.setItem("fluxroute.active", activeName);
  } catch (e) { console.warn("localStorage unavailable; configs are session-only"); }
}
function applyParamsForLevel() {
  const base = Object.assign({}, DEFAULT_PARAMS,
    (configs[activeName] && configs[activeName].params) || {},
    _cb.curLevel().config || {});
  for (const k of dirtyKeys) base[k] = dirtyVals[k];
  for (const k of Object.keys(params)) delete params[k];   // mutate in place:
  Object.assign(params, base);                             // GUI binds this object
  syncSliders();
}
function saveConfigAs(name) {
  if (!name) return;
  configs[name] = { name, ver: 1, quality: qualityName, params: Object.assign({}, params) };
  activeName = name;
  dirtyKeys.clear();
  persistConfigs(); rebuildConfigSelect();
}

/* ---------- tuning panel ---------- */
/* ---------- tuning GUI (lil-gui; grouped) ---------- */
const TIPS = {
  curl: "Vorticity confinement gain: re-sharpens swirls the coarse grid smears out. x media storm zones.",
  velDiss: "Velocity field decay rate (1/s). Higher = flows die sooner. x media zones.",
  dyeDiss: "Dye decay rate (1/s). Higher = trails fade faster. x media fog zones.",
  warmStart: "Fraction of last substep pressure kept as the solver starting guess.",
  viscRed: "Viscosity (velocity-dissipation multiplier) of flow carrying RED. 1 = baseline water.",
  viscGreen: "Viscosity of flow carrying GREEN: syrup. High values make green sluggish and blobby.",
  viscBlue: "Viscosity of flow carrying BLUE: thin and lively.",
  curlRed: "Swirliness multiplier of flow carrying RED.",
  curlGreen: "Swirliness of GREEN-laden flow: syrup resists eddies.",
  curlBlue: "Swirliness of BLUE-laden flow.",
  absorb: "Removal rate (1/s) of dye inside SINK and TRIGGER zones; also weights scoring between overlapping zones.",
  drainRate: "Removal rate (1/s) in DRAIN zones; drained dye is voided, never scored.",
  solidDecay: "Decay rate (1/s) of dye trapped inside walls and solid gel.",
  winScale: "Multiplies every level capture target: a global difficulty dial.",
  fanStrength: "Fan jet force (reference-grid texels/s^2).",
  emitScale: "Dye mass per unit emitter strength. Raises all concentrations; capture % stays normalized.",
  blueEmitStrength: "Force and dye output of player-placed BLUE (builder) emitters.",
  greenEmitStrength: "Force and dye output of player-placed GREEN (reagent) emitters.",
  wallBrush: "Wall fabricator/dissolver brush radius (ref texels).",
  thrust: "Player swim acceleration (UV/s^2).",
  dragK: "Coupling rate (1/s) pulling the player toward local fluid velocity.",
  flowPush: "Fraction of local flow speed the player is dragged toward. Below 1 keeps you in control.",
  linDamp: "Player and predator velocity damping (1/s).",
  spinAccel: "Spin-up rate while Q/E held (rad/s^2).",
  spinDamp: "Top-tier spin decay (1/s); tiers multiply it by [8,4,2,1]. Terminal spin = spinAccel/damp.",
  spinKick: "Tangential kick on bounces proportional to spin: the curveball. Negative flips direction.",
  entityScale: "Global size multiplier for every entity, live.",
  playerMass: "Player collision mass.",
  predMass: "Predator collision mass; heavier predators shove harder.",
  pistonMass: "Piston collision mass.",
  restitution: "Bounciness of body-vs-body collisions: 0 dead, 1 perfectly elastic.",
  bounceFloor: "Guaranteed minimum separation speed after any contact (ref texels/s).",
  pistonSpring: "Spring stiffness pulling pistons toward their oscillating target (1/s^2).",
  pistonDamp: "Piston velocity damping (1/s); lower = wobblier.",
  gelReact: "Gel growth per unit red x blue overlap (1/s).",
  gelDissolve: "Gel passive dissolve rate (1/s).",
  gelErode: "Extra gel erosion per unit flow speed; fast current carves channels.",
  gelDrag: "Drag (1/s) inside porous gel: slows both FLOW and BODIES wading through it.",
  gelSolid: "Gel level at which it becomes a hard, collidable wall.",
  gelConsume: "Red and blue consumed by the gel reaction; keeps growth self-limiting.",
  exoForce: "Blast force of the red+green reaction, along the gradient of the saturating curve.",
  exoKnee: "Curvature of the log force curve: high force at LOW concentration, slow growth above.",
  stagBoost: "Reaction multiplier as local flow stagnates: mix, slow down, then BAM.",
  stagSpeed: "Flow speed (ref texels/s) below which the stagnation boost engages.",
  exoConsume: "Red and green consumed by the reaction. Lower = bigger, longer explosions.",
  dynForm: "Rate co-located blue+green converts into solid dynamite charge.",
  dynTrigger: "Red concentration that sets a charge off.",
  dynForce: "Blast force when a charge fires. The whole point.",
  dynBurn: "How fast a triggered charge consumes itself. Lower = longer burns.",
  dynRed: "Red released per unit of burning charge. Above ~0.4 net, blasts prime neighboring charges \u2014 chain reactions.",
  laneForce: "Acceleration applied along drawn flow lanes (pre-projection, like fans).",
  laneBrush: "Lane stroke width in reference texels.",
  wallTough: "Pressure rating of slate: boundary pixels above this |p| are blasted away. Craters.",
  predSuck: "Predator suction: spiral inflow force on the FLUID (the tangential part survives the pressure solve).",
  predSense: "Predator scent-stencil radius (ref texels). Wider = ignores vortex noise, smells distant plumes.",
  predGreed: "How strongly scent gradients override the random walk. Low = drunkard, high = bloodhound.",
  predTtl: "Default predator lifetime in seconds (nests may override).",
  eatRate: "Dye removal rate under a predator.",
  wakeDeposit: "How fast a predator saturates its dissipation wake (coverage/s).",
  wakeDiss: "Extra velocity dissipation (1/s) at full wake: dead water where predators fed.",
  wakeCurl: "Vorticity boost inside the wake: haunted, churning dead water.",
  wakeSlow: "Wake decay while strong: the plateau phase (1/s).",
  wakeFast: "Wake decay below the knee (1/s): the fast fade-out.",
  wakeKnee: "Wake level where decay switches from plateau to fast fade.",
  tonemapK: "Exposure of the dye tonemap.",
  bloomStr: "Bloom intensity; the red species blooms hardest by design.",
  bloomThr: "Brightness threshold before bloom engages.",
  hueShift: "Global hue rotation (radians).",
  flowGlow: "Dye brightening with flow speed.",
  streak: "Motion smear along flow: red stays tight, blue smears glassy.",
  curlTint: "Swirl tint strength; saturation grows with dye concentration squared.",
  schlieren: "Ambient shading of invisible currents where dye is absent.",
  speciesFx: "Green-species scintillation amount.",
  gelGlow: "Gel membrane and rim-glow intensity."
};
const GROUPS = {
  "flow": [["curl", 0, 60, 0.5], ["velDiss", 0.005, 2, 0, "log"], ["dyeDiss", 0.005, 3, 0, "log"], ["warmStart", 0, 1, 0.01]],
  "species physics": [["viscRed", 0.01, 40, 0, "log"], ["viscGreen", 0.01, 40, 0, "log"], ["viscBlue", 0.01, 40, 0, "log"],
    ["curlRed", 0.01, 12, 0, "log"], ["curlGreen", 0.01, 12, 0, "log"], ["curlBlue", 0.01, 12, 0, "log"]],
  "zones & scoring": [["absorb", 0, 20, 0.1], ["drainRate", 0, 20, 0.1], ["solidDecay", 0, 20, 0.1], ["winScale", 0.2, 3, 0.05]],
  "emitters & tools": [["fanStrength", 10, 6000, 0, "log"], ["emitScale", 0, 0.1, 0.001],
    ["blueEmitStrength", 10, 6000, 0, "log"], ["greenEmitStrength", 10, 6000, 0, "log"], ["wallBrush", 2, 24, 0.5]],
  "player": [["thrust", 0, 2, 0.01], ["dragK", 0, 5, 0.05], ["flowPush", 0, 1, 0.01], ["linDamp", 0, 8, 0.05],
    ["spinAccel", 0, 40, 0.5], ["spinDamp", 0, 5, 0.05], ["spinKick", -0.2, 0.2, 0.005]],
  "bodies": [["entityScale", 0.3, 3, 0.05], ["playerMass", 0.05, 100, 0, "log"], ["predMass", 0.05, 200, 0, "log"],
    ["pistonMass", 0.05, 500, 0, "log"], ["restitution", 0, 1, 0.01], ["bounceFloor", 0, 120, 1],
    ["pistonSpring", 1, 3000, 0, "log"], ["pistonDamp", 0.05, 80, 0, "log"]],
  "gel": [["gelReact", 0.05, 60, 0, "log"], ["gelDissolve", 0, 1, 0.01], ["gelErode", 0, 0.2, 0.002],
    ["gelDrag", 0, 20, 0.1], ["gelSolid", 0.1, 1.5, 0.01], ["gelConsume", 0, 5, 0.05]],
  "exothermics": [["exoForce", 50, 40000, 0, "log"], ["exoKnee", 0.05, 10, 0.05], ["stagBoost", 0, 40, 0.1],
    ["stagSpeed", 0.2, 150, 0, "log"], ["exoConsume", 0, 5, 0.05],
    ["dynForm", 0.1, 60, 0, "log"], ["dynTrigger", 0.02, 1, 0.01],
    ["dynForce", 1000, 300000, 0, "log"], ["dynBurn", 0.5, 60, 0, "log"], ["dynRed", 0.02, 10, 0, "log"],
    ["laneForce", 10, 20000, 0, "log"], ["laneBrush", 1, 20, 0.5], ["wallTough", 5, 1000, 0, "log"]],
  "predators & wake": [["predSuck", 10, 10000, 0, "log"], ["eatRate", 0.1, 80, 0, "log"],
    ["predSense", 2, 80, 1], ["predGreed", 0.5, 500, 0, "log"], ["predTtl", 2, 60, 0.5],
    ["wakeDeposit", 0.2, 50, 0, "log"], ["wakeDiss", 0.5, 100, 0, "log"], ["wakeCurl", 0.1, 40, 0, "log"],
    ["wakeSlow", 0, 1, 0.005], ["wakeFast", 0, 5, 0.05], ["wakeKnee", 0, 1, 0.01]],
  "rendering": [["tonemapK", 0.05, 1, 0.01], ["bloomStr", 0, 1, 0.01], ["bloomThr", 0, 4, 0.05],
    ["hueShift", -3.14, 3.14, 0.01], ["flowGlow", 0, 2, 0.02], ["streak", 0, 3, 0.02],
    ["curlTint", 0, 1, 0.01], ["schlieren", 0, 2, 0.02], ["speciesFx", 0, 2, 0.02], ["gelGlow", 0, 3, 0.05]]
};
let gui = null, panelOpen = false, cfgCtrl = null;
const logCtrls = [];
function logName(key) {
  const v = params[key];
  return key + " = " + (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toPrecision(3));
}
const budgetProxy = { fan: 0, blue: 0, green: 0, slate: 0, steel: 0, lanes: 0 };
const cfgState = { config: activeName || "(defaults)" };
function cfgNames() { return ["(defaults)"].concat(Object.keys(configs)); }
function onCfgChange(v) {
  activeName = v === "(defaults)" ? "" : v;
  persistConfigs();
  dirtyKeys.clear();
  applyParamsForLevel();
}
function rebuildConfigSelect() {
  cfgState.config = activeName || "(defaults)";
  if (cfgCtrl) cfgCtrl = cfgCtrl.options(cfgNames()).name("config").onChange(onCfgChange);
}
function buildPanel() {
  gui = new window.lil.GUI({ title: "FLUX ROUTE \u00b7 tuning", width: 330 });
  gui.domElement.classList.add("flux-gui");
  const sys = gui.addFolder("system");
  const sysState = { quality: qualityName };
  sys.add(sysState, "quality", Object.keys(QUALITY_PRESETS)).onChange(v => {
    try { localStorage.setItem("fluxroute.quality", v); } catch (e) {}
    location.reload();
  }).domElement.title = "Sim/dye resolution preset. Physics is identical at every preset; this reloads the page.";
  cfgCtrl = sys.add(cfgState, "config", cfgNames()).onChange(onCfgChange);
  const acts = {
    save() { saveConfigAs(activeName || window.prompt("config name:", "my-config")); },
    "save as"() { saveConfigAs(window.prompt("config name:", activeName || "my-config")); },
    "delete"() {
      if (activeName && configs[activeName]) {
        delete configs[activeName]; activeName = "";
        persistConfigs(); rebuildConfigSelect(); dirtyKeys.clear(); applyParamsForLevel();
      }
    },
    export() {
      const j = JSON.stringify(configs[activeName] ||
        { name: "current", ver: 1, quality: qualityName, params: Object.assign({}, params) });
      try { navigator.clipboard.writeText(j); } catch (e) {}
      window.prompt("Config JSON (copied to clipboard):", j);
    },
    import() {
      const t = window.prompt("Paste config JSON:");
      if (!t) return;
      try {
        const c = JSON.parse(t);
        if (!c || typeof c.params !== "object") throw new Error("no params");
        const known = {};
        for (const k in c.params) if (k in DEFAULT_PARAMS) known[k] = c.params[k];
          else console.warn("import: ignoring unknown key", k);
        c.params = known;
        configs[c.name || "imported"] = c; activeName = c.name || "imported";
        dirtyKeys.clear();
        persistConfigs(); rebuildConfigSelect(); applyParamsForLevel();
      } catch (e) { alert("Import failed: " + e.message); }
    },
    "revert to level"() { dirtyKeys.clear(); applyParamsForLevel(); }
  };
  for (const k of ["save", "save as", "delete", "export", "import", "revert to level"]) sys.add(acts, k);
  const bud = gui.addFolder("budgets (this level)");
  for (const k of ["fan", "blue", "green", "slate", "steel", "lanes"]) {
    const isWell = k === "slate" || k === "lanes" || k === "steel";
    const c = bud.add(budgetProxy, k, 0, isWell ? 3000 : 60, isWell ? 10 : 1).onChange(v => {
      if (isWell) S.wells[k] = Math.max(0, v);
      else {
        S.budget[k] = Math.max(0, v);
        budgetOverrides[S.levelIdx] = Object.assign({}, budgetOverrides[S.levelIdx], { [k]: S.budget[k] });
      }
    });
    c.domElement.title = isWell
      ? "Well capacity in reference pixels: extant " + k + " matter may not exceed this. Erase refunds."
      : "How many " + k + " tools the player may place on this level.";
  }
  for (const [gname, list] of Object.entries(GROUPS)) {
    const f = gui.addFolder(gname);
    for (const [k, mn, mx, st, scale] of list) {
      if (scale === "log") {
        /* slider tracks the exponent; the label tracks the true value */
        const pr = { v: Math.log10(Math.max(params[k], 1e-6)) };
        const c = f.add(pr, "v", Math.log10(mn), Math.log10(mx), 0.005).onChange(v => {
          params[k] = +Math.pow(10, v).toPrecision(4);
          dirtyKeys.add(k); dirtyVals[k] = params[k];
          S.emitRate = _cb.redEmitRate();
          c.name(logName(k));
        });
        c.name(logName(k));
        c.domElement.title = (TIPS[k] || k) + " [log slider: box shows exponent]";
        logCtrls.push({ key: k, pr, c });
      } else {
        const c = f.add(params, k, mn, mx, st).onChange(v => {
          dirtyKeys.add(k); dirtyVals[k] = v;
          S.emitRate = _cb.redEmitRate();
        });
        c.domElement.title = TIPS[k] || k;
      }
    }
    f.close();
  }
  bud.close();
  gui.domElement.style.display = "none";
}
function syncSliders() {
  for (const L of logCtrls) {
    L.pr.v = Math.log10(Math.max(params[L.key], 1e-6));
    L.c.name(logName(L.key));
  }
  if (gui) gui.controllersRecursive().forEach(c => c.updateDisplay());
}
function syncBudgetInputs() {
  Object.assign(budgetProxy, { fan: 0, blue: 0, green: 0 }, S.budget, { slate: S.wells.slate, steel: S.wells.steel, lanes: S.wells.lanes });
  if (gui) gui.controllersRecursive().forEach(c => { if (c.object === budgetProxy) c.updateDisplay(); });
}
function togglePanel() {
  panelOpen = !panelOpen;
  if (gui) gui.domElement.style.display = panelOpen ? "" : "none";
}


export {
  buildPanel, togglePanel, syncSliders, syncBudgetInputs,
  applyParamsForLevel, saveConfigAs, persistConfigs, rebuildConfigSelect,
};
