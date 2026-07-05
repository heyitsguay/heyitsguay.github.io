// P1 systems on the P3 spawn tensor (docs/09): arrival gating, emergent
// populations, hearts, the no-pops discipline, vicinity re-establishment.
import { Eel } from '../js/eel.js';
import { Critters } from '../js/critters.js';
import { Hearts } from '../js/hearts.js';
import { progress } from '../js/progress.js';
import { SPECIES } from '../js/tuning.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const H = 3240, dt = 1 / 60;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

const eel = new Eel(svgRoot);
eel.resize(H);
const critters = new Critters(svgRoot, svgRoot);   // mock resolves #glows too
const hearts = new Hearts(svgRoot);

const aliveM = () => critters.minnows.filter(m => m.alive).length;
const aliveJ = () => critters.jellies.filter(j => j.alive).length;
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
const cam = { x: 600, y: 150 };
const VIEW_W = 1920, VIEW_H = 1080;
const run = n => { for (let f = 0; f < n; f++) { eel.update(dt, idle, H); critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H); critters.render(hearts); hearts.update(dt); hearts.render(); } };

// LIFE = 0 → nothing
progress.reset();
run(30);
check('no critters at LIFE 0', aliveM() === 0 && aliveJ() === 0);

// just above the minnow threshold → minnows trickle in, jellies still gated
progress.override.life = SPECIES.minnow.arrive.threshold + 0.03;
run(60 * 40);
check(`minnows trickle in just past arrival (${aliveM()})`, aliveM() > 0);
check('early population stays modest (damping)', aliveM() <= 26);
check('no jellies below their threshold', aliveJ() === 0);

// high LIFE → a school (jellies live deep — checked after the teleport)
progress.override.life = 0.95;
run(60 * 30);
console.log('   minnows:', aliveM(), '/ pool', SPECIES.minnow.pool);
check('school grows with LIFE', aliveM() >= 10);
check('population within the pool', aliveM() <= SPECIES.minnow.pool);
check('minnows in their depth bands (soft-keeping overshoot allowed)',
  critters.minnows.every(m => !m.alive || m.y <= 0.66 * H));

// sanity: no NaN in minnow spines
let nan = 0;
for (const m of critters.minnows) {
  if (!m.alive) continue;
  for (let j = 0; j < m.px.length; j++) if (!Number.isFinite(m.px[j] + m.py[j])) nan++;
}
check('no NaN in critter geometry', nan === 0);

// shimmer: fills vary across the school (heading-dependent)
const fills = new Set(critters.minnows.filter(m => m.alive).map(m => m.el.attrs.fill));
check('minnow shimmer varies across the school', fills.size > 1);

// greet: park a minnow and a jelly near the eel, greet, expect hearts pending
const m0 = critters.minnows.find(m => m.alive) || critters.minnows[0];
if (!m0.alive) critters.spawnMinnow(m0, eel.x + 60, eel.y, H);
const j0 = critters.jellies[0];
if (!j0.alive) critters.spawnJelly(j0, eel.x - 80, eel.y);
m0.x = eel.x + 60; m0.y = eel.y; m0.greetCd = 0;
j0.x = eel.x - 80; j0.y = eel.y; j0.greetCd = 0;
critters.greet(eel, hearts);
check('greet queues critter hearts', hearts.pending.length >= 7);  // 1 minnow + 6+ ring
check('greet starts follows', m0.followT > 0 && j0.followT > 0);
critters.greet(eel, hearts);
const afterSecond = hearts.pending.length;
check('critter greet cooldown holds', afterSecond === hearts.pending.length);
run(120);
check('hearts spawned and animating (or finished cleanly)', hearts.pending.length === 0);

// hearts fully expire
run(120);
check('hearts expire', hearts.pool.every(h => h.age >= 1.25));

// NO POPS: while the camera pans and LIFE swings, no critter ELEMENT may
// become visible or invisible while inside the strict view — this watches
// the DOM display attribute (the thing the player actually sees), which is
// what caught the stale-geometry reveal bug.
{
  let pops = 0, reveals = 0;
  const watch = [];
  for (const m of critters.minnows) watch.push({ c: m, el: m.el, disp: m.el.attrs.display });
  for (const j of critters.jellies) watch.push({ c: j, el: j.g, disp: j.g.attrs.display });
  for (const r of critters.reefs) watch.push({ c: r, el: r.el, disp: r.el.attrs.display });
  for (const s of critters.seahorses) watch.push({ c: s, el: s.g, disp: s.g.attrs.display });
  for (const o of critters.octos) watch.push({ c: o, el: o.g, disp: o.g.attrs.display });
  for (const a of critters.anglers) watch.push({ c: a, el: a.g, disp: a.g.attrs.display });
  const inView = (x, y) => x > cam.x && x < cam.x + VIEW_W && y > cam.y && y < cam.y + VIEW_H;
  for (let f = 0; f < 60 * 20; f++) {
    cam.x = 600 + Math.sin(f / 240) * 500;           // pan around
    cam.y = 150 + Math.max(0, Math.sin(f / 300)) * 300;
    progress.override.life = 0.55 + 0.4 * Math.sin(f / 130);   // dial swings
    eel.update(dt, idle, H);
    critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
    critters.render(hearts);
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

// vicinity: teleport the camera to the deep (outside the visible minnow band,
// inside the jelly band) — no minnow ever shows there, jellies establish,
// and everything alive sits inside the new vicinity.
progress.override.life = 0.95;
cam.x = 1800; cam.y = H - VIEW_H;
run(60 * 40);
check('minnows hold their band near the deep view (soft edge)', critters.minnows.every(m =>
  !m.alive || m.y <= 0.68 * H));
check('jellies re-established in the deep view', aliveJ() >= 1);
// pad + up to CULL_T seconds of outward drift before the cull lands
const vicOK = critters.jellies.filter(j => j.alive).every(j =>
  j.x > cam.x - 700 && j.x < cam.x + VIEW_W + 700 &&
  j.y > cam.y - 700 && j.y < cam.y + VIEW_H + 700);
check('all live jellies near the new camera', vicOK);

process.exit(fail ? 1 : 0);
