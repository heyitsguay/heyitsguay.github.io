// Speed burst + cosmetics + minnow eyes + jelly glow behavior (hue pulses).
import { Eel } from '../js/eel.js';
import { Critters } from '../js/critters.js';
import { progress } from '../js/progress.js';

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
eel.setMagic({ boostAmt: 0.2, boostDur: 1.5, lashLen: 6, shadowA: 0.4, lipA: 0.7, hueRange: 30 });

// baseline top speed
const swim = { active: true, dirX: 1, dirY: 0, throttle: 1, mouth: false, boost: false };
for (let f = 0; f < 60 * 5; f++) eel.update(dt, swim, H);
const baseSpeed = eel.speed;

// boost: speed rises ~20%, stamina drains, ends when empty, recharges
swim.boost = true;
let peak = 0;
for (let f = 0; f < 60 * 2; f++) { eel.update(dt, swim, H); peak = Math.max(peak, eel.speed); }
check(`boost raises speed ~20% (${(peak / baseSpeed).toFixed(2)}x)`, peak > baseSpeed * 1.15 && peak < baseSpeed * 1.25);
check('stamina drained', eel.stamina < 0.2);
for (let f = 0; f < 60 * 3; f++) eel.update(dt, swim, H);   // held past empty
check('boost ends on empty stamina', eel.speed < baseSpeed * 1.05);
swim.boost = false;
for (let f = 0; f < 60 * 5; f++) eel.update(dt, swim, H);
check('stamina recharges', eel.stamina > 0.9);
check('boost01 eased back to ~0', eel.boost01 < 0.02);

// infinite x (docs/09): a long cruise crosses the old world edge freely
for (let f = 0; f < 60 * 20; f++) eel.update(dt, swim, H);
check(`eel swims past the old world edge (x = ${Math.round(eel.x)})`, eel.x > 4200);
swim.dirX = -1;
for (let f = 0; f < 60 * 60; f++) eel.update(dt, swim, H);
check(`and back into negative x (x = ${Math.round(eel.x)})`, eel.x < -1000);
check('y walls still hold', eel.y >= 10 && eel.y <= H - 10);
swim.dirX = 1;

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

// critters: minnow eyes exist and show with the fish (shallow water)
const critters = new Critters(svgRoot, svgRoot);
progress.override.life = 0.95;
progress.override.worldMagic = 0.9;
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false, boost: false };
const cam = { x: eel.x - 960, y: 150 };
for (let f = 0; f < 60 * 30; f++) {
  eel.update(dt, idle, H);
  critters.update(dt, eel, H, null, cam, 1920, 1080);
  critters.render();
}
const m0 = critters.minnows.find(m => m.alive
  && m.x > cam.x && m.x < cam.x + 1920 && m.y > cam.y && m.y < cam.y + 1080);
check('minnow eye element rendered', m0 && m0.eye.attrs.display === 'inline' && m0.eye.attrs.cx !== undefined);

// jellies live deep now (docs/09) — sink the camera to find one
cam.y = H - 1080;
eel.y = cam.y + 540; eel.x = cam.x + 960;
for (let i = 0; i < eel.px.length; i++) { eel.px[i] = eel.x - i * eel.seg; eel.py[i] = eel.y; }
for (let f = 0; f < 60 * 60; f++) {
  eel.update(dt, idle, H);
  critters.update(dt, eel, H, null, cam, 1920, 1080);
  critters.render();
}
const j0 = critters.jellies.find(j => j.alive);
check('jelly present for glow tests', !!j0);
if (j0) {
  // far eel → bright; near eel → dimmed
  const jcam = { x: j0.x - 960, y: Math.min(Math.max(0, j0.y - 540), H - 1080) };
  eel.x = j0.x + 900; eel.y = j0.y;
  critters.update(dt, eel, H, null, jcam, 1920, 1080);
  critters.render();
  const far = +j0.glow.attrs.opacity;
  eel.x = j0.x + 40; eel.y = j0.y;
  critters.update(dt, eel, H, null, jcam, 1920, 1080);
  critters.render();
  const near = +j0.glow.attrs.opacity;
  check(`jelly glow dims on approach (${far} → ${near})`, near < far * 0.4);
  check('jelly glow uses its own gradient', /jgrad/.test(j0.glow.attrs.fill));
  check('WORLD MAGIC hue applied to stops', /hsl\(/.test(j0.stops[0].attrs['stop-color']));
  // the P3 hue rework (docs/09): hues PULSE away from cyan and return —
  // watch the excursion over time instead of a static spread
  let maxDev = 0, endNearBase = false;
  for (let f = 0; f < 60 * 25; f++) {
    critters.update(dt, eel, H, null, jcam, 1920, 1080);
    critters.render();
    if (j0.alive && j0.shown) {   // lastHue only updates while rendered
      const dev = Math.abs(j0.lastHue - 196);
      maxDev = Math.max(maxDev, dev);
      if (f > 60 * 20 && dev < 30) endNearBase = true;
    }
  }
  check(`jelly hue pulses under WORLD MAGIC (max ${maxDev.toFixed(0)}°)`, maxDev > 25);
  check('and dwells back near cyan', endNearBase || !j0.alive || !j0.shown);
}

process.exit(fail ? 1 : 0);
