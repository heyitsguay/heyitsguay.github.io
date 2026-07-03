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
