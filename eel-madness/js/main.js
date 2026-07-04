// Boot + frame loop (see docs/04-architecture.md).
// World units are CSS pixels at ZOOM 1. The world is a fixed WORLD_W x WORLD_H;
// the camera follows the eel. The SVG viewBox IS the camera for the eel layer;
// WebGL gets the camera as a uniform offset. On touch devices the camera is
// zoomed out (MOBILE.ZOOM): the view spans W/zoom x H/zoom world px.

import { initInput, getIntent } from './input.js';
import { Eel } from './eel.js';
import { Food } from './food.js';
import { Water } from './water.js';
import { Veil } from './veil.js';
import { initUI } from './ui.js';
import { progress } from './progress.js';
import { AXES, FOODS, MOBILE, AMOUNT_SCALE, lightParams } from './tuning.js';
import { clamp, expApproach } from './math.js';

// Fixed world: 2x3 screens of a 1920x1080 reference, independent of window size.
const WORLD_W = 3840;
const WORLD_H = 3240;
const CAM_TAU = 0.30;    // s — camera follow smoothing
const CAM_LOOKAHEAD = 90; // px ahead of a moving eel
const DPR_MAX = 2;       // devicePixelRatio cap (3× screens pay 2.25× fragments for invisible gain)
const DT_MAX = 0.05;     // s — frame-delta cap (tab-switch protection)

const ZOOM = (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? MOBILE.ZOOM : 1;

const svg = document.getElementById('eel-layer');
const water = new Water(document.getElementById('water'));
const eel = new Eel(svg);
const food = new Food(svg);
const veil = new Veil(document.getElementById('veil'), WORLD_H, ZOOM);
const ui = initUI({
  onReset: () => { progress.reset(); lastLight = -1; },
});
let lastLight = -1;   // push light params only when LIGHT actually moves

let W = 0, H = 0;             // window, CSS px
let viewW = 0, viewH = 0;     // visible world span (window / ZOOM)
const cam = { x: 0, y: 0 };

function cameraTarget() {
  const tx = eel.x + eel.hx * CAM_LOOKAHEAD * eel.speedSm - viewW / 2;
  const ty = eel.y + eel.hy * CAM_LOOKAHEAD * eel.speedSm - viewH / 2;
  return [clamp(tx, 0, Math.max(0, WORLD_W - viewW)), clamp(ty, 0, Math.max(0, WORLD_H - viewH))];
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  viewW = W / ZOOM;
  viewH = H / ZOOM;
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
  eel.resize(WORLD_W, WORLD_H);
  // Water sees the view span and the world→device scale; its canvas backing
  // store works out to W×dpr either way, so nothing blurs (docs/04).
  water.resize(viewW, viewH, dpr * ZOOM, WORLD_W, WORLD_H);
  const [tx, ty] = cameraTarget();
  cam.x = tx; cam.y = ty;    // snap, don't drift, on resize
  svg.setAttribute('viewBox', `${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${viewW.toFixed(1)} ${viewH.toFixed(1)}`);
}
resize();
window.addEventListener('resize', resize);

const hint = document.getElementById('hint');
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

  // Pointer input is screen-space; the eel's screen position keeps them aligned.
  const intent = getIntent((eel.x - cam.x) * ZOOM, (eel.y - cam.y) * ZOOM);
  intent.mouth = food.probe(eel);   // auto-mouth: food ahead opens the jaw
  eel.update(dt, intent, WORLD_W, WORLD_H);
  const eaten = food.update(dt, eel, WORLD_W, WORLD_H);
  for (const e of eaten) {
    water.burst(e.x, e.y);
    const f = FOODS[e.key];
    if (f) {
      progress.add(f.axis, f.amount * AMOUNT_SCALE);
      water.pulse(eel.x, eel.y, AXES[f.axis].color, f.amount);   // flourish keeps raw scale
    }
  }

  const [tx, ty] = cameraTarget();
  cam.x = expApproach(cam.x, tx, dt, CAM_TAU);
  cam.y = expApproach(cam.y, ty, dt, CAM_TAU);
  svg.setAttribute('viewBox', `${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${viewW.toFixed(1)} ${viewH.toFixed(1)}`);

  const light = progress.value('light');
  if (Math.abs(light - lastLight) > 0.001) {
    water.setLight(lightParams(light));
    lastLight = light;
  }
  veil.update(cam.y, light);

  water.update(dt, eel, cam);
  eel.render();
  food.render();
  water.render(cam);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
