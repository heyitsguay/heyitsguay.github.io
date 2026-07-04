import { Eel } from '../js/eel.js';
import { Food } from '../js/food.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const W = 3840, H = 3240, dt = 1 / 60;
const eel = new Eel(svgRoot);
eel.resize(W, H);
const food = new Food(svgRoot);

let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

const it = food.items[0];
const place = (dx, dy) => { it.alive = true; it.eating = 0; it.x = eel.x + dx; it.y = eel.y + dy; it.vx = 0; it.vy = 0; };

// eel faces +x (heading 0) at spawn.
// Triangle probe: mirrors PROBE_START=4, PROBE_LEN=120, PROBE_WIDTH_FRAC=0.10
// in food.js — allowed lateral = r + s * 0.05 at axial distance s from the apex.
check('probe empty world', (it.alive = false, !food.probe(eel)));
place(60, 0);   check('probe hits food dead ahead', food.probe(eel));
place(60, it.r + 56 * 0.05 + 2); check('probe misses food outside the triangle', !food.probe(eel));
place(60, it.r + 56 * 0.05 - 2); check('probe grazes food at the triangle edge', food.probe(eel));
place(4 + 110, it.r + 110 * 0.05 - 2); check('probe wider near the far end', food.probe(eel));
place(4 + 10, it.r + 110 * 0.05 - 2); check('...but same offset misses near the apex', !food.probe(eel));
place(-60, 0);  check('probe ignores food behind', !food.probe(eel));
place(4 + 120 + it.r + 10, 0); check('probe ends at PROBE_LEN', !food.probe(eel));
place(60, 0); it.eating = 0.1; check('probe ignores mid-suck-in items', !food.probe(eel));

// Full no-hands flow: park food ahead, run the real loop shape — probe drives
// intent.mouth, mouth opens, eat fires, mouth closes after.
place(70, 0);
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
let ate = null, opened = false;
for (let f = 0; f < 240 && !ate; f++) {
  idle.mouth = food.probe(eel);
  eel.update(dt, idle, W, H);
  if (eel.mouth > 0.5) opened = true;
  it.x = eel.x + eel.hx * 20; it.y = eel.y + eel.hy * 20;   // keep it in reach
  const ev = food.update(dt, eel, W, H);
  if (ev.length) ate = ev[0];
}
check('mouth opened automatically', opened);
check('food eaten with no manual input', !!ate);
let closed = false;
for (let f = 0; f < 120; f++) {
  idle.mouth = food.probe(eel);
  eel.update(dt, idle, W, H);
  food.update(dt, eel, W, H);
  if (eel.mouth < 0.05) { closed = true; break; }
}
check('mouth eases shut after the catch', closed);

process.exit(fail ? 1 : 0);
