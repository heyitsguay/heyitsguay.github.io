// The eel: spine simulation + SVG rendering (see docs/01-eel-wiggle.md).
//
// Model: the head is driven by heading/speed physics with asymmetric exponential
// easing; the body is a chain that trails the head (follow-the-leader with a bend
// limit); a traveling wave is added at render time so undulation never fights the
// chain constraint. The outline path `d` is regenerated from the spine every frame.

import { TAU, clamp, lerp, expApproach, angleDiff } from './math.js';

// ---- The feel lives here: tune these live ----
const N = 44;                 // spine points
const REF_LEN = 260;          // body length (px) the width profile is authored at
const MAX_BEND = 0.26;        // rad per segment — lower = stiffer body
const WAVELENGTHS = 1.5;      // wave cycles along the body
const FREQ_BASE = 0.4;        // Hz at idle
const FREQ_SLOPE = 2.3;       // extra Hz at full speed
const AMP_BASE = 1.0;         // px lateral amplitude at idle (at REF_LEN scale)
const AMP_SLOPE = 8.0;        // extra px at full speed
const TAU_EFFORT_UP = 0.30;   // s — swim startup gather
const TAU_EFFORT_DOWN = 0.55; // s — throttle release
const TAU_SPEED_UP = 0.50;    // s — acceleration ramp
const TAU_SPEED_DOWN = 0.90;  // s — glide / momentum carry
const WALL_MARGIN = 70;       // px — soft-steer away from edges inside this band

// Width profile: [t along body, half-width in px at REF_LEN]. Slender, with an
// ovular head (bulge peaking at 0.13, neck dip at 0.30). The head's front is
// not capped by this profile — it gets the authored jaw-to-nose contour below.
// Cartoon proportions: the head is deliberately bigger than a real eel's, with
// a deep neck dip so it reads as head-plus-body, not a tapered tube.
const WPROF = [[0, 7.2], [0.045, 8.2], [0.11, 8.6], [0.20, 6.6], [0.28, 5.2], [0.46, 5.8], [0.66, 4.4], [0.86, 2.0], [1, 0.3]];

// Jaw-to-nose contour, authored in the head's local frame: a = forward of the
// head spine point, b = toward the eye side ("up"), in WPROF units. Ordered
// mouth-edge -> eye-edge, so it splices into the outline between the bottom
// and top body edges. Third value = mouth weight: how much the point rotates
// about MOUTH_PIVOT when the mouth opens (positive = lower jaw, swings open;
// negative = upper snout, counter-tilts).
const HEAD_PTS = [
  [2.2, -6.8, 0.15],   // jaw root underside
  [6.0, -5.6, 0.75],   // chin
  [9.0, -3.0, 1.00],   // lower lip front
  [8.6, -1.6, 1.00],   // lower lip top (front of the mouth crease)
  [0.8, -2.0, 0.00],   // mouth corner (the pivot — deep, almost at the skull)
  [9.0, -0.8, -0.32],  // upper lip front
  [10.4, 1.2, -0.30],  // nose front
  [8.6, 4.4, -0.22],   // nose top
  [4.2, 6.6, -0.08],   // snout top
];
const HEAD_N = HEAD_PTS.length;
const MOUTH_PIVOT = [0.8, -2.0];
const MOUTH_MAX = 1.8;        // rad — full gape
const TAU_MOUTH_OPEN = 0.07;  // s — snap open
const TAU_MOUTH_CLOSE = 0.12; // s
// contour indices of the mouth-interior polygon (pivot, lower lip, nose, upper lip)
const MOUTH_POLY = [4, 3, 2, 6, 5];
const WIG_LOCKS = 15;
const WIG_POINTS = 8;     // chain points per lock
const WIG_THICK = 1.0;    // lock half-width at its widest, in WPROF units
const WIG_THICK_VAR = 0.7; // extra thickness, cycling every 3rd lock
// Attachment jitter (fixed per lock, drawn once at startup). The scalp is the
// spine itself, so "x" is distance along the spline (jitters the s parameter)
// and "y" is off the scalp surface along the normal. WPROF units.
const WIG_ATTACH_XSTD = 1.2;
const WIG_ATTACH_YSTD = 0.25;  // keep very small — roots should hug the scalp
// (hair COLOR lives in style.css: #eel-wig path — fill is the hair, stroke is the lock edge)
const LASHES = 8;

function gauss() {
  const u = 1 - Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function halfWidth(t) {
  for (let i = 0; i < WPROF.length - 1; i++) {
    const t0 = WPROF[i][0], w0 = WPROF[i][1];
    const t1 = WPROF[i + 1][0], w1 = WPROF[i + 1][1];
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return lerp(w0, w1, u * u * (3 - 2 * u));
    }
  }
  return WPROF[WPROF.length - 1][1];
}

// Closed Catmull-Rom loop -> cubic Bezier path string.
function closedLoopPath(xs, ys, n) {
  let d = `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = (i - 1 + n) % n, p1 = i, p2 = (i + 1) % n, p3 = (i + 2) % n;
    const c1x = xs[p1] + (xs[p2] - xs[p0]) / 6, c1y = ys[p1] + (ys[p2] - ys[p0]) / 6;
    const c2x = xs[p2] - (xs[p3] - xs[p1]) / 6, c2y = ys[p2] - (ys[p3] - ys[p1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${xs[p2].toFixed(1)} ${ys[p2].toFixed(1)}`;
  }
  return d + 'Z';
}

export class Eel {
  constructor(svgRoot) {
    const NS = 'http://www.w3.org/2000/svg';
    this.body = svgRoot.querySelector('#eel-body');
    this.mouthEl = svgRoot.querySelector('#eel-mouth');
    this.eye = svgRoot.querySelector('#eel-eye');
    this.pupil = svgRoot.querySelector('#eel-pupil');
    this.shine = svgRoot.querySelector('#eel-shine');

    const lashes = svgRoot.querySelector('#eel-lashes');
    this.lashes = [];
    for (let i = 0; i < LASHES; i++) {
      const p = document.createElementNS(NS, 'path');
      lashes.appendChild(p);
      this.lashes.push(p);
    }

    const wig = svgRoot.querySelector('#eel-wig');
    this.wig = [];
    this.wigX = []; this.wigY = [];
    for (let i = 0; i < WIG_LOCKS; i++) {
      const p = document.createElementNS(NS, 'path');
      wig.appendChild(p);
      this.wig.push(p);
      this.wigX.push(new Float64Array(WIG_POINTS));
      this.wigY.push(new Float64Array(WIG_POINTS));
    }
    this.wigReady = false;
    // Per-lock attachment jitter, fixed at startup: along-spline (as an s
    // offset; 1 WPROF unit = 1/REF_LEN of body length) and off-scalp.
    this.wigJitS = new Float64Array(WIG_LOCKS);
    this.wigJitY = new Float64Array(WIG_LOCKS);
    for (let i = 0; i < WIG_LOCKS; i++) {
      this.wigJitS[i] = gauss() * WIG_ATTACH_XSTD / REF_LEN;
      this.wigJitY[i] = gauss() * WIG_ATTACH_YSTD;
    }
    // scratch buffers for lock ribbon outlines (top edge + bottom edge)
    this.lox = new Float64Array(2 * WIG_POINTS);
    this.loy = new Float64Array(2 * WIG_POINTS);

    // Chain spine (simulated) and rendered spine (with wave) + normals.
    this.px = new Float64Array(N); this.py = new Float64Array(N);
    this.rx = new Float64Array(N); this.ry = new Float64Array(N);
    this.nx = new Float64Array(N); this.ny = new Float64Array(N);
    this.wArr = new Float64Array(N);
    // Outline loop: N top + N bottom body-edge points + the head contour.
    this.ox = new Float64Array(2 * N + HEAD_N); this.oy = new Float64Array(2 * N + HEAD_N);

    this.x = 0; this.y = 0;
    this.heading = 0;
    this.hx = 1; this.hy = 0;
    this.speed = 0; this.speed01 = 0; this.speedSm = 0;
    this.effort = 0;
    this.phase = 0; this.prevSin = 0;
    this.mouth = 0;   // 0 closed .. 1 full gape
    this.time = 0;   // wall-clock-ish time for slow drifts (independent of wave phase)
    this.sideTarget = 1; this.sideSm = 1;   // which side of the spine faces world-up
    this.placed = false;
  }

  resize(worldW, worldH) {
    // Fixed size in world units (the world itself is window-independent).
    this.len = 375;
    this.seg = this.len / (N - 1);
    this.ws = this.len / REF_LEN;
    for (let i = 0; i < N; i++) this.wArr[i] = halfWidth(i / (N - 1)) * this.ws;
    if (!this.placed) {
      // start in the deepest reference-screen, mid-world
      this.x = worldW * 0.5;
      this.y = worldH - 486;
      for (let i = 0; i < N; i++) {
        this.px[i] = this.x - i * this.seg;
        this.py[i] = this.y;
      }
      this.placed = true;
    }
  }

  update(dt, intent, W, H) {
    this.dt = dt;   // wig physics runs in render(), after the spine exists
    this.time += dt;
    // Soft wall avoidance: an inward push blended into the desired direction.
    let pushX = 0, pushY = 0;
    if (this.x < WALL_MARGIN) pushX += (WALL_MARGIN - this.x) / WALL_MARGIN;
    if (this.x > W - WALL_MARGIN) pushX -= (this.x - (W - WALL_MARGIN)) / WALL_MARGIN;
    if (this.y < WALL_MARGIN) pushY += (WALL_MARGIN - this.y) / WALL_MARGIN;
    if (this.y > H - WALL_MARGIN) pushY -= (this.y - (H - WALL_MARGIN)) / WALL_MARGIN;

    let steerX = 0, steerY = 0, steering = false;
    if (intent.active) {
      steerX = intent.dirX + pushX * 1.2;
      steerY = intent.dirY + pushY * 1.2;
      steering = true;
    } else if ((pushX || pushY) && this.speed > 10) {
      steerX = pushX; steerY = pushY;    // turn away from walls while gliding
      steering = true;
    }

    // Effort: ease-in on start, longer ease-out on stop.
    const effortTarget = intent.active ? intent.throttle : 0;
    this.effort = expApproach(this.effort, effortTarget, dt,
      effortTarget > this.effort ? TAU_EFFORT_UP : TAU_EFFORT_DOWN);

    // Rate-limited turning: direction changes are arcs, never snaps.
    if (steering && (steerX || steerY)) {
      const desired = Math.atan2(steerY, steerX);
      const rate = 3.4 + 2.2 * this.speed01;
      this.heading += clamp(angleDiff(desired, this.heading), -rate * dt, rate * dt);
    }

    // Mouth: snaps open while held, eases shut on release.
    const mouthTarget = intent.mouth ? 1 : 0;
    this.mouth = expApproach(this.mouth, mouthTarget, dt,
      mouthTarget > this.mouth ? TAU_MOUTH_OPEN : TAU_MOUTH_CLOSE);

    // Speed: asymmetric easing = swim-up ramp vs glide-down momentum.
    // An open mouth drags — swimming while gaping is slower.
    const maxSpeed = this.len * 1.15 * (1 - 0.30 * this.mouth);
    const speedTarget = maxSpeed * this.effort;
    this.speed = expApproach(this.speed, speedTarget, dt,
      speedTarget > this.speed ? TAU_SPEED_UP : TAU_SPEED_DOWN);
    this.speed01 = this.speed / maxSpeed;
    this.speedSm = expApproach(this.speedSm, this.speed01, dt, 0.4);

    // Undulation phase: always ticking (idle sway), faster with speed.
    this.phase += (FREQ_BASE + FREQ_SLOPE * this.speedSm) * TAU * dt;

    // Integrate the head, injecting lateral wiggle as a sine *delta* (no net
    // drift) so the chain records a genuinely sinuous path.
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    this.hx = hx; this.hy = hy;
    const s = Math.sin(this.phase);
    const dLat = (s - this.prevSin) * this.seg * (0.22 + 0.55 * this.speedSm);
    this.prevSin = s;
    this.x += hx * this.speed * dt - hy * dLat;
    this.y += hy * this.speed * dt + hx * dLat;
    this.x = clamp(this.x, 10, W - 10);
    this.y = clamp(this.y, 10, H - 10);

    // Chain: each point trails the previous at fixed length, bend-limited.
    this.px[0] = this.x; this.py[0] = this.y;
    let prevA = Math.atan2(-hy, -hx);   // tailward
    for (let i = 1; i < N; i++) {
      const dx = this.px[i] - this.px[i - 1], dy = this.py[i] - this.py[i - 1];
      let a = (dx * dx + dy * dy) > 1e-9 ? Math.atan2(dy, dx) : prevA;
      a = prevA + clamp(angleDiff(a, prevA), -MAX_BEND, MAX_BEND);
      this.px[i] = this.px[i - 1] + Math.cos(a) * this.seg;
      this.py[i] = this.py[i - 1] + Math.sin(a) * this.seg;
      prevA = a;
    }

    // Side factor: the eye/wig side rolls smoothly when the eel turns around.
    // Head normal is perp(tailward tangent); its dot with world-up works out to hx.
    if (Math.abs(hx) > 0.15) this.sideTarget = Math.sign(hx);
    this.sideSm = expApproach(this.sideSm, this.sideTarget, dt, 0.18);
  }

  // Interpolated point on the rendered spine: position, normal, tailward tangent.
  pointAt(sParam) {
    const f = clamp(sParam, 0, 1) * (N - 1);
    const i = Math.min(Math.floor(f), N - 2);
    const u = f - i;
    const tx = this.rx[i + 1] - this.rx[i], ty = this.ry[i + 1] - this.ry[i];
    const tm = Math.hypot(tx, ty) || 1;
    return {
      x: lerp(this.rx[i], this.rx[i + 1], u),
      y: lerp(this.ry[i], this.ry[i + 1], u),
      nx: lerp(this.nx[i], this.nx[i + 1], u),
      ny: lerp(this.ny[i], this.ny[i + 1], u),
      tx: tx / tm, ty: ty / tm,
    };
  }

  render() {
    const { px, py, rx, ry, nx, ny, ox, oy } = this;

    // Rendered spine = chain + traveling wave along chain normals.
    const amp = this.ws * (AMP_BASE + AMP_SLOPE * this.speedSm);
    for (let i = 0; i < N; i++) {
      const j0 = Math.max(i - 1, 0), j1 = Math.min(i + 1, N - 1);
      let tx = px[j1] - px[j0], ty = py[j1] - py[j0];
      const tm = Math.hypot(tx, ty) || 1;
      tx /= tm; ty /= tm;
      const t = i / (N - 1);
      const env = 0.18 + 0.82 * Math.pow(t, 1.4);
      const off = amp * env * Math.sin(this.phase - t * WAVELENGTHS * TAU);
      rx[i] = px[i] - ty * off;
      ry[i] = py[i] + tx * off;
    }

    // Normals of the *rendered* spine (post-wave) for clean width offsets.
    for (let i = 0; i < N; i++) {
      const j0 = Math.max(i - 1, 0), j1 = Math.min(i + 1, N - 1);
      let tx = rx[j1] - rx[j0], ty = ry[j1] - ry[j0];
      const tm = Math.hypot(tx, ty) || 1;
      nx[i] = -ty / tm;
      ny[i] = tx / tm;
    }

    // Outline loop: top edge head->tail, bottom edge tail->head, then the
    // authored jaw-to-nose contour splicing bottom back around to top.
    for (let i = 0; i < N; i++) {
      const w = this.wArr[i];
      ox[i] = rx[i] + nx[i] * w;
      oy[i] = ry[i] + ny[i] * w;
      ox[2 * N - 1 - i] = rx[i] - nx[i] * w;
      oy[2 * N - 1 - i] = ry[i] - ny[i] * w;
    }

    // Head contour in the local frame (F forward, n0 across). Vertical
    // coordinates scale by sideSm — the head squashes flat mid-roll, which is
    // exactly when the traversal order flips, so the mirror never pops.
    let fx = rx[0] - rx[1], fy = ry[0] - ry[1];
    const fm = Math.hypot(fx, fy) || 1;
    fx /= fm; fy /= fm;
    this.fx = fx; this.fy = fy;
    const ws = this.ws, sideS = this.sideSm, flip = sideS < 0;
    const theta = this.mouth * MOUTH_MAX;
    for (let k = 0; k < HEAD_N; k++) {
      const src = HEAD_PTS[flip ? HEAD_N - 1 - k : k];
      let a = src[0], b = src[1];
      const wgt = src[2];
      if (wgt !== 0 && theta > 1e-4) {
        const phi = -theta * wgt;
        const ca = Math.cos(phi), sa = Math.sin(phi);
        const ra = a - MOUTH_PIVOT[0], rb = b - MOUTH_PIVOT[1];
        a = MOUTH_PIVOT[0] + ra * ca - rb * sa;
        b = MOUTH_PIVOT[1] + ra * sa + rb * ca;
      }
      ox[2 * N + k] = rx[0] + (fx * a + nx[0] * b * sideS) * ws;
      oy[2 * N + k] = ry[0] + (fy * a + ny[0] * b * sideS) * ws;
    }
    this.body.setAttribute('d', closedLoopPath(ox, oy, 2 * N + HEAD_N));
    this.renderMouth(flip);
    this.renderEye();
    this.renderWig();
  }

  // Mouth interior: a dark polygon under the body that shows through the open
  // jaw notch. Its corners are contour points already placed in render().
  renderMouth(flip) {
    if (this.mouth < 0.02) {
      this.mouthEl.setAttribute('d', '');
      return;
    }
    let d = '';
    for (const idx of MOUTH_POLY) {
      const k = 2 * N + (flip ? HEAD_N - 1 - idx : idx);
      d += `${d ? 'L' : 'M'}${this.ox[k].toFixed(1)} ${this.oy[k].toFixed(1)}`;
    }
    this.mouthEl.setAttribute('d', d + 'Z');
  }

  renderEye() {
    const ws = this.ws, side = this.sideSm;
    const p = this.pointAt(0.045);
    const ux = p.nx * side, uy = p.ny * side;   // toward the head's top (shrinks mid-roll)
    const ex = p.x + this.hx * 1.2 * ws + ux * 2.0 * ws;   // forward on the face
    const ey = p.y + this.hy * 1.2 * ws + uy * 2.0 * ws;
    // Slightly elliptical: long axis along the head's "up".
    const rUp = 5.4 * ws, rAcross = 4.1 * ws;
    const upAngle = Math.atan2(uy, ux) * 180 / Math.PI;
    this.eye.setAttribute('cx', ex.toFixed(1));
    this.eye.setAttribute('cy', ey.toFixed(1));
    this.eye.setAttribute('rx', rUp.toFixed(1));
    this.eye.setAttribute('ry', rAcross.toFixed(1));
    this.eye.setAttribute('transform', `rotate(${upAngle.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)})`);
    // Pupil leads toward the heading: the eel looks where it's going.
    const px = ex + this.hx * 1.4 * ws, py = ey + this.hy * 1.4 * ws;
    this.pupil.setAttribute('cx', px.toFixed(1));
    this.pupil.setAttribute('cy', py.toFixed(1));
    this.pupil.setAttribute('r', (2.3 * ws).toFixed(1));
    this.shine.setAttribute('cx', (px + (ux - this.hx * 0.3) * 0.8 * ws).toFixed(1));
    this.shine.setAttribute('cy', (py + (uy - this.hy * 0.3) * 0.8 * ws).toFixed(1));
    this.shine.setAttribute('r', (0.75 * ws).toFixed(1));

    // Eyelashes: short strokes fanning over the upper-forward rim, tips swept
    // gently back toward the tail.
    const um = Math.hypot(ux, uy) || 1;
    const uxn = ux / um, uyn = uy / um;
    for (let k = 0; k < LASHES; k++) {
      const blend = -0.2 + k * (1.6 / (LASHES - 1));   // up-back ... up-forward
      let dx = uxn + this.hx * blend, dy = uyn + this.hy * blend;
      const dm = Math.hypot(dx, dy) || 1;
      dx /= dm; dy /= dm;
      const len = (2.1 - k * 0.07) * ws;
      const bx = ex + dx * rUp * 0.95, by = ey + dy * rUp * 0.95;
      const cxp = bx + dx * len * 0.7, cyp = by + dy * len * 0.7;
      const txp = bx + dx * len + p.tx * len * 0.3;
      const typ = by + dy * len + p.ty * len * 0.3;
      this.lashes[k].setAttribute('d',
        `M${bx.toFixed(1)} ${by.toFixed(1)}Q${cxp.toFixed(1)} ${cyp.toFixed(1)} ${txp.toFixed(1)} ${typ.toFixed(1)}`);
    }
  }

  // The wig is thick flowing locks, not strands: each lock is a trailing chain
  // (same trick as the body — root pinned to the scalp, free points drift in
  // the wake, sway, and relax weakly toward a rest pose flowing up-and-back)
  // rendered as a filled tapered ribbon around the chain, like a mini eel body.
  renderWig() {
    const ws = this.ws, side = this.sideSm, dt = this.dt || 0.016;
    // weak rest pull: the hair mostly does what the water tells it
    const restPull = 1 - Math.exp(-dt / 2.6);
    const lox = this.lox, loy = this.loy;
    const time = this.time;
    for (let i = 0; i < WIG_LOCKS; i++) {
      // crown cluster, back from the nose, with fixed per-lock jitter
      const s = clamp(0.045 + i * 0.0075 + this.wigJitS[i], 0.005, 0.17);
      const p = this.pointAt(s);
      const w = halfWidth(s) * ws;
      const ux = p.nx * side, uy = p.ny * side;
      const root = w * 1.1 + this.wigJitY[i] * ws;   // just proud of the scalp
      const bx = p.x + ux * root, by = p.y + uy * root;
      // Rest pose: lie back along the body from the root (near-zero slope),
      // lifted a touch off the scalp, drifting slowly and smoothly as if in
      // water — two incommensurate slow sines per lock stand in for randomness.
      const lift = 0.22
        + 0.18 * Math.sin(time * 0.31 + i * 2.13)
        + 0.12 * Math.sin(time * 0.173 + i * 0.71);
      let rdx = p.tx + ux * lift;
      let rdy = p.ty + uy * lift;
      const rm = Math.hypot(rdx, rdy) || 1;
      rdx /= rm; rdy /= rm;
      const perpX = -rdy, perpY = rdx;
      const L = (34 + i * 7) * ws;              // long locks
      const segL = L / (WIG_POINTS - 1);

      const xs = this.wigX[i], ys = this.wigY[i];
      if (!this.wigReady) {
        for (let j = 0; j < WIG_POINTS; j++) {
          xs[j] = bx + rdx * segL * j;
          ys[j] = by + rdy * segL * j;
        }
      }
      // forces on free points: sway + weak pull toward the rest pose.
      // The idle sway term is strong on purpose — at rest the hair billows.
      for (let j = 1; j < WIG_POINTS; j++) {
        const sway = (Math.sin(this.phase * 1.1 + j * 0.7 + i * 1.5) * (14 + 18 * this.speedSm)
          + Math.sin(time * 0.42 + j * 1.1 + i * 2.3) * 9) * ws * dt;
        xs[j] += perpX * sway + (bx + rdx * segL * j - xs[j]) * restPull;
        ys[j] += perpY * sway + (by + rdy * segL * j - ys[j]) * restPull;
      }
      // chain constraint from the pinned root outward — this is the wake drift
      xs[0] = bx; ys[0] = by;
      for (let j = 1; j < WIG_POINTS; j++) {
        let dx = xs[j] - xs[j - 1], dy = ys[j] - ys[j - 1];
        const dm = Math.hypot(dx, dy);
        if (dm > 1e-6) { dx /= dm; dy /= dm; } else { dx = rdx; dy = rdy; }
        xs[j] = xs[j - 1] + dx * segL;
        ys[j] = ys[j - 1] + dy * segL;
      }

      // Inflate the chain into a lock: full-bodied through the middle,
      // tapering to a soft point at the tip.
      const maxW = (WIG_THICK + (i % 3) * WIG_THICK_VAR) * ws;
      for (let j = 0; j < WIG_POINTS; j++) {
        const u = j / (WIG_POINTS - 1);
        const lw = maxW * (u < 0.3
          ? 0.55 + 0.45 * (u / 0.3)
          : Math.pow(1 - (u - 0.3) / 0.7, 0.85)) + 0.3;
        const j0 = Math.max(j - 1, 0), j1 = Math.min(j + 1, WIG_POINTS - 1);
        let tx = xs[j1] - xs[j0], ty = ys[j1] - ys[j0];
        const tm = Math.hypot(tx, ty) || 1;
        tx /= tm; ty /= tm;
        lox[j] = xs[j] - ty * lw;
        loy[j] = ys[j] + tx * lw;
        lox[2 * WIG_POINTS - 1 - j] = xs[j] + ty * lw;
        loy[2 * WIG_POINTS - 1 - j] = ys[j] - tx * lw;
      }
      this.wig[i].setAttribute('d', closedLoopPath(lox, loy, 2 * WIG_POINTS));
    }
    this.wigReady = true;
  }
}
