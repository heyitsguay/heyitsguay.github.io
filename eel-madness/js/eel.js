// The eel: spine simulation + SVG rendering (see docs/01-eel-wiggle.md).
//
// Model: the head is driven by heading/speed physics with asymmetric exponential
// easing; the body is a chain that trails the head (follow-the-leader with a bend
// limit); a traveling wave is added at render time so undulation never fights the
// chain constraint. The outline path `d` is regenerated from the spine every frame.

import { TAU, clamp, lerp, expApproach, angleDiff } from './math.js';
import { EEL_LIGHT } from './tuning.js';

// ---- The feel lives here: tune these live ----
// Decoration geometry constants are in WPROF units (px at REF_LEN, scaled by
// the eel's actual size) unless noted otherwise.

// Spine & body
const N = 44;                 // spine points
const REF_LEN = 260;          // body length (px) the width profile is authored at
const EEL_LEN = 375;          // actual body length, world px
const MAX_BEND = 0.26;        // rad per segment — lower = stiffer body
const START_DEPTH = 486;      // spawn: world px below the surface (food falls from up there)

// Traveling wave (render-time undulation)
const WAVELENGTHS = 1.5;      // wave cycles along the body
const FREQ_BASE = 0.4;        // Hz at idle
const FREQ_SLOPE = 2.3;       // extra Hz at full speed
const AMP_BASE = 1.0;         // px lateral amplitude at idle (at REF_LEN scale)
const AMP_SLOPE = 16.0;        // extra px at full speed
const ENV_HEAD = 0.1;        // fraction of full amplitude at the head (tail gets 1)
const ENV_EXP = 1.4;          // envelope curve — higher pushes motion tailward

// Head wiggle injection: the head's *actual* position oscillates a little so
// the chain records a sinuous path (see docs/01). Units: segment lengths per
// unit of sine swing. Keep small — the visible motion belongs to the body.
const HEADWIG_BASE = 0.06;
const HEADWIG_SLOPE = 0.14;   // extra at full speed

// Steering & speed
const MAX_SPEED_BL = 1.15;    // body lengths per second at full effort
const MOUTH_DRAG = 0.30;      // fraction of top speed lost at full gape
const TURN_RATE_BASE = 3.4;   // rad/s
const TURN_RATE_SLOPE = 2.2;  // extra rad/s at full speed (turns tighter with flow)
const TAU_EFFORT_UP = 0.30;   // s — swim startup gather
const TAU_EFFORT_DOWN = 0.55; // s — throttle release
const TAU_SPEED_UP = 0.50;    // s — acceleration ramp
const TAU_SPEED_DOWN = 0.45;  // s — glide / momentum carry (halved 2026-07:
                              // stopping took too long)
const TAU_SPEED_SM = 0.4;     // s — smoothed speed signal driving wave/hair feel
const WALL_MARGIN = 70;       // px — soft-steer away from edges inside this band
const WALL_PUSH = 1.2;        // strength of the inward steer blended in at a wall
const GLIDE_STEER_MIN = 10;   // px/s — gliding faster than this still steers off walls
const EDGE_CLAMP = 10;        // px — hard position clamp inside the world edge

// Speed burst (docs/07): strength/duration arrive via setMagic; feel lives here
const BOOST_MIN_START = 0.35; // stamina needed to (re)start a burst
const BOOST_RECHARGE = 4.0;   // s to refill stamina from empty
const TAU_BOOST_UP = 0.22;    // s — burst ease-in
const TAU_BOOST_DOWN = 0.5;   // s — ease back to normal
const BOOST_WIG_F = 0.5;      // extra wave frequency at full burst
const BOOST_WIG_A = 0.45;     // extra wave amplitude at full burst

// Combo excitement (docs/10): excite() spikes this and it eases out — a brief
// wiggle-amplitude surge so the eel itself looks thrilled by a food combo.
const EXCITE_TAU = 0.8;       // s — surge decay
const EXCITE_WIG_A = 0.5;     // extra wave amplitude at full excitement

// The flare pulse's brightness envelope over its 0→1 progress: fast attack,
// long decay (peak near u ≈ 0.28). Shared by the veil hole (main) and the
// expanding ring (sparkles). u < 0 (no pulse) → 0.
export function flarePulseEnv(u) {
  return u < 0 ? 0 : Math.sin(Math.PI * Math.pow(u, 0.55));
}

// Side roll (which side of the spine the face is on)
const SIDE_FLIP_MIN = 0.15;   // |heading·x| needed before the face picks a side
const TAU_SIDE = 0.18;        // s — how fast the eye/wig roll across on a turn

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
const MOUTH_MAX = 1.4;        // rad — full gape
const TAU_MOUTH_OPEN = 0.07;  // s — snap open
const TAU_MOUTH_CLOSE = 0.12; // s
// contour indices of the mouth-interior polygon (pivot, lower lip, nose, upper lip)
const MOUTH_POLY = [4, 3, 2, 6, 5];
const WIG_LOCKS = 15;
const WIG_POINTS = 8;     // chain points per lock
const WIG_THICK = 1.0;    // lock half-width at its widest, in WPROF units
const WIG_THICK_VAR = 0.7; // extra thickness, cycling every 3rd lock
// (hair COLOR lives in style.css: #eel-wig path — fill is the hair, stroke is the lock edge)
// Hairline: imagine the oval of a mammal skull sitting on the spine — locks
// root along its arc over the back of the head. Angles are degrees in the head
// frame: 0 points at the nose, 90 is straight up, 180 is toward the tail.
const WIG_OVAL_S = 0.10;      // spine anchor of the oval's center
const WIG_OVAL_RA = 14;       // oval radius along the body
const WIG_OVAL_RB = 9;        // oval radius upward (~scalp height at the crown)
const WIG_ARC_START = 45;     // deg — first (shortest) lock, just shy of the crown
const WIG_ARC_END = 155;      // deg — last (longest) lock, at the nape
const WIG_ROOT_PROUD = 0.5;   // roots sit this far off the oval surface
// Attachment jitter, fixed per lock at startup: along the hairline arc
// (degrees) and radially off the surface (keep small — roots hug the skull).
const WIG_ATTACH_ASTD = 3;
const WIG_ATTACH_RSTD = 0.25;
const WIG_LEN_BASE = 34;      // shortest (front) lock length
const WIG_LEN_STEP = 7;       // extra length per lock toward the back
const WIG_REST_TAU = 2.6;     // s — weak pull to the rest pose; higher = water owns the hair
// Rest-pose lift off the scalp: base + two slow incommensurate sines (amp, rad/s)
const WIG_LIFT_BASE = 0.22;
const WIG_LIFT_A1 = 0.18; const WIG_LIFT_F1 = 0.31;
const WIG_LIFT_A2 = 0.12; const WIG_LIFT_F2 = 0.173;
// Sway forces on free points (px/s at REF_LEN scale) — the idle terms are
// strong on purpose: at rest the hair billows, the water owns it.
const WIG_SWAY_BEAT = 14;     // synced to the body wave, at idle
const WIG_SWAY_BEAT_SLOPE = 18; // extra at full speed
const WIG_SWAY_BEAT_FREQ = 1.1; // multiple of the body wave phase
const WIG_SWAY_SLOW = 9;      // slow ambient billow
const WIG_SWAY_SLOW_F = 0.42; // rad/s
// Lock ribbon silhouette: near-full width to the shoulder, then a soft tip
const WIG_SHOULDER = 0.3;     // fraction of the lock at/near full width
const WIG_ROOT_W = 0.55;      // width at the root, fraction of max
const WIG_TIP_EXP = 0.85;     // taper curve after the shoulder
const WIG_MIN_W = 0.3;        // px floor so tips don't vanish
const WIG_DAMAGE_PAD = 12;    // margin around the wig bbox swept by the Chromium
                              // damage rect (see docs/04) — covers spline overshoot

// Eye
const EYE_S = 0.045;          // spine anchor (s parameter)
const EYE_FWD = 1.2;          // push along the heading, onto the face
const EYE_UP = 2.0;           // offset above the spine
const EYE_R_UP = 4.1;         // radius along head-up — smaller than across: wider than tall
const EYE_R_ACROSS = 5.4;     // radius along the heading
const PUPIL_LEAD = 1.4;       // pupil offset toward the heading (looks where it's going)
const PUPIL_R = 2.3;
const SHINE_R = 0.75;
const SHINE_OFF = 0.8;        // highlight offset from the pupil, up-and-back
const SHINE_BACK = 0.3;       // how much that offset leans back from the heading

// Eyelashes — length is an EEL MAGIC cosmetic (4 → 8 via setMagic, docs/07)
const LASHES = 8;
const LASH_FAN_START = -0.2;  // first lash direction blend (up-back)
const LASH_FAN_SPAN = 1.6;    // ...sweeping to up-forward across the fan
const LASH_TAPER = 0.005;     // fractionally shorter per lash across the fan
const LASH_RIM = 0.95;        // base sits at this fraction of the eye's up-radius
const LASH_CTRL = 0.7;        // curve control point, fraction along the lash
const LASH_SWEEP = 0.3;       // tip drift toward the tail

// Makeup (EEL MAGIC cosmetics — opacity/hue range arrive via setMagic)
const SHADOW_HUE = 275;       // deg — base purple
const SHADOW_R_OUT = 1.55;    // crescent outer radius, fraction of eye up-radius
const SHADOW_R_IN = 0.95;     // crescent inner radius
const SHADOW_ARC = 1.05;      // rad — half-angle of the crescent about "up"
const SHADOW_PTS = 7;         // samples per crescent edge
const LIP_HUE = 352;          // deg — base red
const HUE_F1 = 0.21; const HUE_F2 = 0.047;  // rad/s — slow makeup hue-drift sines

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
    this.damage = svgRoot.querySelector('#eel-damage');
    this.lipEl = svgRoot.querySelector('#eel-lip');
    this.shadowEl = svgRoot.querySelector('#eel-shadow');
    this.sx = new Float64Array(2 * SHADOW_PTS);   // eyeshadow crescent scratch
    this.sy = new Float64Array(2 * SHADOW_PTS);
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
    // Per-lock attachment jitter, fixed at startup: along the hairline arc
    // (angle) and radially off the skull surface.
    this.wigJitA = new Float64Array(WIG_LOCKS);
    this.wigJitR = new Float64Array(WIG_LOCKS);
    for (let i = 0; i < WIG_LOCKS; i++) {
      this.wigJitA[i] = gauss() * WIG_ATTACH_ASTD * Math.PI / 180;
      this.wigJitR[i] = gauss() * WIG_ATTACH_RSTD;
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
    // EEL MAGIC package (docs/07), pushed by main via setMagic as the axis moves
    this.magic = { lashLen: 4, shadowA: 0, lipA: 0, hueRange: 0, boostAmt: 0.5, boostDur: 1.5 };
    this.stamina = 1;       // speed-burst fuel, 0..1
    this.boost01 = 0;       // eased burst factor (main reads it for sparks)
    this.boostOn = false;
    this.lightStam = 1;     // eel-light flare fuel, 0..1 (the green bar)
    this.flare01 = 0;       // eased flare factor (main feeds the veil hole/halo)
    this.flareOn = false;
    this.pulseT = -1;       // s since flare ignition; < 0 = no pulse in flight
    this.makeupOn = false;
    this.excite01 = 0;      // combo excitement (docs/10), eases out on its own
  }

  setMagic(m) {
    Object.assign(this.magic, m);
  }

  // A combo link landed (docs/10): surge the wiggle briefly.
  excite(amt) {
    this.excite01 = Math.min(1, this.excite01 + amt);
  }

  // The flare's ignition pulse: progress 0→1 over EEL_LIGHT.PULSE_T, or −1
  // when no pulse is in flight. Feed it to flarePulseEnv for brightness.
  get pulseU() {
    return this.pulseT < 0 ? -1 : Math.min(1, this.pulseT / EEL_LIGHT.PULSE_T);
  }

  resize(worldH) {
    // Fixed size in world units (the world itself is window-independent).
    this.len = EEL_LEN;
    this.seg = this.len / (N - 1);
    this.ws = this.len / REF_LEN;
    for (let i = 0; i < N; i++) this.wArr[i] = halfWidth(i / (N - 1)) * this.ws;
    if (!this.placed) this.place(0, START_DEPTH);   // origin, near the surface
    void worldH;
  }

  // Teleport (persisted spawn, progress reset): straighten the chain in place.
  place(x, y) {
    this.x = x;
    this.y = y;
    for (let i = 0; i < N; i++) {
      this.px[i] = this.x - i * this.seg;
      this.py[i] = this.y;
    }
    this.placed = true;
  }

  // floorAt (optional, docs/10): world y of the SOLID seafloor at an x — the
  // main-plane terrain surface. Falls back to the flat world floor (headless
  // tests, and any caller that doesn't care).
  update(dt, intent, worldH, floorAt) {
    if (typeof floorAt !== 'function') floorAt = null;   // legacy 4-arg callers
    this.dt = dt;   // wig physics runs in render(), after the spine exists
    this.time += dt;
    // Soft wall avoidance at the surface and floor — the sea is infinite in x
    // (docs/09), so there are no side walls. The floor is the TERRAIN (docs/10):
    // sampled under the head and a beat ahead of it, so the eel steers up a
    // dune face before its nose meets it.
    const floorLimit = floorAt
      ? Math.min(floorAt(this.x), floorAt(this.x + this.hx * 80))
      : worldH;
    let pushY = 0;
    const pushX = 0;
    if (this.y < WALL_MARGIN) pushY += (WALL_MARGIN - this.y) / WALL_MARGIN;
    if (this.y > floorLimit - WALL_MARGIN) pushY -= (this.y - (floorLimit - WALL_MARGIN)) / WALL_MARGIN;

    let steerX = 0, steerY = 0, steering = false;
    if (intent.active) {
      steerX = intent.dirX + pushX * WALL_PUSH;
      steerY = intent.dirY + pushY * WALL_PUSH;
      steering = true;
    } else if ((pushX || pushY) && this.speed > GLIDE_STEER_MIN) {
      steerX = pushX; steerY = pushY;    // turn away from walls while gliding
      steering = true;
    }

    // Effort: ease-in on start, longer ease-out on stop.
    const effortTarget = intent.active ? intent.throttle : 0;
    this.effort = expApproach(this.effort, effortTarget, dt,
      effortTarget > this.effort ? TAU_EFFORT_UP : TAU_EFFORT_DOWN);

    // Speed burst (docs/07): a fresh press starts a burst (given reserve);
    // it runs while held until the stamina empties, then eases out and
    // recharges — holding through empty never self-retriggers.
    const freshPress = intent.boost && !this.prevBoostIntent;
    this.prevBoostIntent = !!intent.boost;
    if (this.boostOn) this.boostOn = !!intent.boost && this.stamina > 0;
    else if (freshPress && this.stamina > BOOST_MIN_START) this.boostOn = true;
    this.boost01 = expApproach(this.boost01, this.boostOn ? 1 : 0, dt,
      this.boostOn ? TAU_BOOST_UP : TAU_BOOST_DOWN);
    if (this.boostOn) this.stamina = Math.max(0, this.stamina - dt / this.magic.boostDur);
    else this.stamina = Math.min(1, this.stamina + dt / BOOST_RECHARGE);
    const boostF = 1 + this.magic.boostAmt * this.boost01;
    this.excite01 *= Math.exp(-dt / EXCITE_TAU);   // combo surge fades on its own

    // Eel-light flare (docs/10 follow-up 2): the burst grammar on the green
    // light stamina — ignition fires the radiating pulse, the flare sustains
    // while held until the meter empties, then eases back to ambient and
    // recharges. Numbers live in tuning.EEL_LIGHT.
    const flareFresh = intent.flare && !this.prevFlareIntent;
    this.prevFlareIntent = !!intent.flare;
    if (this.flareOn) this.flareOn = !!intent.flare && this.lightStam > 0;
    else if (flareFresh && this.lightStam > EEL_LIGHT.STAM_MIN) {
      this.flareOn = true;
      this.pulseT = 0;      // ignition fires the pulse
    }
    this.flare01 = expApproach(this.flare01, this.flareOn ? 1 : 0, dt,
      this.flareOn ? EEL_LIGHT.TAU_UP : EEL_LIGHT.TAU_DOWN);
    if (this.flareOn) this.lightStam = Math.max(0, this.lightStam - dt / EEL_LIGHT.STAM_DUR);
    else this.lightStam = Math.min(1, this.lightStam + dt / EEL_LIGHT.STAM_RECHARGE);
    if (this.pulseT >= 0 && (this.pulseT += dt) >= EEL_LIGHT.PULSE_T) this.pulseT = -1;

    // Rate-limited turning: direction changes are arcs, never snaps. A burst
    // trades agility for speed — turn rate drops by the boost factor (docs/02).
    if (steering && (steerX || steerY)) {
      const desired = Math.atan2(steerY, steerX);
      const rate = (TURN_RATE_BASE + TURN_RATE_SLOPE * this.speed01) / boostF;
      this.heading += clamp(angleDiff(desired, this.heading), -rate * dt, rate * dt);
    }

    // Mouth: snaps open while held, eases shut on release.
    const mouthTarget = intent.mouth ? 1 : 0;
    this.mouth = expApproach(this.mouth, mouthTarget, dt,
      mouthTarget > this.mouth ? TAU_MOUTH_OPEN : TAU_MOUTH_CLOSE);

    // Speed: asymmetric easing = swim-up ramp vs glide-down momentum.
    // An open mouth drags — swimming while gaping is slower.
    const maxSpeed = this.len * MAX_SPEED_BL * (1 - MOUTH_DRAG * this.mouth) * boostF;
    const speedTarget = maxSpeed * this.effort;
    this.speed = expApproach(this.speed, speedTarget, dt,
      speedTarget > this.speed ? TAU_SPEED_UP : TAU_SPEED_DOWN);
    this.speed01 = this.speed / maxSpeed;
    this.speedSm = expApproach(this.speedSm, this.speed01, dt, TAU_SPEED_SM);

    // Undulation phase: always ticking (idle sway), faster with speed — and
    // faster still mid-burst (the eel visibly works harder).
    this.phase += (FREQ_BASE + FREQ_SLOPE * this.speedSm)
      * (1 + BOOST_WIG_F * this.boost01) * TAU * dt;

    // Integrate the head, injecting lateral wiggle as a sine *delta* (no net
    // drift) so the chain records a genuinely sinuous path.
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    this.hx = hx; this.hy = hy;
    const s = Math.sin(this.phase);
    const dLat = (s - this.prevSin) * this.seg * (HEADWIG_BASE + HEADWIG_SLOPE * this.speedSm);
    this.prevSin = s;
    this.x += hx * this.speed * dt - hy * dLat;
    this.y += hy * this.speed * dt + hx * dLat;
    // hard clamp: surface above, the terrain surface below (docs/10)
    const floorHard = floorAt ? floorAt(this.x) : worldH;
    this.y = clamp(this.y, EDGE_CLAMP, floorHard - EDGE_CLAMP);

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
    if (Math.abs(hx) > SIDE_FLIP_MIN) this.sideTarget = Math.sign(hx);
    this.sideSm = expApproach(this.sideSm, this.sideTarget, dt, TAU_SIDE);
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

    // Rendered spine = chain + traveling wave along chain normals (the wave
    // swells during a speed burst, and briefly during a combo surge).
    const amp = this.ws * (AMP_BASE + AMP_SLOPE * this.speedSm)
      * (1 + BOOST_WIG_A * this.boost01 + EXCITE_WIG_A * this.excite01);
    for (let i = 0; i < N; i++) {
      const j0 = Math.max(i - 1, 0), j1 = Math.min(i + 1, N - 1);
      let tx = px[j1] - px[j0], ty = py[j1] - py[j0];
      const tm = Math.hypot(tx, ty) || 1;
      tx /= tm; ty /= tm;
      const t = i / (N - 1);
      const env = ENV_HEAD + (1 - ENV_HEAD) * Math.pow(t, ENV_EXP);
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
    this.renderMakeup(flip);
    this.renderEye();
    this.renderWig();
  }

  // EEL MAGIC makeup (docs/01, docs/07): lipstick stroked along the lip
  // contour points (already placed in render), and the eyeshadow crescent is
  // drawn in renderEye where the eye frame lives. Hues drift slowly once the
  // makeupHue dial opens the range.
  makeupHue(base, scale) {
    const off = (Math.sin(this.time * HUE_F1) * 0.6 + Math.sin(this.time * HUE_F2) * 0.4)
      * this.magic.hueRange * scale;
    return base + off;
  }

  renderMakeup(flip) {
    const on = this.magic.lipA > 0.01 || this.magic.shadowA > 0.01;
    if (!on) {
      if (this.makeupOn) {
        this.makeupOn = false;
        this.lipEl.setAttribute('opacity', '0');
        this.shadowEl.setAttribute('opacity', '0');
      }
      return;
    }
    this.makeupOn = true;
    const pt = idx => {
      const k = 2 * N + (flip ? HEAD_N - 1 - idx : idx);
      return `${this.ox[k].toFixed(1)} ${this.oy[k].toFixed(1)}`;
    };
    // lower lip along chin → lip front → lip top; upper lip front → nose
    this.lipEl.setAttribute('d', `M${pt(1)}L${pt(2)}L${pt(3)}M${pt(5)}L${pt(6)}`);
    this.lipEl.setAttribute('stroke', `hsl(${this.makeupHue(LIP_HUE, 0.7).toFixed(0)}, 68%, 52%)`);
    this.lipEl.setAttribute('opacity', this.magic.lipA.toFixed(2));
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
    const p = this.pointAt(EYE_S);
    const ux = p.nx * side, uy = p.ny * side;   // toward the head's top (shrinks mid-roll)
    const ex = p.x + this.hx * EYE_FWD * ws + ux * EYE_UP * ws;   // forward on the face
    const ey = p.y + this.hy * EYE_FWD * ws + uy * EYE_UP * ws;
    const rUp = EYE_R_UP * ws, rAcross = EYE_R_ACROSS * ws;
    const upAngle = Math.atan2(uy, ux) * 180 / Math.PI;
    this.eye.setAttribute('cx', ex.toFixed(1));
    this.eye.setAttribute('cy', ey.toFixed(1));
    this.eye.setAttribute('rx', rUp.toFixed(1));
    this.eye.setAttribute('ry', rAcross.toFixed(1));
    this.eye.setAttribute('transform', `rotate(${upAngle.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)})`);
    // Pupil leads toward the heading: the eel looks where it's going.
    const px = ex + this.hx * PUPIL_LEAD * ws, py = ey + this.hy * PUPIL_LEAD * ws;
    this.pupil.setAttribute('cx', px.toFixed(1));
    this.pupil.setAttribute('cy', py.toFixed(1));
    this.pupil.setAttribute('r', (PUPIL_R * ws).toFixed(1));
    this.shine.setAttribute('cx', (px + (ux - this.hx * SHINE_BACK) * SHINE_OFF * ws).toFixed(1));
    this.shine.setAttribute('cy', (py + (uy - this.hy * SHINE_BACK) * SHINE_OFF * ws).toFixed(1));
    this.shine.setAttribute('r', (SHINE_R * ws).toFixed(1));

    // Eyelashes: short strokes fanning over the upper-forward rim, tips swept
    // gently back toward the tail. Length is the EEL MAGIC cosmetic (4 → 8).
    const um = Math.hypot(ux, uy) || 1;
    const uxn = ux / um, uyn = uy / um;
    for (let k = 0; k < LASHES; k++) {
      const blend = LASH_FAN_START + k * (LASH_FAN_SPAN / (LASHES - 1));
      let dx = uxn + this.hx * blend, dy = uyn + this.hy * blend;
      const dm = Math.hypot(dx, dy) || 1;
      dx /= dm; dy /= dm;
      const len = this.magic.lashLen * (1 - k * LASH_TAPER) * ws;
      const bx = ex + dx * rUp * LASH_RIM, by = ey + dy * rUp * LASH_RIM;
      const cxp = bx + dx * len * LASH_CTRL, cyp = by + dy * len * LASH_CTRL;
      const txp = bx + dx * len + p.tx * len * LASH_SWEEP;
      const typ = by + dy * len + p.ty * len * LASH_SWEEP;
      this.lashes[k].setAttribute('d',
        `M${bx.toFixed(1)} ${by.toFixed(1)}Q${cxp.toFixed(1)} ${cyp.toFixed(1)} ${txp.toFixed(1)} ${typ.toFixed(1)}`);
    }

    // Eyeshadow: a soft crescent over the lid, between the lash roots and the
    // eye rim, fading in with the makeup dial and drifting in hue (docs/07).
    if (this.makeupOn && this.magic.shadowA > 0.01) {
      const sx = this.sx, sy = this.sy;
      for (let k = 0; k < SHADOW_PTS; k++) {
        const th = -SHADOW_ARC + (2 * SHADOW_ARC * k) / (SHADOW_PTS - 1);
        const dx = uxn * Math.cos(th) + this.hx * Math.sin(th);
        const dy = uyn * Math.cos(th) + this.hy * Math.sin(th);
        sx[k] = ex + dx * rUp * SHADOW_R_OUT;
        sy[k] = ey + dy * rUp * SHADOW_R_OUT;
        sx[2 * SHADOW_PTS - 1 - k] = ex + dx * rUp * SHADOW_R_IN;
        sy[2 * SHADOW_PTS - 1 - k] = ey + dy * rUp * SHADOW_R_IN;
      }
      this.shadowEl.setAttribute('d', closedLoopPath(sx, sy, 2 * SHADOW_PTS));
      this.shadowEl.setAttribute('fill', `hsl(${this.makeupHue(SHADOW_HUE, 1).toFixed(0)}, 48%, 62%)`);
      this.shadowEl.setAttribute('opacity', this.magic.shadowA.toFixed(2));
    }
  }

  // The wig is thick flowing locks, not strands: each lock is a trailing chain
  // (same trick as the body — root pinned to the scalp, free points drift in
  // the wake, sway, and relax weakly toward a rest pose flowing up-and-back)
  // rendered as a filled tapered ribbon around the chain, like a mini eel body.
  renderWig() {
    const ws = this.ws, side = this.sideSm, dt = this.dt || 0.016;
    // weak rest pull: the hair mostly does what the water tells it
    const restPull = 1 - Math.exp(-dt / WIG_REST_TAU);
    const lox = this.lox, loy = this.loy;
    const time = this.time;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    // The skull-oval frame: pinned to the rendered spine at the oval's center,
    // forward toward the nose, up toward the scalp side (squashes mid-roll).
    const c = this.pointAt(WIG_OVAL_S);
    const fwX = -c.tx, fwY = -c.ty;
    const upX = c.nx * side, upY = c.ny * side;
    for (let i = 0; i < WIG_LOCKS; i++) {
      // root on the hairline arc, with fixed per-lock jitter
      const th = (WIG_ARC_START + (WIG_ARC_END - WIG_ARC_START) * (i / (WIG_LOCKS - 1)))
        * Math.PI / 180 + this.wigJitA[i];
      const proud = WIG_ROOT_PROUD + this.wigJitR[i];
      const ra = (WIG_OVAL_RA + proud) * ws, rb = (WIG_OVAL_RB + proud) * ws;
      const bx = c.x + fwX * Math.cos(th) * ra + upX * Math.sin(th) * rb;
      const by = c.y + fwY * Math.cos(th) * ra + upY * Math.sin(th) * rb;
      // Rest pose: lie back along the body from the root (near-zero slope),
      // lifted a touch off the scalp, drifting slowly and smoothly as if in
      // water — two incommensurate slow sines per lock stand in for randomness.
      // (The i·… phase strides here and below just decorrelate the locks.)
      const lift = WIG_LIFT_BASE
        + WIG_LIFT_A1 * Math.sin(time * WIG_LIFT_F1 + i * 2.13)
        + WIG_LIFT_A2 * Math.sin(time * WIG_LIFT_F2 + i * 0.71);
      let rdx = c.tx + upX * lift;
      let rdy = c.ty + upY * lift;
      const rm = Math.hypot(rdx, rdy) || 1;
      rdx /= rm; rdy /= rm;
      const perpX = -rdy, perpY = rdx;
      const L = (WIG_LEN_BASE + i * WIG_LEN_STEP) * ws;   // long locks
      const segL = L / (WIG_POINTS - 1);

      const xs = this.wigX[i], ys = this.wigY[i];
      if (!this.wigReady) {
        for (let j = 0; j < WIG_POINTS; j++) {
          xs[j] = bx + rdx * segL * j;
          ys[j] = by + rdy * segL * j;
        }
      }
      // forces on free points: sway + weak pull toward the rest pose
      for (let j = 1; j < WIG_POINTS; j++) {
        const sway = (Math.sin(this.phase * WIG_SWAY_BEAT_FREQ + j * 0.7 + i * 1.5)
            * (WIG_SWAY_BEAT + WIG_SWAY_BEAT_SLOPE * this.speedSm)
          + Math.sin(time * WIG_SWAY_SLOW_F + j * 1.1 + i * 2.3) * WIG_SWAY_SLOW) * ws * dt;
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
        const lw = maxW * (u < WIG_SHOULDER
          ? WIG_ROOT_W + (1 - WIG_ROOT_W) * (u / WIG_SHOULDER)
          : Math.pow(1 - (u - WIG_SHOULDER) / (1 - WIG_SHOULDER), WIG_TIP_EXP)) + WIG_MIN_W;
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
      for (let k = 0; k < 2 * WIG_POINTS; k++) {
        if (lox[k] < minX) minX = lox[k];
        if (lox[k] > maxX) maxX = lox[k];
        if (loy[k] < minY) minY = loy[k];
        if (loy[k] > maxY) maxY = loy[k];
      }
    }
    // Explicit clear step: sweep the damage rect over everything the wig
    // painted, so Chromium re-rasters the region every frame (see docs/04).
    const pad = WIG_DAMAGE_PAD * ws;
    this.damage.setAttribute('x', (minX - pad).toFixed(1));
    this.damage.setAttribute('y', (minY - pad).toFixed(1));
    this.damage.setAttribute('width', (maxX - minX + 2 * pad).toFixed(1));
    this.damage.setAttribute('height', (maxY - minY + 2 * pad).toFixed(1));
    this.wigReady = true;
  }
}
