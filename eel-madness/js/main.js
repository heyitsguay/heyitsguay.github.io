// Boot + frame loop (see docs/04-architecture.md).
// World units are CSS pixels at ZOOM 1. The world is WORLD_H deep and INFINITE
// along x (docs/09 — seeded procedural chunks); the camera follows the eel,
// clamped in y only. The SVG viewBox IS the camera for the eel layer; WebGL
// only ever sees camera-relative coordinates (float precision, docs/09). On
// touch devices the camera is zoomed out (MOBILE.ZOOM): the view spans
// W/zoom x H/zoom world px. The eel's position persists across sessions.

import { initInput, getIntent, consumeGreet, getBoost } from './input.js';
import { Eel } from './eel.js';
import { Food } from './food.js';
import { Water } from './water.js';
import { Veil } from './veil.js';
import { Critters } from './critters.js';
import { Hearts } from './hearts.js';
import { Sparkles, BgLights, Lanterns } from './sparkles.js';
import { FrontPlane } from './fgplane.js';
import { initUI } from './ui.js';
import { progress } from './progress.js';
import { AXES, FOODS, MOBILE, AMOUNT_SCALE, DIALS, GREET, BOOST, EAT_FX, LEVELS, lightParams } from './tuning.js';
import { clamp, lerp, expApproach } from './math.js';

// Depth of the water column (3 reference screens); x is unbounded.
const WORLD_H = 3240;
const CAM_TAU = 0.30;    // s — camera follow smoothing
const CAM_LOOKAHEAD = 90; // px ahead of a moving eel
const DPR_MAX = 2;       // devicePixelRatio cap (3× screens pay 2.25× fragments for invisible gain)
const DT_MAX = 0.05;     // s — frame-delta cap (tab-switch protection)
const POS_KEY = 'eel-madness:pos:v1';
const POS_SAVE_T = 1.5;  // s between position saves

const ZOOM = (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? MOBILE.ZOOM : 1;

const svg = document.getElementById('eel-layer');
const glowSvg = document.getElementById('glow-layer');   // emissives, above the veil
const water = new Water(document.getElementById('water'));
const eel = new Eel(svg);
const food = new Food(svg);
const veil = new Veil(document.getElementById('veil'), WORLD_H, ZOOM);
const hearts = new Hearts(glowSvg);
const critters = new Critters(svg, glowSvg);
const sparkles = new Sparkles(glowSvg);
const bgLights = new BgLights(glowSvg);
const lanterns = new Lanterns(glowSvg);
const fg = new FrontPlane(svg);
let uiGreet = false;

// Title screen + attract mode (docs/08): the sea plays itself at full dials
// (EEL MAGIC stays 0 — the powers are the surprise) behind the menu — the
// eel cruises right at half throttle, and nothing writes to the save.
// URL preview parameters skip the title and load straight into that state.
const SKIP_TITLE = Object.keys(progress.override).length > 0;
let titleMode = !SKIP_TITLE;
progress.demo = titleMode;
const bootPos = { x: 0, y: 486 };   // where Start returns the eel (set below)

const ui = initUI({
  // Reset = a BLANK SLATE (docs/08): axes zeroed, eel home, and every live
  // world object evicted — the tensor has no population targets, so without
  // the explicit clears the old sea would linger around a "reset" player.
  onReset: () => {
    progress.reset();
    lastLight = -1; lastLife = -1; lastEelMagic = -1;
    bootPos.x = 0; bootPos.y = 486;   // a fresh sea starts at home
    eel.place(bootPos.x, bootPos.y);
    critters.clear();
    food.clear();
    hearts.clear();
    sparkles.clear();
    water.clear();
    const [tx, ty] = cameraTarget();
    cam.x = tx; cam.y = ty;   // snap home — no cross-sea camera sweep
    try { localStorage.removeItem(POS_KEY); } catch { /* private mode */ }
  },
  onGreet: () => { uiGreet = true; },
  // Start: leave the attract sea — blank slate, real dials, the eel back
  // where the save left it (the attract cruise moved it).
  onStart: () => {
    titleMode = false;
    progress.demo = false;
    lastLight = -1; lastLife = -1; lastEelMagic = -1;
    critters.clear();
    food.clear();
    hearts.clear();
    sparkles.clear();
    water.clear();
    eel.place(bootPos.x, bootPos.y);
    const [tx, ty] = cameraTarget();
    cam.x = tx; cam.y = ty;
    hint.classList.remove('hidden');
  },
  // Skip To The End (docs/08): a separate, maxed-out instance — sandbox mode
  // forces every value/level to full and progress.add/persistence are inert,
  // so nothing done there touches the real save.
  onSkip: () => {
    titleMode = false;
    progress.demo = false;
    progress.sandbox = true;
    lastLight = -1; lastLife = -1; lastEelMagic = -1;
    critters.clear();
    food.clear();
    hearts.clear();
    sparkles.clear();
    water.clear();
    eel.place(0, 486);
    const [tx, ty] = cameraTarget();
    cam.x = tx; cam.y = ty;
    hint.classList.remove('hidden');
  },
  // Main Menu from the pause panel (docs/08): raise the title back over the
  // sea. The player's place is remembered so Start resumes it — unless we're
  // leaving the sandbox, which never touches the save.
  onMenu: () => {
    if (!progress.sandbox) {
      bootPos.x = eel.x;
      bootPos.y = eel.y;
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(eel.x), y: Math.round(eel.y) }));
      } catch { /* private mode */ }
    }
    titleMode = true;
    progress.demo = true;
    progress.sandbox = false;
    lastLight = -1; lastLife = -1; lastEelMagic = -1;
  },
  skipTitle: SKIP_TITLE,
});
let lastLight = -1;   // push light/life/magic values only when they actually move
let lastLife = -1;
let lastEelMagic = -1;
let greetCd = 0;
let posT = 0;
const EEL_HEART = {   // rose-pink, the EEL MAGIC hue — a little fan of three
  color: '#ff9db8', size: 16.5, count: 3, pattern: 'fan', spread: 16,
};

// Screen feedback (docs/06): a gentle colored flash + camera shake — big for
// eats (scaled by the food's amount), tiny and rose for greets.
const flashEl = document.getElementById('flash');
let flashA = 0;
let shakeAmp = 0, shakeT = 0;
function screenFeedback(color, flashPeak, shakePeak) {
  flashEl.style.background = `rgb(${color.map(c => Math.round(c * 255)).join(',')})`;
  flashA = Math.max(flashA, flashPeak);
  shakeAmp = Math.max(shakeAmp, shakePeak);
}

let W = 0, H = 0;             // window, CSS px
let viewW = 0, viewH = 0;     // visible world span (window / ZOOM)
const cam = { x: 0, y: 0 };

function cameraTarget() {
  const tx = eel.x + eel.hx * CAM_LOOKAHEAD * eel.speedSm - viewW / 2;
  // the eel anchors mid-view — the title composition hangs off that same
  // 50vh line (style.css #title-head / #title-buttons)
  const ty = eel.y + eel.hy * CAM_LOOKAHEAD * eel.speedSm - viewH / 2;
  return [tx, clamp(ty, 0, Math.max(0, WORLD_H - viewH))];   // x unbounded
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  viewW = W / ZOOM;
  viewH = H / ZOOM;
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
  eel.resize(WORLD_H);
  // Water sees the view span and the world→device scale; its canvas backing
  // store works out to W×dpr either way, so nothing blurs (docs/04).
  water.resize(viewW, viewH, dpr * ZOOM, WORLD_H);
  fg.resize(viewW, viewH, WORLD_H);
  const [tx, ty] = cameraTarget();
  cam.x = tx; cam.y = ty;    // snap, don't drift, on resize
  const vb = `${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${viewW.toFixed(1)} ${viewH.toFixed(1)}`;
  svg.setAttribute('viewBox', vb);
  glowSvg.setAttribute('viewBox', vb);
}

// The persisted spawn: resume where you left off (docs/09).
try {
  const pos = JSON.parse(localStorage.getItem(POS_KEY));
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    eel.resize(WORLD_H);   // sizes the chain before placing it
    eel.place(pos.x, clamp(pos.y, 20, WORLD_H - 20));
  }
} catch { /* fresh sea */ }
resize();
bootPos.x = eel.x;   // Start returns here after the attract cruise
bootPos.y = eel.y;
window.addEventListener('resize', resize);

const hint = document.getElementById('hint');
if (SKIP_TITLE) hint.classList.remove('hidden');
initInput(() => hint.classList.add('hidden'));

let last = performance.now();
function frame(now) {
  if (ui.paused()) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min((now - last) / 1000, DT_MAX);   // tab-switch protection
  last = now;

  progress.tick(dt);   // level-up bloom easing (docs/08)
  ui.tick(dt);         // level-up popup queue

  // Pointer input is screen-space; the eel's screen position keeps them
  // aligned. In title mode the eel drives itself: a gentle constant cruise
  // rightward at half throttle while the menu floats over the attract sea.
  const intent = titleMode
    ? { active: true, dirX: 1, dirY: 0, throttle: 0.5, mouth: false, boost: false }
    : getIntent((eel.x - cam.x) * ZOOM, (eel.y - cam.y) * ZOOM);
  intent.mouth = food.probe(eel);   // auto-mouth: food ahead opens the jaw
  const burstDial = progress.dial(DIALS.speedBurst);
  intent.boost = !titleMode && burstDial > 0 && getBoost();

  // EEL MAGIC package (docs/07): lash growth, makeup, burst strength/duration.
  const em = progress.value('eelMagic');
  if (Math.abs(em - lastEelMagic) > 0.003) {
    lastEelMagic = em;
    eel.setMagic({
      lashLen: lerp(4, 8, em),
      shadowA: 0.5 * progress.dial(DIALS.makeup),
      lipA: 0.85 * progress.dial(DIALS.makeup),
      hueRange: 45 * progress.dial(DIALS.makeupHue),
      boostAmt: BOOST.AMT_BASE + BOOST.AMT_RAMP * burstDial,
      boostDur: BOOST.DUR_BASE + BOOST.DUR_RAMP * burstDial,
    });
  }

  eel.update(dt, intent, WORLD_H);
  // (the boost's electric crackle is emitted inside sparkles.update — glow
  // layer, so it shines through the veil in dark water)

  const eaten = food.update(dt, eel, cam, viewW, WORLD_H, water);
  for (const e of eaten) {
    water.burst(e.x, e.y);
    const f = FOODS[e.key];
    if (f) {
      let mul = 1;
      if (!titleMode) {   // attract-mode bites are theater — no save writes
        progress.add(f.axis, f.amount * AMOUNT_SCALE);
        // Level-ups from this bite (docs/08): chained popups + axis-colored
        // confetti, and the eat's own flash + shake hit LEVELUP_MUL harder
        // (applied after the caps so the boost always reads).
        const ups = progress.consumeLevelUps();
        for (const lu of ups) {
          ui.levelUp(lu);
          sparkles.burst(eel.x, eel.y - 26, AXES[lu.axis].color, LEVELS.SPARKS);
        }
        if (ups.length) mul = EAT_FX.LEVELUP_MUL;
      }
      water.pulse(eel.x, eel.y, AXES[f.axis].color, f.amount);   // flourish keeps raw scale
      screenFeedback(AXES[f.axis].color,
        mul * Math.min(0.22, EAT_FX.FLASH_A + EAT_FX.FLASH_A_AMT * f.amount),
        mul * Math.min(14, EAT_FX.SHAKE_BASE + EAT_FX.SHAKE_AMT * f.amount));
    }
  }

  // Greeting (I / touch button): eel heart + in-range critter responses.
  greetCd = Math.max(0, greetCd - dt);
  const greetWanted = (consumeGreet() || uiGreet) && !titleMode;
  uiGreet = false;
  const greetUnlocked = progress.dial(DIALS.greet) > 0;
  ui.showGreet(greetUnlocked && !titleMode);
  // a greeting needs someone to greet: no subject in range, no greet
  if (greetWanted && greetUnlocked && greetCd === 0 && critters.anyGreetable(eel)) {
    greetCd = GREET.CD;
    hearts.emit(eel.x + eel.hx * 6, eel.y - 18, EEL_HEART);
    critters.greet(eel, hearts);
    screenFeedback(GREET.COLOR, GREET.FLASH_A, GREET.SHAKE);
  }

  critters.update(dt, eel, WORLD_H, water, cam, viewW, viewH, food.positions());
  hearts.update(dt);
  sparkles.update(dt, cam, viewW, viewH, eel, WORLD_H);

  const [tx, ty] = cameraTarget();
  cam.x = expApproach(cam.x, tx, dt, CAM_TAU);
  cam.y = expApproach(cam.y, ty, dt, CAM_TAU);

  // Persist the eel's place in the infinite sea (throttled) — the attract
  // cruise and the sandbox don't count as travel.
  posT -= dt;
  if (posT <= 0 && !titleMode && !progress.sandbox) {
    posT = POS_SAVE_T;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(eel.x), y: Math.round(eel.y) }));
    } catch { /* private mode */ }
  }

  // Eat feedback: decaying flash + shake (the shake perturbs only the
  // rendering camera; the eased cam above stays clean).
  const rcam = { x: cam.x, y: cam.y };
  if (shakeAmp > 0.1) {
    shakeT += dt;
    shakeAmp *= Math.exp(-dt / EAT_FX.SHAKE_TAU);
    rcam.x += shakeAmp * Math.sin(shakeT * EAT_FX.SHAKE_F1);
    rcam.y += shakeAmp * Math.sin(shakeT * EAT_FX.SHAKE_F2 + 1.3);
  }
  if (flashA > 0.003) {
    flashA *= Math.exp(-dt / EAT_FX.FLASH_TAU);
    flashEl.style.opacity = flashA.toFixed(3);
  } else if (flashEl.style.opacity !== '0') {
    flashEl.style.opacity = '0';
  }

  const vb = `${rcam.x.toFixed(1)} ${rcam.y.toFixed(1)} ${viewW.toFixed(1)} ${viewH.toFixed(1)}`;
  svg.setAttribute('viewBox', vb);
  glowSvg.setAttribute('viewBox', vb);   // glow layer shares the camera exactly

  const light = progress.value('light');
  if (Math.abs(light - lastLight) > 0.001) {
    water.setLight(lightParams(light));
    lastLight = light;
  }
  const life = progress.value('life');
  if (Math.abs(life - lastLife) > 0.002) {
    water.setLife(life);
    lastLife = life;
  }
  veil.update(rcam.y, light);

  water.update(dt, eel, cam);   // sim wrap uses the clean camera
  eel.render();
  critters.render(hearts);      // hearts: the seahorse pair vignette pops one
  food.render();
  fg.render(dt, rcam);          // the front plane pans with the render camera
  bgLights.render(dt, rcam, viewW, viewH, WORLD_H);
  // lantern bulbs sit on the kelp geometry water actually built (builtLife)
  lanterns.render(dt, rcam, viewW, viewH, WORLD_H, eel, water.builtLife ?? 0);
  hearts.render();
  sparkles.render();
  water.render(rcam);           // all visual layers shake together

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
