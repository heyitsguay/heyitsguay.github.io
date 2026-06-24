/* FLUX ROUTE — GLSL shader object assembly.
 *
 * Re-exports the GLSL object consumed by gl-core.js. Structure:
 *   GLSL.vs = { fullscreen, splat, glyph, ghost } — vertex shaders
 *   GLSL.fs = { copy, advect, curl, ... }         — fragment shaders
 *
 * Shader sources live in sources.js as template-literal strings, composed
 * by concatenating shared snippets from common.js (FRAG_HEADER, OBST,
 * ZONES, SPECIES, SPECIES_PHYS). gl-core.js compiles all programs at
 * module load via compile(name, GLSL.vs.xxx, GLSL.fs.xxx).
 *
 * Splat shaders use a special vertex shader (splatVS) that positions
 * instanced quads at actor positions for the 64-instance draw calls.
 *
 * Dependencies: common.js, sources.js.
 * Imported by: gl-core.js only.
 */
import { VS_FULLSCREEN } from './common.js';
import {
  copyFS, advectFS, curlFS, vorticityFS, reactForceFS,
  divergenceFS, jacobiFS, gradientSubtractFS, gelUpdateFS,
  obstacleComposeFS, dyePostFS, scoreAccumFS, sensorFS, reduceFS,
  telemetryFS, jfaSeedFS, jfaStepFS, jfaCombineFS, jfaGradFS,
  actorUpdateFS, splatVS, SPLAT_FRAG_IN, splatForceFS, splatDyeFS,
  splatWakeFS, splatMaskFS,
  glyphVS, ghostVS, glyphFS,
  brightFS, blurFS, compositeFS,
  wakeUpdateFS, wallPaintFS, switchSenseFS, dynUpdateFS,
  lanePaintFS, matPackFS, wallErodeFS, wallCutFS
} from './sources.js';

const GLSL = {
  vs: { fullscreen: VS_FULLSCREEN, splat: splatVS, glyph: glyphVS, ghost: ghostVS },
  fs: {
    copy: copyFS, advect: advectFS, curl: curlFS, vorticity: vorticityFS,
    reactForce: reactForceFS, divergence: divergenceFS, jacobi: jacobiFS,
    gradientSubtract: gradientSubtractFS, gelUpdate: gelUpdateFS,
    obstacleCompose: obstacleComposeFS, dyePost: dyePostFS, scoreAccum: scoreAccumFS,
    sensor: sensorFS, reduce: reduceFS, telemetry: telemetryFS,
    jfaSeed: jfaSeedFS, jfaStep: jfaStepFS, jfaCombine: jfaCombineFS, jfaGrad: jfaGradFS,
    actorUpdate: actorUpdateFS, splatForce: splatForceFS, splatDye: splatDyeFS, splatWake: splatWakeFS, wakeUpdate: wakeUpdateFS, wallPaint: wallPaintFS, switchSense: switchSenseFS, dynUpdate: dynUpdateFS, lanePaint: lanePaintFS, matPack: matPackFS, wallErode: wallErodeFS, wallCut: wallCutFS,
    splatMask: splatMaskFS, glyph: glyphFS, bright: brightFS, blur: blurFS,
    composite: compositeFS
  }
};

export default GLSL;
