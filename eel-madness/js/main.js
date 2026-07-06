// Boot + frame loop (see docs/04-architecture.md).
// World units are CSS pixels at ZOOM 1. The world is WORLD_H deep and INFINITE
// along x (docs/09 — seeded procedural chunks); the camera follows the eel,
// clamped in y only. The SVG viewBox IS the camera for the eel layer; WebGL
// only ever sees camera-relative coordinates (float precision, docs/09). On
// touch devices the camera is zoomed out (MOBILE.ZOOM): the view spans
// W/zoom x H/zoom world px. The eel's position persists across sessions.

import { initInput, getIntent, consumeGreet, getBoost, getFlare } from './input.js';
import { Eel, flarePulseEnv } from './eel.js';
import { Food } from './food.js';
import { Water } from './water.js';
import { Veil } from './veil.js';
import { Critters } from './critters.js';
import { Hearts } from './hearts.js';
import { Sparkles, BgLights, Lanterns, StaminaBar, EelHalo } from './sparkles.js';
import { FrontPlane } from './fgplane.js';
import { Rocks } from './rocks.js';
import { initUI } from './ui.js';
import { progress } from './progress.js';
import { AXES, FOODS, MOBILE, AMOUNT_SCALE, DIALS, GREET, BOOST, EAT_FX, LEVELS,
  GRADES, COMBO, ROCKS, EEL_LIGHT, lightParams } from './tuning.js';
import { clamp, lerp, expApproach } from './math.js';
import { mainFloorY } from './worldgen.js';

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
const rocks = new Rocks(svg, glowSvg);
const stamBar = new StaminaBar(glowSvg);                        // boost (blue)
const lightBar = new StaminaBar(glowSvg, EEL_LIGHT.BAR_COLOR);  // eel light (green)
const eelHalo = new EelHalo(glowSvg);
let uiGreet = false;
let uiFlare = false;    // the touch ✦ button's held state (docs/10)
let uiSprint = false;   // the touch ⚡ button's held state (docs/02)

// Food combos (docs/10): eats within COMBO.WINDOW chain; the counter drives
// popups, escalating FX, and the (placeholder) reward below.
let comboN = 0, comboT = 0;
// The dressing buff (docs/10): greens grants ×ROCKS.BUFF_MUL while > 0.
let greensBuffT = 0;
const cssColor = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;

// COMBO REWARD — PLACEHOLDER (docs/10): charge boost stamina. The real reward
// is TBD (Matt); whatever it becomes, keep it inside this one function.
function comboReward(n) {
  eel.stamina = Math.min(1, eel.stamina + COMBO.STAMINA_PER);
  stamBar.flash();
  void n;
}

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
    rocks.clear();   // every rock back (docs/10)
    comboN = 0; comboT = 0; greensBuffT = 0;
    const [tx, ty] = cameraTarget();
    cam.x = tx; cam.y = ty;   // snap home — no cross-sea camera sweep
    try { localStorage.removeItem(POS_KEY); } catch { /* private mode */ }
  },
  onGreet: () => { uiGreet = true; },
  onFlare: held => { uiFlare = held; },
  onSprint: held => { uiSprint = held; },
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
    showHint();
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
    showHint();
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

// The SOLID seafloor (docs/10): the main-plane terrain surface at an x —
// the eel and the fish collide with this, and flora roots on it.
const floorAt = x => mainFloorY(x, viewH, WORLD_H);

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
if (titleMode) {
  // the title camera must be able to CENTER the eel: a fresh spawn (486 px
  // deep) is shallower than half a zoomed-out phone view, which pinned the
  // camera at the surface and hung the eel high over the title line
  eel.place(eel.x, clamp(eel.y, viewH / 2 + 40, WORLD_H - viewH / 2 - 40));
  const [tx, ty] = cameraTarget();
  cam.x = tx; cam.y = ty;
}
window.addEventListener('resize', resize);

// The control hint fades on first input OR after 5 s regardless — touch
// players may never trip the input callback (it shipped stuck on mobile).
const hint = document.getElementById('hint');
// Touch steers with the joystick now (docs/02) — say so instead of the
// press-and-hold line, which no longer does anything there.
if (window.matchMedia && matchMedia('(pointer: coarse)').matches) {
  hint.textContent = 'steer with the joystick';
}
let hintT = -1;
const showHint = () => {
  hint.classList.remove('hidden');
  hintT = 5;
};
if (SKIP_TITLE) showHint();
initInput(() => { hint.classList.add('hidden'); hintT = -1; });

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

  if (hintT > 0) {     // the hint's 5 s timer (pause freezes it with dt)
    hintT -= dt;
    if (hintT <= 0) hint.classList.add('hidden');
  }

  // Pointer input is screen-space; the eel's screen position keeps them
  // aligned. In title mode the eel drives itself: a gentle constant cruise
  // rightward at half throttle, easing toward a depth the camera can center
  // (rotation, resizes, and shallow Main-Menu returns all self-correct).
  let intent;
  if (titleMode) {
    const wantY = clamp(eel.y, viewH / 2 + 40, WORLD_H - viewH / 2 - 40);
    const dy = clamp((wantY - eel.y) / 240, -0.6, 0.6);
    const m = Math.hypot(1, dy);
    intent = { active: true, dirX: 1 / m, dirY: dy / m, throttle: 0.5, mouth: false, boost: false };
  } else {
    intent = getIntent((eel.x - cam.x) * ZOOM, (eel.y - cam.y) * ZOOM);
  }
  intent.mouth = food.probe(eel);   // auto-mouth: food ahead opens the jaw
  const burstDial = progress.dial(DIALS.speedBurst);
  intent.boost = !titleMode && burstDial > 0 && (getBoost() || uiSprint);
  const lightDial = progress.dial(DIALS.eelLight);
  intent.flare = !titleMode && lightDial > 0 && (getFlare() || uiFlare);

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

  eel.update(dt, intent, WORLD_H, floorAt);
  // (the boost's electric crackle is emitted inside sparkles.update — glow
  // layer, so it shines through the veil in dark water)

  // Combo window (docs/10): the chain dies when the window closes.
  comboT = Math.max(0, comboT - dt);
  if (comboT === 0) comboN = 0;
  greensBuffT = Math.max(0, greensBuffT - dt);

  const eaten = food.update(dt, eel, cam, viewW, WORLD_H, water);
  for (const e of eaten) {
    const f = FOODS[e.key];
    if (!f) continue;
    // the grant: authored amount × grade (docs/10) × the dressing buff
    const gradeMul = GRADES.MUL[e.grade] || 1;
    const buffMul = (e.key === 'greens' && greensBuffT > 0) ? ROCKS.BUFF_MUL : 1;
    const amt = f.amount * gradeMul * buffMul;

    // Patch grains (docs/10): tiny individual grants and light FX — they
    // refresh a live combo window but never increment the counter.
    if (e.grain) {
      water.burst(e.x, e.y, 2);
      if (!titleMode) progress.add(f.axis, amt * AMOUNT_SCALE);
      if (comboN > 0) comboT = COMBO.WINDOW;
      if (Math.random() < 0.3) water.pulse(e.x, e.y, AXES[f.axis].color, amt * 0.6);
      continue;
    }

    water.burst(e.x, e.y);
    let mul = 1;
    if (!titleMode) {   // attract-mode bites are theater — no save writes
      progress.add(f.axis, amt * AMOUNT_SCALE);
      // Level-ups from this bite (docs/08): chained popups + axis-colored
      // confetti, and the eat's own flash + shake hit LEVELUP_MUL harder
      // (applied after the caps so the boost always reads).
      const ups = progress.consumeLevelUps();
      for (const lu of ups) {
        ui.levelUp(lu);
        sparkles.burst(eel.x, eel.y - 26, AXES[lu.axis].color, LEVELS.SPARKS);
      }
      if (ups.length) mul = EAT_FX.LEVELUP_MUL;
      // The combo (docs/10): chain, count, celebrate, reward (placeholder).
      comboN = comboT > 0 ? comboN + 1 : 1;
      comboT = COMBO.WINDOW;
      if (comboN >= 2) {
        ui.combo(comboN, cssColor(AXES[f.axis].color));
        sparkles.burst(eel.x, eel.y - 26, AXES[f.axis].color,
          Math.min(30, COMBO.SPARKS * comboN));
        eel.excite(COMBO.EXCITE);
        comboReward(comboN);
        mul *= Math.min(COMBO.FX_CAP, 1 + COMBO.FX_MUL * (comboN - 1));
      }
    }
    water.pulse(eel.x, eel.y, AXES[f.axis].color, amt);   // flourish rides the graded amount
    screenFeedback(AXES[f.axis].color,
      mul * Math.min(0.22, EAT_FX.FLASH_A + EAT_FX.FLASH_A_AMT * amt),
      mul * Math.min(14, EAT_FX.SHAKE_BASE + EAT_FX.SHAKE_AMT * amt));
  }

  // Greeting (I / touch button): eel heart + in-range critter responses.
  greetCd = Math.max(0, greetCd - dt);
  const greetWanted = (consumeGreet() || uiGreet) && !titleMode;
  uiGreet = false;
  const greetUnlocked = progress.dial(DIALS.greet) > 0;
  const greetable = critters.anyGreetable(eel);
  ui.showGreet(greetUnlocked && !titleMode, greetable);
  // a greeting needs someone to greet: no subject in range, no greet
  if (greetWanted && greetUnlocked && greetCd === 0 && greetable) {
    greetCd = GREET.CD;
    hearts.emit(eel.x + eel.hx * 6, eel.y - 18, EEL_HEART);
    const responders = critters.greet(eel, hearts);
    screenFeedback(GREET.COLOR, GREET.FLASH_A, GREET.SHAKE);
    // LOVE (docs/10): greeting is how the fifth axis earns — per responder,
    // capped per greet. Level-ups pop like any other axis.
    if (responders > 0) {
      progress.add('love', GREET.LOVE_PER * Math.min(responders, GREET.LOVE_CAP));
      for (const lu of progress.consumeLevelUps()) {
        ui.levelUp(lu);
        sparkles.burst(eel.x, eel.y - 26, AXES[lu.axis].color, LEVELS.SPARKS);
      }
    }
  }

  critters.update(dt, eel, WORLD_H, water, cam, viewW, viewH, food.positions(), floorAt);
  // Spontaneous greets (docs/10): as LOVE grows, friends say hello first.
  critters.spontaneous(dt, eel, hearts, progress.dial(DIALS.spontGreet));
  hearts.update(dt);
  sparkles.update(dt, cam, viewW, viewH, eel, WORLD_H);

  // Rocks + the shaker (docs/10): boost-smash → debris FX → the dressing.
  const rockEv = rocks.update(dt, eel, cam, viewW, viewH, WORLD_H, progress.sandbox);
  for (const s of rockEv.shattered) {
    water.burst(s.x, s.y, 14);
    water.pulse(s.x, s.y, [1.0, 0.85, 0.55], 1.6);
    screenFeedback([0.85, 0.90, 1.0], 0.12, 10);
  }
  if (rockEv.collected) {
    greensBuffT = ROCKS.BUFF_T;
    screenFeedback(AXES.life.color, 0.12, 4);
    sparkles.burst(rockEv.collected.x, rockEv.collected.y, AXES.life.color, 18);
    ui.notice('DRESSING!', 'Greens are extra nourishing for a while',
      cssColor(AXES.life.color));
  }

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

  // The eel light (docs/10): an ambient soft hole in the veil around the eel.
  // The flare (hold J / ✦) runs on the eel's green light stamina (follow-up
  // 2): ignition fires a radiating pulse — the hole overshoots outward, an
  // expanding ring rides the glow layer — then the held flare settles at its
  // brighter-than-ambient steady state until the meter empties. The mask
  // hole is the light; the halo/ring are the visible flourish.
  ui.showFlare(lightDial > 0 && !titleMode);
  ui.showSprint(burstDial > 0 && !titleMode);
  ui.showJoy(!titleMode);   // the joystick isn't progression-gated
  const pulseEnv = flarePulseEnv(eel.pulseU);
  let hole = null;
  let holeRWorld = 0;
  if (lightDial > 0) {
    holeRWorld = (EEL_LIGHT.R_BASE + EEL_LIGHT.R_RAMP * lightDial)
      * (1 + (EEL_LIGHT.FLARE_R - 1) * eel.flare01
         + (EEL_LIGHT.PULSE_R - 1) * pulseEnv);
    const ambient = EEL_LIGHT.HOLE_BASE + EEL_LIGHT.HOLE_RAMP * lightDial;
    hole = {
      x: (eel.x - rcam.x) * ZOOM,
      y: eel.y * ZOOM,   // element-local: the veil's top is world y = 0
      r: holeRWorld * ZOOM,
      a: lerp(lerp(ambient, EEL_LIGHT.FLARE_HOLE, eel.flare01),
              EEL_LIGHT.PULSE_HOLE, pulseEnv),
    };
  }
  veil.update(rcam.y, light, hole);

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
  eelHalo.render(eel, eel.flare01, holeRWorld, eel.pulseU);
  // Stamina meters (docs/10 follow-up 2): fixed order — boost, then light —
  // but visible bars always compact from the top slot, no gaps.
  let barSlot = 0;
  stamBar.render(dt, eel, burstDial > 0 && !titleMode, eel.stamina, barSlot);
  if (stamBar.wanted) barSlot++;
  lightBar.render(dt, eel, lightDial > 0 && !titleMode, eel.lightStam, barSlot);
  water.render(rcam);           // all visual layers shake together

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
