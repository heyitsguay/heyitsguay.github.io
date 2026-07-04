// P2 systems: boost end-to-end (with dial gating), sparkles, pixel-pulse guard.
import { Eel } from '../js/eel.js';
import { Food } from '../js/food.js';
import { Sparkles } from '../js/sparkles.js';
import { progress } from '../js/progress.js';
import { DIALS, BOOST } from '../js/tuning.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const W = 3840, H = 3240, dt = 1 / 60;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

// ---- Boost end-to-end, exactly as main.js wires it (incl. the dial gate) ----
const runBoost = eelMagic => {
  const eel = new Eel(svgRoot);
  eel.resize(W, H);
  progress.override.eelMagic = eelMagic;
  const burstDial = progress.dial(DIALS.speedBurst);
  eel.setMagic({
    boostAmt: BOOST.AMT_BASE + BOOST.AMT_RAMP * burstDial,
    boostDur: BOOST.DUR_BASE + BOOST.DUR_RAMP * burstDial,
  });
  const swim = { active: true, dirX: 1, dirY: 0, throttle: 1, mouth: false, boost: false };
  for (let f = 0; f < 60 * 5; f++) eel.update(dt, swim, W, H);
  const base = eel.speed;
  let peak = 0, boosted = false;
  for (let f = 0; f < 60 * 2; f++) {
    swim.boost = burstDial > 0 && true;   // main: dial gate && getBoost()
    eel.update(dt, swim, W, H);
    peak = Math.max(peak, eel.speed);
    if (eel.boost01 > 0.5) boosted = true;
  }
  return { base, peak, boosted };
};
const hi = runBoost(1);
check(`boost engages at eelMagic=1 (${(hi.peak / hi.base).toFixed(2)}x)`, hi.boosted && hi.peak > hi.base * 1.25);
const lo = runBoost(0.2);
check('boost gate stays closed below threshold (by design)', !lo.boosted && lo.peak < lo.base * 1.02);

// ---- Sparkles: spawn in view, fade envelopes, die out when dial closes ----
progress.reset();
delete progress.override.eelMagic;
progress.override.worldMagic = 1;
const eel = new Eel(svgRoot);
eel.resize(W, H);
const sparkles = new Sparkles(svgRoot);
const cam = { x: 800, y: 1900 };   // deep view: plankton band active too
for (let f = 0; f < 60 * 6; f++) {
  sparkles.update(dt, cam, 1920, 1080, eel, W, H);
  sparkles.render();
}
const live = sparkles.pool.filter(p => p.age < p.life);
check('sparkles + plankton alive at full WORLD MAGIC', live.length > 8);
check('all live sparkles near the view', live.every(p =>
  p.x > cam.x - 80 && p.x < cam.x + 2000 && p.y > cam.y - 80 && p.y < cam.y + 1160));
check('plankton only in the deep band', sparkles.pool
  .filter(p => p.age < p.life && p.kind === 1).every(p => p.y >= 0.5 * H));
check('opacity attrs set on shown sparkles', live.some(p => p.shown && p.el.attrs.opacity !== undefined));
progress.override.worldMagic = 0;
for (let f = 0; f < 60 * 9; f++) sparkles.update(dt, cam, 1920, 1080, eel, W, H);
check('sparkles die out when the dial closes', sparkles.pool.every(p => p.age >= p.life));

// ---- Pixel pulse: dial reaches food.update; headless guard holds ----
progress.override.worldMagic = 1;
const food = new Food(svgRoot);
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
for (let f = 0; f < 120; f++) { eel.update(dt, idle, W, H); food.update(dt, eel, W, H, null); food.render(); }
check('pixel dial live in food', food.pixDial === 1);
check('headless pixel guard (no levels, no crash)', Object.keys(food.pixels).length === 0);

process.exit(fail ? 1 : 0);
