// Boot + frame loop (see docs/04-architecture.md).
// World units are CSS pixels. The world is WORLD_SX x WORLD_SY screens; the
// camera follows the eel. The SVG viewBox IS the camera for the eel layer;
// WebGL gets the camera as a uniform offset.

import { initInput, getIntent } from './input.js';
import { Eel } from './eel.js';
import { Water } from './water.js';
import { clamp, expApproach } from './math.js';

// Fixed world: 2x3 screens of a 1920x1080 reference, independent of window size.
const WORLD_W = 3840;
const WORLD_H = 3240;
const CAM_TAU = 0.30;    // s — camera follow smoothing
const CAM_LOOKAHEAD = 90; // px ahead of a moving eel

const svg = document.getElementById('eel-layer');
const water = new Water(document.getElementById('water'));
const eel = new Eel(svg);

let W = 0, H = 0;
const cam = { x: 0, y: 0 };

function cameraTarget() {
  const tx = eel.x + eel.hx * CAM_LOOKAHEAD * eel.speedSm - W / 2;
  const ty = eel.y + eel.hy * CAM_LOOKAHEAD * eel.speedSm - H / 2;
  return [clamp(tx, 0, Math.max(0, WORLD_W - W)), clamp(ty, 0, Math.max(0, WORLD_H - H))];
}

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  eel.resize(WORLD_W, WORLD_H);
  water.resize(W, H, dpr, WORLD_W, WORLD_H);
  const [tx, ty] = cameraTarget();
  cam.x = tx; cam.y = ty;    // snap, don't drift, on resize
  svg.setAttribute('viewBox', `${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${W} ${H}`);
}
resize();
window.addEventListener('resize', resize);

const hint = document.getElementById('hint');
initInput(() => hint.classList.add('hidden'));

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);   // tab-switch protection
  last = now;

  // Pointer input is screen-space; the eel's screen position keeps them aligned.
  const intent = getIntent(eel.x - cam.x, eel.y - cam.y);
  eel.update(dt, intent, WORLD_W, WORLD_H);

  const [tx, ty] = cameraTarget();
  cam.x = expApproach(cam.x, tx, dt, CAM_TAU);
  cam.y = expApproach(cam.y, ty, dt, CAM_TAU);
  svg.setAttribute('viewBox', `${cam.x.toFixed(1)} ${cam.y.toFixed(1)} ${W} ${H}`);

  water.update(dt, eel, cam);
  eel.render();
  water.render(cam);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
