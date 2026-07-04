import { Eel } from '../js/eel.js';

function makeEl() {
  return { attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); } };
}
const groups = {};
global.document = { createElementNS: () => makeEl() };
const svgRoot = { querySelector(sel) { return groups[sel] ||= makeEl(); } };

const eel = new Eel(svgRoot);
eel.resize(3840, 3240);
const idle = { active: false, dirX: 0, dirY: 0, throttle: 0, mouth: false };
const dmg = groups['#eel-damage'];

let worstMargin = Infinity, updates = 0, prev = '';
for (let f = 0; f < 60 * 120; f++) {   // 2 min idle
  eel.update(1 / 60, idle, 3840, 3240);
  eel.render();
  const x = +dmg.attrs.x, y = +dmg.attrs.y, w = +dmg.attrs.width, h = +dmg.attrs.height;
  if ([x, y, w, h].some(v => !Number.isFinite(v))) { console.error('bad rect at frame', f, dmg.attrs); process.exit(1); }
  const key = `${x},${y},${w},${h}`;
  if (key !== prev) { updates++; prev = key; }
  for (let i = 0; i < eel.wigX.length; i++) {
    const xs = eel.wigX[i], ys = eel.wigY[i];
    for (let j = 0; j < xs.length; j++) {
      const m = Math.min(xs[j] - x, ys[j] - y, x + w - xs[j], y + h - ys[j]);
      if (m < worstMargin) worstMargin = m;
    }
  }
}
console.log('rect changed on', updates, 'of 7200 frames');
console.log('worst chain-point margin inside rect (px):', worstMargin.toFixed(1));
