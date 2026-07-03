// The living kelp forest: one WebGL canvas, three draw calls
// (see docs/03-environment.md).
//   1. background — procedural gradient + god rays, fullscreen fragment shader
//   2. kelp — one degenerate triangle strip, all sway + eel-push in the vertex shader
//   3. particles — motes (eel-repelled) + bubbles (eel-emitted), one dynamic point buffer

import { TAU } from './math.js';

const REF_W = 1920, REF_H = 1080;  // world sizing is in reference-screen units
const MOTE_COUNT = 120;
const BUBBLE_POOL = 40;
const KELP_PER_SCREEN = 22;    // strands per reference-screen-width of world floor
const KELP_FAR_FRAC = 12 / 22; // fraction in the dimmer/shorter back layer
const KELP_SEGS = 16;
const REPEL_RADIUS = 70;   // px — motes scatter from the eel head inside this

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
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  // world position of this fragment (y-down: 0 = surface, u_worldH = floor)
  float wx = u_cam.x + gl_FragCoord.x;
  float wy = u_cam.y + (u_res.y - gl_FragCoord.y);
  float depth = clamp(wy / u_worldH, 0.0, 1.0);
  float bright = 1.0 - depth;
  // deepest water keeps the original palette; the surface is light aqua
  vec3 deep = vec3(0.010, 0.048, 0.070);
  vec3 surface = vec3(0.30, 0.62, 0.66);
  vec3 col = mix(surface, deep, pow(depth, 0.85));
  // god rays: fixed in world space, strongest near the surface
  float rx = wx / u_ref.x * 3.0 + wy / u_ref.y * 0.9;
  float r1 = sin(rx * 4.0 + u_t * 0.10) * sin(rx * 7.3 - u_t * 0.07 + 1.7);
  col += vec3(0.26, 0.48, 0.55) * pow(max(r1, 0.0), 3.0) * pow(bright, 2.2) * 0.35;
  // faint large-scale shimmer
  float sh = sin(wx / u_ref.x * 9.0 + u_t * 0.23) * sin(wy / u_ref.y * 7.0 - u_t * 0.19);
  col += vec3(0.04, 0.09, 0.11) * sh * 0.06 * (0.3 + 0.7 * bright);
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
uniform vec2 u_eel;        // world position, device px
uniform float u_t;
uniform float u_dpr;
uniform float u_push;      // eel speed factor
varying float v_shade;
void main() {
  float frac = a_aux.x, ph = a_aux.y;
  v_shade = a_aux.z;
  vec2 p = a_xy;
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
  vec2 clip = (p - u_cam) / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const KELP_FS = `
precision mediump float;
varying float v_shade;
void main() {
  vec3 far = vec3(0.055, 0.165, 0.125);
  vec3 near = vec3(0.012, 0.070, 0.052);
  gl_FragColor = vec4(mix(far, near, v_shade), 1.0);
}
`;

const POINT_VS = `
attribute vec2 a_pos;      // world position, device px
attribute vec3 a_aux;      // size (device px), alpha, kind (0 mote / 1 bubble)
uniform vec2 u_res;
uniform vec2 u_cam;
varying float v_alpha;
varying float v_kind;
void main() {
  vec2 clip = (a_pos - u_cam) / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = a_aux.x;
  v_alpha = a_aux.y;
  v_kind = a_aux.z;
}
`;

const POINT_FS = `
precision mediump float;
varying float v_alpha;
varying float v_kind;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.12, d);
  float ring = smoothstep(0.5, 0.40, d) * smoothstep(0.20, 0.30, d);
  float a = mix(disc, ring, v_kind) * v_alpha;
  vec3 col = mix(vec3(0.60, 0.80, 0.82), vec3(0.78, 0.93, 0.95), v_kind);
  gl_FragColor = vec4(col, a);
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

    this.bgProg = buildProgram(gl, QUAD_VS, BG_FS);
    this.kelpProg = buildProgram(gl, KELP_VS, KELP_FS);
    this.pointProg = buildProgram(gl, POINT_VS, POINT_FS);
    this.loc = {
      bg: { pos: gl.getAttribLocation(this.bgProg, 'a_pos'),
            res: gl.getUniformLocation(this.bgProg, 'u_res'),
            ref: gl.getUniformLocation(this.bgProg, 'u_ref'),
            cam: gl.getUniformLocation(this.bgProg, 'u_cam'),
            worldH: gl.getUniformLocation(this.bgProg, 'u_worldH'),
            t: gl.getUniformLocation(this.bgProg, 'u_t') },
      kelp: { xy: gl.getAttribLocation(this.kelpProg, 'a_xy'),
              aux: gl.getAttribLocation(this.kelpProg, 'a_aux'),
              res: gl.getUniformLocation(this.kelpProg, 'u_res'),
              cam: gl.getUniformLocation(this.kelpProg, 'u_cam'),
              eel: gl.getUniformLocation(this.kelpProg, 'u_eel'),
              t: gl.getUniformLocation(this.kelpProg, 'u_t'),
              dpr: gl.getUniformLocation(this.kelpProg, 'u_dpr'),
              push: gl.getUniformLocation(this.kelpProg, 'u_push') },
      point: { pos: gl.getAttribLocation(this.pointProg, 'a_pos'),
               aux: gl.getAttribLocation(this.pointProg, 'a_aux'),
               res: gl.getUniformLocation(this.pointProg, 'u_res'),
               cam: gl.getUniformLocation(this.pointProg, 'u_cam') },
    };

    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.kelpBuf = gl.createBuffer();
    this.kelpVerts = 0;

    this.pointBuf = gl.createBuffer();
    this.pointData = new Float32Array((MOTE_COUNT + BUBBLE_POOL) * 5);

    // Particle sim lives in CSS px; converted to device px on upload.
    this.motes = [];
    this.bubbles = [];
    for (let i = 0; i < BUBBLE_POOL; i++) {
      this.bubbles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, size: 2, seed: Math.random() * TAU });
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
    this.motesSeeded = false;   // reseed around the camera on next update
  }

  // Kelp lines the whole world floor; sizes are in reference-screen units so
  // the forest looks identical regardless of window size.
  buildKelp() {
    const { dpr, worldW, worldH } = this;
    const count = Math.round(KELP_PER_SCREEN * worldW / REF_W);
    const farCount = Math.round(count * KELP_FAR_FRAC);
    const verts = [];
    const push = (x, y, frac, ph, shade) => verts.push(x * dpr, y * dpr, frac, ph, shade);
    for (let k = 0; k < count; k++) {
      const far = k < farCount;
      const x = Math.random() * worldW;
      const h = (far ? 0.35 + Math.random() * 0.30 : 0.55 + Math.random() * 0.40) * REF_H;
      const hw = far ? 6 + Math.random() * 4 : 9 + Math.random() * 7;
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

  update(dt, eel, cam) {
    if (!this.ok) return;
    this.t += dt;
    const t = this.t;
    this.eelX = eel.x; this.eelY = eel.y;
    this.eelPush = 0.25 + 0.75 * eel.speedSm;

    // Motes live in world space but only near the camera: they wrap around the
    // (slightly expanded) view rect, so the visible density is constant.
    const left = cam.x - 20, top = cam.y - 20;
    const spanX = this.W + 40, spanY = this.H + 40;
    if (!this.motesSeeded) {
      this.motesSeeded = true;
      this.motes.length = 0;
      for (let i = 0; i < MOTE_COUNT; i++) {
        this.motes.push({
          x: left + Math.random() * spanX, y: top + Math.random() * spanY,
          vx: 0, vy: 0,
          size: 1.6 + Math.random() * 1.8,
          seed: Math.random() * TAU,
        });
      }
    }

    // Motes: lazy wander + scatter away from a fast eel.
    for (const m of this.motes) {
      m.vx += Math.sin(t * 0.5 + m.seed) * 3 * dt;
      m.vy += Math.cos(t * 0.4 + m.seed * 1.7) * 3 * dt;
      const dx = m.x - eel.x, dy = m.y - eel.y;
      const d = Math.hypot(dx, dy);
      if (d < REPEL_RADIUS && d > 0.01) {
        const f = (1 - d / REPEL_RADIUS) * 400 * eel.speed01 * dt;
        m.vx += (dx / d) * f;
        m.vy += (dy / d) * f;
      }
      const damp = Math.exp(-dt * 1.2);
      m.vx *= damp; m.vy *= damp;
      m.x += m.vx * dt; m.y += m.vy * dt;
      // wrap around the camera rect so re-entry isn't visible
      if (m.x < left) m.x += spanX; else if (m.x > left + spanX) m.x -= spanX;
      if (m.y < top) m.y += spanY; else if (m.y > top + spanY) m.y -= spanY;
    }

    // Bubbles: emitted from the mouth while the eel works, rise and pop offscreen.
    if (eel.effort > 0.4) {
      this.spawnAcc += dt * (4 + 14 * eel.effort);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        const b = this.bubbles.find(b => b.life <= 0);
        if (!b) break;
        b.x = eel.x + eel.hx * 8 + (Math.random() - 0.5) * 6;
        b.y = eel.y + eel.hy * 8 + (Math.random() - 0.5) * 6;
        b.vx = eel.hx * 30 * eel.speed01;
        b.vy = -20 - Math.random() * 20;
        b.life = 1.2 + Math.random() * 1.5;
        b.size = 2 + Math.random() * 3;
        b.seed = Math.random() * TAU;
      }
    }
    for (const b of this.bubbles) {
      if (b.life <= 0) continue;
      b.vy = Math.max(b.vy - 50 * dt, -70);        // buoyancy
      b.vx += Math.sin(t * 4 + b.seed) * 15 * dt;  // wobble
      b.vx *= Math.exp(-dt * 0.8);
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.y < 5) b.life = 0;   // popped at the surface
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. kelp
    gl.useProgram(this.kelpProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.kelpBuf);
    gl.enableVertexAttribArray(this.loc.kelp.xy);
    gl.enableVertexAttribArray(this.loc.kelp.aux);
    gl.vertexAttribPointer(this.loc.kelp.xy, 2, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(this.loc.kelp.aux, 3, gl.FLOAT, false, 20, 8);
    gl.uniform2f(this.loc.kelp.res, rw, rh);
    gl.uniform2f(this.loc.kelp.cam, camX, camY);
    gl.uniform2f(this.loc.kelp.eel, this.eelX * dpr, this.eelY * dpr);
    gl.uniform1f(this.loc.kelp.t, t);
    gl.uniform1f(this.loc.kelp.dpr, dpr);
    gl.uniform1f(this.loc.kelp.push, this.eelPush);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.kelpVerts);

    // 3. particles
    let n = 0;
    const pd = this.pointData;
    for (const m of this.motes) {
      pd[n++] = m.x * dpr; pd[n++] = m.y * dpr;
      pd[n++] = m.size * dpr;
      pd[n++] = 0.18 + 0.15 * (0.5 + 0.5 * Math.sin(t * 0.8 + m.seed * 3));
      pd[n++] = 0;
    }
    for (const b of this.bubbles) {
      if (b.life <= 0) continue;
      pd[n++] = b.x * dpr; pd[n++] = b.y * dpr;
      pd[n++] = b.size * dpr;
      pd[n++] = Math.min(1, b.life / 0.5) * 0.7;
      pd[n++] = 1;
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
    gl.drawArrays(gl.POINTS, 0, n / 5);
  }
}
