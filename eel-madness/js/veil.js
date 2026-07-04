// The darkness veil (see docs/03, docs/07): a single world-height div above the
// SVG layer holding a fixed vertical gradient (dark alpha rising with world
// depth). Per frame it only gets a compositor-only translateY to follow the
// camera; the gradient string is rebuilt only when LIGHT moves meaningfully.
// At LIGHT = 0 the deep world is genuinely unreadable — that's gameplay.

import { clamp } from './math.js';
import { VEIL } from './tuning.js';

const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export class Veil {
  constructor(el, worldH, zoom = 1) {
    this.el = el;
    this.worldH = worldH;
    this.zoom = zoom;
    el.style.height = `${worldH * zoom}px`;   // world depth in screen px
    this.lastLight = -1;
  }

  // Darkness alpha at depth fraction d (0 surface .. 1 floor) for a LIGHT value.
  alpha(d, light) {
    const strength = Math.pow(1 - light, VEIL.FADE_EXP);
    const blackD = VEIL.BLACK_D0 + (VEIL.BLACK_D1 - VEIL.BLACK_D0) * light;
    const a = VEIL.SURF_A + (1 - VEIL.SURF_A) * smooth((d - VEIL.CLEAR_D) / (blackD - VEIL.CLEAR_D));
    return clamp(a * strength, 0, 1);
  }

  rebuild(light) {
    const stops = [];
    for (let i = 0; i <= VEIL.STOPS; i++) {
      const d = i / VEIL.STOPS;
      stops.push(`rgba(${VEIL.TINT}, ${this.alpha(d, light).toFixed(3)}) ${(d * 100).toFixed(1)}%`);
    }
    this.el.style.background = `linear-gradient(to bottom, ${stops.join(', ')})`;
  }

  update(camY, light) {
    if (Math.abs(light - this.lastLight) > VEIL.REBUILD_EPS) {
      this.rebuild(light);
      this.lastLight = light;
    }
    this.el.style.transform = `translateY(${(-camY * this.zoom).toFixed(1)}px)`;
  }
}
