// The eel light's flare fuel + ignition pulse (docs/10 follow-up 2): the
// green light stamina mirrors the boost rules on the eel, ignition fires a
// one-shot radiating pulse, and the stamina bars stack with fixed order
// compacting from the top slot. (The veil-hole arithmetic itself lives in
// main.js — DOM-bound — so this suite pins the pieces it composes.)
import { Eel, flarePulseEnv } from '../js/eel.js';
import { EEL_LIGHT } from '../js/tuning.js';

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
check('flare drains over real seconds', EEL_LIGHT.STAM_DUR > 0.5 && EEL_LIGHT.STAM_DUR < 30);
check('recharge is slower than instant', EEL_LIGHT.STAM_RECHARGE > 1);
check('re-ignite reserve is a real threshold', EEL_LIGHT.STAM_MIN > 0 && EEL_LIGHT.STAM_MIN < 1);
check('pulse overshoots the steady flare', EEL_LIGHT.PULSE_R > EEL_LIGHT.FLARE_R);
check('pulse relief stays a valid alpha', EEL_LIGHT.PULSE_HOLE <= 1);
check('ring travels outward', EEL_LIGHT.RING_R > 1);

// the pulse envelope: silent when idle, zero at both ends, a real peak between
check('env is 0 with no pulse in flight', flarePulseEnv(-1) === 0);
check('env starts at 0', flarePulseEnv(0) === 0);
check('env ends near 0', flarePulseEnv(1) < 0.01);
check('env peaks hard early', flarePulseEnv(0.28) > 0.9);

// the flare state machine on the eel
const eel = new Eel(svgRoot);
eel.resize(H);
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
const flare = { ...idle, flare: true };
eel.update(dt, idle, H);
check('flare starts at rest, tank full', eel.flare01 < 0.01 && eel.lightStam === 1);

eel.update(dt, flare, H);
check('fresh press ignites', eel.flareOn === true);
check('ignition fires the pulse', eel.pulseU >= 0);
for (let f = 0; f < Math.ceil((EEL_LIGHT.PULSE_T + 0.1) * 60); f++) eel.update(dt, flare, H);
check('pulse is one-shot — ends on its own', eel.pulseU === -1);
check('held flare swells toward full', eel.flare01 > 0.8);
check('holding drains the tank', eel.lightStam < 1);

// hold until empty: the flare cuts, and holding through empty never retriggers
for (let f = 0; f < Math.ceil(EEL_LIGHT.STAM_DUR * 60) + 10; f++) eel.update(dt, flare, H);
// (recharge starts the same frame the flare cuts, so the tank is never
// observably exactly 0 — below the re-ignite reserve is the real claim)
check('empty tank kills the flare', eel.flareOn === false
  && eel.lightStam < EEL_LIGHT.STAM_MIN);
for (let f = 0; f < Math.ceil(EEL_LIGHT.STAM_RECHARGE * 60); f++) eel.update(dt, flare, H);
check('still held: recharges but never self-retriggers',
  eel.lightStam > EEL_LIGHT.STAM_MIN && eel.flareOn === false);
check('no phantom pulse while off', eel.pulseU === -1);

// release, then the re-ignite reserve
eel.update(dt, idle, H);
eel.lightStam = EEL_LIGHT.STAM_MIN * 0.5;
eel.update(dt, flare, H);
check('below the reserve a press does nothing', eel.flareOn === false);
eel.update(dt, idle, H);
eel.lightStam = EEL_LIGHT.STAM_MIN + 0.2;
eel.update(dt, flare, H);
check('above the reserve a fresh press re-ignites', eel.flareOn === true && eel.pulseU >= 0);
eel.update(dt, idle, H);
const low = eel.lightStam;
for (let f = 0; f < 60; f++) eel.update(dt, idle, H);
check('released flare recharges', eel.lightStam > low);

// the bar stack: fixed order (boost, light), compacting from slot 0.
// Emulates main.js's slot assignment.
const boostBar = new StaminaBar(svgRoot);
const lightBar = new StaminaBar(svgRoot, EEL_LIGHT.BAR_COLOR);
check('light bar takes the tuning green', lightBar.fill.attrs.fill === EEL_LIGHT.BAR_COLOR);
const mEel = { x: 100, y: 100, stamina: 1 };
const stack = (boostVal, lightVal) => {
  let slot = 0;
  boostBar.render(dt, mEel, true, boostVal, slot);
  if (boostBar.wanted) slot++;
  lightBar.render(dt, mEel, true, lightVal, slot);
};
for (let f = 0; f < 60; f++) stack(1, 0.5);
check('lone draining bar sits in the top slot', lightBar.rowSm < 0.01
  && lightBar.g.attrs.display === 'inline');
check('full boost bar stays hidden', boostBar.g.attrs.display === 'none');
for (let f = 0; f < 90; f++) stack(0.4, 0.5);
check('boost draining too: light compacts to slot 1',
  boostBar.rowSm < 0.01 && lightBar.rowSm > 0.9);
for (let f = 0; f < 60 * 3; f++) stack(1, 0.5);
check('boost refilled: its bar hides again', boostBar.g.attrs.display === 'none');
check('light slides back up to the top slot', lightBar.rowSm < 0.05);

process.exit(fail ? 1 : 0);
