// Food grades (P4, docs/10): the per-spawn roll, the amount multiplier
// contract, and the falling tells — buzz is render-only (physics unmoved),
// the legendary throb dwells at rest for most of its period.
import { Eel } from '../js/eel.js';
import { Food } from '../js/food.js';
import { FOODS, GRADES } from '../js/tuning.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const H = 3240, dt = 1 / 60, VIEW_W = 1920;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

const eel = new Eel(svgRoot);
eel.resize(H);
eel.x = 80; eel.y = H - 80;   // parked far from the spawn band
for (let i = 0; i < eel.px.length; i++) { eel.px[i] = eel.x - i * eel.seg; eel.py[i] = eel.y; }
const cam = { x: eel.x - 960, y: H - 1080 };
const food = new Food(svgRoot);

// grade multipliers: sane ordering, common is identity
check('grade multipliers ordered', GRADES.MUL.common === 1
  && GRADES.MUL.rare > 1 && GRADES.MUL.legendary > GRADES.MUL.rare);
check('grade probabilities leave room for common',
  GRADES.P.rare + GRADES.P.legendary < 0.5);

// the roll: spawn a lot, tally the distribution (loose bounds — it's random)
const it = food.items.find(i => i.key === 'pinecone');
const tally = { common: 0, rare: 0, legendary: 0 };
const N = 4000;
for (let k = 0; k < N; k++) {
  it.alive = false;
  food.spawnOne('pinecone', FOODS.pinecone, eel, cam, VIEW_W);
  if (!it.alive) { k--; continue; }   // spawn skipped near the eel — retry
  tally[it.grade]++;
}
check(`grades roll near spec (rare ${tally.rare}, legendary ${tally.legendary} of ${N})`,
  tally.rare > N * GRADES.P.rare * 0.6 && tally.rare < N * GRADES.P.rare * 1.5
  && tally.legendary > N * GRADES.P.legendary * 0.4
  && tally.legendary < N * GRADES.P.legendary * 2.0
  && tally.common > N * 0.8);

// buzz: render-only — the physics position never carries the jitter
it.alive = true; it.eating = 0; it.grade = 'rare';
it.x = cam.x + 900; it.y = 200; it.vx = 0; it.vy = 0; it.rot = 0; it.vrot = 0;
it.jx = 0; it.jy = 0; it.buzzT = 0;
let sawJitter = false;
for (let f = 0; f < 90; f++) {
  food.update(dt, eel, cam, VIEW_W, H);
  food.render();
  if (Math.abs(it.jx) > 0.2 || Math.abs(it.jy) > 0.2) sawJitter = true;
}
check('rare items buzz (smoothed jitter present)', sawJitter);
check('buzz stays bounded', Math.abs(it.jx) < GRADES.BUZZ_A * 2.5
  && Math.abs(it.jy) < GRADES.BUZZ_A * 2.5);
const tr = it.el.attrs.transform;
const shown = tr.match(/translate\((-?\d+\.?\d*) (-?\d+\.?\d*)\)/);
check('rendered position = physics + jitter (render-only tell)',
  Math.abs(parseFloat(shown[1]) - (it.x + it.jx)) < 0.11
  && Math.abs(parseFloat(shown[2]) - (it.y + it.jy)) < 0.11);

// throb: legendary only — mostly dwelling at rest, swelling for ~DUTY of the
// period, peaking near 1 + THROB_A
it.grade = 'legendary';
it.throbPh = 0;
let swellFrames = 0, maxScale = 0, frames = 0;
const period = Math.round(GRADES.THROB_T / dt) * 2;   // two full periods
for (let f = 0; f < period; f++) {
  food.update(dt, eel, cam, VIEW_W, H);
  food.render();
  const m = it.el.attrs.transform.match(/scale\((-?\d+\.?\d*)\)/);
  const s = parseFloat(m[1]);
  frames++;
  if (s > 1.005) swellFrames++;
  if (s > maxScale) maxScale = s;
}
const swellFrac = swellFrames / frames;
check(`throb is dwell-then-bloom, not a sine (active ${(swellFrac * 100).toFixed(0)}%)`,
  swellFrac > GRADES.THROB_DUTY * 0.4 && swellFrac < GRADES.THROB_DUTY * 1.6);
check(`throb peak ≈ 1 + THROB_A (${maxScale.toFixed(3)})`,
  maxScale > 1 + GRADES.THROB_A * 0.7 && maxScale < 1 + GRADES.THROB_A * 1.2);

// the eat event carries the grade (main multiplies the grant by it)
it.grade = 'legendary';
it.x = eel.x + eel.hx * 12; it.y = eel.y + eel.hy * 12;
eel.mouth = 1;
const ev = food.update(dt, eel, cam, VIEW_W, H).find(e => !e.grain);
check('eat event carries the grade', ev && ev.grade === 'legendary');

process.exit(fail ? 1 : 0);
