// Octopus locomotion (2026-07-05): DRIFT then SPURT — becalmed glides
// punctuated by single flare→contract jets — plus half-stiff tentacle sanity.
import { Eel } from '../js/eel.js';
import { Critters } from '../js/critters.js';
import { Hearts } from '../js/hearts.js';
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
const critters = new Critters(svgRoot, svgRoot);
const hearts = new Hearts(svgRoot);

// spawn one octopus mid-band, camera on it, the eel far and becalmed
const bands = SPECIES.octopus.bands;
const oy = (bands[0][0] + bands[bands.length - 1][1]) / 2 * H;
const o = critters.octos[0];
critters.spawnOcto(o, 400, oy);
eel.place(400, oy - 900);
const cam = { x: 0, y: Math.max(0, oy - 540) };
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };

const x0 = o.x, y0 = o.y;
let sawSpurt = false, calmFrames = 0, frames = 0, maxD = 0;
const run = n => {
  for (let f = 0; f < n; f++) {
    critters.update(dt, eel, H, null, cam, 1920, 1080);
    critters.render(hearts);
    frames++;
    if (o.pulse > 0.5) sawSpurt = true;
    if (o.pulse === 0) calmFrames++;
    maxD = Math.max(maxD, Math.hypot(o.x - x0, o.y - y0));
  }
};

run(60 * 12);
check('a spurt fires within the first drift window', sawSpurt);
check('drifting dominates the cycle (becalmed most of the time)',
  calmFrames / frames > 0.5);

run(60 * 18);
check(`spurts actually take it places (${maxD.toFixed(0)} px in 30 s)`, maxD > 120);
check('it stays in the sea', o.y > 0 && o.y < H);

// tentacles: finite, attached, and hanging below the mantle on average
let bad = 0, below = 0, pts = 0;
for (let k = 0; k < o.tx.length; k++) {
  for (let q = 0; q < o.tx[k].length; q++) {
    if (!Number.isFinite(o.tx[k][q] + o.ty[k][q])) bad++;
    if (o.ty[k][q] >= o.y) below++;
    pts++;
  }
}
check('no NaN in tentacle chains', bad === 0);
check('arms trail below the mantle overall', below / pts > 0.6);

process.exit(fail ? 1 : 0);
