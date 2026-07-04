// Speed burst + cosmetics + minnow eyes + jelly glow behavior.
import { Eel } from '../js/eel.js';
import { Critters } from '../js/critters.js';
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
eel.setMagic({ boostAmt: 0.2, boostDur: 1.5, lashLen: 6, shadowA: 0.4, lipA: 0.7, hueRange: 30 });

// baseline top speed
const swim = { active: true, dirX: 1, dirY: 0, throttle: 1, mouth: false, boost: false };
for (let f = 0; f < 60 * 5; f++) eel.update(dt, swim, W, H);
const baseSpeed = eel.speed;

// boost: speed rises ~20%, stamina drains, ends when empty, recharges
swim.boost = true;
let peak = 0;
for (let f = 0; f < 60 * 2; f++) { eel.update(dt, swim, W, H); peak = Math.max(peak, eel.speed); }
check(`boost raises speed ~20% (${(peak / baseSpeed).toFixed(2)}x)`, peak > baseSpeed * 1.15 && peak < baseSpeed * 1.25);
check('stamina drained', eel.stamina < 0.2);
for (let f = 0; f < 60 * 3; f++) eel.update(dt, swim, W, H);   // held past empty
check('boost ends on empty stamina', eel.speed < baseSpeed * 1.05);
swim.boost = false;
for (let f = 0; f < 60 * 5; f++) eel.update(dt, swim, W, H);
check('stamina recharges', eel.stamina > 0.9);
check('boost01 eased back to ~0', eel.boost01 < 0.02);

// cosmetics: lashes use magic length; makeup elements got geometry + colors
eel.render();
const lashD = eel.lashes[0].attrs.d;
check('lashes render', typeof lashD === 'string' && lashD.startsWith('M'));
check('lipstick rendered with hsl stroke', /hsl\(/.test(groups['#eel-lip'].attrs.stroke) && +groups['#eel-lip'].attrs.opacity > 0.5);
check('eyeshadow rendered with hsl fill', /hsl\(/.test(groups['#eel-shadow'].attrs.fill) && +groups['#eel-shadow'].attrs.opacity > 0.2);
// makeup off → opacity zeroed once
eel.setMagic({ shadowA: 0, lipA: 0 });
eel.render();
check('makeup hides at zero dial', groups['#eel-lip'].attrs.opacity === '0' && groups['#eel-shadow'].attrs.opacity === '0');

// lash length responds to magic
eel.setMagic({ lashLen: 4 });
eel.render();
const shortLash = eel.lashes[0].attrs.d;
eel.setMagic({ lashLen: 8 });
eel.render();
check('lash geometry changes with lashLen', shortLash !== eel.lashes[0].attrs.d);

// critters: minnow eyes exist and show with the fish; jelly glow shy-dims
const critters = new Critters(svgRoot, svgRoot);
const cam = { x: 600, y: 150 };
progress.override.life = 0.95;
progress.override.worldMagic = 0.9;
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false, boost: false };
for (let f = 0; f < 60 * 5; f++) {
  eel.update(dt, idle, W, H);
  critters.update(dt, eel, W, H, null, cam, 1920, 1080);
  critters.render();
}
const m0 = critters.minnows.find(m => m.alive
  && m.x > cam.x && m.x < cam.x + 1920 && m.y > cam.y && m.y < cam.y + 1080);
check('minnow eye element rendered', m0 && m0.eye.attrs.display === 'inline' && m0.eye.attrs.cx !== undefined);

const j0 = critters.jellies.find(j => j.alive);
check('jelly present for glow tests', !!j0);
if (j0) {
  // far eel → bright; near eel → dimmed
  eel.x = j0.x + 900; eel.y = j0.y;
  critters.update(dt, eel, W, H, null, { x: j0.x - 960, y: j0.y - 540 }, 1920, 1080);
  critters.render();
  const far = +j0.glow.attrs.opacity;
  eel.x = j0.x + 40; eel.y = j0.y;
  critters.update(dt, eel, W, H, null, { x: j0.x - 960, y: j0.y - 540 }, 1920, 1080);
  critters.render();
  const near = +j0.glow.attrs.opacity;
  check(`jelly glow dims on approach (${far} → ${near})`, near < far * 0.4);
  check('jelly glow uses its own gradient', /jgrad/.test(j0.glow.attrs.fill));
  check('WORLD MAGIC hue applied to stops', /hsl\(/.test(j0.stops[0].attrs['stop-color']));
  // hues vary across jellies at high worldMagic
  const hues = new Set(critters.jellies.filter(j => j.alive).map(j => Math.round(j.hue)));
  check('jelly light hues vary at high WORLD MAGIC', hues.size > 1);
}

process.exit(fail ? 1 : 0);
