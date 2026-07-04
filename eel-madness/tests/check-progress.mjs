// progress.js is headless-safe by design (localStorage/location wrapped in try).
import { progress } from '../js/progress.js';
import { AXES, FOODS, DIALS, lightParams } from '../js/tuning.js';
import { Veil } from '../js/veil.js';
import { curves } from '../js/math.js';

let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

// fresh state
check('all axes start at 0', Object.keys(AXES).every(a => progress.value(a) === 0));

// greet unlocks on one chocolate (eelMagic +1.0)
check('greet locked at start', progress.dial(DIALS.greet) === 0);
progress.add('eelMagic', FOODS.chocolate.amount);
check('greet unlocked after one chocolate', progress.dial(DIALS.greet) > 0);
check('speedBurst still locked', progress.dial(DIALS.speedBurst) === 0);

// K calibration: simulate 5 sessions of eating (125 eats, share ∝ rarity)
progress.reset();
const totalRarity = Object.values(FOODS).reduce((s, f) => s + f.rarity, 0);
for (const f of Object.values(FOODS)) {
  progress.add(f.axis, f.amount * 125 * (f.rarity / totalRarity));
}
for (const axis of Object.keys(AXES)) {
  const v = progress.value(axis);
  check(`${axis} ≈ fully-alive after 5 sessions (got ${v.toFixed(2)})`, v > 0.9 && v <= 1);
}

// one session (25 eats): every axis should have moved visibly
progress.reset();
for (const f of Object.values(FOODS)) progress.add(f.axis, f.amount * 25 * (f.rarity / totalRarity));
for (const axis of Object.keys(AXES)) {
  const v = progress.value(axis);
  check(`${axis} visibly moved after 1 session (got ${v.toFixed(2)})`, v > 0.15);
}

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

process.exit(fail ? 1 : 0);
