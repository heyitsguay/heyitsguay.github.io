// P2 systems: boost end-to-end (with dial gating), sparkles + fairies,
// pixel-pulse guard.
import { Eel } from '../js/eel.js';
import { Food } from '../js/food.js';
import { Sparkles, Lanterns } from '../js/sparkles.js';
import { progress } from '../js/progress.js';
import { DIALS, BOOST } from '../js/tuning.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const H = 3240, dt = 1 / 60;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

// ---- Boost end-to-end, exactly as main.js wires it (incl. the dial gate) ----
const runBoost = eelMagic => {
  const eel = new Eel(svgRoot);
  eel.resize(H);
  progress.override.eelMagic = eelMagic;
  const burstDial = progress.dial(DIALS.speedBurst);
  eel.setMagic({
    boostAmt: BOOST.AMT_BASE + BOOST.AMT_RAMP * burstDial,
    boostDur: BOOST.DUR_BASE + BOOST.DUR_RAMP * burstDial,
  });
  const swim = { active: true, dirX: 1, dirY: 0, throttle: 1, mouth: false, boost: false };
  for (let f = 0; f < 60 * 5; f++) eel.update(dt, swim, H);
  const base = eel.speed;
  let peak = 0, boosted = false;
  for (let f = 0; f < 60 * 2; f++) {
    swim.boost = burstDial > 0 && true;   // main: dial gate && getBoost()
    eel.update(dt, swim, H);
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
eel.resize(H);
const sparkles = new Sparkles(svgRoot);
const cam = { x: 800, y: 1900 };   // deep view: plankton band active too
for (let f = 0; f < 60 * 6; f++) {
  sparkles.update(dt, cam, 1920, 1080, eel, H);
  sparkles.render();
}
const live = sparkles.pool.filter(p => p.age < p.life);
check('sparkles + plankton alive at full WORLD MAGIC', live.length > 8);
// fairy trails can be shed up to FAIRY_PAD (120) outside the view for one
// frame before the cull lands — the bound covers that fringe
check('all live sparkles near the view', live.every(p =>
  p.x > cam.x - 150 && p.x < cam.x + 2070 && p.y > cam.y - 150 && p.y < cam.y + 1230));
check('plankton only in the deep band', sparkles.pool
  .filter(p => p.age < p.life && p.kind === 1).every(p => p.y >= 0.5 * H));
check('opacity attrs set on shown sparkles', live.some(p => p.shown && p.el.attrs.opacity !== undefined));

// plankton palette (Matt): a few medium-light greens, no rainbow
const plkFills = new Set(sparkles.pool.filter(p => p.kind === 1).map(p => p.el.attrs.fill));
check('plankton drawn from the green shade set',
  plkFills.size > 0 && [...plkFills].every(f => /^hsl\((9[0-9]|1[0-3][0-9]),/.test(f)));

// fairies (docs/09): present at full dial, near the view, shedding trails
check('fairies active at full WORLD MAGIC', sparkles.fairies.some(f => f.a > 0.5));
check('fairies near the view', sparkles.fairies.every(f => f.a === 0
  || (f.x > cam.x - 140 && f.x < cam.x + 2100 && f.y > cam.y - 140 && f.y < cam.y + 1260)));

progress.override.worldMagic = 0;
for (let f = 0; f < 60 * 9; f++) sparkles.update(dt, cam, 1920, 1080, eel, H);
check('sparkles die out when the dial closes', sparkles.pool.every(p => p.age >= p.life));
check('fairies fade out when the dial closes', sparkles.fairies.every(f => f.a === 0));

// ---- Food headless smoke (the pixelation pulse was cut) ----
progress.override.worldMagic = 1;
const food = new Food(svgRoot);
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
const fcam = { x: eel.x - 960, y: 0 };
for (let f = 0; f < 120; f++) { eel.update(dt, idle, H); food.update(dt, eel, fcam, 1920, H, null); food.render(); }
check('food sim runs clean headless', food.items.every(it => Number.isFinite(it.x + it.y)));

// ---- Boost crackle (docs/07): electric bolts crackle down the body on the
// glow layer while bursting (GL sparks died under the veil — this must not)
progress.override.eelMagic = 1;
const bEel = new Eel(svgRoot);
bEel.resize(H);
bEel.setMagic({ boostAmt: 1, boostDur: 3 });
const bswim = { active: true, dirX: 1, dirY: 0, throttle: 1, mouth: false, boost: false };
for (let f = 0; f < 60; f++) { bEel.update(dt, bswim, H); bEel.render(); }
bswim.boost = true;
const bspk = new Sparkles(svgRoot);
const bcam = { x: 0, y: 0 };
for (let f = 0; f < 60; f++) {
  bEel.update(dt, bswim, H);
  bEel.render();
  bcam.x = bEel.x - 960;
  bcam.y = Math.min(Math.max(0, bEel.y - 540), H - 1080);
  bspk.update(dt, bcam, 1920, 1080, bEel, H);
}
const bolts = bspk.pool.filter(p => p.age < p.life && p.kind === 2);
check(`boost crackle bolts alive (${bolts.length})`, bolts.length >= 5);
// fresh bolts crackle on the body; older ones shoot back in the wake
check('fresh bolts ride the body', bolts.some(p =>
  Math.hypot(p.x - bEel.x, p.y - bEel.y) < 450));
check('the wake trails behind, not ahead', bolts.every(p =>
  (p.x - bEel.x) * bEel.hx + (p.y - bEel.y) * bEel.hy < 60));

// clear() = blank slate: everything out at once (docs/08 reset)
bspk.clear();
check('sparkles clear() empties the pool and fairies',
  bspk.pool.every(p => p.age >= p.life) && bspk.fairies.every(f => f.a === 0));

// ---- Lantern kelp (docs/07): soft bulbs on seeded strands at high dial ----
progress.override.worldMagic = 1;   // dial fully open
const lan = new Lanterns(svgRoot);
const lcam = { x: 0, y: H - 1080 };   // deep view: kelp roots on screen
const leel = { x: -500, y: 600, speedSm: 0 };
for (let f = 0; f < 30; f++) lan.render(dt, lcam, 1920, 1080, H, leel, 1);
const lit = lan.pool.filter(p => p.shown);
check(`lantern bulbs lit at full WORLD MAGIC (${lit.length})`, lit.length >= 3);
check('bulbs sit in the kelp band (lower strand reaches)', lit.every(p =>
  +p.el.attrs.cy > H - 1500 && +p.el.attrs.cy < H + 10
  && +p.el.attrs.cx > lcam.x - 80 && +p.el.attrs.cx < lcam.x + 2000));
check('bulbs are soft gradient fills', lit.every(p =>
  /lkgrad/.test(p.el.attrs.fill) && +p.el.attrs.opacity > 0));
progress.override.worldMagic = 0;
lan.render(dt, lcam, 1920, 1080, H, leel, 1);
check('lanterns dark when the dial closes', lan.pool.every(p => !p.shown));

process.exit(fail ? 1 : 0);
