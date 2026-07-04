// The living kelp forest: one WebGL canvas, three draw calls
// (see docs/03-environment.md).
//   1. background — procedural gradient + god rays, fullscreen fragment shader
//   2. kelp — one degenerate triangle strip, all sway + eel-push in the vertex shader
//   3. particles — motes (eel-repelled) + bubbles (eel-emitted), one dynamic point buffer

import { TAU, lerp, clamp, curves } from './math.js';
import { LAYERS, KELP_GROWTH, DIALS } from './tuning.js';

// JS-side sim knobs live here; shape/color numbers inside the shader strings
// below deliberately stay next to the effect they control (see docs/03).
const REF_W = 1920, REF_H = 1080;  // world sizing is in reference-screen units

// Kelp (geometry built once per resize; heights are fractions of REF_H, px otherwise)
const KELP_PER_SCREEN = 22;    // strands per reference-screen-width of world floor
const KELP_FAR_FRAC = 12 / 22; // fraction in the dimmer/shorter back layer
const KELP_SEGS = 16;
const KELP_FAR_H_MIN = 0.35, KELP_FAR_H_VAR = 0.30;   // back-layer strand heights
const KELP_NEAR_H_MIN = 0.55, KELP_NEAR_H_VAR = 0.40; // front-layer strand heights
const KELP_FAR_W_MIN = 6, KELP_FAR_W_VAR = 4;         // base half-widths, px
const KELP_NEAR_W_MIN = 9, KELP_NEAR_W_VAR = 7;
const PUSH_BASE = 0.25;        // kelp-part strength at rest...
const PUSH_SLOPE = 0.75;       // ...plus this at full eel speed
const KELP_COL_FAR = [0.055, 0.165, 0.125];   // main kelp palette (was in the shader)
const KELP_COL_NEAR = [0.012, 0.070, 0.052];
const KELP_TIP_LIGHT = 3.5;   // per-vertex depth lighting gain: strands brighten
                              // with the water's own gradient curve (1 + gain ×
                              // surfaceness). Flat-colored strands read far too
                              // dark where their tips reach bright water, and a
                              // small gain is invisible on near-black greens.

// Parallax planes (docs/03): both behind the main forest, drawn with the kelp
// program at reduced camera factors + jitter-tap fake blur (tuning.LAYERS).
const ROCK_COUNT = 26;
const ROCK_W_MIN = 60, ROCK_W_VAR = 110;      // half-width at the base, px
const ROCK_H_MIN = 260, ROCK_H_VAR = 620;     // spire height, px
const ROCK_FOG = 0.14;      // rock tone: this far from deep-water color toward surface
const WALL_COUNT = 34;      // far-plane kelp strands
const WALL_H_MIN = 0.45, WALL_H_VAR = 0.45;   // heights, fraction of REF_H
const WALL_W_MIN = 5, WALL_W_VAR = 5;         // base half-widths, px
const WALL_FOG_BASE = 0.18;  // far kelp visibility above the water color...
const WALL_FOG_LIFE = 0.45;  // ...plus this at full LIFE
const NEAR_COUNT = 18;       // near-behind-plane kelp strands
const NEAR_H_MIN = 0.5, NEAR_H_VAR = 0.5;
const NEAR_W_MIN = 7, NEAR_W_VAR = 6;

// Seagrass (docs/07, LIFE `seagrass` dial): short bright tufts along the
// floor — sparse at first, denser and taller as LIFE grows.
const GRASS_MAX = 130;       // blades at full dial
const GRASS_H_MIN = 0.024, GRASS_H_VAR = 0.045;  // heights, fraction of REF_H
const GRASS_W_MIN = 1.2, GRASS_W_VAR = 1.4;      // base half-widths, px
const GRASS_COL_A = [0.10, 0.30, 0.17];          // brighter than kelp — grass
const GRASS_COL_B = [0.045, 0.17, 0.10];
const NEAR_FOG_BASE = 0.4;   // near plane sits closer to the true kelp tones
const NEAR_FOG_LIFE = 0.4;
// jitter directions for the fake blur taps (scaled by each plane's BLUR)
const BLUR_JIT = [[0, 0], [0.8, 0.55], [-0.7, -0.6], [0.35, -0.9]];

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

// Boost sparks (docs/07): electric-blue jitter motes streamed off the eel
const SPARK_POOL = 48;
const SPARK_LIFE = 0.55;       // s
const SPARK_SIZE_MIN = 2.6, SPARK_SIZE_VAR = 2.0;   // px
const SPARK_JITTER = 260;      // px/s² random fizz
const SPARK_DRAG = 2.2;        // 1/s
const SPARK_ALPHA = 0.9;

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
precision mediump float;
uniform vec2 u_res;
uniform vec2 u_ref;        // reference screen size, device px (world-fixed scale)
uniform vec2 u_cam;        // camera top-left, device px, world y-down
uniform float u_worldH;    // world height, device px
uniform float u_t;
uniform vec3 u_deep;       // LIGHT-axis palette + strengths (see docs/03, tuning.js)
uniform vec3 u_surface;
uniform float u_ray;
uniform float u_shim;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  // world position of this fragment (y-down: 0 = surface, u_worldH = floor)
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
attribute vec2 a_xy;       // world position, device px
attribute vec3 a_aux;      // frac up the strand, phase, shade
uniform vec2 u_res;
uniform vec2 u_cam;        // camera top-left, device px
uniform float u_pf;        // parallax factor (1 = the main plane)
uniform vec2 u_jit;        // blur-tap jitter offset, device px
uniform vec2 u_eel;        // world position, device px
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
  vec2 clip = (p - u_cam * u_pf) / u_res * 2.0 - 1.0;
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
attribute vec2 a_pos;      // world position, device px
attribute vec3 a_aux;      // size (device px), alpha, kind (0 mote / 1 bubble)
uniform vec2 u_res;
uniform vec2 u_cam;
uniform float u_pf;        // parallax factor (1 = main plane)
varying float v_alpha;
varying float v_kind;
void main() {
  vec2 clip = (a_pos - u_cam * u_pf) / u_res * 2.0 - 1.0;
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
uniform vec2 u_cam;
uniform float u_pf;        // parallax factor (1 = main plane)
uniform vec2 u_center;     // world position, device px
uniform float u_radius;    // device px
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  vec2 clip = (u_center + a_pos * u_radius - u_cam * u_pf) / u_res * 2.0 - 1.0;
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
              cam: gl.getUniformLocation(this.kelpProg, 'u_cam'),
              pf: gl.getUniformLocation(this.kelpProg, 'u_pf'),
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
               res: gl.getUniformLocation(this.pointProg, 'u_res'),
               cam: gl.getUniformLocation(this.pointProg, 'u_cam'),
               pf: gl.getUniformLocation(this.pointProg, 'u_pf') },
      pulse: { pos: gl.getAttribLocation(this.pulseProg, 'a_pos'),
               res: gl.getUniformLocation(this.pulseProg, 'u_res'),
               cam: gl.getUniformLocation(this.pulseProg, 'u_cam'),
               pf: gl.getUniformLocation(this.pulseProg, 'u_pf'),
               center: gl.getUniformLocation(this.pulseProg, 'u_center'),
               radius: gl.getUniformLocation(this.pulseProg, 'u_radius'),
               color: gl.getUniformLocation(this.pulseProg, 'u_color'),
               alpha: gl.getUniformLocation(this.pulseProg, 'u_alpha') },
    };

    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.kelpBuf = gl.createBuffer();
    this.kelpVerts = 0;
    this.rockBuf = gl.createBuffer();
    this.rockVerts = 0;
    this.wallBuf = gl.createBuffer();
    this.wallVerts = 0;
    this.nearBuf = gl.createBuffer();
    this.nearVerts = 0;
    this.grassBuf = gl.createBuffer();
    this.grassVerts = 0;
    this.faunaBuf = gl.createBuffer();
    this.lifeV = 0;         // LIFE axis value, set by main
    this.builtLife = -1;    // kelp geometry rebuilds when LIFE moves enough

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
    this.faunaScratch = new Float32Array(Math.max(...PLANE_MINNOWS) * 5);

    this.pointBuf = gl.createBuffer();
    this.pointData = new Float32Array((MOTE_COUNT + BUBBLE_POOL + SNOW_COUNT + SPARK_POOL) * 5);
    this.sparks = [];
    for (let i = 0; i < SPARK_POOL; i++) {
      this.sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 2, seed: Math.random() * TAU });
    }

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

  resize(W, H, dpr, worldW, worldH) {
    this.W = W; this.H = H; this.dpr = dpr;
    this.worldW = worldW; this.worldH = worldH;
    if (!this.ok) return;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.buildKelp();
    this.buildSilhouettes();
    this.builtLife = this.lifeV;
    this.motesSeeded = false;   // reseed around the camera on next update
    this.snowSeeded = false;
  }

  // Kelp lines the whole world floor; sizes are in reference-screen units so
  // the forest looks identical regardless of window size. Density and height
  // grow with the LIFE axis (tuning.KELP_GROWTH) — geometry rebuilds when
  // LIFE has moved enough (see setLife).
  buildKelp() {
    const { dpr, worldW, worldH } = this;
    const dens = 1 + KELP_GROWTH.DENSITY * this.lifeV;
    const tall = 1 + KELP_GROWTH.HEIGHT * this.lifeV;
    const count = Math.round(KELP_PER_SCREEN * worldW / REF_W * dens);
    const farCount = Math.round(count * KELP_FAR_FRAC);
    const verts = [];
    const push = (x, y, frac, ph, shade) => verts.push(x * dpr, y * dpr, frac, ph, shade);
    for (let k = 0; k < count; k++) {
      const far = k < farCount;
      const x = Math.random() * worldW;
      const h = (far ? KELP_FAR_H_MIN + Math.random() * KELP_FAR_H_VAR
                     : KELP_NEAR_H_MIN + Math.random() * KELP_NEAR_H_VAR) * REF_H * tall;
      const hw = far ? KELP_FAR_W_MIN + Math.random() * KELP_FAR_W_VAR
                     : KELP_NEAR_W_MIN + Math.random() * KELP_NEAR_W_VAR;
      const ph = Math.random() * TAU;
      const shade = far ? 0.15 + Math.random() * 0.2 : 0.75 + Math.random() * 0.25;
      for (let j = 0; j <= KELP_SEGS; j++) {
        const frac = j / KELP_SEGS;
        const y = worldH + 4 - h * frac;
        const wj = hw * (1 - frac * 0.85) + 0.6;
        if (j === 0 && k > 0) {
          // degenerate join: repeat previous strand's last vertex + this strand's first
          const p = verts.length;
          verts.push(verts[p - 5], verts[p - 4], verts[p - 3], verts[p - 2], verts[p - 1]);
          push(x - wj, y, frac, ph, shade);
        }
        push(x - wj, y, frac, ph, shade);
        push(x + wj, y, frac, ph, shade);
      }
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.kelpBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    this.kelpVerts = verts.length / 5;
  }

  // Parallax silhouettes (docs/03): rock spires + kelp strands for the far
  // plane, and a kelp buffer for the near-behind plane — all in the kelp
  // vertex layout with degenerate joins. Strand counts/heights grow with LIFE.
  buildSilhouettes() {
    const { dpr, worldW, worldH } = this;
    const floor = worldH + 4;
    const dens = 1 + KELP_GROWTH.DENSITY * this.lifeV;
    const tall = 1 + KELP_GROWTH.HEIGHT * this.lifeV;

    const strands = (verts, count, hMin, hVar, wMin, wVar) => {
      const push = (x, y, frac, ph, shade) => verts.push(x * dpr, y * dpr, frac, ph, shade);
      for (let k = 0; k < count; k++) {
        const x = Math.random() * worldW;
        const h = (hMin + Math.random() * hVar) * REF_H * tall;
        const hw = wMin + Math.random() * wVar;
        const ph = Math.random() * TAU;
        const shade = Math.random() * 0.5;
        for (let j = 0; j <= KELP_SEGS; j++) {
          const frac = j / KELP_SEGS;
          const y = floor - h * frac;
          const wj = hw * (1 - frac * 0.85) + 0.5;
          if (j === 0 && verts.length) {
            const p = verts.length;
            verts.push(verts[p - 5], verts[p - 4], verts[p - 3], verts[p - 2], verts[p - 1]);
            push(x - wj, y, frac, ph, shade);
          }
          push(x - wj, y, frac, ph, shade);
          push(x + wj, y, frac, ph, shade);
        }
      }
    };

    const rocks = [];
    const pushR = (x, y, shade) => rocks.push(x * dpr, y * dpr, 0, 0, shade);
    for (let k = 0; k < ROCK_COUNT; k++) {
      const x = Math.random() * worldW;
      const hw = ROCK_W_MIN + Math.random() * ROCK_W_VAR;
      const h = ROCK_H_MIN + Math.random() * ROCK_H_VAR;
      const tip = x + (Math.random() - 0.5) * hw * 0.8;
      const shade = Math.random();
      if (k > 0) {   // degenerate join between spires
        const p = rocks.length;
        rocks.push(rocks[p - 5], rocks[p - 4], 0, 0, rocks[p - 1]);
        pushR(x - hw, floor, shade);
      }
      pushR(x - hw, floor, shade);
      pushR(x + hw, floor, shade);
      pushR(tip, floor - h, shade);
    }

    const wall = [];
    strands(wall, Math.round(WALL_COUNT * dens), WALL_H_MIN, WALL_H_VAR, WALL_W_MIN, WALL_W_VAR);
    const near = [];
    strands(near, Math.round(NEAR_COUNT * dens), NEAR_H_MIN, NEAR_H_VAR, NEAR_W_MIN, NEAR_W_VAR);
    // seagrass: count from its own LIFE dial, height stretching with the dial too
    const gd = DIALS.seagrass;
    const grassAmt = gd.max * curves[gd.curve](clamp((this.lifeV - gd.threshold) / gd.rampWidth, 0, 1));
    const grass = [];
    if (grassAmt > 0) {
      const stretch = 0.55 + 0.7 * grassAmt;
      strands(grass, Math.round(GRASS_MAX * grassAmt),
        GRASS_H_MIN * stretch, GRASS_H_VAR * stretch, GRASS_W_MIN, GRASS_W_VAR);
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rockBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rocks), gl.STATIC_DRAW);
    this.rockVerts = rocks.length / 5;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.wallBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(wall), gl.STATIC_DRAW);
    this.wallVerts = wall.length / 5;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nearBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(near), gl.STATIC_DRAW);
    this.nearVerts = near.length / 5;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.grassBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(grass), gl.STATIC_DRAW);
    this.grassVerts = grass.length / 5;
  }

  // Silhouette fauna for one parallax plane (docs/07): a school of dim dots
  // around the wandering anchor + soft pulsing jelly blobs. Counts scale with
  // LIFE. Blend is already enabled by the plane pass.
  drawPlaneFauna(pi, cfg, rw, rh, camX, camY, t) {
    const gl = this.gl, dpr = this.dpr, pl = this.planes[pi === 0 ? 0 : 1];
    const nDots = Math.round(PLANE_MINNOWS[pi] * this.lifeV);
    if (nDots > 0) {
      const pd = this.faunaScratch;
      let n = 0;
      for (let k = 0; k < nDots; k++) {
        const d = pl.dots[k];
        const a = t * 0.5 + d.seed;
        pd[n++] = (pl.school.x + Math.cos(a) * d.r) * dpr;
        pd[n++] = (pl.school.y + Math.sin(a) * d.r * 0.55) * dpr;
        pd[n++] = PLANE_DOT_SIZE[pi] * dpr;
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
      gl.uniform2f(this.loc.point.cam, camX, camY);
      gl.uniform1f(this.loc.point.pf, cfg.PF);
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
      gl.uniform2f(this.loc.pulse.cam, camX, camY);
      gl.uniform1f(this.loc.pulse.pf, cfg.PF);
      for (let k = 0; k < nJel; k++) {
        const b = pl.jellies[k];
        const pulse = 0.5 + 0.5 * Math.sin(t * TAU / 3.4 + b.phase);
        gl.uniform2f(this.loc.pulse.center, b.x * dpr, b.y * dpr);
        gl.uniform1f(this.loc.pulse.radius, PLANE_JELLY_R[pi] * dpr * (0.85 + 0.2 * pulse));
        gl.uniform3f(this.loc.pulse.color, 0.45, 0.75, 0.8);
        gl.uniform1f(this.loc.pulse.alpha, PLANE_JELLY_ALPHA[pi] * (0.6 + 0.4 * pulse));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);   // planes need this back
    }
  }

  // LIFE axis value: plane fog + kelp growth. Geometry rebuilds when LIFE has
  // moved enough that density/height visibly changed (cheap, rare).
  setLife(v) {
    this.lifeV = v;
    if (this.ok && Math.abs(v - this.builtLife) > 0.08) {
      this.builtLife = v;
      this.buildKelp();
      this.buildSilhouettes();
    }
  }

  update(dt, eel, cam) {
    if (!this.ok) return;
    this.t += dt;
    const t = this.t;
    this.eelX = eel.x; this.eelY = eel.y;
    this.eelPush = PUSH_BASE + PUSH_SLOPE * eel.speedSm;

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
      const spanX = this.W + 2 * PLANE_WRAP_PAD, spanY = this.H + 2 * PLANE_WRAP_PAD;
      const wrap = o => {
        if (o.x < px0) o.x += spanX; else if (o.x > px0 + spanX) o.x -= spanX;
        if (o.y < py0) o.y += spanY; else if (o.y > py0 + spanY) o.y -= spanY;
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

    // Sparks: fizzing electric motes — jitter, drag, die fast.
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.vx += (Math.random() - 0.5) * SPARK_JITTER * dt;
      s.vy += (Math.random() - 0.5) * SPARK_JITTER * dt;
      const damp = Math.exp(-dt * SPARK_DRAG);
      s.vx *= damp; s.vy *= damp;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.life -= dt;
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

  // One electric boost spark (docs/07), inheriting some source velocity.
  spark(x, y, vx, vy) {
    if (!this.ok) return;
    const s = this.sparks.find(s => s.life <= 0);
    if (!s) return;
    s.x = x; s.y = y;
    s.vx = vx + (Math.random() - 0.5) * 60;
    s.vy = vy + (Math.random() - 0.5) * 60;
    s.life = SPARK_LIFE * (0.7 + Math.random() * 0.6);
    s.size = SPARK_SIZE_MIN + Math.random() * SPARK_SIZE_VAR;
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

  render(cam) {
    if (!this.ok) return;
    const gl = this.gl, t = this.t, dpr = this.dpr;
    const camX = cam.x * dpr, camY = cam.y * dpr;
    const rw = this.canvas.width, rh = this.canvas.height;

    gl.disable(gl.BLEND);

    // 1. background
    gl.useProgram(this.bgProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(this.loc.bg.pos);
    gl.vertexAttribPointer(this.loc.bg.pos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(this.loc.bg.res, rw, rh);
    gl.uniform2f(this.loc.bg.ref, REF_W * dpr, REF_H * dpr);
    gl.uniform2f(this.loc.bg.cam, camX, camY);
    gl.uniform1f(this.loc.bg.worldH, this.worldH * dpr);
    gl.uniform1f(this.loc.bg.t, t);
    const lp = this.lightP;
    gl.uniform3f(this.loc.bg.deep, lp.deep[0], lp.deep[1], lp.deep[2]);
    gl.uniform3f(this.loc.bg.surface, lp.surface[0], lp.surface[1], lp.surface[2]);
    gl.uniform1f(this.loc.bg.ray, lp.ray);
    gl.uniform1f(this.loc.bg.shim, lp.shim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. parallax planes (both BEHIND the forest, docs/03) then the main kelp.
    //    Plane "blur" = jittered semi-transparent re-draws (no framebuffers).
    gl.useProgram(this.kelpProg);
    gl.enableVertexAttribArray(this.loc.kelp.xy);
    gl.enableVertexAttribArray(this.loc.kelp.aux);
    gl.uniform2f(this.loc.kelp.res, rw, rh);
    gl.uniform2f(this.loc.kelp.cam, camX, camY);
    gl.uniform2f(this.loc.kelp.eel, this.eelX * dpr, this.eelY * dpr);
    gl.uniform1f(this.loc.kelp.t, t);
    gl.uniform1f(this.loc.kelp.dpr, dpr);
    gl.uniform1f(this.loc.kelp.worldH, this.worldH * dpr);
    gl.uniform1f(this.loc.kelp.tip, KELP_TIP_LIGHT);
    const strip = (buf, verts, pf, push, dim, colFar, colNear, alpha, jx, jy) => {
      if (!verts) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(this.loc.kelp.xy, 2, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(this.loc.kelp.aux, 3, gl.FLOAT, false, 20, 8);
      gl.uniform1f(this.loc.kelp.pf, pf);
      gl.uniform2f(this.loc.kelp.jit, jx || 0, jy || 0);
      gl.uniform1f(this.loc.kelp.push, push);
      gl.uniform1f(this.loc.kelp.dim, dim);
      gl.uniform1f(this.loc.kelp.alpha, alpha);
      gl.uniform3f(this.loc.kelp.colFar, colFar[0], colFar[1], colFar[2]);
      gl.uniform3f(this.loc.kelp.colNear, colNear[0], colNear[1], colNear[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts);
    };
    // fog tones: silhouettes sit between the water color and their own hue
    // (lp was set for the bg pass above)
    const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    const rockA = mix3(lp.deep, lp.surface, ROCK_FOG);
    const rockB = mix3(lp.deep, lp.surface, ROCK_FOG * 0.45);
    const wallVis = WALL_FOG_BASE + WALL_FOG_LIFE * this.lifeV;
    const wallA = mix3(lp.deep, KELP_COL_FAR, wallVis);
    const wallB = mix3(lp.deep, KELP_COL_NEAR, wallVis);
    const nearVis = NEAR_FOG_BASE + NEAR_FOG_LIFE * this.lifeV;
    const nearA = mix3(lp.deep, KELP_COL_FAR, nearVis);
    const nearB = mix3(lp.deep, KELP_COL_NEAR, nearVis);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const planeStrips = (cfg, bufs) => {
      const a = cfg.ALPHA / cfg.TAPS;
      for (let k = 0; k < cfg.TAPS; k++) {
        const jx = BLUR_JIT[k][0] * cfg.BLUR * dpr, jy = BLUR_JIT[k][1] * cfg.BLUR * dpr;
        for (const [buf, verts, cA, cB] of bufs) {
          strip(buf, verts, cfg.PF, 0, lp.kelpDim, cA, cB, a, jx, jy);
        }
      }
    };
    // far plane first (deepest), then its fauna; then the near-behind plane
    planeStrips(LAYERS.FAR, [[this.rockBuf, this.rockVerts, rockA, rockB],
                             [this.wallBuf, this.wallVerts, wallA, wallB]]);
    this.drawPlaneFauna(1, LAYERS.FAR, rw, rh, camX, camY, t);
    gl.useProgram(this.kelpProg);   // fauna switched programs
    gl.enableVertexAttribArray(this.loc.kelp.xy);
    gl.enableVertexAttribArray(this.loc.kelp.aux);
    planeStrips(LAYERS.NEAR, [[this.nearBuf, this.nearVerts, nearA, nearB]]);
    this.drawPlaneFauna(0, LAYERS.NEAR, rw, rh, camX, camY, t);

    // main forest: opaque, eel-parted, unblurred
    gl.disable(gl.BLEND);
    gl.useProgram(this.kelpProg);
    gl.enableVertexAttribArray(this.loc.kelp.xy);
    gl.enableVertexAttribArray(this.loc.kelp.aux);
    gl.uniform2f(this.loc.kelp.res, rw, rh);
    gl.uniform2f(this.loc.kelp.cam, camX, camY);
    gl.uniform2f(this.loc.kelp.eel, this.eelX * dpr, this.eelY * dpr);
    gl.uniform1f(this.loc.kelp.t, t);
    gl.uniform1f(this.loc.kelp.dpr, dpr);
    gl.uniform1f(this.loc.kelp.worldH, this.worldH * dpr);
    gl.uniform1f(this.loc.kelp.tip, KELP_TIP_LIGHT);
    strip(this.kelpBuf, this.kelpVerts, 1, this.eelPush, lp.kelpDim, KELP_COL_FAR, KELP_COL_NEAR, 1, 0, 0);
    strip(this.grassBuf, this.grassVerts, 1, this.eelPush, lp.kelpDim, GRASS_COL_A, GRASS_COL_B, 1, 0, 0);

    // 3. particles
    let n = 0;
    const pd = this.pointData;
    for (const m of this.motes) {
      pd[n++] = m.x * dpr; pd[n++] = m.y * dpr;
      pd[n++] = m.size * dpr;
      pd[n++] = MOTE_ALPHA + MOTE_TWINKLE * (0.5 + 0.5 * Math.sin(t * MOTE_TWINKLE_F + m.seed * 3));
      pd[n++] = 0;
    }
    for (const s of this.snow) {
      pd[n++] = s.x * dpr; pd[n++] = s.y * dpr;
      pd[n++] = s.size * dpr;
      pd[n++] = SNOW_ALPHA + SNOW_TWINKLE * (0.5 + 0.5 * Math.sin(t * 0.5 + s.seed * 2));
      pd[n++] = 0;
    }
    for (const b of this.bubbles) {
      if (b.life <= 0) continue;
      pd[n++] = b.x * dpr; pd[n++] = b.y * dpr;
      pd[n++] = b.size * dpr;
      pd[n++] = Math.min(1, b.life / BUBBLE_FADE) * BUBBLE_ALPHA;
      pd[n++] = b.size < RING_MIN_SIZE ? 0 : 1;   // micro-bubbles read as discs
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      pd[n++] = s.x * dpr; pd[n++] = s.y * dpr;
      pd[n++] = s.size * dpr;
      pd[n++] = (s.life / SPARK_LIFE) * SPARK_ALPHA;
      pd[n++] = 2;
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
    gl.uniform2f(this.loc.point.cam, camX, camY);
    gl.uniform1f(this.loc.point.pf, 1);   // main plane (fauna draws changed it)
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
      gl.uniform2f(this.loc.pulse.cam, camX, camY);
      gl.uniform1f(this.loc.pulse.pf, 1);   // main plane
      for (const p of this.pulses) {
        if (p.age >= p.dur) continue;
        const u = p.age / p.dur;
        const ease = u * u * (3 - 2 * u);
        gl.uniform2f(this.loc.pulse.center, p.x * dpr, p.y * dpr);
        gl.uniform1f(this.loc.pulse.radius, p.r * dpr * (0.35 + 0.65 * ease));
        gl.uniform3f(this.loc.pulse.color, p.color[0], p.color[1], p.color[2]);
        gl.uniform1f(this.loc.pulse.alpha, p.a * (1 - u) * (1 - u));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
  }
}
