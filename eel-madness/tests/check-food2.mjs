import { Eel } from '../js/eel.js';
import { Food } from '../js/food.js';
import { FOODS } from '../js/tuning.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const H = 3240, dt = 1 / 60;
const VIEW_W = 1920;
const eel = new Eel(svgRoot);
eel.resize(H);
const spawnedNearSurface = eel.y < H * 0.2;
// park the eel in a bottom corner so falling items never touch it — any
// rotation seen during the idle phase would then be genuine self-tumbling
eel.x = 80; eel.y = H - 80;
for (let i = 0; i < eel.px.length; i++) { eel.px[i] = eel.x - i * eel.seg; eel.py[i] = eel.y; }
const cam = { x: eel.x - 960, y: H - 1080 };   // food falls where you are (docs/09)
const food = new Food(svgRoot);
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };

let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

check('pool sized to Σrarity (patch foods pool separately — docs/10)',
  food.items.length === Object.values(FOODS).filter(f => !f.patch).reduce((s, f) => s + f.rarity, 0)
  && food.patches.length === Object.values(FOODS).filter(f => f.patch).reduce((s, f) => s + f.rarity, 0));
check('eel spawns near surface', spawnedNearSurface);

// 10 sim-minutes idle: spawn/fall/exit behavior
let spawnYmax = -1e9, spawnX0 = 1e9, spawnX1 = -1e9, rotWhileFalling = 0, exits = 0, nan = 0;
const seen = new Set(), touched = new Set(), popMax = {};
for (let f = 0; f < 60 * 600; f++) {
  eel.update(dt, idle, H);
  const eaten = food.update(dt, eel, cam, VIEW_W, H);
  if (eaten.length) console.log('unexpected eat during idle');
  const pops = {};
  for (const it of food.items) {
    if (!Number.isFinite(it.x + it.y + it.vx + it.vy + it.rot + it.vrot)) nan++;
    if (it.alive) {
      pops[it.key] = (pops[it.key] || 0) + 1;
      if (!seen.has(it)) {
        seen.add(it); touched.delete(it);
        if (it.y > spawnYmax) spawnYmax = it.y;
        spawnX0 = Math.min(spawnX0, it.x); spawnX1 = Math.max(spawnX1, it.x);
      }
      // anywhere near the parked eel's chain counts as possible contact
      if (Math.hypot(it.x - eel.x, it.y - eel.y) < 700) touched.add(it);
      if (!touched.has(it) && Math.abs(it.rot) > 1e-9) rotWhileFalling++;
    } else if (seen.has(it)) { seen.delete(it); exits++; }
  }
  for (const k in pops) popMax[k] = Math.max(popMax[k] || 0, pops[k]);
}
check('no NaN', nan === 0);
check('all spawns at/above the surface', spawnYmax <= 0);
check('spawns spread across the camera window (docs/09)',
  spawnX0 >= cam.x - 320 && spawnX1 <= cam.x + VIEW_W + 320 && spawnX1 - spawnX0 > 800);
check('no self-rotation while falling', rotWhileFalling === 0);
check('items exit out the bottom', exits > 0);
let capOK = true;
for (const [k, cfg] of Object.entries(FOODS)) if ((popMax[k] || 0) > cfg.rarity) capOK = false;
console.log('   max concurrent:', JSON.stringify(popMax));
check('per-type population ≤ rarity cap', capOK);
check('common foods spawned more than rare ones', (popMax.pinecone || 0) > (popMax.chocolate || 0));

// Contact tumble: mouth closed, item pushed onto the body picks up spin.
const it = food.items.find(i => i.alive) || food.items[0];
if (!it.alive) { it.alive = true; }
it.eating = 0; it.x = eel.x + eel.hx * 15; it.y = eel.y + eel.hy * 15;
it.vx = -40 * eel.hx + 25; it.vy = 20; it.vrot = 0; it.rot = 0;
eel.mouth = 0;
food.update(dt, eel, cam, VIEW_W, H);
check('contact imparts tumble (vrot ≠ 0)', Math.abs(it.vrot) > 0.01);

// Eat: mouth open, headfirst → event + suck-in state, then slot frees.
it.x = eel.x + eel.hx * 12; it.y = eel.y + eel.hy * 12; it.vrot = 0;
eel.mouth = 1;
const ev = food.update(dt, eel, cam, VIEW_W, H);
check('eat event fired with key', ev.length === 1 && typeof ev[0].key === 'string');
check('suck-in started, slot still busy', it.eating > 0 && it.alive);
let freed = false;
for (let f = 0; f < 30; f++) { food.update(dt, eel, cam, VIEW_W, H); if (!it.alive) { freed = true; break; } }
check('suck-in completes and frees the slot', freed);

// Behind the head with mouth open → not eaten.
const it2 = food.items.find(i => i.alive && i.eating === 0);
if (it2) {
  it2.x = eel.x - eel.hx * 60; it2.y = eel.y - eel.hy * 60;
  const ev2 = food.update(dt, eel, cam, VIEW_W, H);
  check('item behind head not eaten', it2.alive && ev2.length === 0);
}

// ---- The beans & rice patch (docs/10): swoop-through grain eating ----------
const pcfg = FOODS.beansrice;
check('beansrice is a patch food', !!(pcfg && pcfg.patch));
const patch = food.patches[0];
// force-spawn away from the eel, then park the (tightened) cloud on the mouth
food.spawnPatch('beansrice', pcfg, eel, { x: eel.x + 3000, y: 0 }, VIEW_W);
check('patch spawned with all grains alive',
  patch.alive && patch.grains.every(g => g.alive));
check('patch grade rolled', ['common', 'rare', 'legendary'].includes(patch.grade));
// tighten the cloud so every grain sits inside the eat radius, ahead of the mouth
for (const g of patch.grains) { g.ox *= 0.1; g.oy *= 0.1; }
eel.mouth = 1;
let grainEats = 0;
for (let f = 0; f < 240 && patch.alive; f++) {
  // keep the cloud pinned just ahead of the mouth: the sim pulls it down each tick
  patch.x = eel.x + eel.hx * 14; patch.y = eel.y + eel.hy * 14;
  patch.vy = 0;
  for (const e of food.update(dt, eel, cam, VIEW_W, H)) {
    if (e.grain) { grainEats++; if (e.key !== 'beansrice') grainEats = -1e9; }
  }
}
check(`grains eaten individually through the cloud (${grainEats})`,
  grainEats === pcfg.patch.grains);
check('all grains eaten → the patch frees its slot', !patch.alive);

// the probe sees grains: a fresh patch ahead of the nose opens the jaw
food.clear();
food.spawnPatch('beansrice', pcfg, eel, { x: eel.x + 3000, y: 0 }, VIEW_W);
patch.x = eel.x + eel.hx * 60; patch.y = eel.y + eel.hy * 60;
for (const g of patch.grains) { g.x = patch.x + g.ox * 0.2; g.y = patch.y + g.oy * 0.2; }
check('probe sees patch grains', food.probe(eel) === true);

process.exit(fail ? 1 : 0);
