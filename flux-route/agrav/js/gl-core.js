/* FLUX ROUTE — WebGL2 context, resources, programs, actor helpers.
 *
 * The "hardware layer": creates the GL context, allocates ALL GPU textures
 * and framebuffers, compiles ALL shader programs, and provides the actor
 * table read/write helpers.
 *
 * ## Context & capabilities (§6)
 * Requires WebGL2 + EXT_color_buffer_float. Falls back to half-float if
 * only EXT_color_buffer_half_float is available (reduced precision, score
 * accumulator scaled by SCORE_SCALE = 1/64).
 *
 * ## Exports — context & flags
 *   gl                     WebGL2RenderingContext
 *   canvas                 The <canvas id="gl"> element
 *   fatal(msg)             Show fatal error overlay and throw
 *   HALF_FALLBACK          Boolean — true if using half-float workaround
 *   F32                    { internal, type } — RGBA32F or RGBA16F config
 *   SCORE_SCALE            1.0 or 1/64 (half-float compensation factor)
 *
 * ## Exports — utilities
 *   makeTex(w,h,...)       Create a raw texture
 *   makeRT(w,h,...)        Create a render target (tex + fbo)
 *   makePP(w,h,...)        Create a ping-pong pair (a,b with read/write/swap)
 *   compile(name,vs,fs)    Compile+link a shader program with error reporting
 *   U(prog,name)           Get/cache uniform location
 *   drawTo(rt)             Bind framebuffer + viewport (null = screen)
 *   bindTex(prog,name,tex,unit) Bind texture with feedback-loop check
 *   clearRT(rt)            Clear a render target to (0,0,0,0)
 *   fullscreen()           Draw fullscreen triangle (triVAO)
 *   runFS(prog,rt,setup)   Fullscreen pass: drawTo → useProgram → setup → draw
 *   runJFA()               Jump Flood Algorithm for level SDF (§8.2)
 *   triVAO, quadVAO        Vertex arrays for fullscreen tri and instanced quad
 *
 * ## Exports — textures (see architecture.md §4.3 for full inventory)
 *   velocity, pressure, divergence, curlTex  — simulation fields
 *   dye, dynMask, obstacle                   — dye and boundaries
 *   gel, level, distRT, seeds, seedSolid, seedEmpty — gel + JFA chain
 *   actors, scoreAcc, sensorRT, scoreOne, telemetry — actors + scoring
 *   bloomA, bloomB                           — bloom ping-pong
 *   regionsTex, levelPngTex, mediaTex        — level definition textures
 *   wake, walls, swState, dyn                — game mechanic fields
 *   matPackRT, matSum, maskTex               — well counting + mask scratch
 *   reduceChain                              — 2×2 reduction chain to 1×1
 *   P                                        — compiled program dictionary
 *
 * ## Exports — actors
 *   cpuActors              Array(64) of JS actor descriptors (null = empty)
 *   freeSlots              Stack of available slot indices
 *   writeActor(slot,f32)   Upload Float32Array(16) to BOTH ping-pong copies
 *   actorRecord(a)         Pack JS actor descriptor → Float32Array(16) for GPU
 *   clearActorSlot(slot)   Write zeros to a slot (remove actor from GPU)
 *   f32ToF16Arr(f32)       Convert Float32Array → Uint16Array for half-float
 *   getLevelData()         Get the cached level canvas pixel data
 *   setLevelData(d)        Set the cached level canvas pixel data
 *
 * ## Ping-pong convention
 * A ping-pong pair pp has pp.read (current state) and pp.write (target).
 * After drawing into pp.write, call pp.swap(). The scheduler (runFS) does
 * NOT auto-swap — the caller must swap explicitly.
 *
 * ## Actor table (§9.1)
 * 64 slots × 4 rows of RGBA32F. writeActor() writes to BOTH a and b copies
 * (writing only one loses the data on the next swap). actorRecord() packs
 * a JS actor descriptor into a Float32Array(16) for GPU upload.
 *
 * Dependencies: shaders/index.js, config.js.
 * Imported by: simulation, input, main, editor.
 */
import GLSL from '../shaders/index.js';
import {
  SIM_W, SIM_H, DYE_W, DYE_H, N_ACTORS, ACTOR_ROWS,
  SIM_TEXEL, TELEM_W, params,
} from './config.js';

/* ---------- context ---------- */
const canvas = document.getElementById("gl");
const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
function fatal(msg) {
  const el = document.getElementById("fatal");
  el.style.display = "flex"; el.querySelector("p").textContent = msg;
  throw new Error(msg);
}
if (!gl) fatal("This game needs WebGL2, which your browser did not provide.");
canvas.width = DYE_W; canvas.height = DYE_H;   // buffer matches render res; CSS letterboxes
const extCBF = gl.getExtension("EXT_color_buffer_float");
let HALF_FALLBACK = false;
if (!extCBF) {
  if (gl.getExtension("EXT_color_buffer_half_float")) {
    HALF_FALLBACK = true;
    console.warn("EXT_color_buffer_float missing; half-float fallback (reduced precision).");
  } else fatal("This game needs float render targets (EXT_color_buffer_float).");
}

const F32 = HALF_FALLBACK
  ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT }
  : { internal: gl.RGBA32F, type: gl.FLOAT };
const SCORE_SCALE = HALF_FALLBACK ? 1 / 64 : 1.0;

function makeTex(w, h, internal, format, type, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  return t;
}
function makeRT(w, h, internal, format, type, filter) {
  const tex = makeTex(w, h, internal, format, type, filter);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) fatal("Framebuffer incomplete for " + w + "x" + h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}
function makePP(w, h, internal, format, type, filter) {
  const a = makeRT(w, h, internal, format, type, filter);
  const b = makeRT(w, h, internal, format, type, filter);
  return { a, b, get read() { return this.a; }, get write() { return this.b; },
           swap() { const t = this.a; this.a = this.b; this.b = t; } };
}
function compile(name, vsSrc, fsSrc) {
  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(name, gl.getShaderInfoLog(s), "\n" +
        src.split("\n").map((l, i) => (i + 1) + ": " + l).join("\n"));
      fatal("Shader compile failed: " + name);
    }
    return s;
  }
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) fatal("Link failed: " + name);
  p._uni = {};
  return p;
}
function U(p, n) {
  if (!(n in p._uni)) p._uni[n] = gl.getUniformLocation(p, n);
  return p._uni[n];
}
let currentTargetTex = null;
function drawTo(rt) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fbo : null);
  gl.viewport(0, 0, rt ? rt.w : DYE_W, rt ? rt.h : DYE_H);
  currentTargetTex = rt ? rt.tex : null;
}
function bindTex(p, name, tex, unit) {
  if (tex === currentTargetTex) fatal("Feedback loop: " + name);
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(U(p, name), unit);
}
function clearRT(rt) { drawTo(rt); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }

const triVAO = gl.createVertexArray();
gl.bindVertexArray(triVAO);
let buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);
buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);
function fullscreen() { gl.bindVertexArray(triVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); }

/* ---------- resources ---------- */
const velocity  = makePP(SIM_W, SIM_H, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR);
const pressure  = makePP(SIM_W, SIM_H, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
const divergence = makeRT(SIM_W, SIM_H, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
const curlTex   = makeRT(SIM_W, SIM_H, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
const dye       = makePP(DYE_W, DYE_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
const dynMask   = makeRT(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
const obstacle  = makeRT(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
const gel       = makePP(SIM_W, SIM_H, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
const level     = makeRT(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
const distRT    = makeRT(SIM_W, SIM_H, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
const seeds     = makePP(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
const seedSolid = makeRT(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
const seedEmpty = makeRT(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
const actors    = makePP(N_ACTORS, ACTOR_ROWS, F32.internal, gl.RGBA, F32.type, gl.NEAREST);
const scoreAcc  = makePP(SIM_W, SIM_H, F32.internal, gl.RGBA, F32.type, gl.NEAREST);
const sensorRT  = makeRT(SIM_W, SIM_H, F32.internal, gl.RGBA, F32.type, gl.NEAREST);
const scoreOne  = makeRT(1, 1, F32.internal, gl.RGBA, F32.type, gl.NEAREST);
const telemetry = makeRT(TELEM_W, 1, F32.internal, gl.RGBA, F32.type, gl.NEAREST);
const bloomA    = makeRT(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
const bloomB    = makeRT(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
const regionsTex = makeTex(SIM_W, SIM_H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
const levelPngTex = makeTex(SIM_W, SIM_H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
const mediaTex  = makeTex(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.FLOAT, gl.LINEAR);
const wake = makePP(SIM_W, SIM_H, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
const walls = makePP(SIM_W, SIM_H, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR);  /* r=slate (erodible), g=steel */
const swState = makePP(8, 1, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
const dyn = makePP(SIM_W, SIM_H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);  /* r=charge, gb=lane dir */
const matPackRT = makeRT(SIM_W, SIM_H, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.NEAREST);
const matSum = makeRT(1, 1, F32.internal, gl.RGBA, F32.type, gl.NEAREST);
const maskTex = makeTex(SIM_W, SIM_H, gl.R16F, gl.RED, gl.FLOAT, gl.NEAREST);
clearRT(gel.a); clearRT(gel.b); clearRT(wake.a); clearRT(wake.b); clearRT(walls.a); clearRT(walls.b); clearRT(swState.a); clearRT(swState.b); clearRT(dyn.a); clearRT(dyn.b);

const reduceChain = [];
{
  let w = SIM_W, h = SIM_H;
  while (w > 1 || h > 1) {
    w = Math.max(1, Math.ceil(w / 2)); h = Math.max(1, Math.ceil(h / 2));
    reduceChain.push(makeRT(w, h, F32.internal, gl.RGBA, F32.type, gl.NEAREST));
  }
}

const P = {};
for (const [n, src] of Object.entries(GLSL.fs)) {
  if (n === "splatForce" || n === "splatDye" || n === "splatMask" || n === "splatWake")
    P[n] = compile(n, GLSL.vs.splat, src);
  else if (n === "glyph") { /* below */ }
  else P[n] = compile(n, GLSL.vs.fullscreen, src);
}
P.glyph = compile("glyph", GLSL.vs.glyph, GLSL.fs.glyph);
P.ghost = compile("ghost", GLSL.vs.ghost, GLSL.fs.glyph);


/* ---------- JFA SDF ---------- */
function runFS(prog, rt, setup) { drawTo(rt); gl.useProgram(prog); setup(prog); fullscreen(); }
function runJFA() {
  for (let pass = 0; pass < 2; pass++) {
    runFS(P.jfaSeed, seeds.write, p => {
      bindTex(p, "uLevelPng", levelPngTex, 0);
      gl.uniform1f(U(p, "uInvert"), pass);
    });
    seeds.swap();
    let step = 1 << Math.ceil(Math.log2(Math.max(SIM_W, SIM_H)));
    const list = [];
    while (step >= 1) { list.push(step); step >>= 1; }
    list.push(1);
    for (const s of list) {
      runFS(P.jfaStep, seeds.write, p => {
        bindTex(p, "uSeeds", seeds.read.tex, 0);
        gl.uniform2f(U(p, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]);
        gl.uniform2f(U(p, "uSimSize"), SIM_W, SIM_H);
        gl.uniform1f(U(p, "uStep"), s);
      });
      seeds.swap();
    }
    runFS(P.copy, pass === 0 ? seedSolid : seedEmpty, p => {
      bindTex(p, "uSrc", seeds.read.tex, 0);
      gl.uniform1f(U(p, "uMul"), 1.0);
    });
  }
  runFS(P.jfaCombine, distRT, p => {
    bindTex(p, "uLevelPng", levelPngTex, 0);
    bindTex(p, "uSolidSeeds", seedSolid.tex, 1);
    bindTex(p, "uEmptySeeds", seedEmpty.tex, 2);
    gl.uniform2f(U(p, "uSimSize"), SIM_W, SIM_H);
  });
  runFS(P.jfaGrad, level, p => {
    bindTex(p, "uDist", distRT.tex, 0);
    gl.uniform2f(U(p, "uSimTexel"), SIM_TEXEL[0], SIM_TEXEL[1]);
  });
}


/* ---------- actor table ---------- */
/* ---------- actor table ---------- */
const cpuActors = new Array(N_ACTORS).fill(null);
let freeSlots = [], levelData = null;
function getLevelData() { return levelData; }
function setLevelData(d) { levelData = d; }
function writeActor(slot, rows16) {
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  let data = rows16;
  if (HALF_FALLBACK) data = f32ToF16Arr(rows16);
  for (const rt of [actors.a, actors.b]) {
    gl.bindTexture(gl.TEXTURE_2D, rt.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, slot, 0, 1, ACTOR_ROWS, gl.RGBA, F32.type, data);
  }
}
function f32ToF16Arr(f32) {
  const out = new Uint16Array(f32.length);
  const fv = new Float32Array(1), iv = new Int32Array(fv.buffer);
  for (let i = 0; i < f32.length; i++) {
    fv[0] = f32[i]; const x = iv[0];
    const sign = (x >>> 16) & 0x8000;
    let exp = ((x >>> 23) & 0xff) - 127 + 15, man = (x >>> 13) & 0x3ff;
    if (exp <= 0) { exp = 0; man = 0; } else if (exp >= 31) { exp = 31; man = 0; }
    out[i] = sign | (exp << 10) | man;
  }
  return out;
}
function actorRecord(a) {
  const f = new Float32Array(16);
  f[0] = a.pos[0]; f[1] = a.pos[1];
  f[4] = a.type; f[5] = a.r;
  f[8] = -1;
  if (a.type === 5) {                 // piston
    f[6] = a.amp || 0.10; f[7] = a.angle != null ? a.angle : Math.PI / 2;
    f[9] = 1;
    f[10] = a.omega || 2.0; f[11] = a.phase || 0;
    f[13] = a.pos[0]; f[14] = a.pos[1];
  } else if (a.type === 6) {          // predator
    f[6] = a.predThrust || 0.45;
    const ttl = a.predTtl || params.predTtl || 14;
    f[8] = ttl; f[11] = Math.random() * 6.28;
    f[12] = Math.random() < 0.5 ? -1 : 1;   // r3.x = vortex spin sign
    f[15] = ttl;                      // r3.w = ttl0
  } else if (a.type === 7) {          // nest: r2.w = arm fraction (CPU refreshes)
    f[9] = 1; f[11] = 1.0;
  } else if (a.type === 8) {          // pickup: species color drives the glyph
    f[9] = 1;
    const gv = a.gives || "";
    const sp = gv === "blue" ? [0, 0, 1] : gv === "green" ? [0, 1, 0]
      : gv === "wallAdd" ? [0.8, 0.5, 0] : gv === "wallErase" ? [1, 0.1, 0]
      : gv.indexOf("spin") === 0 ? [1, 0.12, 0.08]
      : gv === "slate" ? [0.62, 0.66, 0.74] : gv === "steel" ? [0.78, 0.82, 0.92]
      : gv === "lanes" ? [0.2, 0.75, 0.85] : [1, 1, 1];
    f[10] = sp[0]; f[11] = sp[1]; f[12] = sp[2];
    f[6] = gv.indexOf("spin") === 0 ? (+gv[4] || 0) : 0;   // glyph throb tier
  } else {
    f[6] = a.strength || 0; f[7] = a.angle || 0;
    f[9] = a.locked ? 1 : 0;
    const d = a.dye || [1, 1, 1];
    f[10] = d[0]; f[11] = d[1]; f[12] = a.dye ? d[2] : 0;
  }
  return f;
}
function clearActorSlot(slot) { writeActor(slot, new Float32Array(16)); }

export {
  gl, canvas, fatal,
  HALF_FALLBACK, F32, SCORE_SCALE,
  makeTex, makeRT, makePP, compile, U, drawTo, bindTex, clearRT,
  triVAO, quadVAO, fullscreen, runFS,
  velocity, pressure, divergence, curlTex, dye, dynMask, obstacle,
  gel, level, distRT, seeds, seedSolid, seedEmpty,
  actors, scoreAcc, sensorRT, scoreOne, telemetry,
  bloomA, bloomB, regionsTex, levelPngTex, mediaTex,
  wake, walls, swState, dyn, matPackRT, matSum, maskTex,
  reduceChain, P, runJFA,
  cpuActors, freeSlots, writeActor, actorRecord, clearActorSlot, f32ToF16Arr,
  getLevelData, setLevelData,
};
