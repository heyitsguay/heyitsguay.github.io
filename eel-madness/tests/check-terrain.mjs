// The solid main-plane seafloor (docs/10): worldgen.mainFloorY is the one
// authority, the eel and fish collide with it, flora roots on it.
import { Eel } from '../js/eel.js';
import { Critters } from '../js/critters.js';
import { mainFloorY } from '../js/worldgen.js';
import { TERRAIN } from '../js/tuning.js';
import { progress } from '../js/progress.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const H = 3240, VIEW_H = 1080, dt = 1 / 60;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };
const floorAt = x => mainFloorY(x, VIEW_H, H);

// the surface: deterministic, bounded, actually rolling
check('mainFloorY deterministic', floorAt(1234.5) === floorAt(1234.5));
let lo = Infinity, hi = -Infinity;
for (let x = -20000; x < 20000; x += 37) {
  const y = floorAt(x);
  if (y < lo) lo = y;
  if (y > hi) hi = y;
}
check('surface stays below the ceiling and above the world floor',
  hi <= H + 4 - TERRAIN.BASE.main + 1e-9 && lo > H - 0.5 * VIEW_H);
check(`surface really rolls (span ${(hi - lo).toFixed(0)} px)`, hi - lo > 0.12 * VIEW_H);

// the eel cannot dive through a dune: hold "down" forever, y obeys floorAt(x)
const eel = new Eel(svgRoot);
eel.resize(H);
eel.place(0, H - 600);
const dive = { active: true, dirX: 0.3, dirY: 1, throttle: 1, mouth: false };
let buried = false;
for (let f = 0; f < 60 * 30; f++) {
  eel.update(dt, dive, H, floorAt);
  if (eel.y > floorAt(eel.x) - 5) buried = true;
}
check('eel never passes the terrain surface', !buried);
check('eel actually reached the floor zone', eel.y > H - 0.6 * VIEW_H);
// without floorAt the old flat clamp still holds (headless back-compat)
const eel2 = new Eel(svgRoot);
eel2.resize(H);
eel2.place(0, H - 300);
for (let f = 0; f < 60 * 10; f++) eel2.update(dt, dive, H);
check('no floorAt → flat world floor (back-compat)', eel2.y <= H - 9 && eel2.y > H - 200);

// a deep critter rides the dunes: pin a jelly over a spot and sink it
progress.override.life = 1;
const critters = new Critters(svgRoot, svgRoot);
const cam = { x: 0, y: H - VIEW_H };
const eelFar = { x: -5000, y: 100, hx: 1, hy: 0, speed: 0, speedSm: 0, speed01: 0 };
const j = critters.jellies[0];
critters.spawnJelly(j, 300, H - 400);
let jellyBuried = false;
for (let f = 0; f < 60 * 20; f++) {
  j.vy = 300;   // force it downward against the clamp every frame
  critters.update(dt, eelFar, H, null, cam, 1920, VIEW_H, [], floorAt);
  if (!j.alive) break;
  if (j.y > floorAt(j.x) - 55) jellyBuried = true;
}
check('jelly clamps to the terrain surface (60px clearance)', !jellyBuried);
delete progress.override.life;

process.exit(fail ? 1 : 0);
