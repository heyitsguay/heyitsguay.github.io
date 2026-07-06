// Food combos (P4, docs/10): the tuning contract main.js builds on, the
// eel's excitement surge, and the stamina bar's show/hide discipline.
// (The chain arithmetic itself lives in main.js — DOM-bound — so this suite
// pins the pieces it composes.)
import { Eel } from '../js/eel.js';
import { COMBO, BOOST } from '../js/tuning.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const { StaminaBar } = await import('../js/sparkles.js');

const H = 3240, dt = 1 / 60;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

// tuning contract
check('combo window is a real window', COMBO.WINDOW > 0.5 && COMBO.WINDOW < 10);
check('bang starts at 5x (Matt, 2026-07-05)', COMBO.BANG_AT === 5);
check('combo FX multiplier is capped', COMBO.FX_CAP >= 1 + COMBO.FX_MUL
  && COMBO.FX_CAP < 4);
check('placeholder reward charges meaningful stamina',
  COMBO.STAMINA_PER > 0.1 && COMBO.STAMINA_PER <= 1);

// the excitement surge: spikes on excite(), decays on its own, swells the wave
const eel = new Eel(svgRoot);
eel.resize(H);
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
eel.update(dt, idle, H);
check('excitement starts at rest', eel.excite01 < 0.01);
eel.excite(COMBO.EXCITE);
eel.excite(COMBO.EXCITE);
eel.excite(COMBO.EXCITE);
check('excite() accumulates and clamps', eel.excite01 > 0.9 && eel.excite01 <= 1);
const peak = eel.excite01;
for (let f = 0; f < 60 * 3; f++) eel.update(dt, idle, H);
check('excitement decays back to rest', eel.excite01 < peak * 0.1);

// stamina bar: hidden at full, fades in below full or on a combo flash,
// fades back out — and never shows before the burst unlocks
const bar = new StaminaBar(svgRoot);
const mEel = { x: 100, y: 100, stamina: 1 };
for (let f = 0; f < 60; f++) bar.render(dt, mEel, true);
check('bar hidden at full stamina', bar.g.attrs.display === 'none');
mEel.stamina = 0.4;
for (let f = 0; f < 60; f++) bar.render(dt, mEel, true);
check('bar shows while stamina is down', bar.g.attrs.display === 'inline'
  && parseFloat(bar.fill.attrs.width) > 0);
const w1 = parseFloat(bar.fill.attrs.width);
mEel.stamina = 0.8;
bar.render(dt, mEel, true);
check('fill tracks stamina', parseFloat(bar.fill.attrs.width) > w1);
mEel.stamina = 1;
for (let f = 0; f < 120; f++) bar.render(dt, mEel, true);
check('bar fades out at full', bar.g.attrs.display === 'none');
bar.flash();   // the combo just charged it
bar.render(dt, mEel, true);
check('combo flash shows the bar even at full', bar.g.attrs.display === 'inline');
for (let f = 0; f < 60 * 3; f++) bar.render(dt, mEel, true);
check('flash expires', bar.g.attrs.display === 'none');
mEel.stamina = 0.2;
for (let f = 0; f < 60; f++) bar.render(dt, mEel, false);
check('bar never shows before the burst unlocks', bar.g.attrs.display === 'none');
void BOOST;

process.exit(fail ? 1 : 0);
