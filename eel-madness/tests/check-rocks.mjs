// Rocks + the dressing shaker (P4, docs/10): seeded placement, boost-smash,
// the 24 h localStorage respawn contract, reset, and the shaker pickup.
import { rocksInChunk } from '../js/worldgen.js';
import { ROCKS, SEA } from '../js/tuning.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

const { Rocks } = await import('../js/rocks.js');

const H = 3240, dt = 1 / 60, VIEW_W = 1920, VIEW_H = 1080;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

// seeded stream: deterministic, roughly one rock per ROCKS.EVERY px
let count = 0, rock = null, rockChunk = 0;
for (let c = 0; c < 400; c++) {
  const rs = rocksInChunk(c);
  count += rs.length;
  if (!rock && rs.length) { rock = rs[0]; rockChunk = c; }
}
const expect = 400 * SEA.CHUNK_W / ROCKS.EVERY;
check(`rock density ≈ spec (${count} vs ~${Math.round(expect)})`,
  count > expect * 0.6 && count < expect * 1.5);
check('rock stream deterministic',
  JSON.stringify(rocksInChunk(rockChunk)) === JSON.stringify(rocksInChunk(rockChunk)));
check('rock sizes in range', rock.r >= ROCKS.R[0] && rock.r <= ROCKS.R[1]);

// pool the rock in, then smash it with a boost-charging eel
const rocks = new Rocks(svgRoot, svgRoot);
const cam = { x: rock.x - VIEW_W / 2, y: H - VIEW_H };
const eel = { x: rock.x - 500, y: H - 200, boost01: 0, speed: 0 };
let ev = rocks.update(dt, eel, cam, VIEW_W, VIEW_H, H);
const slot = rocks.pool.find(s => s.key === Math.round(rock.x));
check('rock pooled in near the camera', !!slot && slot.el.attrs.display === 'inline');
check('rock sits low on the main floor', slot.y > H - 0.42 * VIEW_H && slot.y < H + 20);
check('rock is planted, not hovering: underside below the local terrain', (() => {
  // lowest polygon reach ≈ 0.52 r below center must sit below the terrain top
  const bottom = slot.y + slot.r * 0.52;
  return bottom > rocks.floorY(slot.x, VIEW_H, H);
})());

// a slow bump does nothing
eel.x = slot.x; eel.y = slot.y;
ev = rocks.update(dt, eel, cam, VIEW_W, VIEW_H, H);
check('no shatter without a boost charge', ev.shattered.length === 0);

// the boost charge shatters it
eel.boost01 = 1; eel.speed = ROCKS.SMASH_SPEED + 100;
ev = rocks.update(dt, eel, cam, VIEW_W, VIEW_H, H);
check('boost charge shatters the rock', ev.shattered.length === 1);
check('shatter persisted to localStorage', (() => {
  const saved = JSON.parse(store['eel-madness:rocks:v1']);
  return saved.length === 1 && saved[0][0] === Math.round(rock.x);
})());
eel.boost01 = 0; eel.speed = 0;
ev = rocks.update(dt, eel, cam, VIEW_W, VIEW_H, H);
check('shattered rock stays gone', !rocks.pool.some(s => s.key === Math.round(rock.x)));

// the shaker pops out and is collected on contact
check('shaker revealed', rocks.shaker.alive);
let collected = null;
for (let f = 0; f < 600 && !collected; f++) {
  eel.x = rocks.shaker.x; eel.y = rocks.shaker.y;   // chase the hop
  collected = rocks.update(dt, eel, cam, VIEW_W, VIEW_H, H).collected;
}
check('shaker collected on eel contact', !!collected);
check('shaker gone after pickup', !rocks.shaker.alive);

// respawn contract: a fresh instance honors the store; a stale entry expires
const rocks2 = new Rocks(svgRoot, svgRoot);
rocks2.update(dt, eel, cam, VIEW_W, VIEW_H, H);
check('smash survives a reload', !rocks2.pool.some(s => s.key === Math.round(rock.x)));
store['eel-madness:rocks:v1'] =
  JSON.stringify([[Math.round(rock.x), Date.now() - (ROCKS.RESPAWN_H + 1) * 3600 * 1000]]);
const rocks3 = new Rocks(svgRoot, svgRoot);
rocks3.update(dt, { x: rock.x - 500, y: H - 200, boost01: 0, speed: 0 }, cam, VIEW_W, VIEW_H, H);
check('a rock older than 24h respawns',
  rocks3.pool.some(s => s.key === Math.round(rock.x)));

// reset = every rock back, store cleared
rocks2.clear();
check('reset clears the rock store', !('eel-madness:rocks:v1' in store));

// sandbox smashes never touch the store (docs/08 discipline)
const rocks4 = new Rocks(svgRoot, svgRoot);
const eelB = { x: rock.x, y: 0, boost01: 1, speed: ROCKS.SMASH_SPEED + 100 };
rocks4.update(dt, { x: rock.x - 500, y: H - 200, boost01: 0, speed: 0 }, cam, VIEW_W, VIEW_H, H, true);
const s4 = rocks4.pool.find(s => s.key === Math.round(rock.x));
eelB.y = s4 ? s4.y : H - 30;
rocks4.update(dt, eelB, cam, VIEW_W, VIEW_H, H, true);
check('sandbox smash stays out of localStorage', !('eel-madness:rocks:v1' in store));

process.exit(fail ? 1 : 0);
