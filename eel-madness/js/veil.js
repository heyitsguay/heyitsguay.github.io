// The illumination veil (see docs/03): the single depth-brightness authority
// for the whole scene. A world-height div above the SVG layer holding a fixed
// vertical gradient — in 'multiply' mode a true multiplicative color ramp
// (white at the surface → deep tint at depth), in 'alpha' mode a tinted
// overlay fallback. Per frame it only gets a compositor-only translateY; the
// gradient string is rebuilt only when LIGHT moves meaningfully. At LIGHT = 0
// the deep world multiplies to ~black — that's gameplay.

import { clamp, lerp } from './math.js';
import { VEIL } from './tuning.js';

const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export class Veil {
  constructor(el, worldH, zoom = 1) {
    this.el = el;
    this.worldH = worldH;
    this.zoom = zoom;
    el.style.height = `${worldH * zoom}px`;   // world depth in screen px
    el.style.mixBlendMode = VEIL.MODE === 'multiply' ? 'multiply' : 'normal';
    this.lastLight = -1;
  }

  // Darkness alpha at depth fraction d (0 surface .. 1 floor) for a LIGHT
  // value. Gamma-shaped (docs/03): a linear response lightened the deep far
  // too early — with light^GAMMA the dark clears slowly and blooms late, and
  // DEPTH_EXP < 1 brings the darkness on faster as you descend.
  alpha(d, light) {
    const lg = Math.pow(clamp(light, 0, 1), VEIL.GAMMA);
    const strength = 1 - lg;
    const blackD = VEIL.BLACK_D0 + (VEIL.BLACK_D1 - VEIL.BLACK_D0) * lg;
    const a = VEIL.SURF_A + (1 - VEIL.SURF_A)
      * Math.pow(smooth((d - VEIL.CLEAR_D) / (blackD - VEIL.CLEAR_D)), VEIL.DEPTH_EXP);
    // the permanent abyss floor: even at LIGHT = 1 the bottom stays dim
    const aEnd = VEIL.END_A * smooth((d - VEIL.END_START) / (1 - VEIL.END_START));
    return clamp(Math.max(a * strength, aEnd), 0, 1);
  }

  rebuild(light) {
    const [tr, tg, tb] = VEIL.TINT;
    const stops = [];
    for (let i = 0; i <= VEIL.STOPS; i++) {
      const d = i / VEIL.STOPS;
      const a = this.alpha(d, light);
      const pct = `${(d * 100).toFixed(1)}%`;
      if (VEIL.MODE === 'multiply') {
        // multiplier ramps white (no-op) → tint (deep water)
        stops.push(`rgb(${Math.round(lerp(255, tr, a))}, ${Math.round(lerp(255, tg, a))}, ${Math.round(lerp(255, tb, a))}) ${pct}`);
      } else {
        stops.push(`rgba(${tr}, ${tg}, ${tb}, ${a.toFixed(3)}) ${pct}`);
      }
    }
    this.el.style.background = `linear-gradient(to bottom, ${stops.join(', ')})`;
  }

  update(camY, light, hole) {
    if (Math.abs(light - this.lastLight) > VEIL.REBUILD_EPS) {
      this.rebuild(light);
      this.lastLight = light;
    }
    this.el.style.transform = `translateY(${(-camY * this.zoom).toFixed(1)}px)`;

    // The eel light (P4 follow-up, docs/10): a soft radial MASK HOLE in the
    // veil around the eel — where the mask's alpha drops, the veil thins and
    // the world underneath genuinely brightens (unlike the cut glow blob,
    // which painted light on top of crushed pixels). hole = {x, y, r, a} in
    // ELEMENT-LOCAL px (x = screen x, y = world y × zoom), a = core relief.
    if (hole && hole.a > 0.005) {
      const core = (1 - hole.a).toFixed(3);
      const mid = (1 - hole.a * 0.55).toFixed(3);
      const m = `radial-gradient(circle ${hole.r.toFixed(0)}px at `
        + `${hole.x.toFixed(0)}px ${hole.y.toFixed(0)}px, `
        + `rgba(0,0,0,${core}) 0%, rgba(0,0,0,${mid}) 55%, rgb(0,0,0) 100%)`;
      this.el.style.webkitMaskImage = m;
      this.el.style.maskImage = m;
      this.holeOn = true;
    } else if (this.holeOn) {
      this.holeOn = false;
      this.el.style.webkitMaskImage = '';
      this.el.style.maskImage = '';
    }
  }
}
