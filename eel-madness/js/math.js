export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export const lerp = (a, b, t) => a + (b - a) * t;

// Framerate-independent exponential ease toward a target with time constant tau (seconds).
export function expApproach(cur, target, dt, tau) {
  return target + (cur - target) * Math.exp(-dt / tau);
}

// Signed shortest angular difference a - b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// curve01 library: each maps [0,1] → [0,1] monotonically (input clamped).
// Progression dials pick one by name (see docs/07).
export const curves = {
  linear: t => clamp(t, 0, 1),
  quadratic: t => { t = clamp(t, 0, 1); return t * t; },
  sqrt: t => Math.sqrt(clamp(t, 0, 1)),
  smoothstep: t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); },
  // logistic, renormalized so 0→0 and 1→1
  sigmoid: t => {
    t = clamp(t, 0, 1);
    const f = x => 1 / (1 + Math.exp(-8 * (x - 0.5)));
    return (f(t) - f(0)) / (f(1) - f(0));
  },
  log: t => Math.log1p(9 * clamp(t, 0, 1)) / Math.log(10),
};
