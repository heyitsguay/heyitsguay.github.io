// progress.js is headless-safe by design (localStorage/location wrapped in try).
// Covers the level quantization layer (docs/08) plus curves/light/veil.
import { progress } from '../js/progress.js';
import { AXES, FOODS, DIALS, SPECIES, LEVELS, LEVEL_NOTES, AMOUNT_SCALE, lightParams } from '../js/tuning.js';
import { Veil } from '../js/veil.js';
import { curves } from '../js/math.js';

let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

// fresh state
check('all axes start at 0 / level 0',
  Object.keys(AXES).every(a => progress.value(a) === 0 && progress.level(a) === 0));

// thresholds (docs/08): monotonic, T(30) = 3K, band costs double
for (const axis of Object.keys(AXES)) {
  const T = progress.T[axis];
  check(`${axis} has ${LEVELS.COUNT} thresholds`, T.length === LEVELS.COUNT + 1 && T[0] === 0);
  check(`${axis} thresholds monotonic`, T.every((v, i) => i === 0 || v > T[i - 1]));
  check(`${axis} T(30) = 3K`, Math.abs(T[LEVELS.COUNT] - 3 * AXES[axis].K) < 1e-9);
}
const Tl = progress.T.light;
const cost = L => Tl[L] - Tl[L - 1];
check('per-level cost doubles each band',
  Math.abs(cost(17) - 2 * cost(2)) < 1e-9
  && Math.abs(cost(25) - 4 * cost(2)) < 1e-9
  && Math.abs(cost(29) - 8 * cost(2)) < 1e-9);
check('eelMagic level 1 costs no more than one chocolate (FIRST_CAP)',
  progress.T.eelMagic[1] <= FOODS.chocolate.amount * AMOUNT_SCALE + 1e-12);

// one chocolate (the real scaled in-game grant) = eelMagic level 1 = greet
check('greet locked at start', progress.dial(DIALS.greet) === 0);
progress.add('eelMagic', FOODS.chocolate.amount * AMOUNT_SCALE);
check('one chocolate reaches level 1', progress.level('eelMagic') === 1);
progress.tick(LEVELS.BLOOM_T + 0.1);
check('greet unlocked after one chocolate', progress.dial(DIALS.greet) > 0);
check('speedBurst still locked', progress.dial(DIALS.speedBurst) === 0);
let ups = progress.consumeLevelUps();
check('level-up event queued', ups.length === 1 && ups[0].axis === 'eelMagic' && ups[0].level === 1);

// multi-level jumps chain one event per level, in order (post-K-retune
// economy: two burgers land level 2; a triple-burger windfall jumps to 6)
progress.add('eelMagic', FOODS.burger.amount * AMOUNT_SCALE);
progress.add('eelMagic', FOODS.burger.amount * AMOUNT_SCALE);
ups = progress.consumeLevelUps();
check('burgers land level 2', ups.map(u => u.level).join(',') === '2');
progress.add('eelMagic', FOODS.burger.amount * AMOUNT_SCALE * 3);
ups = progress.consumeLevelUps();
check('chained multi-level events', ups.map(u => u.level).join(',') === '3,4,5,6');

// bloom: value() eases from the old step to the new one over BLOOM_T
progress.reset();
progress.add('light', progress.T.light[1] + 1e-6);
const v1 = progress.levelValue('light', 1);
check('value holds the old step before tick', progress.value('light') === 0);
progress.tick(LEVELS.BLOOM_T / 2);
const mid = progress.value('light');
check('bloom in progress at half time', mid > 0 && mid < v1);
progress.tick(LEVELS.BLOOM_T);
check('bloom settles on the new step', Math.abs(progress.value('light') - v1) < 1e-9);

// pacing (docs/08): expected per-session intake lands the band boundaries
// exactly — levels 16 / 24 / 28 / 30 after sessions 1–4 (37.5 eats/session at
// authored amounts since the +50% K retune, spawn share ∝ rarity ⇔ ~150
// scaled eats in-game).
progress.reset();
progress.consumeLevelUps();
// patch foods (docs/10) sit outside the per-eat session model: a patch is
// many tiny grants, and its LIFE intake is deliberately uncalibrated bonus
// (Matt retunes K_life if it moves the pacing).
const eatFoods = Object.values(FOODS).filter(f => !f.patch);
const totalRarity = eatFoods.reduce((s, f) => s + f.rarity, 0);
const eatSession = () => {
  for (const f of eatFoods) progress.add(f.axis, f.amount * 37.5 * (f.rarity / totalRarity));
  // LOVE earns from greeting, not food (docs/10). Its K is defined as
  // (expected 4-session greet W)/3, so feed exactly that per session — this
  // asserts the ladder shape; the real greet volume is Matt's tuning.
  progress.add('love', AXES.love.K * 3 / 4);
};
const bandEnds = [16, 24, 28, 30];
for (let s = 0; s < 4; s++) {
  eatSession();
  for (const axis of Object.keys(AXES)) {
    check(`${axis} at level ${bandEnds[s]} after session ${s + 1} (got ${progress.level(axis)})`,
      progress.level(axis) === bandEnds[s]);
  }
}
progress.tick(LEVELS.BLOOM_T + 0.1);
for (const axis of Object.keys(AXES)) {
  const v = progress.value(axis);
  check(`${axis} ≈ fully alive at level 30 (got ${v.toFixed(2)})`, v > 0.94 && v <= 1);
}

// note↔dial alignment (docs/08): every dial's computed unlock level must have
// an authored LEVEL_NOTES entry, so retunes can't silently desync the popups.
const unlockLevel = dial => {
  let L = 1;
  while (L <= LEVELS.COUNT && progress.levelValue(dial.axis, L) < dial.threshold) L++;
  return L;
};
for (const [name, dial] of Object.entries(DIALS)) {
  const L = unlockLevel(dial);
  check(`${name} unlocks at a noted level (${dial.axis} ${L})`,
    L <= LEVELS.COUNT && LEVEL_NOTES[dial.axis][L] !== undefined);
}
// species arrivals (docs/09) get the same note discipline as dials
for (const [name, sp] of Object.entries(SPECIES)) {
  const L = unlockLevel(sp.arrive);
  check(`${name} arrives at a noted level (${sp.arrive.axis} ${L})`,
    L <= LEVELS.COUNT && LEVEL_NOTES[sp.arrive.axis][L] !== undefined);
}
check('greet is the level-1 unlock', unlockLevel(DIALS.greet) === 1);
check('speed burst unlocks at level 8', unlockLevel(DIALS.speedBurst) === 8);
check('unlock guides are marked', typeof LEVEL_NOTES.eelMagic[1] === 'object'
  && LEVEL_NOTES.eelMagic[1].guide && LEVEL_NOTES.eelMagic[8].guide);

// demo (the title's attract mode, docs/08): values read fully alive EXCEPT
// EEL MAGIC (the powers stay the game's surprise); levels and W stay real.
progress.reset();
check('no save after reset', progress.hasSave() === false);
progress.add('light', 0.3);
check('hasSave sees real W', progress.hasSave() === true);
progress.demo = true;
check('demo forces values to 1 (except eelMagic)', Object.keys(AXES)
  .every(a => progress.value(a) === (a === 'eelMagic' ? 0 : 1)));
check('demo leaves levels real', progress.level('light') < 10 && progress.level('life') === 0);
progress.demo = false;
check('demo off restores real values', progress.value('life') === 0);

// sandbox ("Skip To The End", docs/08): everything maxed, nothing saved
progress.sandbox = true;
const wBefore = progress.W.light;
progress.add('light', 5);
check('sandbox: values and levels maxed', progress.value('eelMagic') === 1
  && progress.level('life') === LEVELS.COUNT);
check('sandbox: add() never touches the save', progress.W.light === wBefore);
progress.sandbox = false;
check('sandbox off restores real state', progress.W.light === wBefore
  && progress.level('life') === 0);

// overrides: fractions pass through verbatim (dial-tuning pins), level derived
progress.reset();
progress.override.light = 0.5;
check('fraction override returned verbatim', progress.value('light') === 0.5);
check('override level derived from the pin', progress.level('light') === 14);
delete progress.override.light;

// curves: endpoints + range
for (const [name, fn] of Object.entries(curves)) {
  check(`curve ${name} endpoints`, Math.abs(fn(0)) < 1e-9 && Math.abs(fn(1) - 1) < 1e-9);
  check(`curve ${name} in range`, [0.1, 0.3, 0.5, 0.7, 0.9].every(t => fn(t) >= 0 && fn(t) <= 1));
}

// lightParams endpoints: GL carries hue only now (veil owns darkness) — the
// dark end is dim-but-formed, and the bright end is brighter.
const p0 = lightParams(0), p1 = lightParams(1);
check('LIGHT=0 GL palette dim but not black', p0.deep.every(c => c > 0) && p0.surface[1] < 0.5 * p1.surface[1]);
check('LIGHT=1 brighter than LIGHT=0', p1.surface[1] > p0.surface[1] && p1.ray > p0.ray);

// veil: gradient rebuild + alpha behavior
const el = { style: {} };
const veil = new Veil(el, 3240);
veil.update(1000, 0);
check('veil height set', el.style.height === '3240px');
check('veil translated', el.style.transform === 'translateY(-1000.0px)');
check('veil gradient built', /linear-gradient/.test(el.style.background));
const a = (d, l) => veil.alpha(d, l);
check('veil deep is opaque at LIGHT=0', a(1, 0) === 1);
check('veil monotonic with depth', a(0.2, 0) <= a(0.5, 0) && a(0.5, 0) <= a(0.9, 0));
check('veil surface clear at LIGHT=1', a(0, 1) < 0.001 && a(0.3, 1) < 0.01);
check('abyss floor persists at LIGHT=1 (~93% dark)', a(1, 1) > 0.9 && a(1, 1) <= 0.95);
check('long gentle abyss ramp', a(0.35, 1) < 0.03 && a(0.6, 1) > 0.1 && a(0.6, 1) < a(0.85, 1));
const g0 = el.style.background;
veil.update(2000, 0.001);   // tiny light change: no rebuild
check('no rebuild under epsilon', el.style.background === g0);
veil.update(2000, 0.5);
check('rebuild past epsilon', el.style.background !== g0);

// the eel light's veil mask hole (docs/10): set while lit, cleared when off
veil.update(2000, 0.5, { x: 300, y: 2600, r: 250, a: 0.8 });
check('eel light punches a mask hole', /radial-gradient/.test(el.style.maskImage)
  && /rgba\(0,0,0,0\.200\)/.test(el.style.maskImage));
veil.update(2000, 0.5, null);
check('mask hole cleared when the light is off', el.style.maskImage === '');
veil.update(2000, 0.5, { x: 0, y: 0, r: 100, a: 0.001 });
check('near-zero relief keeps the mask off', el.style.maskImage === '');

process.exit(fail ? 1 : 0);
