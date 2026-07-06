// The LOVE axis (P4, docs/10): fifth axis plumbing, greet grants, and the
// spontaneous-greet dial (in-character response, no follow, no LOVE grant).
import { Critters } from '../js/critters.js';
import { progress } from '../js/progress.js';
import { AXES, DIALS, GREET, LEVEL_NOTES, LEVELS, SPECIES } from '../js/tuning.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const H = 3240, dt = 1 / 60;
let fail = 0;
const check = (name, ok) => { console.log(ok ? ' ok ' : 'FAIL', name); if (!ok) fail++; };

// the axis exists with full plumbing
check('LOVE is the fifth axis', !!AXES.love && Object.keys(AXES).length === 5);
check('LOVE is warm coral-red (red-dominant)',
  AXES.love.color[0] > 0.9 && AXES.love.color[0] > AXES.love.color[1] * 2);
check('LOVE has level thresholds', progress.T.love
  && progress.T.love.length === LEVELS.COUNT + 1);
check('LOVE level notes authored', !!LEVEL_NOTES.love && !!LEVEL_NOTES.love[30]);
check('spontGreet dial rides LOVE', DIALS.spontGreet.axis === 'love');

// greet grants: LOVE_PER per responder, capped — the numbers main.js uses
progress.reset();
progress.add('love', GREET.LOVE_PER * Math.min(3, GREET.LOVE_CAP));
check('greet grants accumulate W', progress.W.love > 0);
check('LOVE levels like any axis (enough greets → level 1)', (() => {
  for (let i = 0; i < 200 && progress.level('love') < 1; i++) {
    progress.add('love', GREET.LOVE_PER);
  }
  return progress.level('love') >= 1;
})());
progress.reset();

// spontaneous greets: an on-screen critter near the eel says hello first —
// hearts fire, cooldown set, but NO follow and no LOVE grant.
const hearts = { emits: [], emit(x, y, spec) { this.emits.push(spec); } };
const critters = new Critters(svgRoot, svgRoot);
const eel = { x: 500, y: 400, hx: 1, hy: 0, speed: 0, speedSm: 0, speed01: 0 };
const cam = { x: 0, y: 0 };
progress.override.life = 1;
critters.update(dt, eel, H, null, cam, 1920, 1080, []);   // establishes the view
const m = critters.minnows[0];
critters.spawnMinnow(m, eel.x + 80, eel.y, H);
m.followT = 0;
const wBefore = progress.W.love;
let fired = false;
for (let f = 0; f < 8000 && !fired; f++) {
  m.x = eel.x + 80; m.y = eel.y;   // hold it in range against the sim
  critters.spontaneous(1 / 4, eel, hearts, 1);   // big dt: fast convergence
  fired = hearts.emits.length > 0;
}
check('a nearby critter spontaneously greets', fired);
check('spontaneous greet sets the critter cooldown', m.greetCd > 0);
check('spontaneous greet does NOT befriend-follow', !(m.followT > 0));
check('spontaneous greet grants no LOVE', progress.W.love === wBefore);

// the player greet returns the responder count (main grants LOVE off it)
m.greetCd = 0;
m.x = eel.x + 40; m.y = eel.y;
const n = critters.greet(eel, hearts);
check('greet() returns the responder count', n >= 1);
check('player greet DOES befriend-follow', m.followT > 0);

// arrival-note discipline still holds for the new dial (docs/08)
const unlockLevel = dial => {
  let L = 1;
  while (L <= LEVELS.COUNT && progress.levelValue(dial.axis, L) < dial.threshold) L++;
  return L;
};
check('spontGreet unlocks at a noted LOVE level',
  LEVEL_NOTES.love[unlockLevel(DIALS.spontGreet)] !== undefined);
void SPECIES;

process.exit(fail ? 1 : 0);
