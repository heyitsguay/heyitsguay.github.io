// The living kelp forest: one WebGL canvas, a handful of small draw calls
// (see docs/03-environment.md).
//   1. background — procedural gradient + god rays, fullscreen fragment shader
//   2. strips — rolling seafloor terrain, corals, kelp walls, main kelp,
//      seagrass: chunk-seeded geometry (docs/09), sway + eel-push in the
//      vertex shader
//   3. particles — motes (eel-repelled) + bubbles + snow, one buffer
//
// INFINITE-X PRECISION (docs/09): the GL side never sees a large coordinate.
// Strip vertices are stored relative to their chunk window's origin and placed
// with a per-draw u_off uniform computed in float64 JS; dynamic points/pulses
// upload camera-relative positions; the background shader's camera x arrives
// pre-wrapped modulo the god-ray/shimmer common period.

import { TAU, lerp, clamp, curves } from './math.js';
import { LAYERS, KELP_GROWTH, DIALS, SEA, TERRAIN } from './tuning.js';
import { kelpStrands, strandsInChunk, terrainShape } from './worldgen.js';

// JS-side sim knobs live here; shape/color numbers inside the shader strings
// below deliberately stay next to the effect they control (see docs/03).
const REF_W = 1920, REF_H = 1080;  // world sizing is in reference-screen units

// The background camera-x wrap period: the smallest x-translation that leaves
// both god-ray sines AND the shimmer invariant (docs/09) — (20π/3) · REF_W.
const BG_WRAP = (20 * Math.PI / 3) * REF_W;

// Shader time wrap: 200π is an exact common period of every u_t frequency in
// the bg (0.10/0.07/0.23/0.19) and kelp (0.55/0.23) shaders — all become
// integer multiples of 2π — so the GPU never sees a large timestamp. (The
// plane-fauna jelly pulse isn't commensurate; it takes one imperceptible
// phase hop per ~10.5 min wrap.)
const T_WRAP = 200 * Math.PI;

// Chunk windows: how far past the view strips extend before a rebuild is due.
const CHUNK_PAD = 480;         // px (plane space)

// Kelp (per-chunk streams come from worldgen; px sizes here)
const KELP_SEGS = 16;
const PUSH_BASE = 0.25;        // kelp-part strength at rest...
const PUSH_SLOPE = 0.75;       // ...plus this at full eel speed
const KELP_COL_FAR = [0.055, 0.165, 0.125];   // main kelp palette
const KELP_COL_NEAR = [0.012, 0.070, 0.052];
const KELP_TIP_LIGHT = 3.5;   // per-vertex depth lighting gain: strands brighten
                              // with the water's own gradient curve — flat color
                              // reads far too dark where tips reach bright water

// Background-plane strand streams (worldgen specs; salts are layer identity)
const WALL_SPEC = { salt: 6, perChunk: 8.5, hMin: 0.45, hVar: 0.45, wMin: 5, wVar: 5 };
const NEAR_SPEC = { salt: 7, perChunk: 4.5, hMin: 0.5, hVar: 0.5, wMin: 7, wVar: 6 };
const GRASS_SPEC = { salt: 5, perChunk: 32, hMin: 0.024, hVar: 0.045, wMin: 1.2, wVar: 1.4 };
const CORAL_SPEC = { salt: 9, perChunk: 5.5, hMin: 0.05, hVar: 0.08, wMin: 10, wVar: 12 };
const TERR_FOG = 0.14;      // terrain tone: this far from deep water toward surface
const WALL_FOG_BASE = 0.18;  // far kelp visibility above the water color...
const WALL_FOG_LIFE = 0.45;  // ...plus this at full LIFE
const NEAR_FOG_BASE = 0.4;   // near plane sits closer to the true kelp tones
const NEAR_FOG_LIFE = 0.4;
const GRASS_COL_A = [0.10, 0.30, 0.17];       // brighter than kelp — grass
const GRASS_COL_B = [0.045, 0.17, 0.10];
const CORAL_COL = [0.22, 0.10, 0.11];         // warm silhouette, fogged per plane
const TERR_SEG = 48;         // px between terrain heightfield samples
const TERR_SINK = 90;        // px the terrain fill extends below the plane floor
// (The P4 depth-of-field blur FBO lived here and was REMOVED — three
// attempts all read badly. Planes draw sharp; LAYERS.FAR.FOG fakes the
// depth by pulling the far palette toward the water color. docs/10.)

// New kelp types (P4, docs/10 — geometry only; worldgen assigns the types):
const SINUOUS_CURVE = 0.16;   // static S-curve amplitude, fraction of height
const SINUOUS_W = 0.72;       // width factor — longer AND slimmer
const SPINDLE_W = 3.2;        // px — the spindle stalk half-width
const SPINDLE_NODES = [0.30, 0.48, 0.66, 0.84];   // growth nodes up the stalk
const SPINDLE_BLADES = 6;     // grassy projections per node
const SPINDLE_BLADE_L = [20, 36];   // px projection length range
const SPINDLE_BLADE_W = 1.6;  // px projection half-width
const SPINDLE_FRAC_SPREAD = 0.05;   // projections wave differentially vs the stalk

// Background plane fauna (docs/07): silhouette minnow-dot schools + soft jelly
// blobs living in each parallax plane, wrapping around the plane-space camera
// window like motes. Counts scale with the LIFE axis.
const PLANE_MINNOWS = [10, 14];   // [near, far] dots at full LIFE
const PLANE_JELLIES = [1, 2];
const PLANE_DOT_SIZE = [5.5, 4.0]; // dark silhouette dots — small vs a real
const PLANE_DOT_ALPHA = [0.55, 0.40];  // minnow (~22px), but clearly *there*
const PLANE_JELLY_R = [34, 24];
const PLANE_JELLY_ALPHA = [0.22, 0.11];
const PLANE_SCHOOL_SPEED = 26;    // px/s anchor wander
const PLANE_ORBIT = 30;           // px dot orbit radius around the anchor
const PLANE_WRAP_PAD = 60;

// Motes
const MOTE_COUNT = 120;
const MOTE_SIZE_MIN = 1.6, MOTE_SIZE_VAR = 1.8;  // px
const MOTE_WANDER = 3;         // px/s² sinusoidal drift force
const MOTE_REPEL = 400;        // px/s² scatter at the eel head, scaled by its speed
const REPEL_RADIUS = 70;       // px — motes scatter from the eel head inside this
const MOTE_DAMP = 1.2;         // 1/s velocity damping
const MOTE_ALPHA = 0.18, MOTE_TWINKLE = 0.15;    // base alpha + twinkle amplitude
const MOTE_TWINKLE_F = 0.8;    // rad/s
const WRAP_PAD = 20;           // px beyond the view rect before motes wrap around

// Marine snow: sparse pale specks sinking through the view (docs/03) — the
// barren sea's first texture, present from LIGHT = 0.
const SNOW_COUNT = 50;
const SNOW_SINK_MIN = 5, SNOW_SINK_VAR = 9;      // px/s
const SNOW_SIZE_MIN = 1.0, SNOW_SIZE_VAR = 1.2;  // px
const SNOW_ALPHA = 0.10, SNOW_TWINKLE = 0.05;
const SNOW_WANDER = 4;         // px/s lateral sine drift

// (Boost sparks moved to the glow layer — sparkles.js — so the crackle shines
// through the veil in dark water; GL sparks were being multiplied to black.)

// Light pulses: a small pool of expanding additive glows (eat flourish, docs/06)
const PULSE_POOL = 6;
const PULSE_R_BASE = 130, PULSE_R_AMT = 90;      // px radius vs progression amount
const PULSE_A_BASE = 0.70, PULSE_A_AMT = 0.30;   // peak alpha vs amount (capped 1)
const PULSE_T_BASE = 0.85, PULSE_T_AMT = 0.30;   // s duration vs amount

// Bubbles (one pool shared by the mouth, food trails, plops, bursts, critters)
const BUBBLE_POOL = 90;
const RING_MIN_SIZE = 2.5;     // px — smaller bubbles draw as discs: the ring
                               // pattern can't resolve inside a ~3px point sprite
const BUBBLE_MIN_EFFORT = 0.4; // eel effort needed to emit
const BUBBLE_RATE_BASE = 4, BUBBLE_RATE_SLOPE = 14;  // per second, vs effort
const BUBBLE_MOUTH_OFF = 8;    // px ahead of the head at spawn
const BUBBLE_JITTER = 6;       // px spawn scatter
const BUBBLE_KICK = 30;        // px/s forward speed inherited from the eel
const BUBBLE_RISE0 = 20, BUBBLE_RISE_VAR = 20;       // px/s initial upward speed
const BUBBLE_BUOY = 50;        // px/s² buoyant acceleration
const BUBBLE_RISE_MAX = 70;    // px/s terminal rise speed
const BUBBLE_WOBBLE = 15;      // px/s² lateral wobble force
const BUBBLE_WOBBLE_F = 4;     // rad/s
const BUBBLE_DRAG = 0.8;       // 1/s horizontal damping
const BUBBLE_LIFE_MIN = 1.2, BUBBLE_LIFE_VAR = 1.5;  // s
const BUBBLE_SIZE_MIN = 2, BUBBLE_SIZE_VAR = 3;      // px
const BUBBLE_FADE = 0.5;       // s — fade-out at end of life
const BUBBLE_ALPHA = 0.7;
// Burst (the eat flourish — see docs/06): a puff of pool bubbles at a point
const BURST_COUNT = 7;
const BURST_SCATTER = 14;      // px spawn spread
const BURST_VX = 40;           // px/s lateral scatter speed
const BURST_RISE0 = 30, BURST_RISE_VAR = 40;   // px/s initial upward speed
const BURST_LIFE_MIN = 0.8, BURST_LIFE_VAR = 0.8;  // s

const QUAD_VS = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const BG_FS = `
// highp is REQUIRED here, not a nicety: mediump is fp16 on mobile GPUs, and
// wx below reaches ~80k device px — fp16 quantizes that in 32+ px steps,
// which renders the god rays as low-res blocks (a real shipped bug).
precision highp float;
uniform vec2 u_res;
uniform vec2 u_ref;        // reference screen size, device px (world-fixed scale)
uniform vec2 u_cam;        // camera top-left, device px; x pre-wrapped (docs/09)
uniform float u_worldH;    // world height, device px
uniform float u_t;
uniform vec3 u_deep;       // LIGHT-axis palette + strengths (see docs/03, tuning.js)
uniform vec3 u_surface;
uniform float u_ray;
uniform float u_shim;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  // world position of this fragment (y-down: 0 = surface, u_worldH = floor);
  // wx is world x modulo the ray/shimmer period — indistinguishable, precise
  float wx = u_cam.x + gl_FragCoord.x;
  float wy = u_cam.y + (u_res.y - gl_FragCoord.y);
  float depth = clamp(wy / u_worldH, 0.0, 1.0);
  float bright = 1.0 - depth;
  vec3 col = mix(u_surface, u_deep, pow(depth, 0.85));
  // god rays: fixed in world space, strongest near the surface
  float rx = wx / u_ref.x * 3.0 + wy / u_ref.y * 0.9;
  float r1 = sin(rx * 4.0 + u_t * 0.10) * sin(rx * 7.3 - u_t * 0.07 + 1.7);
  col += vec3(0.26, 0.48, 0.55) * pow(max(r1, 0.0), 3.0) * pow(bright, 2.2) * u_ray;
  // faint large-scale shimmer
  float sh = sin(wx / u_ref.x * 9.0 + u_t * 0.23) * sin(wy / u_ref.y * 7.0 - u_t * 0.19);
  col += vec3(0.04, 0.09, 0.11) * sh * u_shim * (0.3 + 0.7 * bright);
  vec2 c = uv - 0.5;
  col *= 1.0 - dot(c, c) * 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`;

const KELP_VS = `
attribute vec2 a_xy;       // device px: x relative to the chunk-window origin,
                           // y absolute plane-space (bounded — precise in f32)
attribute vec3 a_aux;      // frac up the strand, phase, shade
uniform vec2 u_res;
uniform vec2 u_off;        // origin − planeCam, device px (float64 in JS)
uniform vec2 u_jit;        // blur-tap jitter offset, device px
uniform vec2 u_eel;        // eel, CAMERA-RELATIVE device px
uniform float u_t;
uniform float u_dpr;
uniform float u_push;      // eel speed factor (0 disables for silhouette passes)
uniform float u_worldH;    // world height, device px (depth lighting)
varying float v_shade;
varying float v_bright;    // "surfaceness" on the water's own gradient curve
void main() {
  float frac = a_aux.x, ph = a_aux.y;
  v_shade = a_aux.z;
  // match the background shader: water brightness ~ 1 - depth^0.85
  v_bright = 1.0 - pow(clamp(a_xy.y / u_worldH, 0.0, 1.0), 0.85);
  vec2 p = a_xy + u_jit;
  p.x += u_off.x;
  p.y += u_off.y;
  // ambient sway: bases planted, tips waving
  p.x += (sin(u_t * 0.55 + ph + frac * 2.6) * 14.0
        + sin(u_t * 0.23 + ph * 1.7 + frac * 1.3) * 9.0) * pow(frac, 1.3) * u_dpr;
  // the eel parts the kelp as it swims through: horizontal-only bend with a
  // smooth sign, so strands sweep continuously as the eel crosses them
  vec2 d = p - u_eel;
  float dl = length(d);
  float r = 100.0 * u_dpr;
  float bend = (d.x / (abs(d.x) + 24.0 * u_dpr)) * exp(-(dl * dl) / (r * r));
  p.x += bend * 30.0 * u_dpr * frac * u_push;
  vec2 clip = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const KELP_FS = `
precision mediump float;
varying float v_shade;
varying float v_bright;
uniform float u_dim;   // LIGHT-axis dim so plants don't glow against dark water
uniform float u_tip;   // depth-lighting gain toward the surface
uniform float u_alpha; // <1 for the blurred parallax taps
uniform vec3 u_colFar; // per-pass palette (kelp greens, rock darks, plane fog)
uniform vec3 u_colNear;
void main() {
  // strands sit in the water's light: brighten toward the surface like it does
  float dl = 1.0 + u_tip * v_bright;
  gl_FragColor = vec4(mix(u_colFar, u_colNear, v_shade) * u_dim * dl, u_alpha);
}
`;

const POINT_VS = `
attribute vec2 a_pos;      // CAMERA-RELATIVE device px (docs/09)
attribute vec3 a_aux;      // size (device px), alpha, kind
uniform vec2 u_res;
varying float v_alpha;
varying float v_kind;
void main() {
  vec2 clip = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = a_aux.x;
  v_alpha = a_aux.y;
  v_kind = a_aux.z;
}
`;

const POINT_FS = `
precision mediump float;
varying float v_alpha;
varying float v_kind;   // 0 mote/snow, 1 bubble ring, 2 spark, 3 plane-fauna silhouette
void main() {
  float d = length(gl_PointCoord - 0.5);
  vec3 col;
  float a;
  if (v_kind < 0.5) {
    col = vec3(0.60, 0.80, 0.82);
    a = smoothstep(0.5, 0.12, d);
  } else if (v_kind < 1.5) {
    col = vec3(0.78, 0.93, 0.95);
    a = smoothstep(0.5, 0.40, d) * smoothstep(0.20, 0.30, d);
  } else if (v_kind < 2.5) {
    col = vec3(0.38, 0.85, 1.0);   // electric blue
    a = pow(smoothstep(0.5, 0.0, d), 1.6);
  } else {
    col = vec3(0.07, 0.13, 0.15);  // distant-fauna silhouette, dark against water
    a = smoothstep(0.5, 0.18, d);
  }
  gl_FragColor = vec4(col, a * v_alpha);
}
`;

const PULSE_VS = `
attribute vec2 a_pos;      // the fullscreen triangle, reused as a unit-space quad
uniform vec2 u_res;
uniform vec2 u_center;     // CAMERA-RELATIVE device px
uniform float u_radius;    // device px
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  vec2 clip = (u_center + a_pos * u_radius) / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const PULSE_FS = `
precision mediump float;
varying vec2 v_uv;
uniform vec3 u_color;
uniform float u_alpha;
void main() {
  float a = max(0.0, 1.0 - length(v_uv));
  a *= a;
  gl_FragColor = vec4(u_color * (a * u_alpha), 0.0);   // additive
}
`;

function buildProgram(gl, vsSrc, fsSrc) {
  const make = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh));
    }
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, make(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog));
  }
  return prog;
}

export class Water {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    this.gl = gl;
    this.ok = !!gl;
    if (!this.ok) return;   // no WebGL: the CSS background carries the scene

    this.t = 0;
    this.eelX = 0; this.eelY = 0; this.eelPush = 0;
    this.spawnAcc = 0;
    // Light params (tuning.lightParams shape); today's look until main sets it.
    this.lightP = { deep: [0.010, 0.048, 0.070], surface: [0.30, 0.62, 0.66],
                    ray: 0.35, shim: 0.06, kelpDim: 1.0 };

    this.bgProg = buildProgram(gl, QUAD_VS, BG_FS);
    this.kelpProg = buildProgram(gl, KELP_VS, KELP_FS);
    this.pointProg = buildProgram(gl, POINT_VS, POINT_FS);
    this.pulseProg = buildProgram(gl, PULSE_VS, PULSE_FS);
    this.loc = {
      bg: { pos: gl.getAttribLocation(this.bgProg, 'a_pos'),
            res: gl.getUniformLocation(this.bgProg, 'u_res'),
            ref: gl.getUniformLocation(this.bgProg, 'u_ref'),
            cam: gl.getUniformLocation(this.bgProg, 'u_cam'),
            worldH: gl.getUniformLocation(this.bgProg, 'u_worldH'),
            t: gl.getUniformLocation(this.bgProg, 'u_t'),
            deep: gl.getUniformLocation(this.bgProg, 'u_deep'),
            surface: gl.getUniformLocation(this.bgProg, 'u_surface'),
            ray: gl.getUniformLocation(this.bgProg, 'u_ray'),
            shim: gl.getUniformLocation(this.bgProg, 'u_shim') },
      kelp: { xy: gl.getAttribLocation(this.kelpProg, 'a_xy'),
              aux: gl.getAttribLocation(this.kelpProg, 'a_aux'),
              res: gl.getUniformLocation(this.kelpProg, 'u_res'),
              off: gl.getUniformLocation(this.kelpProg, 'u_off'),
              jit: gl.getUniformLocation(this.kelpProg, 'u_jit'),
              eel: gl.getUniformLocation(this.kelpProg, 'u_eel'),
              t: gl.getUniformLocation(this.kelpProg, 'u_t'),
              dpr: gl.getUniformLocation(this.kelpProg, 'u_dpr'),
              push: gl.getUniformLocation(this.kelpProg, 'u_push'),
              dim: gl.getUniformLocation(this.kelpProg, 'u_dim'),
              alpha: gl.getUniformLocation(this.kelpProg, 'u_alpha'),
              worldH: gl.getUniformLocation(this.kelpProg, 'u_worldH'),
              tip: gl.getUniformLocation(this.kelpProg, 'u_tip'),
              colFar: gl.getUniformLocation(this.kelpProg, 'u_colFar'),
              colNear: gl.getUniformLocation(this.kelpProg, 'u_colNear') },
      point: { pos: gl.getAttribLocation(this.pointProg, 'a_pos'),
               aux: gl.getAttribLocation(this.pointProg, 'a_aux'),
               res: gl.getUniformLocation(this.pointProg, 'u_res') },
      pulse: { pos: gl.getAttribLocation(this.pulseProg, 'a_pos'),
               res: gl.getUniformLocation(this.pulseProg, 'u_res'),
               center: gl.getUniformLocation(this.pulseProg, 'u_center'),
               radius: gl.getUniformLocation(this.pulseProg, 'u_radius'),
               color: gl.getUniformLocation(this.pulseProg, 'u_color'),
               alpha: gl.getUniformLocation(this.pulseProg, 'u_alpha') },
    };

    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    // Chunk-windowed strip layers (docs/09): each rebuilds its buffer only
    // when the camera crosses into new chunks, LIFE moves, or the view
    // resizes. build(verts, chunk, origin) pushes the chunk's strands.
    this.layers = {
      kelp: this.mkLayer(1, (v, c, o) => this.buildKelpChunk(v, c, o)),
      grass: this.mkLayer(1, (v, c, o) => this.buildGrassChunk(v, c, o)),
      // main-plane seafloor (P4, docs/10): a low roll behind the eel
      terrMain: this.mkLayer(1, (v, c, o) => this.buildTerrainChunk(v, c, o, 'main')),
      wall: this.mkLayer(LAYERS.FAR.PF, (v, c, o) => this.buildStrandChunk(v, c, o, WALL_SPEC, LAYERS.FAR.PF, true)),
      nearK: this.mkLayer(LAYERS.NEAR.PF, (v, c, o) => this.buildStrandChunk(v, c, o, NEAR_SPEC, LAYERS.NEAR.PF, true)),
      terrFar: this.mkLayer(LAYERS.FAR.PF, (v, c, o) => this.buildTerrainChunk(v, c, o, 'far')),
      terrNear: this.mkLayer(LAYERS.NEAR.PF, (v, c, o) => this.buildTerrainChunk(v, c, o, 'near')),
      coralFar: this.mkLayer(LAYERS.FAR.PF, (v, c, o) => this.buildCoralChunk(v, c, o, 'far')),
      coralNear: this.mkLayer(LAYERS.NEAR.PF, (v, c, o) => this.buildCoralChunk(v, c, o, 'near')),
    };
    this.lifeV = 0;         // LIFE axis value, set by main

    // Background plane fauna: one dot-school anchor + jelly blobs per plane,
    // living in plane space, wrapping around the plane camera window.
    this.planes = [LAYERS.NEAR, LAYERS.FAR].map((cfg, pi) => ({
      cfg, pi,
      school: { x: Math.random() * 3000, y: 400 + Math.random() * 800, hd: Math.random() * TAU, seed: Math.random() * TAU },
      dots: Array.from({ length: PLANE_MINNOWS[pi] }, () => ({
        seed: Math.random() * TAU, r: PLANE_ORBIT * (0.4 + Math.random()),
      })),
      jellies: Array.from({ length: PLANE_JELLIES[pi] }, () => ({
        x: Math.random() * 3000, y: 500 + Math.random() * 1000,
        phase: Math.random() * TAU, seed: Math.random() * TAU,
      })),
    }));
    this.faunaBuf = gl.createBuffer();
    this.faunaScratch = new Float32Array(Math.max(...PLANE_MINNOWS) * 5);

    this.pointBuf = gl.createBuffer();
    this.pointData = new Float32Array((MOTE_COUNT + BUBBLE_POOL + SNOW_COUNT) * 5);

    // Particle sim lives in CSS px; converted to device px on upload.
    this.motes = [];
    this.snow = [];
    this.bubbles = [];
    for (let i = 0; i < BUBBLE_POOL; i++) {
      this.bubbles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 2, seed: Math.random() * TAU });
    }
    this.pulses = [];
    for (let i = 0; i < PULSE_POOL; i++) {
      this.pulses.push({ x: 0, y: 0, color: [1, 1, 1], age: 1e9, dur: 1, r: 0, a: 0 });
    }
  }

  mkLayer(pf, build) {
    return { pf, build, buf: this.gl.createBuffer(), verts: 0,
             c0: 1, c1: 0, origin: 0, dirty: true };
  }

  resize(W, H, dpr, worldH) {
    this.W = W; this.H = H; this.dpr = dpr;
    this.worldH = worldH;
    if (!this.ok) return;
    const gl = this.gl;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    for (const L of Object.values(this.layers)) L.dirty = true;   // floors moved
    this.motesSeeded = false;   // reseed around the camera on next update
    this.snowSeeded = false;
  }

  // Plane floor (docs/09): meets the window bottom when the camera rests on
  // the world floor — geometry anchored at the raw world floor with pf < 1
  // would sit forever below the window (that bug shipped; don't reintroduce).
  planeFloor(pf) {
    return pf === 1 ? this.worldH + 4 : this.H + (this.worldH - this.H) * pf;
  }

  // ---- chunk builders (vertex layout: xRel, y, frac, phase, shade) ---------

  // curveFn (optional, docs/10): a static build-time lateral offset per
  // height-fraction — the sinuous kelp's S-curve rides under the shader sway.
  pushStrand(verts, xRel, floorY, hPx, hw, ph, shade, curveFn) {
    const dpr = this.dpr;
    const push = (x, y, frac) => verts.push(x * dpr, y * dpr, frac, ph, shade);
    for (let j = 0; j <= KELP_SEGS; j++) {
      const frac = j / KELP_SEGS;
      const y = floorY - hPx * frac;
      const xc = xRel + (curveFn ? curveFn(frac) : 0);
      const wj = hw * (1 - frac * 0.85) + 0.6;
      if (j === 0 && verts.length) {
        // degenerate join: repeat previous strand's last vertex + this first
        const p = verts.length;
        verts.push(verts[p - 5], verts[p - 4], verts[p - 3], verts[p - 2], verts[p - 1]);
        push(xc - wj, y, frac);
      }
      push(xc - wj, y, frac);
      push(xc + wj, y, frac);
    }
  }

  // Kelp density is gated on LIFE (DIALS.kelp, docs/09): the barren sea
  // starts near-bare and the forest grows in, on every plane.
  kelpDens() {
    const kd = DIALS.kelp;
    const dial = kd.max * curves[kd.curve](clamp((this.lifeV - kd.threshold) / kd.rampWidth, 0, 1));
    return dial * (1 + KELP_GROWTH.DENSITY * this.lifeV);
  }

  // One short grassy blade (the spindle's growth-node projections, docs/10):
  // a thin two-point strip. frac is inherited from the STALK's height (± a
  // small spread along the blade) so the blade rides the stalk's shader sway
  // exactly and waves differentially against it — no separate sim.
  pushBlade(verts, x0, y0, x1, y1, hw, frac0, frac1, ph, shade) {
    const dpr = this.dpr;
    let nx = -(y1 - y0), ny = x1 - x0;
    const nm = Math.hypot(nx, ny) || 1;
    nx = nx / nm * hw; ny = ny / nm * hw;
    const quad = [
      [x0 - nx, y0 - ny, frac0], [x0 + nx, y0 + ny, frac0],
      [x1 - nx * 0.3, y1 - ny * 0.3, frac1], [x1 + nx * 0.3, y1 + ny * 0.3, frac1],
    ];
    if (verts.length) {   // degenerate join
      const p = verts.length;
      verts.push(verts[p - 5], verts[p - 4], verts[p - 3], verts[p - 2], verts[p - 1]);
      verts.push(quad[0][0] * dpr, quad[0][1] * dpr, quad[0][2], ph, shade);
    }
    for (const [x, y, f] of quad) verts.push(x * dpr, y * dpr, f, ph, shade);
  }

  buildKelpChunk(verts, chunk, origin) {
    const tall = 1 + KELP_GROWTH.HEIGHT * this.lifeV;
    const floor = this.planeFloor(1);
    for (const s of kelpStrands(chunk, this.kelpDens())) {
      const xr = s.x - origin;
      // rooted ON the terrain surface (docs/10), sunk 6 px like the planes
      const rootY = floor - this.terrainRise(s.x, 'main') + 6;
      const hPx = s.h * REF_H * tall * (s.hMul || 1);
      if (s.type === 'sinuous') {
        // longer, slimmer, with a static build-time S-curve (docs/10)
        this.pushStrand(verts, xr, rootY, hPx, s.hw * SINUOUS_W, s.ph, s.shade,
          f => Math.sin(f * 4.2 + s.ph) * f * hPx * SINUOUS_CURVE);
      } else if (s.type === 'spindle') {
        // very tall, very narrow, with grassy growth nodes (docs/10)
        this.pushStrand(verts, xr, rootY, hPx, SPINDLE_W, s.ph, s.shade);
        for (let nI = 0; nI < SPINDLE_NODES.length; nI++) {
          const nf = SPINDLE_NODES[nI];
          const ny = rootY - hPx * nf;
          for (let b = 0; b < SPINDLE_BLADES; b++) {
            // a deterministic little fan: out and up from the node
            const u = SPINDLE_BLADES === 1 ? 0.5 : b / (SPINDLE_BLADES - 1);
            const spread = (u - 0.5) * 2;   // -1 .. 1
            const wob = Math.sin(s.ph * 3.7 + nI * 2.1 + b * 1.3);
            const len = SPINDLE_BLADE_L[0]
              + (SPINDLE_BLADE_L[1] - SPINDLE_BLADE_L[0]) * (0.5 + 0.5 * wob);
            const bx = xr + spread * len * 0.55;
            const by = ny - len * (0.65 + 0.25 * Math.abs(wob));
            this.pushBlade(verts, xr, ny, bx, by, SPINDLE_BLADE_W,
              nf, nf + SPINDLE_FRAC_SPREAD * (0.4 + 0.6 * u),
              s.ph, Math.min(1, s.shade * 0.5 + 0.1));
          }
        }
      } else {
        this.pushStrand(verts, xr, rootY, hPx, s.hw, s.ph, s.shade);
      }
    }
  }

  buildGrassChunk(verts, chunk, origin) {
    const gd = DIALS.seagrass;
    const amt = gd.max * curves[gd.curve](clamp((this.lifeV - gd.threshold) / gd.rampWidth, 0, 1));
    if (amt <= 0) return;
    const stretch = 0.55 + 0.7 * amt;
    const floor = this.planeFloor(1);
    const list = strandsInChunk(chunk, GRASS_SPEC);
    const n = Math.round(list.length * amt);
    for (let i = 0; i < n; i++) {
      const s = list[i];
      // seagrass rides the terrain surface too (docs/10)
      const rootY = floor - this.terrainRise(s.x, 'main') + 6;
      this.pushStrand(verts, s.x - origin, rootY, s.h * stretch * REF_H, s.hw, s.ph, s.shade * 0.5);
    }
  }

  // Terrain height above a plane's floor (docs/09, docs/10): a smooth shaped
  // roll — mostly low, occasionally swelling. Keyed per plane; fractions of
  // the view height.
  terrainRise(x, pk) {
    return TERRAIN.BASE[pk]
      + terrainShape(x, TERRAIN.SALT[pk], TERRAIN.POW[pk]) * TERRAIN.AMP[pk] * this.H;
  }

  // Behind-plane kelp strands, rooted on that plane's terrain.
  buildStrandChunk(verts, chunk, origin, spec, pf, grow) {
    const dens = grow ? this.kelpDens() : 1;
    const tall = grow ? 1 + KELP_GROWTH.HEIGHT * this.lifeV : 1;
    const pk = pf === LAYERS.FAR.PF ? 'far' : 'near';
    const floor = this.planeFloor(pf);
    const full = strandsInChunk(chunk, spec, 1 + KELP_GROWTH.DENSITY);
    const n = Math.round(spec.perChunk * dens);
    for (let i = 0; i < Math.min(n, full.length); i++) {
      const s = full[i];
      const rootY = floor - this.terrainRise(s.x, pk) + 6;
      this.pushStrand(verts, s.x - origin, rootY, s.h * REF_H * tall, s.hw, s.ph, s.shade * 0.5);
    }
  }

  // Rolling seafloor silhouette (docs/09, keyed per plane since docs/10).
  buildTerrainChunk(verts, chunk, origin, pk) {
    const dpr = this.dpr;
    const pf = pk === 'main' ? 1 : (pk === 'far' ? LAYERS.FAR.PF : LAYERS.NEAR.PF);
    const floor = this.planeFloor(pf);
    const x0 = chunk * SEA.CHUNK_W, x1 = (chunk + 1) * SEA.CHUNK_W;
    for (let x = x0; x <= x1 + 0.1; x += TERR_SEG) {
      const top = floor - this.terrainRise(x, pk);
      const shade = 0.25 + 0.3 * terrainShape(x * 0.31 + 999, TERRAIN.SALT[pk] + 3);
      const xr = (x - origin) * dpr;
      if (x === x0 && verts.length) {
        const p = verts.length;
        verts.push(verts[p - 5], verts[p - 4], verts[p - 3], verts[p - 2], verts[p - 1]);
        verts.push(xr, top * dpr, 0, 0, shade);
      }
      verts.push(xr, top * dpr, 0, 0, shade);
      verts.push(xr, (floor + TERR_SINK) * dpr, 0, 0, shade);
    }
  }

  // Corals: short wide tufts on the terrain, growing in with LIFE (count
  // scales directly — the terrain is barren early, gardened late).
  buildCoralChunk(verts, chunk, origin, pk) {
    const amt = Math.pow(this.lifeV, 1.2);
    if (amt <= 0) return;
    const pf = pk === 'far' ? LAYERS.FAR.PF : LAYERS.NEAR.PF;
    const floor = this.planeFloor(pf);
    const list = strandsInChunk(chunk, CORAL_SPEC);
    const n = Math.round(list.length * amt);
    for (let i = 0; i < n; i++) {
      const s = list[i];
      const rootY = floor - this.terrainRise(s.x, pk) + 4;
      this.pushStrand(verts, s.x - origin, rootY, s.h * REF_H, s.hw, s.ph, 0.8 + s.shade * 0.2);
    }
  }

  // Rebuild a layer's buffer if its chunk window moved (or it's dirty).
  ensureLayer(L, camX) {
    const px0 = camX * L.pf - CHUNK_PAD, px1 = camX * L.pf + this.W + CHUNK_PAD;
    const c0 = Math.floor(px0 / SEA.CHUNK_W), c1 = Math.floor(px1 / SEA.CHUNK_W);
    if (!L.dirty && c0 === L.c0 && c1 === L.c1) return;
    L.dirty = false;
    L.c0 = c0; L.c1 = c1;
    L.origin = c0 * SEA.CHUNK_W;
    const verts = [];
    for (let c = c0; c <= c1; c++) L.build(verts, c, L.origin);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, L.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    L.verts = verts.length / 5;
  }

  // Silhouette fauna for one parallax plane (docs/07): a school of dim dots
  // around the wandering anchor + soft pulsing jelly blobs. Counts scale with
  // LIFE. Blend is already enabled by the plane pass. Camera-relative upload.
  drawPlaneFauna(pi, cfg, rw, rh, cam, t, sizeMul = 1) {
    const gl = this.gl, dpr = this.dpr, pl = this.planes[pi === 0 ? 0 : 1];
    const cx = cam.x * cfg.PF, cy = cam.y * cfg.PF;
    const nDots = Math.round(PLANE_MINNOWS[pi] * this.lifeV);
    if (nDots > 0) {
      const pd = this.faunaScratch;
      let n = 0;
      for (let k = 0; k < nDots; k++) {
        const d = pl.dots[k];
        const a = t * 0.5 + d.seed;
        pd[n++] = (pl.school.x + Math.cos(a) * d.r - cx) * dpr;
        pd[n++] = (pl.school.y + Math.sin(a) * d.r * 0.55 - cy) * dpr;
        pd[n++] = Math.max(1, PLANE_DOT_SIZE[pi] * dpr * sizeMul);
        pd[n++] = PLANE_DOT_ALPHA[pi] * (0.7 + 0.3 * Math.sin(t * 1.1 + d.seed * 3));
        pd[n++] = 3;   // dark silhouette kind — not a mote
      }
      gl.useProgram(this.pointProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.faunaBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pd.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.loc.point.pos);
      gl.enableVertexAttribArray(this.loc.point.aux);
      gl.vertexAttribPointer(this.loc.point.pos, 2, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(this.loc.point.aux, 3, gl.FLOAT, false, 20, 8);
      gl.uniform2f(this.loc.point.res, rw, rh);
      gl.drawArrays(gl.POINTS, 0, n / 5);
    }
    const nJel = Math.round(PLANE_JELLIES[pi] * this.lifeV);
    if (nJel > 0) {
      gl.blendFunc(gl.ONE, gl.ONE);   // the pulse shader is additive
      gl.useProgram(this.pulseProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(this.loc.pulse.pos);
      gl.vertexAttribPointer(this.loc.pulse.pos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(this.loc.pulse.res, rw, rh);
      for (let k = 0; k < nJel; k++) {
        const b = pl.jellies[k];
        const pulse = 0.5 + 0.5 * Math.sin(t * TAU / 3.4 + b.phase);
        gl.uniform2f(this.loc.pulse.center, (b.x - cx) * dpr, (b.y - cy) * dpr);
        gl.uniform1f(this.loc.pulse.radius, PLANE_JELLY_R[pi] * dpr * (0.85 + 0.2 * pulse));
        gl.uniform3f(this.loc.pulse.color, 0.45, 0.75, 0.8);
        gl.uniform1f(this.loc.pulse.alpha, PLANE_JELLY_ALPHA[pi] * (0.6 + 0.4 * pulse));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);   // planes need this back
    }
  }

  // LIFE axis value: plane fog + kelp/coral growth. Chunk buffers rebuild when
  // LIFE has moved enough that density/height visibly changed (cheap, rare).
  setLife(v) {
    if (this.ok && Math.abs(v - (this.builtLife ?? -1)) > 0.08) {
      this.builtLife = v;
      for (const L of Object.values(this.layers)) L.dirty = true;
    }
    this.lifeV = v;
  }

  update(dt, eel, cam) {
    if (!this.ok) return;
    this.t += dt;
    const t = this.t;
    this.eelX = eel.x; this.eelY = eel.y;
    this.eelPush = PUSH_BASE + PUSH_SLOPE * eel.speedSm;

    // Chunk windows track the CLEAN camera (the render camera shakes, and a
    // shake astride a chunk boundary would thrash rebuilds); the 480 px pad
    // covers any shake offset.
    for (const L of Object.values(this.layers)) this.ensureLayer(L, cam.x);

    // Motes live in world space but only near the camera: they wrap around the
    // (slightly expanded) view rect, so the visible density is constant.
    const left = cam.x - WRAP_PAD, top = cam.y - WRAP_PAD;
    const spanX = this.W + 2 * WRAP_PAD, spanY = this.H + 2 * WRAP_PAD;
    if (!this.motesSeeded) {
      this.motesSeeded = true;
      this.motes.length = 0;
      for (let i = 0; i < MOTE_COUNT; i++) {
        this.motes.push({
          x: left + Math.random() * spanX, y: top + Math.random() * spanY,
          vx: 0, vy: 0,
          size: MOTE_SIZE_MIN + Math.random() * MOTE_SIZE_VAR,
          seed: Math.random() * TAU,
        });
      }
    }

    if (!this.snowSeeded) {
      this.snowSeeded = true;
      this.snow.length = 0;
      for (let i = 0; i < SNOW_COUNT; i++) {
        this.snow.push({
          x: left + Math.random() * spanX, y: top + Math.random() * spanY,
          sink: SNOW_SINK_MIN + Math.random() * SNOW_SINK_VAR,
          size: SNOW_SIZE_MIN + Math.random() * SNOW_SIZE_VAR,
          seed: Math.random() * TAU,
        });
      }
    }

    // Marine snow: sink slowly, drift a little, wrap around the camera rect.
    for (const s of this.snow) {
      s.x += Math.sin(t * 0.3 + s.seed) * SNOW_WANDER * dt;
      s.y += s.sink * dt;
      if (s.x < left) s.x += spanX; else if (s.x > left + spanX) s.x -= spanX;
      if (s.y > top + spanY) { s.y -= spanY; s.x = left + Math.random() * spanX; }
      else if (s.y < top) s.y += spanY;
    }

    // Light pulses just age.
    for (const p of this.pulses) p.age += dt;

    // Background plane fauna: the dot-school anchor wanders and the jelly
    // blobs bob, all wrapping around their plane's camera window so the
    // planes always read as inhabited (density scales with LIFE at render).
    for (const pl of this.planes) {
      const pf = pl.cfg.PF;
      const px0 = cam.x * pf - PLANE_WRAP_PAD, py0 = cam.y * pf - PLANE_WRAP_PAD;
      const wSpanX = this.W + 2 * PLANE_WRAP_PAD, wSpanY = this.H + 2 * PLANE_WRAP_PAD;
      const wrap = o => {
        if (o.x < px0) o.x += wSpanX; else if (o.x > px0 + wSpanX) o.x -= wSpanX;
        if (o.y < py0) o.y += wSpanY; else if (o.y > py0 + wSpanY) o.y -= wSpanY;
      };
      const s = pl.school;
      s.hd += Math.sin(t * 0.19 + s.seed) * 0.5 * dt;
      s.x += Math.cos(s.hd) * PLANE_SCHOOL_SPEED * dt;
      s.y += Math.sin(s.hd) * PLANE_SCHOOL_SPEED * 0.5 * dt;
      wrap(s);
      for (const b of pl.jellies) {
        b.x += Math.sin(t * 0.11 + b.seed) * 8 * dt;
        b.y += (-4 + Math.sin(t * 0.23 + b.seed * 2) * 6) * dt;
        wrap(b);
      }
    }

    // Motes: lazy wander + scatter away from a fast eel.
    for (const m of this.motes) {
      m.vx += Math.sin(t * 0.5 + m.seed) * MOTE_WANDER * dt;
      m.vy += Math.cos(t * 0.4 + m.seed * 1.7) * MOTE_WANDER * dt;
      const dx = m.x - eel.x, dy = m.y - eel.y;
      const d = Math.hypot(dx, dy);
      if (d < REPEL_RADIUS && d > 0.01) {
        const f = (1 - d / REPEL_RADIUS) * MOTE_REPEL * eel.speed01 * dt;
        m.vx += (dx / d) * f;
        m.vy += (dy / d) * f;
      }
      const damp = Math.exp(-dt * MOTE_DAMP);
      m.vx *= damp; m.vy *= damp;
      m.x += m.vx * dt; m.y += m.vy * dt;
      // wrap around the camera rect so re-entry isn't visible
      if (m.x < left) m.x += spanX; else if (m.x > left + spanX) m.x -= spanX;
      if (m.y < top) m.y += spanY; else if (m.y > top + spanY) m.y -= spanY;
    }

    // Bubbles: emitted from the mouth while the eel works, rise and pop offscreen.
    if (eel.effort > BUBBLE_MIN_EFFORT) {
      this.spawnAcc += dt * (BUBBLE_RATE_BASE + BUBBLE_RATE_SLOPE * eel.effort);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        const b = this.bubbles.find(b => b.life <= 0);
        if (!b) break;
        b.x = eel.x + eel.hx * BUBBLE_MOUTH_OFF + (Math.random() - 0.5) * BUBBLE_JITTER;
        b.y = eel.y + eel.hy * BUBBLE_MOUTH_OFF + (Math.random() - 0.5) * BUBBLE_JITTER;
        b.vx = eel.hx * BUBBLE_KICK * eel.speed01;
        b.vy = -BUBBLE_RISE0 - Math.random() * BUBBLE_RISE_VAR;
        b.life = BUBBLE_LIFE_MIN + Math.random() * BUBBLE_LIFE_VAR;
        b.size = BUBBLE_SIZE_MIN + Math.random() * BUBBLE_SIZE_VAR;
        b.seed = Math.random() * TAU;
      }
    }
    for (const b of this.bubbles) {
      if (b.life <= 0) continue;
      b.vy = Math.max(b.vy - BUBBLE_BUOY * dt, -BUBBLE_RISE_MAX);        // buoyancy
      b.vx += Math.sin(t * BUBBLE_WOBBLE_F + b.seed) * BUBBLE_WOBBLE * dt;  // wobble
      b.vx *= Math.exp(-dt * BUBBLE_DRAG);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.y < 5) b.life = 0;   // popped at the surface
    }
  }

  // LIGHT-axis palette + strengths, from tuning.lightParams(light01).
  setLight(params) {
    this.lightP = params;
  }

  // Blank-slate reset (docs/08): bubbles and pulses out (motes/snow are the
  // barren sea's own texture — they stay).
  clear() {
    if (!this.ok) return;
    for (const b of this.bubbles) b.life = 0;
    for (const p of this.pulses) p.age = 1e9;
    this.spawnAcc = 0;
  }

  // An expanding additive light pulse at a world point (docs/06): color is the
  // food's axis signature, size/strength scale with its progression amount.
  pulse(x, y, color, amount) {
    if (!this.ok) return;
    const p = this.pulses.find(p => p.age >= p.dur) || this.pulses[0];
    p.x = x; p.y = y;
    p.color = color;
    p.age = 0;
    p.dur = PULSE_T_BASE + PULSE_T_AMT * amount;
    p.r = PULSE_R_BASE + PULSE_R_AMT * amount;
    p.a = Math.min(1, PULSE_A_BASE + PULSE_A_AMT * amount);
  }

  // One small bubble (food trails, critter darts). Pool-shared; may no-op.
  emitBubble(x, y, size = 2.4, life = 1.2) {
    if (!this.ok) return;
    const b = this.bubbles.find(b => b.life <= 0);
    if (!b) return;
    b.x = x; b.y = y;
    b.vx = (Math.random() - 0.5) * 16;
    b.vy = -12 - Math.random() * 14;
    b.life = life * (0.75 + Math.random() * 0.5);
    b.size = size * (0.8 + Math.random() * 0.5);
    b.seed = Math.random() * TAU;
  }

  // A one-shot puff of bubbles at a world point (the eat flourish). Draws
  // from the same pool as mouth bubbles; silently emits fewer if it's busy.
  burst(x, y, count = BURST_COUNT) {
    if (!this.ok) return;
    for (let k = 0; k < count; k++) {
      const b = this.bubbles.find(b => b.life <= 0);
      if (!b) break;
      b.x = x + (Math.random() - 0.5) * BURST_SCATTER;
      b.y = y + (Math.random() - 0.5) * BURST_SCATTER;
      b.vx = (Math.random() - 0.5) * BURST_VX;
      b.vy = -BURST_RISE0 - Math.random() * BURST_RISE_VAR;
      b.life = BURST_LIFE_MIN + Math.random() * BURST_LIFE_VAR;
      b.size = BUBBLE_SIZE_MIN + Math.random() * BUBBLE_SIZE_VAR;
      b.seed = Math.random() * TAU;
    }
  }

  bindKelpProg(cam, t, rw, rh) {
    const gl = this.gl, dpr = this.dpr;
    gl.useProgram(this.kelpProg);
    gl.enableVertexAttribArray(this.loc.kelp.xy);
    gl.enableVertexAttribArray(this.loc.kelp.aux);
    gl.uniform2f(this.loc.kelp.res, rw, rh);
    gl.uniform2f(this.loc.kelp.eel, (this.eelX - cam.x) * dpr, (this.eelY - cam.y) * dpr);
    gl.uniform1f(this.loc.kelp.t, t);
    gl.uniform1f(this.loc.kelp.dpr, dpr);
    gl.uniform1f(this.loc.kelp.worldH, this.worldH * dpr);
    gl.uniform1f(this.loc.kelp.tip, KELP_TIP_LIGHT);
    gl.uniform2f(this.loc.kelp.jit, 0, 0);   // the jitter taps retired (docs/10)
  }

  strip(L, push, dim, colFar, colNear, alpha, cam) {
    if (!L.verts) return;
    const gl = this.gl, dpr = this.dpr;
    gl.bindBuffer(gl.ARRAY_BUFFER, L.buf);
    gl.vertexAttribPointer(this.loc.kelp.xy, 2, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(this.loc.kelp.aux, 3, gl.FLOAT, false, 20, 8);
    // float64 in JS: origin − planeCam stays view-sized forever (docs/09)
    gl.uniform2f(this.loc.kelp.off,
      (L.origin - cam.x * L.pf) * dpr, -cam.y * L.pf * dpr);
    gl.uniform1f(this.loc.kelp.push, push);
    gl.uniform1f(this.loc.kelp.dim, dim);
    gl.uniform1f(this.loc.kelp.alpha, alpha);
    gl.uniform3f(this.loc.kelp.colFar, colFar[0], colFar[1], colFar[2]);
    gl.uniform3f(this.loc.kelp.colNear, colNear[0], colNear[1], colNear[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, L.verts);
  }

  // One behind-plane's strips (terrain, corals, kelp) in its fog tones.
  // The far plane takes an EXTRA pull toward the water color (LAYERS.FAR.FOG,
  // docs/10) — depth reads as haze, not blur (the blur routine was removed).
  drawPlaneEntries(key, cfg, cam, alpha) {
    const lp = this.lightP;
    const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    const fog = c => (cfg.FOG ? mix3(c, lp.deep, cfg.FOG) : c);
    const terrA = fog(mix3(lp.deep, lp.surface, TERR_FOG));
    const terrB = fog(mix3(lp.deep, lp.surface, TERR_FOG * 0.45));
    const Ls = this.layers;
    let entries;
    if (key === 'far') {
      const vis = WALL_FOG_BASE + WALL_FOG_LIFE * this.lifeV;
      const kA = fog(mix3(lp.deep, KELP_COL_FAR, vis));
      const kB = fog(mix3(lp.deep, KELP_COL_NEAR, vis));
      const cC = fog(mix3(lp.deep, CORAL_COL, vis + 0.15));
      entries = [[Ls.terrFar, terrA, terrB], [Ls.coralFar, cC, cC], [Ls.wall, kA, kB]];
    } else {
      const vis = NEAR_FOG_BASE + NEAR_FOG_LIFE * this.lifeV;
      const kA = mix3(lp.deep, KELP_COL_FAR, vis);
      const kB = mix3(lp.deep, KELP_COL_NEAR, vis);
      const cC = mix3(lp.deep, CORAL_COL, vis + 0.15);
      entries = [[Ls.terrNear, terrA, terrB], [Ls.coralNear, cC, cC], [Ls.nearK, kA, kB]];
    }
    for (const [L, cA, cB] of entries) this.strip(L, 0, lp.kelpDim, cA, cB, alpha, cam);
  }

  render(cam) {
    if (!this.ok) return;
    const gl = this.gl, dpr = this.dpr;
    // shader clock wrapped to its exact common period — a raw long-session
    // timestamp loses precision on the GPU (fp16/fp32) and stutters the rays
    const t = this.t % T_WRAP;
    const rw = this.canvas.width, rh = this.canvas.height;

    gl.disable(gl.BLEND);

    // 1. background — camera x pre-wrapped to the ray/shimmer period (docs/09)
    const camWX = (((cam.x % BG_WRAP) + BG_WRAP) % BG_WRAP) * dpr;
    gl.useProgram(this.bgProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(this.loc.bg.pos);
    gl.vertexAttribPointer(this.loc.bg.pos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(this.loc.bg.res, rw, rh);
    gl.uniform2f(this.loc.bg.ref, REF_W * dpr, REF_H * dpr);
    gl.uniform2f(this.loc.bg.cam, camWX, cam.y * dpr);
    gl.uniform1f(this.loc.bg.worldH, this.worldH * dpr);
    gl.uniform1f(this.loc.bg.t, t);
    const lp = this.lightP;
    gl.uniform3f(this.loc.bg.deep, lp.deep[0], lp.deep[1], lp.deep[2]);
    gl.uniform3f(this.loc.bg.surface, lp.surface[0], lp.surface[1], lp.surface[2]);
    gl.uniform1f(this.loc.bg.ray, lp.ray);
    gl.uniform1f(this.loc.bg.shim, lp.shim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. strips: the behind-planes drawn sharp with their fog tones (far
    //    first, deepest), then the main forest. All placed via u_off (docs/09).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.bindKelpProg(cam, t, rw, rh);
    this.drawPlaneEntries('far', LAYERS.FAR, cam, LAYERS.FAR.ALPHA);
    this.drawPlaneFauna(1, LAYERS.FAR, rw, rh, cam, t);
    this.bindKelpProg(cam, t, rw, rh);   // fauna switched programs
    this.drawPlaneEntries('near', LAYERS.NEAR, cam, LAYERS.NEAR.ALPHA);
    this.drawPlaneFauna(0, LAYERS.NEAR, rw, rh, cam, t);

    // main forest: opaque, eel-parted, sharp — the seafloor roll first
    // (docs/10), then kelp and grass over it.
    gl.disable(gl.BLEND);
    this.bindKelpProg(cam, t, rw, rh);
    const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    // main floor gets its OWN visibility, well above the far-plane fog tones:
    // the abyss veil eats most contrast down there, and a subtle water-mix
    // read as no floor at all (Matt, 2026-07-05) — these are real dune tones
    const terrMainA = mix3(lp.deep, lp.surface, 0.42);
    const terrMainB = mix3(lp.deep, lp.surface, 0.20);
    const Ls = this.layers;
    this.strip(Ls.terrMain, 0, lp.kelpDim, terrMainA, terrMainB, 1, cam);
    this.strip(Ls.kelp, this.eelPush, lp.kelpDim, KELP_COL_FAR, KELP_COL_NEAR, 1, cam);
    this.strip(Ls.grass, this.eelPush, lp.kelpDim, GRASS_COL_A, GRASS_COL_B, 1, cam);

    // 3. particles — uploaded camera-relative (docs/09)
    let n = 0;
    const pd = this.pointData;
    const cx = cam.x, cy = cam.y;
    for (const m of this.motes) {
      pd[n++] = (m.x - cx) * dpr; pd[n++] = (m.y - cy) * dpr;
      pd[n++] = m.size * dpr;
      pd[n++] = MOTE_ALPHA + MOTE_TWINKLE * (0.5 + 0.5 * Math.sin(t * MOTE_TWINKLE_F + m.seed * 3));
      pd[n++] = 0;
    }
    for (const s of this.snow) {
      pd[n++] = (s.x - cx) * dpr; pd[n++] = (s.y - cy) * dpr;
      pd[n++] = s.size * dpr;
      pd[n++] = SNOW_ALPHA + SNOW_TWINKLE * (0.5 + 0.5 * Math.sin(t * 0.5 + s.seed * 2));
      pd[n++] = 0;
    }
    for (const b of this.bubbles) {
      if (b.life <= 0) continue;
      pd[n++] = (b.x - cx) * dpr; pd[n++] = (b.y - cy) * dpr;
      pd[n++] = b.size * dpr;
      pd[n++] = Math.min(1, b.life / BUBBLE_FADE) * BUBBLE_ALPHA;
      pd[n++] = b.size < RING_MIN_SIZE ? 0 : 1;   // micro-bubbles read as discs
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.pointProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pd.subarray(0, n), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.loc.point.pos);
    gl.enableVertexAttribArray(this.loc.point.aux);
    gl.vertexAttribPointer(this.loc.point.pos, 2, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(this.loc.point.aux, 3, gl.FLOAT, false, 20, 8);
    gl.uniform2f(this.loc.point.res, rw, rh);
    gl.drawArrays(gl.POINTS, 0, n / 5);

    // 4. light pulses — additive expanding glows, one small draw each
    let anyPulse = false;
    for (const p of this.pulses) if (p.age < p.dur) { anyPulse = true; break; }
    if (anyPulse) {
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.pulseProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(this.loc.pulse.pos);
      gl.vertexAttribPointer(this.loc.pulse.pos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(this.loc.pulse.res, rw, rh);
      for (const p of this.pulses) {
        if (p.age >= p.dur) continue;
        const u = p.age / p.dur;
        const ease = u * u * (3 - 2 * u);
        gl.uniform2f(this.loc.pulse.center, (p.x - cam.x) * dpr, (p.y - cam.y) * dpr);
        gl.uniform1f(this.loc.pulse.radius, p.r * dpr * (0.35 + 0.65 * ease));
        gl.uniform3f(this.loc.pulse.color, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(this.loc.pulse.alpha, p.a * (1 - u) * (1 - u));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
  }
}
