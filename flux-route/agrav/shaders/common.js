/* FLUX ROUTE — shared GLSL snippets.
 * Units: field velocity = sim texels/sec; actor velocity = UV/sec; SDF = sim
 * texels; positions = UV. Conversions marked (!!).
 * DYE CHEMISTRY: R = cargo (the only scored species, fixed level emitters),
 * B = builder (R+B precipitates gel), G = reagent (R+G reacts exothermically:
 * consumes both, repulsive force ~ grad(R*G)). B+G: inert, reserved (TODO).
 * Zones (regions tex): r=sink g=drain b=trigger a=sensor.
 * Actors: 0 empty, 1 player, 2 fan, 3 emitter, 5 piston, 6 predator, 7 nest.
 * Obstacle field (composed per substep): rg=boundary vel (texels/s),
 * b=solid flag, a=porous gel drag.
 */

export const VS_FULLSCREEN = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPosition;
out vec2 vUv;
void main(){ vUv = aPosition*0.5+0.5; gl_Position = vec4(aPosition,0.0,1.0); }
`;

export const FRAG_HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
`;

/* solidAt against the composed obstacle field: ONE fetch (plan §19) */
export const OBST = `uniform sampler2D uObstacle;
struct Solid { bool isSolid; vec2 vel; };
Solid solidAt(vec2 uv){
  Solid s; s.isSolid=false; s.vel=vec2(0.0);
  if(uv.x<=0.0||uv.x>=1.0||uv.y<=0.0||uv.y>=1.0){ s.isSolid=true; return s; }
  vec4 o = texture(uObstacle,uv);
  s.isSolid = o.b>0.5; s.vel = o.rg;
  return s;
}
`;

/* shared zone-removal math: dyePost and scoreAccum MUST agree exactly */
export const ZONES = `uniform sampler2D uRegions;
uniform float uAbsorbRate;
uniform float uDrainRate;
uniform float uDt;
vec3 zoneRemoval(vec3 dye, vec2 uv, out float wSink, out float wTrig){
  vec3 z = texture(uRegions, uv).rgb;
  vec3 rates = vec3(uAbsorbRate*z.r, uDrainRate*z.g, uAbsorbRate*z.b);
  float R = rates.x + rates.y + rates.z;
  wSink = R>1e-6 ? rates.x/R : 0.0;
  wTrig = R>1e-6 ? rates.z/R : 0.0;
  return dye*(1.0 - exp(-R*uDt));
}
`;

/* species (texture channels) -> display colors. Chemistry lives in pure
 * channel space; aesthetics live here and ONLY here. */
export const SPECIES = `const vec3 SPEC_R = vec3(1.00,0.22,0.06);
const vec3 SPEC_G = vec3(0.10,1.00,0.20);
const vec3 SPEC_B = vec3(0.10,0.25,1.00);
vec3 speciesToDisplay(vec3 s){ return s.r*SPEC_R + s.g*SPEC_G + s.b*SPEC_B; }
`;

/* species-dependent physics (plan section 37): per-species coefficient vec3
 * (channel order r=cargo, g=reagent, b=builder) blended toward neutral 1.0
 * by total concentration. The ONLY sanctioned way physics depends on "color". */
export const SPECIES_PHYS = `float speciesMix(vec3 d, vec3 coeff){
  float tot = d.r+d.g+d.b;
  if(tot < 1e-4) return 1.0;
  return mix(1.0, dot(d/tot, coeff), clamp(tot*2.0, 0.0, 1.0));
}
`;
