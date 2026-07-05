// The spawn tensor end-to-end (docs/09): arrival gating, depth bands, hotspot
// homes, damping, plus the P3 species behaviors — follow rubberbanding, jelly
// hue pulses, octopus ink, anglerfish lures, seahorse perches.
//
// Uses a stub eel (position/speed set directly) so behaviors are driven
// deterministically; the camera parks where each species should live.
import { Critters } from '../js/critters.js';
import { Hearts } from '../js/hearts.js';
import { progress } from '../js/progress.js';
import { SPECIES, SEA, FOLLOW } from '../js/tuning.js';
import { xWeight } from '../js/worldgen.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const H = 3240, VIEW_W = 1920, VIEW_H = 1080, dt = 1 / 60;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

const critters = new Critters(svgRoot, svgRoot);
const hearts = new Hearts(svgRoot);
const eel = { x: 0, y: 600, speed: 0, speedSm: 0, speed01: 0 };
const cam = { x: 0, y: 0 };
const run = s => {
  for (let f = 0; f < Math.round(60 * s); f++) {
    critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
    critters.render(hearts);
    hearts.update(dt);
  }
};
const alive = list => list.filter(c => c.alive);
const aliveN = list => alive(list).length;

// scan for a species' seeded hotspot cell (deterministic, so tests can park
// the camera on one — "the same octopus" lives there every run)
const findHot = sp => {
  for (let c = 0; c < 5e6; c++) if (xWeight(c * SEA.CELL_W, sp) === 1) return c * SEA.CELL_W;
  return -1;
};

// ---- barren sea: nothing spawns anywhere -----------------------------------
progress.reset();
progress.override.life = 0;
cam.x = 400; cam.y = 150;
run(10);
cam.y = 2100;
run(10);
check('LIFE 0: no fauna at all', Object.values(critters.species)
  .every(S => aliveN(S.list) === 0));

// ---- shallow living water: minnows + reef fish in their bands --------------
progress.override.life = 1;
cam.x = 400; cam.y = 150;
eel.x = cam.x + 960; eel.y = cam.y + 540; eel.speed = 0; eel.speedSm = 0;
let rMax = 0, salmonMax = 0, bigFishMax = 0;
const roamerList = key => critters.species[key].list;
for (let f = 0; f < 60 * 60; f++) {
  critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
  critters.render(hearts);
  rMax = Math.max(rMax, aliveN(critters.reefs));
  salmonMax = Math.max(salmonMax, aliveN(roamerList('salmon')));
  bigFishMax = Math.max(bigFishMax,
    aliveN(roamerList('barracuda')) + aliveN(roamerList('swordfish')));
}
const mA = aliveN(critters.minnows), rA = aliveN(critters.reefs);
console.log(`   shallow: minnows ${mA}, reef ${rA} (peak ${rMax}), salmon peak ${salmonMax}, cuda+sword peak ${bigFishMax}`);
check('minnows populate the shallow view', mA >= 6);
check('reef fish arrive at full LIFE', rMax >= 1);
check('salmon run the midwater', salmonMax >= 1);
check('the big roamers show up (barracuda / swordfish)', bigFishMax >= 1);
check('roamers hold their bands', critters.roamers.every(R =>
  R.list.every(f => !f.alive || f.y <= 0.82 * H)));
check('minnows respect their depth bands (soft-keeping overshoot allowed)',
  alive(critters.minnows).every(m => m.y <= 0.66 * H));
check('reef fish stay out of the deep',
  alive(critters.reefs).every(r => r.y <= 0.8 * H));
check('no deep species in the shallow view',
  aliveN(critters.anglers) === 0 && aliveN(critters.giants) === 0
  && aliveN(critters.seahorses) === 0);
check('populations respect their pools', Object.values(critters.species)
  .every(S => aliveN(S.list) <= S.cfg.pool));
// sample sizes NOW, while the shallow sea is crowded (docs/09: ±20% jitter)
const sampledSizes = [];
for (const S of Object.values(critters.species)) {
  for (const c of S.list) if (c.alive && c.size) sampledSizes.push(c.size);
}

// ---- deep water at an anglerfish hotspot -----------------------------------
// Park so the hot cell sits in the OFFSCREEN vicinity strip (spawns are
// strictly offscreen — this is how a hotspot looks as you approach it).
const aHot = findHot(SPECIES.angler);
cam.x = aHot + SEA.CELL_W - 10; cam.y = H - VIEW_H;
eel.x = cam.x + 960; eel.y = cam.y + 540;
run(120);
const jA = aliveN(critters.jellies), aA = aliveN(critters.anglers), sA = aliveN(critters.seahorses);
console.log(`   deep: jellies ${jA}, anglers ${aA}, seahorses ${sA}`);
check('jellies populate the deep', jA >= 1);
check('an anglerfish prowls near its hotspot', aA >= 1);
check('anglerfish stay deep', alive(critters.anglers).every(a => a.y > 0.72 * H));
check('seahorses perch in the kelp heights',
  sA >= 1 && alive(critters.seahorses).every(s => s.y > 0.55 * H));
check('minnows hold their band near a deep view (soft edge, no gross violations)',
  alive(critters.minnows).every(m => m.y <= 0.68 * H));

// anglerfish lure: an in-view angler's lure is lit on the glow layer
{
  const a = alive(critters.anglers).find(a =>
    a.x > cam.x && a.x < cam.x + VIEW_W && a.y > cam.y && a.y < cam.y + VIEW_H);
  if (a) {
    check('lure rendered and glowing', a.lure.attrs.display === 'inline'
      && +a.lure.attrs.opacity > 0.2 && a.lure.attrs.cx !== undefined);
  } else {
    console.log('   (no in-view angler this run — lure check skipped)');
  }
}

// ---- the giant octopus: at home, essentially alone --------------------------
const gHot = findHot(SPECIES.giantOcto);
cam.x = gHot + SEA.CELL_W - 10; cam.y = H - VIEW_H;   // hot cell offscreen-left
eel.x = cam.x + 960; eel.y = cam.y + 540;
let gMax = 0;
for (let f = 0; f < 60 * 300; f++) {
  critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
  critters.render(hearts);
  gMax = Math.max(gMax, aliveN(critters.giants));
}
console.log(`   giant octopus max concurrent: ${gMax}`);
check('the giant octopus appears at its hotspot', gMax >= 1);
check('damping keeps it essentially singular', gMax <= 2);
check('the giant lives deep', alive(critters.giants).every(o => o.y > 0.7 * H));

// ---- greet-follow rubberbanding: the fan club keeps pace --------------------
progress.override.eelMagic = 1;   // greet unlocked
cam.x = 0; cam.y = 900;
eel.x = 960; eel.y = 1400; eel.speed = 0; eel.speedSm = 0;
const m0 = critters.minnows[0];
critters.spawnMinnow(m0, eel.x + 40, eel.y, H);
m0.x = eel.x + 40; m0.y = eel.y;   // JOIN_BIAS may have placed it by a school
m0.greetCd = 0;
critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
critters.greet(eel, hearts);
check('greet starts the follow timer', m0.followT === FOLLOW.T);
// cruise away at eel pace (ramping up like the real eel — τ_speed ≈ 0.5 s,
// docs/02); the camera tracks so the minnow stays simulated
const CRUISE = 430;   // px/s — a full-throttle eel
for (let f = 0; f < 60 * 5; f++) {
  eel.speed += (CRUISE - eel.speed) * (1 - Math.exp(-dt / 0.5));
  eel.speedSm = 0;   // speedSm 0: followers don't spook
  eel.x += eel.speed * dt;
  cam.x = eel.x - 960;
  critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
}
const gap = Math.hypot(m0.x - eel.x, m0.y - eel.y);
console.log(`   rubberband gap after 5 s at ${CRUISE} px/s: ${gap.toFixed(0)} px`);
// (soft escort, not a dart — the old cruise-speed followers trailed ~1500 px)
check('befriended minnow keeps pace with a cruising eel', m0.alive && gap < 450);

// ---- octopus: greeted camouflage + startle dodge (no ink cloud — cut) -------
const o0 = critters.octos[0];
critters.spawnOcto(o0, eel.x + 50, eel.y + 20);
o0.greetCd = 0;
critters.render(hearts);
const baseFill = o0.head.attrs.fill;
check('octopus body painted rgb', /rgb\(/.test(baseFill));
critters.greet(eel, hearts);
check('octopus greet starts the camouflage', o0.camoT > 0);
o0.camoT = 1.75;   // mid-camo: fill should be the water sample, not the base
critters.render(hearts);
check('camouflage repaints toward the water color', o0.head.attrs.fill !== baseFill
  && o0.tents[0].attrs.fill === o0.head.attrs.fill);
o0.camoT = 0;
o0.greetCd = 0;
eel.speedSm = 0.9;   // a fast pass startles it
eel.x = o0.x - 40; eel.y = o0.y;
const vBefore = Math.hypot(o0.vx, o0.vy);
critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
check('startled octopus jets away', Math.hypot(o0.vx, o0.vy) > vBefore + 40);
check('no ink cloud element remains', o0.ink === undefined);
eel.speedSm = 0;

// ---- seahorse pirouette + jelly heartbeat + greet gating --------------------
const s0 = critters.seahorses[0];
critters.spawnSeahorse(s0, eel.x + 60, eel.y - 10);
s0.hx = eel.x + 60; s0.hy = eel.y - 10; s0.greetCd = 0;
const jj = critters.jellies.find(j => !j.alive) || critters.jellies[0];
critters.spawnJelly(jj, eel.x - 70, eel.y);
jj.greetCd = 0;
progress.override.eelMagic = 1;
critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
check('anyGreetable true with subjects in range', critters.anyGreetable(eel) === true);
critters.greet(eel, hearts);
check('greeted seahorse starts its clockwise spin', s0.spinAge === 0);
check('greeted jelly starts its heartbeat', jj.beatT > 0);
// heartbeat suspends the shy dim: glow opacity stays high with the eel close
eel.x = jj.x + 30; eel.y = jj.y;
critters.update(dt, eel, H, null, { x: jj.x - 960, y: Math.min(Math.max(0, jj.y - 540), H - VIEW_H) }, VIEW_W, VIEW_H);
critters.render(hearts);
check('heartbeat suspends the shy dim', +jj.glow.attrs.opacity > 0.4);
check('nobody in range → anyGreetable false',
  critters.anyGreetable({ x: eel.x + 90000, y: 600 }) === false);

// greet brackets: a fresh greetable minnow in view gets corner-framed
{
  const mb = critters.minnows.find(m => !m.alive) || critters.minnows[1];
  critters.spawnMinnow(mb, eel.x + 80, eel.y, H);
  mb.x = eel.x + 80; mb.y = eel.y; mb.greetCd = 0;
  critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
  critters.render(hearts);
  const b0 = critters.brackets.find(b => b.shown);
  check('greetable critter gets corner brackets', !!b0
    && (b0.el.attrs.d.match(/M/g) || []).length === 4
    && +b0.el.attrs.opacity > 0);
}

// (drift-vines were cut — surface flora slot is open again)

// ---- size variety: every species draws an individual scale ------------------
check(`critters vary in size (${sampledSizes.length} sampled)`, sampledSizes.length >= 10
  && sampledSizes.every(s => s >= 0.8 && s <= 1.2)
  && Math.max(...sampledSizes) - Math.min(...sampledSizes) > 0.1);

// ---- jelly hue pulses: cyan at rest, excursions under WORLD MAGIC ----------
const j0 = critters.jellies.find(j => j.alive) || critters.jellies[0];
if (!j0.alive) critters.spawnJelly(j0, cam.x + 400, 2800);
progress.override.worldMagic = 0;
cam.x = j0.x - 960; cam.y = Math.min(j0.y - 540, H - VIEW_H);
run(2);
check('jelly lantern rests at cyan without WORLD MAGIC',
  Math.abs(j0.lastHue - 196) < 3);
progress.override.worldMagic = 1;
let maxDev = 0;
for (let f = 0; f < 60 * 25; f++) {
  critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
  critters.render(hearts);
  if (j0.alive) maxDev = Math.max(maxDev, Math.abs(j0.lastHue - 196));
}
console.log(`   jelly max hue excursion: ${maxDev.toFixed(0)}°`);
check('WORLD MAGIC pulses the hue away from cyan', maxDev > 25);

// ---- fast-travel backfill (docs/09): sweeping into fresh water refills it ---
{
  progress.override.life = 1;
  delete progress.override.worldMagic;
  cam.x = 200000; cam.y = 150;   // fresh water, far from everything
  eel.y = 690; eel.speed = 0; eel.speedSm = 0;
  const SWEEP = 900;   // px/s — a hard boosting eel
  for (let f = 0; f < 60 * 15; f++) {
    cam.x += SWEEP * dt;
    eel.x = cam.x + 960;
    critters.update(dt, eel, H, null, cam, VIEW_W, VIEW_H);
    critters.render(hearts);
  }
  // stragglers behind the camera are mid-cull (up to CULL_T s) — count the
  // population that matters: the water around the current view
  const near = alive(critters.minnows)
    .filter(m => m.x > cam.x - 600 && m.x < cam.x + VIEW_W + 600);
  console.log(`   after a 15 s sweep at ${SWEEP} px/s: ${near.length} minnows near the view`);
  check('backfill keeps swept water populated', near.length >= 8);
  check('nothing spawns ahead of the vicinity', alive(critters.minnows)
    .every(m => m.x < cam.x + VIEW_W + 800));
}

// ---- blank-slate reset: clear() evicts everything (docs/08) -----------------
{
  const anyAlive = () => Object.values(critters.species)
    .some(S => S.list.some(c => c.alive));
  if (!anyAlive()) critters.spawnMinnow(critters.minnows[0], cam.x - 200, 600, H);
  critters.clear();
  check('clear() evicts every critter', !anyAlive());
  check('clear() hides every element', Object.values(critters.species)
    .every(S => S.list.every(c => (c.g || c.el).attrs.display === 'none')));
  check('clear() disbands the schools', critters.leaders.every(L => !L.active));
}

// ---- sanity: no NaN anywhere ------------------------------------------------
let nan = 0;
for (const S of Object.values(critters.species)) {
  for (const c of S.list) {
    if (c.alive && !Number.isFinite(c.x + c.y)) nan++;
  }
}
check('no NaN in critter positions', nan === 0);

process.exit(fail ? 1 : 0);
