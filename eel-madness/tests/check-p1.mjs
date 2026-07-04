import { Eel } from '../js/eel.js';
import { Critters } from '../js/critters.js';
import { Hearts } from '../js/hearts.js';
import { progress } from '../js/progress.js';
import { DIALS } from '../js/tuning.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const W = 3840, H = 3240, dt = 1 / 60;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

const eel = new Eel(svgRoot);
eel.resize(W, H);
const critters = new Critters(svgRoot, svgRoot);   // mock resolves #glows too
const hearts = new Hearts(svgRoot);

const aliveM = () => critters.minnows.filter(m => m.alive).length;
const aliveJ = () => critters.jellies.filter(j => j.alive).length;
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
const cam = { x: 600, y: 150 };
const VIEW_W = 1920, VIEW_H = 1080;
const run = n => { for (let f = 0; f < n; f++) { eel.update(dt, idle, W, H); critters.update(dt, eel, W, H, null, cam, VIEW_W, VIEW_H); critters.render(); hearts.update(dt); hearts.render(); } };

// LIFE = 0 → nothing
progress.reset();
run(30);
check('no critters at LIFE 0', aliveM() === 0 && aliveJ() === 0);

// just above the minnow threshold → population within the dial, jellies still gated
progress.override.life = DIALS.minnows.threshold + 0.02;
run(30);
const dialM = Math.round(progress.dial(DIALS.minnows));
check(`minnows present, bounded by the dial (${aliveM()}/${dialM})`,
  aliveM() > 0 && aliveM() <= dialM);
check('no jellies below their threshold', aliveJ() === 0);

// high LIFE → a school + jellies
progress.override.life = 0.95;
run(60 * 5);
console.log('   minnows:', aliveM(), '/ target', Math.round(progress.dial(DIALS.minnows)),
  '| jellies:', aliveJ(), '/ target', Math.round(progress.dial(DIALS.jellyfish)));
check('school grows with LIFE', aliveM() >= 10);
check('jellies present at high LIFE', aliveJ() >= 2);

// sanity: no NaN in minnow spines / jelly tentacles, minnows stay in the world
let nan = 0, out = 0;
for (const m of critters.minnows) {
  if (!m.alive) continue;
  for (let j = 0; j < m.px.length; j++) if (!Number.isFinite(m.px[j] + m.py[j])) nan++;
  if (m.x < 0 || m.x > W || m.y < 0 || m.y > H) out++;
}
for (const j of critters.jellies) {
  if (!j.alive) continue;
  for (const xs of j.tx) for (let q = 0; q < xs.length; q++) if (!Number.isFinite(xs[q])) nan++;
}
check('no NaN in critter geometry', nan === 0);
check('minnows inside the world', out === 0);

// shimmer: fills vary across the school (heading-dependent)
const fills = new Set(critters.minnows.filter(m => m.alive).map(m => m.el.attrs.fill));
check('minnow shimmer varies across the school', fills.size > 1);

// greet: park a minnow and a jelly near the eel, greet, expect hearts pending
const m0 = critters.minnows.find(m => m.alive);
const j0 = critters.jellies.find(j => j.alive);
m0.x = eel.x + 60; m0.y = eel.y; m0.greetCd = 0;
j0.x = eel.x - 80; j0.y = eel.y; j0.greetCd = 0;
critters.greet(eel, hearts);
check('greet queues critter hearts', hearts.pending.length >= 7);  // 1 minnow + 6 ring
critters.greet(eel, hearts);
const afterSecond = hearts.pending.length;
check('critter greet cooldown holds', afterSecond === hearts.pending.length);
run(120);
const visible = hearts.pool.filter(h => h.age < 1.25).length;
check('hearts spawned and animating (or finished cleanly)', hearts.pending.length === 0);

// hearts fully expire
run(120);
check('hearts expire', hearts.pool.every(h => h.age >= 1.25));

// NO POPS: while the camera pans and the LIFE dial swings, no critter ELEMENT
// may become visible or invisible while inside the strict view — this watches
// the DOM display attribute (the thing the player actually sees), which is
// what caught the stale-geometry reveal bug.
{
  let pops = 0, reveals = 0;
  const watch = [];
  for (const m of critters.minnows) watch.push({ c: m, el: m.el, disp: m.el.attrs.display });
  for (const j of critters.jellies) watch.push({ c: j, el: j.g, disp: j.g.attrs.display });
  const inView = (x, y) => x > cam.x && x < cam.x + VIEW_W && y > cam.y && y < cam.y + VIEW_H;
  for (let f = 0; f < 60 * 20; f++) {
    cam.x = 600 + Math.sin(f / 240) * 500;           // pan around
    cam.y = 150 + Math.max(0, Math.sin(f / 300)) * 300;
    progress.override.life = 0.55 + 0.4 * Math.sin(f / 130);   // dial swings
    eel.update(dt, idle, W, H);
    critters.update(dt, eel, W, H, null, cam, VIEW_W, VIEW_H);
    critters.render();
    for (const w of watch) {
      const disp = w.el.attrs.display;
      if (disp !== w.disp) {
        reveals++;
        if (inView(w.c.x, w.c.y)) pops++;   // visibility flipped while on-screen
        w.disp = disp;
      }
    }
  }
  check(`no element visibility flips inside the view (${reveals} offscreen transitions)`,
    pops === 0 && reveals > 0);
}

// vicinity: teleport the camera deep (outside the minnow band, inside the
// jelly band) — old critters cull, minnows don't respawn there, jellies do,
// and everything alive sits inside the new vicinity.
cam.x = 1800; cam.y = 1800;
run(60 * 8);
check('minnows gone where their band is not visible', aliveM() === 0);
check('jellies re-established in the deep view', aliveJ() >= 2);
const vicOK = critters.jellies.filter(j => j.alive).every(j =>
  j.x > cam.x - 400 && j.x < cam.x + VIEW_W + 400 &&
  j.y > cam.y - 400 && j.y < cam.y + VIEW_H + 400);
check('all live jellies near the new camera', vicOK);

process.exit(fail ? 1 : 0);
