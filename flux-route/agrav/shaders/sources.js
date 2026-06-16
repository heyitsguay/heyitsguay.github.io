/* FLUX ROUTE — all shader source strings.
 * Shared snippets (VS_FULLSCREEN, FRAG_HEADER, OBST, ZONES, SPECIES, SPECIES_PHYS)
 * are imported from common.js and concatenated at module-definition time.
 */
import { VS_FULLSCREEN, FRAG_HEADER, OBST, ZONES, SPECIES, SPECIES_PHYS } from './common.js';

export const copyFS = FRAG_HEADER + `uniform sampler2D uSrc;
uniform float uMul;
void main(){ fragColor = texture(uSrc,vUv)*uMul; }
`;

export const advectFS = FRAG_HEADER + SPECIES_PHYS + `uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform sampler2D uMedia;      /* r=curl mul, g=velDiss mul, b=dyeDiss mul */
uniform sampler2D uWake;       /* predator dissipation wake (velocity only) */
uniform sampler2D uDye;
uniform vec3  uViscMul;        /* per-species viscosity: blue thin, green syrup */
uniform float uWakeDiss;
uniform float uMediaChan;      /* 0=none 1=g 2=b */
uniform vec2  uSimTexel;
uniform float uDt;
uniform float uDissipation;
uniform float uViscTempK;
uniform float uColdDamp;
uniform float uColdScale;
uniform float uTempAmbient;
uniform float uTempDiss;       /* temperature dissipation (dye pass only) */
void main(){
  vec2 vel = texture(uVelocity,vUv).xy;
  vec2 coord = vUv - uDt*vel*uSimTexel;
  vec4 m = texture(uMedia,vUv);
  float mul = uMediaChan<0.5 ? 1.0 : (uMediaChan<1.5 ? m.g : m.b);
  bool velChan = uMediaChan>0.5 && uMediaChan<1.5;
  float wk = velChan ? texture(uWake,vUv).r : 0.0;
  vec4 dy = texture(uDye,vUv);
  float visc = velChan ? speciesMix(dy.rgb, uViscMul) : 1.0;
  /* temperature → viscosity + cold damping (velocity pass only) */
  if(velChan){
    float T = dy.a;
    visc *= exp(-uViscTempK * (T - uTempAmbient));
    visc *= 1.0 + uColdDamp / (1.0 + uColdScale * max(T, 0.0));  /* rational cold damping */
  }
  vec4 src = texture(uSource,coord);
  float diss = exp(-(uDissipation*mul*visc + uWakeDiss*wk)*uDt);
  fragColor.rgb = src.rgb * diss;
  /* dye pass: alpha = temperature; dissipate excess above ambient, not absolute T */
  fragColor.a = (uMediaChan > 1.5) ? uTempAmbient + (src.a - uTempAmbient) * (1.0 - uTempDiss*uDt) : src.a * diss;
}
`;

export const curlFS = FRAG_HEADER + `uniform sampler2D uVelocity;
uniform vec2 uSimTexel;
void main(){
  float L = texture(uVelocity, vUv-vec2(uSimTexel.x,0.0)).y;
  float R = texture(uVelocity, vUv+vec2(uSimTexel.x,0.0)).y;
  float B = texture(uVelocity, vUv-vec2(0.0,uSimTexel.y)).x;
  float T = texture(uVelocity, vUv+vec2(0.0,uSimTexel.y)).x;
  fragColor = vec4(R-L-T+B, 0.0, 0.0, 1.0);
}
`;

export const vorticityFS = FRAG_HEADER + SPECIES_PHYS + `uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform sampler2D uMedia;
uniform sampler2D uDye;
uniform sampler2D uWake;
uniform vec3  uCurlMul;        /* per-species swirliness */
uniform float uWakeCurl;       /* wake churns: haunted dead water */
uniform float uTempCurlBoost;
uniform vec2  uSimTexel;
uniform float uCurlStrength;
uniform float uDt;
void main(){
  float cL = texture(uCurl, vUv-vec2(uSimTexel.x,0.0)).x;
  float cR = texture(uCurl, vUv+vec2(uSimTexel.x,0.0)).x;
  float cB = texture(uCurl, vUv-vec2(0.0,uSimTexel.y)).x;
  float cT = texture(uCurl, vUv+vec2(0.0,uSimTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5*vec2(abs(cT)-abs(cB), abs(cR)-abs(cL));
  force /= length(force)+1e-4;
  vec4 dy = texture(uDye,vUv);
  float sp = speciesMix(dy.rgb, uCurlMul);
  float churn = 1.0 + uWakeCurl*texture(uWake,vUv).r;
  float Tv = dy.a;  /* temperature from dye alpha */
  float tempCurl = 1.0 + uTempCurlBoost * smoothstep(0.2, 0.8, Tv);
  force *= uCurlStrength * texture(uMedia,vUv).r * sp * churn * C * tempCurl;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity,vUv).xy + force*uDt;
  fragColor = vec4(clamp(vel, vec2(-1000.0), vec2(1000.0)), 0.0, 1.0);
}
`;

/* exothermic R+G repulsion + dye-driven amp jets (red-powered) */
export const reactForceFS = FRAG_HEADER + `uniform sampler2D uVelocity;
uniform sampler2D uDye;
uniform vec2  uSimTexel;
uniform float uExoForce;
uniform float uExoKnee;        /* curve curvature: steep onset, log saturation */
uniform float uStagBoost;      /* reaction multiplier as flow stagnates */
uniform float uStagSpeed;      /* texels/s scale of "stagnant" */
uniform float uActivation;     /* Arrhenius activation energy: higher = needs more heat */
uniform float uArrhScale;      /* scalar multiplier on the arrh term (0-100) */
uniform float uReactFloor;     /* baseline reactivity floor (added to scaled arrh) */
uniform sampler2D uDyn;
uniform float uDynForce;
uniform float uDynTrigger;
uniform float uLaneForce;
uniform float uDt;
float exoAt(vec2 uv){
  vec4 d = texture(uDye,uv);
  float Tv = d.a;  /* temperature from dye alpha */
  float arrh = uActivation*Tv / (1.0 + uActivation*Tv);  /* rational Arrhenius */
  float spd = length(texture(uVelocity,uv).xy);
  float stag = 1.0 + uStagBoost*exp(-(spd*spd)/max(uStagSpeed*uStagSpeed,1e-3));
  float P = d.r*d.g*stag*(uReactFloor + uArrhScale*arrh);
  return log(1.0 + uExoKnee*P)/max(uExoKnee,1e-3);   /* mix, slow, then BAM */
}
float blastAt(vec2 uv){
  float r = texture(uDye,uv).r;
  return texture(uDyn,uv).r * smoothstep(uDynTrigger*0.55, uDynTrigger, r);
}
void main(){
  vec2 vel = texture(uVelocity,vUv).xy;
  float eR = exoAt(vUv+vec2(uSimTexel.x,0.0));
  float eL = exoAt(vUv-vec2(uSimTexel.x,0.0));
  float eT = exoAt(vUv+vec2(0.0,uSimTexel.y));
  float eB = exoAt(vUv-vec2(0.0,uSimTexel.y));
  vec2 grad = 0.5*vec2(eR-eL, eT-eB);
  vel += -grad*uExoForce*uDt;                       /* blast away from reaction */
  float xR = blastAt(vUv+vec2(uSimTexel.x,0.0)), xL = blastAt(vUv-vec2(uSimTexel.x,0.0));
  float xT = blastAt(vUv+vec2(0.0,uSimTexel.y)), xB = blastAt(vUv-vec2(0.0,uSimTexel.y));
  vel += -0.5*vec2(xR-xL, xT-xB)*uDynForce*uDt;     /* dynamite goes off */
  float red = texture(uDye,vUv).r;
  vec4 lf = texture(uDyn,vUv);          /* gb = flow dir, a = red-powered flag */
  vel += lf.gb * uLaneForce * mix(1.0, min(red,4.0), clamp(lf.a,0.0,1.0)) * uDt;
  fragColor = vec4(clamp(vel,vec2(-1000.0),vec2(1000.0)), 0.0, 1.0);
}
`;

export const divergenceFS = FRAG_HEADER + OBST + `uniform sampler2D uVelocity;
uniform vec2 uSimTexel;
void main(){
  vec2 uvL=vUv-vec2(uSimTexel.x,0.0), uvR=vUv+vec2(uSimTexel.x,0.0);
  vec2 uvB=vUv-vec2(0.0,uSimTexel.y), uvT=vUv+vec2(0.0,uSimTexel.y);
  vec2 vL=texture(uVelocity,uvL).xy;
  vec2 vR=texture(uVelocity,uvR).xy;
  vec2 vB=texture(uVelocity,uvB).xy;
  vec2 vT=texture(uVelocity,uvT).xy;
  Solid sL=solidAt(uvL); if(sL.isSolid) vL=sL.vel;
  Solid sR=solidAt(uvR); if(sR.isSolid) vR=sR.vel;
  Solid sB=solidAt(uvB); if(sB.isSolid) vB=sB.vel;
  Solid sT=solidAt(uvT); if(sT.isSolid) vT=sT.vel;
  fragColor = vec4(0.5*((vR.x-vL.x)+(vT.y-vB.y)), 0.0, 0.0, 1.0);
}
`;

export const jacobiFS = FRAG_HEADER + OBST + `uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uSimTexel;
void main(){
  vec2 uvL=vUv-vec2(uSimTexel.x,0.0), uvR=vUv+vec2(uSimTexel.x,0.0);
  vec2 uvB=vUv-vec2(0.0,uSimTexel.y), uvT=vUv+vec2(0.0,uSimTexel.y);
  float pC = texture(uPressure,vUv).x;
  float pL = solidAt(uvL).isSolid ? pC : texture(uPressure,uvL).x;
  float pR = solidAt(uvR).isSolid ? pC : texture(uPressure,uvR).x;
  float pB = solidAt(uvB).isSolid ? pC : texture(uPressure,uvB).x;
  float pT = solidAt(uvT).isSolid ? pC : texture(uPressure,uvT).x;
  float div = texture(uDivergence,vUv).x;
  fragColor = vec4((pL+pR+pB+pT-div)*0.25, 0.0, 0.0, 1.0);
}
`;

export const gradientSubtractFS = FRAG_HEADER + OBST + `uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uSimTexel;
uniform float uGelDrag;
uniform float uDt;
void main(){
  Solid sC = solidAt(vUv);
  if(sC.isSolid){ fragColor = vec4(sC.vel, 0.0, 1.0); return; }
  vec2 uvL=vUv-vec2(uSimTexel.x,0.0), uvR=vUv+vec2(uSimTexel.x,0.0);
  vec2 uvB=vUv-vec2(0.0,uSimTexel.y), uvT=vUv+vec2(0.0,uSimTexel.y);
  float pC = texture(uPressure,vUv).x;
  float pL = solidAt(uvL).isSolid ? pC : texture(uPressure,uvL).x;
  float pR = solidAt(uvR).isSolid ? pC : texture(uPressure,uvR).x;
  float pB = solidAt(uvB).isSolid ? pC : texture(uPressure,uvB).x;
  float pT = solidAt(uvT).isSolid ? pC : texture(uPressure,uvT).x;
  vec2 vel = texture(uVelocity,vUv).xy - 0.5*vec2(pR-pL, pT-pB);
  vel *= exp(-uGelDrag*texture(uObstacle,vUv).a*uDt);   /* porous gel */
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

/* predator dissipation wake: plateau, then fast fade (knee-gated decay) */
export const wakeUpdateFS = FRAG_HEADER + `uniform sampler2D uWake;
uniform float uWakeSlow;
uniform float uWakeFast;
uniform float uWakeKnee;
uniform float uDt;
void main(){
  float w = texture(uWake,vUv).r;
  float hi = smoothstep(uWakeKnee-0.1, uWakeKnee+0.1, w);
  w -= (hi*uWakeSlow + (1.0-hi)*uWakeFast*w)*uDt;
  fragColor = vec4(clamp(w,0.0,1.2), 0.0, 0.0, 1.0);
}
`;

export const gelUpdateFS = FRAG_HEADER + `uniform sampler2D uGel;
uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform float uGelReact;
uniform float uGelDissolve;
uniform float uGelErode;
uniform float uGelTempK;
uniform float uGelSelfCat;    /* self-catalysis: existing gel boosts formation */
uniform float uGelHotThresh;  /* temperature at which gel formation fully stops */
uniform float uDt;
void main(){
  float gel = texture(uGel,vUv).r;
  vec4  d4  = texture(uDye,vUv);
  vec3  d   = d4.rgb;
  float spd = length(texture(uVelocity,vUv).xy);
  float Tv  = d4.a;  /* temperature from dye alpha */
  /* cold-favoring: rational 1/(1+k*T), strongest at T=0 */
  float coldFavor = 1.0 / (1.0 + uGelTempK * max(Tv, 0.0));
  /* hot cutoff: gel impossible above gelHotThresh, ramp starts at 70% */
  float hotCutoff = 1.0 - smoothstep(0.7 * uGelHotThresh, uGelHotThresh, Tv);
  /* self-catalysis: existing gel boosts further formation (endothermic runaway) */
  float selfBoost = 1.0 + uGelSelfCat * gel;
  float gelTempFactor = coldFavor * hotCutoff * selfBoost;
  gel += uGelReact*d.r*d.b*gelTempFactor*uDt;   /* R + B precipitate */
  gel -= gel*(uGelDissolve + uGelErode*spd)*uDt;
  fragColor = vec4(clamp(gel,0.0,2.0), 0.0, 0.0, 1.0);
}
`;

/* player wall painting (plan section 38) */
export const wallPaintFS = FRAG_HEADER + `uniform sampler2D uWalls;
uniform vec2  uSimTexel;
uniform vec2  uPaintPos;
uniform float uPaintR;        /* texels */
uniform float uPaintMode;     /* 1 add, 0 erase */
uniform float uPaintChan;     /* 0 slate (r), 1 steel (g) */
void main(){
  vec2 w = texture(uWalls,vUv).rg;
  float d = length((vUv-uPaintPos)/uSimTexel);
  float brush = step(0.35, 1.0 - smoothstep(uPaintR-1.0, uPaintR, d));
  float c = uPaintChan > 0.5 ? w.g : w.r;
  c = uPaintMode>0.5 ? max(c, brush) : c*(1.0-brush);
  if(uPaintChan > 0.5) w.g = c; else w.r = c;
  fragColor = vec4(w, 0.0, 1.0);
}
`;

/* per-pixel destructible slate: boundary pixels of the walls field die when
 * the pressure beside them exceeds the toughness rating. One cheap SIM-res
 * pass; the field drives physics directly (no SDF rebuild), and the wells
 * invariant refunds eroded player matter automatically. Blasts carve craters. */
export const wallErodeFS = FRAG_HEADER + `uniform sampler2D uWalls;
uniform sampler2D uPressure;
uniform vec2  uSimTexel;
uniform float uWallTough;
void main(){
  vec2 w2 = texture(uWalls,vUv).rg;            /* r=slate erodes; g=steel never */
  float w = w2.r;
  if(w > 0.05){
    float nL = texture(uWalls,vUv-vec2(uSimTexel.x,0.0)).r;
    float nR = texture(uWalls,vUv+vec2(uSimTexel.x,0.0)).r;
    float nB = texture(uWalls,vUv-vec2(0.0,uSimTexel.y)).r;
    float nT = texture(uWalls,vUv+vec2(0.0,uSimTexel.y)).r;
    if(min(min(nL,nR),min(nB,nT)) < 0.5){               /* boundary pixel */
      float p = max(max(abs(texture(uPressure,vUv-vec2(uSimTexel.x,0.0)).x),
                        abs(texture(uPressure,vUv+vec2(uSimTexel.x,0.0)).x)),
                    max(abs(texture(uPressure,vUv-vec2(0.0,uSimTexel.y)).x),
                        abs(texture(uPressure,vUv+vec2(0.0,uSimTexel.y)).x)));
      if(p > uWallTough) w = 0.0;
    }
  }
  fragColor = vec4(w, w2.g, 0.0, 1.0);
}
`;

/* lane paint: capsule along the drag segment writes unit direction into the
 * gb channels of the matter (dyn) texture. Last-written-wins: repainting
 * redirects without erase. Mode 0 erases (free; the well refunds itself). */
export const lanePaintFS = FRAG_HEADER + `uniform sampler2D uDyn;
uniform vec2  uSimTexel;
uniform vec2  uSegA;
uniform vec2  uSegB;
uniform vec2  uDir;
uniform float uPaintR;        /* texels */
uniform float uPaintMode;     /* 1 paint, 0 erase */
void main(){
  vec4 m = texture(uDyn,vUv);
  vec2 pa = (vUv-uSegA)/uSimTexel, ba = (uSegB-uSegA)/uSimTexel;
  float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-6), 0.0, 1.0);
  float d = length(pa - ba*h);
  if(d <= uPaintR) m.gb = uPaintMode>0.5 ? uDir : vec2(0.0);
  fragColor = m;
}
`;

/* cut a rasterized mask out of a walls channel (switch-deleted removable walls) */
export const wallCutFS = FRAG_HEADER + `uniform sampler2D uWalls;
uniform sampler2D uMask;
uniform float uChan;
void main(){
  vec2 w = texture(uWalls,vUv).rg;
  float m = texture(uMask,vUv).r;
  if(uChan > 0.5) w.g *= 1.0 - m; else w.r *= 1.0 - m;
  fragColor = vec4(w, 0.0, 1.0);
}
`;

/* matter sums for the wells: (walls coverage, lane coverage) -> reduce -> CPU */
export const matPackFS = FRAG_HEADER + `uniform sampler2D uWalls;
uniform sampler2D uDyn;
void main(){
  vec2 wv = texture(uWalls,vUv).rg;
  float l = min(length(texture(uDyn,vUv).gb), 1.0);
  fragColor = vec4(wv.r, l, wv.g, 1.0);
}
`;

/* dynamite field: deposits where B+G co-locate, burns where red or heat triggers.
   Solid dynamite: surface trigger uses adjacent-cell dye/heat; chain reaction
   propagates detonation inward through the mass. */
export const dynUpdateFS = FRAG_HEADER + `uniform sampler2D uDye;
uniform sampler2D uDyn;
uniform float uDynForm;
uniform float uDynTrigger;
uniform float uDynTempTrigger;
uniform float uDynBurn;
uniform vec2  uSimTexel;
uniform float uDt;
void main(){
  float dyn = texture(uDyn,vUv).r;
  vec4 d = texture(uDye,vUv);
  float form = uDynForm * smoothstep(0.06, 0.30, min(d.g, d.b));
  /* trigger: check THIS cell + 4 neighbors for red dye & heat
     (solid dynamite blocks dye, so neighbors carry the trigger signal) */
  vec4 dL = texture(uDye, vUv - vec2(uSimTexel.x, 0.0));
  vec4 dR = texture(uDye, vUv + vec2(uSimTexel.x, 0.0));
  vec4 dB = texture(uDye, vUv - vec2(0.0, uSimTexel.y));
  vec4 dT = texture(uDye, vUv + vec2(0.0, uSimTexel.y));
  float maxRed = max(d.r, max(max(dL.r, dR.r), max(dB.r, dT.r)));
  float maxTemp = max(d.a, max(max(dL.a, dR.a), max(dB.a, dT.a)));
  float redTrig = smoothstep(uDynTrigger*0.55, uDynTrigger, maxRed);
  float tempTrig = smoothstep(uDynTempTrigger*0.7, uDynTempTrigger, maxTemp);
  float trig = max(redTrig, tempTrig);
  /* chain reaction: 2px stencil — if ANY individual neighbor has charge
     but is lower than ours, it's burning → propagate.
     Bug fix: previously used max() which masked single burning cells. */
  if(trig < 0.01 && dyn > 0.1){
    vec2 dx = vec2(uSimTexel.x, 0.0);
    vec2 dy = vec2(0.0, uSimTexel.y);
    float thresh = dyn * 0.99;
    float n;
    n = texture(uDyn, vUv-dx).r;       if(n > 0.05 && n < thresh) trig = 1.0;
    n = texture(uDyn, vUv+dx).r;       if(n > 0.05 && n < thresh) trig = 1.0;
    n = texture(uDyn, vUv-dy).r;       if(n > 0.05 && n < thresh) trig = 1.0;
    n = texture(uDyn, vUv+dy).r;       if(n > 0.05 && n < thresh) trig = 1.0;
    n = texture(uDyn, vUv-2.0*dx).r;   if(n > 0.05 && n < thresh) trig = 1.0;
    n = texture(uDyn, vUv+2.0*dx).r;   if(n > 0.05 && n < thresh) trig = 1.0;
    n = texture(uDyn, vUv-2.0*dy).r;   if(n > 0.05 && n < thresh) trig = 1.0;
    n = texture(uDyn, vUv+2.0*dy).r;   if(n > 0.05 && n < thresh) trig = 1.0;
  }
  float burn = uDynBurn * dyn * trig;
  vec3 lane = texture(uDyn,vUv).gba;
  fragColor = vec4(clamp(dyn + (form - burn)*uDt, 0.0, 1.5), lane);
}
`;

/* switches (plan section 3): one fragment per switch slot. State texture:
 * r=bank (volume), g=hold timer (flow), b=latched, a=instant flux. */
export const switchSenseFS = FRAG_HEADER + `uniform sampler2D uDye;
uniform sampler2D uState;
uniform int   uSwCount;
uniform vec4  uSwRect[8];   /* x0,y0,x1,y1 in UV */
uniform sampler2D uPressure;
uniform vec4  uSwMask[8];   /* rgb dye mask; w: 0=volume 1=flow 2=pressure */
uniform vec4  uSwCfg[8];    /* threshold, holdSec, staticLatch, _ */
uniform float uDtF;
void main(){
  int i = int(gl_FragCoord.x);
  vec4 st = texelFetch(uState, ivec2(i,0), 0);
  if(i >= uSwCount){ fragColor = vec4(0.0); return; }
  vec4 R = uSwRect[i];
  float kind = uSwMask[i].w;
  float thr = uSwCfg[i].x, holdS = max(uSwCfg[i].y, 1e-3);
  float flux = 0.0;
  if(kind > 1.5){
    /* pressure (blast) switch: frame MAX of |p| over the grid. A blast is a
     * traveling front — only part of the boundary sees peak at once, so max
     * detects the hit wherever it lands. Latches forever: rubble stays rubble. */
    for(int gy=0; gy<8; gy++)
      for(int gx=0; gx<12; gx++){
        vec2 uv = mix(R.xy, R.zw, vec2((float(gx)+0.5)/12.0, (float(gy)+0.5)/8.0));
        flux = max(flux, abs(texture(uPressure, uv).x));
      }
    st.x = flux;
    if(flux >= thr) st.z = 1.0;
  } else {
    for(int gy=0; gy<8; gy++)
      for(int gx=0; gx<12; gx++){
        vec2 uv = mix(R.xy, R.zw, vec2((float(gx)+0.5)/12.0, (float(gy)+0.5)/8.0));
        flux += dot(texture(uDye, uv).rgb, uSwMask[i].rgb);
      }
    flux /= 96.0;
    if(kind < 0.5){
      st.x += flux*uDtF;                     /* volume: tank fills, latches */
      if(st.x >= thr) st.z = 1.0;
    } else {
      if(flux >= thr) st.y = min(st.y + uDtF, holdS*2.0);
      else if(flux < thr*0.8) st.y = max(0.0, st.y - 2.0*uDtF);
      if(uSwCfg[i].z > 0.5 && st.y >= holdS) st.z = 1.0;   /* static latch */
    }
  }
  st.w = flux;
  fragColor = st;
}
`;

export const obstacleComposeFS = FRAG_HEADER + `uniform sampler2D uLevel;
uniform sampler2D uWalls;
uniform sampler2D uDynMask;
uniform sampler2D uGel;
uniform sampler2D uDyn;
uniform float uGelSolid;
void main(){
  vec2 vel = vec2(0.0); float solid = 0.0;
  if(texture(uLevel,vUv).r <= 0.0) solid = 1.0;
  vec2 wv2 = texture(uWalls,vUv).rg;          /* r=slate, g=steel */
  if(max(wv2.r, wv2.g) > 0.5) solid = 1.0;
  if(texture(uDyn,vUv).r > 0.3) solid = 1.0;  /* dynamite charge is solid */
  vec4 m = texture(uDynMask,vUv);
  if(m.a > 0.5){ solid = 1.0; vel = m.rg/max(m.a,1e-4); }
  float gel = texture(uGel,vUv).r;
  if(gel >= uGelSolid){ solid = 1.0; vel = vec2(0.0); }
  float drag = clamp(gel/max(uGelSolid,1e-3), 0.0, 1.0)*(1.0-solid);
  fragColor = vec4(vel, solid, drag);
}
`;

export const dyePostFS = FRAG_HEADER + OBST + ZONES + `uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform sampler2D uMedia;
uniform float uSolidDecay;
uniform float uExoConsume;
uniform float uGelConsume;
uniform float uGelHotThresh;
uniform float uStagBoost2;
uniform float uStagSpeed2;
uniform sampler2D uDyn;
uniform float uDynForm;
uniform float uDynTrigger;
uniform float uDynTempTrigger;
uniform float uDynBurn;
uniform float uDynRed;
uniform float uActivation;
uniform float uTempHeatRate;
uniform float uGelHeatAbsorb;
uniform float uDynHeat;
uniform float uTempCoolLinear;
uniform float uTempCoolQuad;
uniform float uTempAmbient;
uniform float uTempAmbientRestore;
uniform float uTempMax;
uniform float uTempZoneRate;
uniform float uTempScale;
void main(){
  vec4 dye = texture(uDye,vUv);
  float wS, wT;
  dye.rgb -= zoneRemoval(dye.rgb, vUv, wS, wT);
  float Tv = dye.a;  /* temperature from dye alpha */
  /* dynamite: co-located B+G converts to charge; red OR heat detonates */
  float dynC = texture(uDyn,vUv).r;
  float form2 = uDynForm * smoothstep(0.06, 0.30, min(dye.g, dye.b));
  float redTrig = smoothstep(uDynTrigger*0.55, uDynTrigger, dye.r);
  float heatTrig = smoothstep(uDynTempTrigger*0.7, uDynTempTrigger, Tv);
  float trig2 = max(redTrig, heatTrig);
  dye.g -= form2*0.6*uDt;
  dye.b -= form2*0.6*uDt;
  dye.r += uDynBurn*dynC*trig2*(uDynRed - 0.35)*uDt;
  float spd2 = length(texture(uVelocity,vUv).xy);
  float stag2 = 1.0 + uStagBoost2*exp(-(spd2*spd2)/max(uStagSpeed2*uStagSpeed2,1e-3));
  /* Arrhenius modulation of consumption (matches reactForceFS) */
  float arrh = uActivation*Tv / (1.0 + uActivation*Tv);  /* rational Arrhenius */
  float rxExo = dye.r*dye.g*stag2*arrh;
  /* R+B gel consumption: cold-favoring + hot cutoff (matches gelUpdateFS) */
  float gelColdFavor = 1.0 / (1.0 + 2.0 * max(Tv, 0.0));
  float gelHotCutoff = 1.0 - smoothstep(0.7 * uGelHotThresh, uGelHotThresh, Tv);
  float rxGel = dye.r*dye.b*gelColdFavor*gelHotCutoff;
  dye.r -= (uExoConsume*rxExo + uGelConsume*rxGel)*uDt;
  dye.g -= uExoConsume*rxExo*uDt;
  dye.b -= uGelConsume*rxGel*uDt;
  if(solidAt(vUv).isSolid) dye.rgb *= exp(-uSolidDecay*uDt);
  dye.rgb = max(dye.rgb, vec3(0.0));
  /* temperature evolution (in dye.a) */
  float T = Tv;
  /* cooling: Newton's law — cool excess above ambient, not absolute T */
  float Tex = max(T - uTempAmbient, 0.0);
  /* all source/sink terms scaled by inverse heat capacity */
  float dT = uTempHeatRate * rxExo            /* R+G exothermic */
           - uGelHeatAbsorb * rxGel            /* R+B endothermic */
           + uDynHeat * dynC * trig2           /* dynamite heat flash */
           - uTempCoolLinear*Tex               /* Newton cooling */
           - uTempCoolQuad*Tex*Tex;            /* runaway brake */
  T += uTempScale * dT * uDt;
  T += uTempAmbientRestore * (uTempAmbient - T) * uDt;  /* env coupling, unscaled */
  float zoneT = texture(uMedia, vUv).a;
  if(zoneT >= 0.0) T = mix(T, zoneT, min(uTempZoneRate*uDt, 1.0));
  dye.a = clamp(T, 0.0, uTempMax);
  fragColor = dye;
}
`;

/* only RED is scored: delivery and trigger banking count dye.r alone */
export const scoreAccumFS = FRAG_HEADER + ZONES + `uniform sampler2D uScoreAcc;
uniform sampler2D uDye;
uniform float uActive;
void main(){
  vec4 acc = texture(uScoreAcc,vUv);
  float wS, wT;
  vec3 removed = zoneRemoval(texture(uDye,vUv).rgb, vUv, wS, wT);
  acc.r += removed.r*wS*uActive;
  acc.a += removed.r*wT*uActive;
  fragColor = acc;
}
`;

export const sensorFS = FRAG_HEADER + `uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform sampler2D uRegions;
void main(){
  float sensor = texture(uRegions,vUv).a;
  float red = texture(uDye,vUv).r;
  float spd = length(texture(uVelocity,vUv).xy);
  fragColor = vec4(sensor*red*spd, 0.0, 0.0, 1.0);
}
`;

export const reduceFS = FRAG_HEADER + `uniform sampler2D uSrc;
uniform ivec2 uSrcSize;
void main(){
  ivec2 base = ivec2(gl_FragCoord.xy)*2;
  vec4 s = vec4(0.0);
  for(int dy=0;dy<2;dy++)
  for(int dx=0;dx<2;dx++){
    ivec2 c = base+ivec2(dx,dy);
    if(c.x<uSrcSize.x && c.y<uSrcSize.y) s += texelFetch(uSrc,c,0);
  }
  fragColor = s;
}
`;

export const telemetryFS = FRAG_HEADER + `uniform sampler2D uScoreOne;
uniform sampler2D uSensorReduced;
uniform sampler2D uActors;
void main(){
  int x = int(gl_FragCoord.x);
  if(x==0)      fragColor = texelFetch(uScoreOne, ivec2(0,0), 0);
  else if(x==1) fragColor = vec4(texelFetch(uSensorReduced, ivec2(0,0), 0).r, 0.0, 0.0, 0.0);
  else          fragColor = texelFetch(uActors, ivec2(x-2,0), 0);
}
`;

export const jfaSeedFS = FRAG_HEADER + `uniform sampler2D uLevelPng;
uniform float uInvert;
void main(){
  float solid = step(0.5, texture(uLevelPng,vUv).r);
  float isSeed = mix(solid, 1.0-solid, uInvert);
  fragColor = isSeed>0.5 ? vec4(vUv,1.0,1.0) : vec4(-1.0,-1.0,0.0,1.0);
}
`;

export const jfaStepFS = FRAG_HEADER + `uniform sampler2D uSeeds;
uniform vec2 uSimTexel;
uniform vec2 uSimSize;
uniform float uStep;
void main(){
  vec4 best = texture(uSeeds,vUv);
  float bestD = best.z>0.5 ? length((vUv-best.xy)*uSimSize) : 1e8;
  for(int dy=-1;dy<=1;dy++)
  for(int dx=-1;dx<=1;dx++){
    vec2 nUv = clamp(vUv+vec2(float(dx),float(dy))*uStep*uSimTexel, vec2(0.0), vec2(1.0));
    vec4 cand = texture(uSeeds,nUv);
    if(cand.z>0.5){
      float d = length((vUv-cand.xy)*uSimSize);
      if(d<bestD){ bestD=d; best=cand; }
    }
  }
  fragColor = best;
}
`;

export const jfaCombineFS = FRAG_HEADER + `uniform sampler2D uLevelPng;
uniform sampler2D uSolidSeeds;
uniform sampler2D uEmptySeeds;
uniform vec2 uSimSize;
void main(){
  float solid = step(0.5, texture(uLevelPng,vUv).r);
  vec4 ss = texture(uSolidSeeds,vUv);
  vec4 es = texture(uEmptySeeds,vUv);
  float dOut = ss.z>0.5 ? length((vUv-ss.xy)*uSimSize) : 1e4;
  float dIn  = es.z>0.5 ? length((vUv-es.xy)*uSimSize) : 1e4;
  fragColor = vec4(mix(dOut,-dIn,solid), 0.0, 0.0, 1.0);
}
`;

export const jfaGradFS = FRAG_HEADER + `uniform sampler2D uDist;
uniform vec2 uSimTexel;
void main(){
  float dC = texture(uDist,vUv).r;
  float dL = texture(uDist,vUv-vec2(uSimTexel.x,0.0)).r;
  float dR = texture(uDist,vUv+vec2(uSimTexel.x,0.0)).r;
  float dB = texture(uDist,vUv-vec2(0.0,uSimTexel.y)).r;
  float dT = texture(uDist,vUv+vec2(0.0,uSimTexel.y)).r;
  vec2 g = vec2(dR-dL, dT-dB);
  float len = length(g);
  g = len<1e-5 ? vec2(0.0,1.0) : g/len;
  fragColor = vec4(dC, g, 0.0);
}
`;

export const actorUpdateFS = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uActors;
uniform sampler2D uVelocity;
uniform sampler2D uLevel;
uniform sampler2D uDye;
uniform vec2  uSimTexel;
uniform float uDt;
uniform float uTime;
uniform vec4  uInput;          /* xy = thrust dir, z = spin input -1/0/1 */
uniform float uThrust;
uniform float uDragK;
uniform float uLinDamp;
uniform float uSpinAccel;
uniform float uSpinDamp;
uniform float uSpinKick;
uniform float uEntityScale;
uniform float uMassPlayer;
uniform float uMassPred;
uniform float uMassPiston;
uniform float uRestitution;
uniform float uPistonSpring;
uniform float uPistonDamp;
uniform float uFlowPush;
uniform float uBounceFloor;    /* min separation speed after contact, texels/s */
uniform sampler2D uWalls;
uniform sampler2D uGel;
uniform sampler2D uDyn;
uniform float uGelSolid;
uniform float uPredSense;
uniform float uPredGreed;
uniform float uGelDrag;
uniform vec4  uSpawn;
uniform vec4  uSpawnParams;
uniform vec4  uSpawnDye;
void resolveWalls(inout vec2 pos, inout vec2 vel, float radius){
  vec4 lv = texture(uLevel,pos);
  float pen = lv.r - radius;
  if(pen<0.0){
    vec2 n = lv.gb;
    pos += -pen*n*uSimTexel;
    vec2 vT = vel/uSimTexel;
    float vn = dot(vT,n);
    if(vn<0.0) vT -= vn*n;
    vel = vT*uSimTexel;
  }
  vec2 rUv = vec2(radius)*uSimTexel;
  pos = clamp(pos, rUv, vec2(1.0)-rUv);
}
/* dynamic solids: player walls + solid gel. Deliberately simple: 4-probe
 * normal estimate, push-out, restitution bounce (plan section 38). */
float hardAt(vec2 uv){
  vec2 ws2 = texture(uWalls,uv).rg;
  float w = max(ws2.r, ws2.g);                /* slate or steel */
  float g = texture(uGel,uv).r/max(uGelSolid,1e-3);
  float dn = step(0.6, texture(uDyn,uv).r);          /* packed charge too */
  return max(max(w, dn), step(0.55, g));   /* dense gel is a wall for bodies */
}
void resolveDynamic(inout vec2 pos, inout vec2 vel, float rTex){
  for(int it=0; it<2; it++){
    vec2 ro = rTex*uSimTexel;
    float C  = hardAt(pos);
    float pL = hardAt(pos-vec2(ro.x,0.0)), pR = hardAt(pos+vec2(ro.x,0.0));
    float pB = hardAt(pos-vec2(0.0,ro.y)), pT = hardAt(pos+vec2(0.0,ro.y));
    if(C<0.5 && max(max(pL,pR),max(pB,pT))<0.5) return;
    /* normal from SHORT probes: thin gel sheets are invisible to wide ones */
    vec2 hh = 2.0*uSimTexel;
    vec2 n = vec2(hardAt(pos-vec2(hh.x,0.0))-hardAt(pos+vec2(hh.x,0.0)),
                  hardAt(pos-vec2(0.0,hh.y))-hardAt(pos+vec2(0.0,hh.y)));
    n += vec2(pL-pR, pB-pT);
    float nl = length(n);
    if(nl>1e-4) n /= nl;
    else { float vl = length(vel); n = vl>1e-6 ? -vel/vl : vec2(0.0,1.0); }
    pos += n*(C>0.5 ? 2.5 : 1.0)*uSimTexel;
    vec2 vT = vel/uSimTexel;
    float vn = dot(vT,n);
    if(vn<0.0) vT -= 1.45*vn*n;
    vel = vT*uSimTexel;
  }
}
/* fluid velocity sampled on a ring OUTSIDE the body's own no-slip stamp —
 * at the center the field equals the body's own velocity (zero net force) */
vec2 fluidRing(vec2 pos, float rTex){
  vec2 o = rTex*1.7*uSimTexel;
  vec2 sum = texture(uVelocity,pos+vec2(o.x,0.0)).xy + texture(uVelocity,pos-vec2(o.x,0.0)).xy
           + texture(uVelocity,pos+vec2(0.0,o.y)).xy + texture(uVelocity,pos-vec2(0.0,o.y)).xy;
  return 0.25*sum*uSimTexel;   /* UV/s */
}
float massOf(int t){
  if(t==1) return max(uMassPlayer,0.05);
  if(t==5) return max(uMassPiston,0.05);
  if(t==6) return max(uMassPred,0.05);
  return 1e5;                       /* fans/emitters: immovable */
}
/* symmetric body collisions: every dynamic actor resolves against the same
 * pre-update table, so both parties compute identical contacts and impulses */
void collideBodies(int slot, inout vec2 pos, inout vec2 vel, float radius, float mass){
  for(int o=0;o<64;o++){
    if(o==slot) continue;
    vec4 or1 = texelFetch(uActors, ivec2(o,1), 0);
    int ot = int(or1.x);
    if(ot!=1 && ot!=2 && ot!=3 && ot!=5 && ot!=6) continue;
    vec4 or0 = texelFetch(uActors, ivec2(o,0), 0);
    vec2 dT = (pos-or0.xy)/uSimTexel;
    float rr = radius + or1.y*uEntityScale;
    float dist = length(dT);
    if(dist>=rr || dist<1e-4) continue;
    vec2 nn = dT/dist;
    float mO = massOf(ot);
    pos += nn*(rr-dist)*0.75*(mO/(mass+mO))*uSimTexel;
    vec2 vT = vel/uSimTexel;
    vec2 ovT = or0.zw/uSimTexel;
    float rel = dot(vT-ovT, nn);
    if(rel<0.0){
      float j = -(1.0+clamp(uRestitution,0.0,1.0))*rel/(1.0/mass+1.0/mO);
      vT += (j/mass)*nn;
    }
    float relA = dot(vT-ovT, nn);          /* bounce floor: never grind to a halt */
    if(relA < uBounceFloor) vT += (uBounceFloor-relA)*(mO/(mass+mO))*nn;
    vel = vT*uSimTexel;
  }
}
void main(){
  int slot = int(gl_FragCoord.x);
  int row  = int(gl_FragCoord.y);
  vec4 r0 = texelFetch(uActors, ivec2(slot,0), 0);
  vec4 r1 = texelFetch(uActors, ivec2(slot,1), 0);
  vec4 r2 = texelFetch(uActors, ivec2(slot,2), 0);
  vec4 r3 = texelFetch(uActors, ivec2(slot,3), 0);
  int type = int(r1.x);

  if(uSpawn.x>=0.0 && slot==int(uSpawn.x)){
    vec4 player = texelFetch(uActors, ivec2(0,0), 0);
    r0 = vec4(player.xy + uSpawn.zw, 0.0, 0.0);
    r1 = vec4(uSpawn.y, uSpawnParams.xyz);
    r2 = vec4(uSpawnParams.w, 0.0, uSpawnDye.x, uSpawnDye.y);
    r3 = vec4(uSpawnDye.z, 0.0, 0.0, 0.0);
    type = int(uSpawn.y);
  }

  if(type==5){    /* spring piston: a body chasing its oscillating target */
    vec2 axis = vec2(cos(r1.w), sin(r1.w));
    vec2 target = r3.yz + axis*r1.z*sin(uTime*r2.z + r2.w);
    vec2 pos = r0.xy, vel = r0.zw;
    vel += uPistonSpring*(target-pos)*uDt;
    vel *= exp(-uPistonDamp*uDt);
    collideBodies(slot, pos, vel, r1.y*uEntityScale, uMassPiston);
    pos += vel*uDt;
    resolveWalls(pos, vel, r1.y*uEntityScale);
    resolveDynamic(pos, vel, r1.y*uEntityScale);
    r0 = vec4(pos,vel);
  }

  if(type==6){    /* predator: swims up the red-dye gradient, winds down */
    vec2 pos = r0.xy, vel = r0.zw;
    float life = clamp(r2.x / max(r3.w,1e-3), 0.0, 1.0);
    vec2 h = uPredSense*uSimTexel;               /* WIDE stencil: smell past vortex noise */
    float dR = texture(uDye,pos+vec2(h.x,0.0)).r;
    float dL = texture(uDye,pos-vec2(h.x,0.0)).r;
    float dT = texture(uDye,pos+vec2(0.0,h.y)).r;
    float dB = texture(uDye,pos-vec2(0.0,h.y)).r;
    vec2 g = vec2(dR-dL, dT-dB);
    float rnd = fract(sin(dot(vec2(uTime, float(slot)), vec2(12.9898,78.233)))*43758.5453);
    r2.w += (rnd*2.0-1.0)*4.0*uDt;               /* drifting random heading */
    vec2 wDir = vec2(cos(r2.w), sin(r2.w));
    float gl2 = length(g);
    float bias = clamp(gl2*uPredGreed, 0.0, 0.85); /* scent strength takes the wheel */
    vec2 dir = normalize(mix(wDir, g/max(gl2,1e-5), bias) + vec2(1e-5));
    /* wall repulsion with hysteresis: steer away AND drag the wander heading
       along, so an escaping predator stays committed outbound for a while */
    vec4 lvP = texture(uLevel, pos);
    float danger = 1.0 - smoothstep(r1.y*uEntityScale*1.5, r1.y*uEntityScale*5.0, lvP.r);
    if(danger > 0.001){
      vec2 away = lvP.gb;
      dir = normalize(mix(dir, away, min(danger*1.6, 1.0)));
      float tA = atan(away.y, away.x);
      float dA = mod(tA - r2.w + 3.14159265, 6.2831853) - 3.14159265;
      r2.w += dA * min(danger*5.0*uDt, 1.0);
    }
    vec2 fluidUv = fluidRing(pos, r1.y*uEntityScale);
    vel += (dir*r1.z*life + uDragK*(fluidUv-vel))*uDt;
    vel *= exp(-uLinDamp*uDt);
    collideBodies(slot, pos, vel, r1.y*uEntityScale, uMassPred);
    pos += vel*uDt;
    resolveWalls(pos, vel, r1.y*uEntityScale);
    vel *= exp(-uGelDrag*0.8*clamp(texture(uGel,pos).r/max(uGelSolid,1e-3),0.0,1.5)*uDt);
    resolveDynamic(pos, vel, r1.y*uEntityScale);
    r0 = vec4(pos,vel);
  }

  if(type==1){    /* player */
    vec2 pos = r0.xy, vel = r0.zw;
    r2.z += uInput.z*uSpinAccel*uDt;                /* spin omega */
    r2.z *= exp(-uSpinDamp*uDt);
    r2.w += r2.z*uDt;                               /* spin angle, for the glyph */
    vec2 fluidUv = fluidRing(pos, r1.y*uEntityScale)*uFlowPush;   /* feel the current */
    vel += (uInput.xy*uThrust + uDragK*(fluidUv-vel)) * uDt;
    vel *= exp(-uLinDamp*uDt);
    pos += vel*uDt;
    resolveWalls(pos, vel, r1.y*uEntityScale);
    vel *= exp(-uGelDrag*0.8*clamp(texture(uGel,pos).r/max(uGelSolid,1e-3),0.0,1.5)*uDt);
    resolveDynamic(pos, vel, r1.y*uEntityScale);
    for(int o=1;o<64;o++){
      vec4 or1 = texelFetch(uActors, ivec2(o,1), 0);
      int ot = int(or1.x);
      if(ot!=2 && ot!=3 && ot!=5 && ot!=6) continue;
      vec4 or0 = texelFetch(uActors, ivec2(o,0), 0);
      vec2 dT2 = (pos-or0.xy)/uSimTexel;
      float rr = (r1.y + or1.y)*uEntityScale;
      float dist = length(dT2);
      if(dist<rr && dist>1e-4){
        vec2 nn = dT2/dist;
        float mO = massOf(ot);
        float mP = max(uMassPlayer,0.05);
        pos += nn*(rr-dist)*0.75*(mO/(mP+mO))*uSimTexel;
        vec2 vT = vel/uSimTexel;
        vec2 ovT = or0.zw/uSimTexel;
        float rel = dot(vT-ovT, nn);
        if(rel<0.0){
          float j = -(1.0+clamp(uRestitution,0.0,1.0))*rel/(1.0/mP+1.0/mO);
          vT += (j/mP)*nn;
          vT += uSpinKick*r2.z*rr*vec2(-nn.y,nn.x); /* spin-biased deflection */
          r2.z *= 0.8;
        }
        float relA = dot(vT-ovT, nn);      /* bounce floor: always a visible pop */
        if(relA < uBounceFloor) vT += (uBounceFloor-relA)*(mO/(mP+mO))*nn;
        vel = vT*uSimTexel;
      }
    }
    vec2 rUv = vec2(r1.y*uEntityScale)*uSimTexel;
    pos = clamp(pos, rUv, vec2(1.0)-rUv);
    r0 = vec4(pos,vel);
  }

  if(type!=0 && r2.x>=0.0){
    r2.x -= uDt;
    if(r2.x<=0.0){ r1.x = 0.0; }
  }
  fragColor = (row==0)?r0 : (row==1)?r1 : (row==2)?r2 : r3;
}
`;

export const splatVS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
uniform sampler2D uActors;
uniform int   uTarget;
uniform vec2  uSimTexel;
uniform float uExtentMul;
uniform float uEntityScale;
flat out vec4 vR0; flat out vec4 vR1; flat out vec4 vR2; flat out vec4 vR3;
out vec2 vLocal;
bool writesTarget(int type,int target){
  if(target==0) return type==2 || type==3 || type==6;  /* predators suck */
  if(target==1) return type==3 || type==6 || type==10;  /* +10: temp emitter to dye.a */
  if(target==2) return type==1 || type==5 || type==6; /* boundaries */
  if(target==3) return type==6;                       /* dissipation wake */
  return false;
}
void main(){
  int slot = gl_InstanceID;
  vR0 = texelFetch(uActors, ivec2(slot,0), 0);
  vR1 = texelFetch(uActors, ivec2(slot,1), 0);
  vR2 = texelFetch(uActors, ivec2(slot,2), 0);
  vR3 = texelFetch(uActors, ivec2(slot,3), 0);
  vLocal = aCorner;
  if(!writesTarget(int(vR1.x), uTarget)){ gl_Position = vec4(-2.0,-2.0,0.0,1.0); return; }
  vec2 extent = vR1.y*uEntityScale*uExtentMul*uSimTexel;
  gl_Position = vec4((vR0.xy + aCorner*extent)*2.0-1.0, 0.0, 1.0);
}
`;

export const SPLAT_FRAG_IN = `#version 300 es
precision highp float;
in vec2 vLocal;
flat in vec4 vR0; flat in vec4 vR1; flat in vec4 vR2; flat in vec4 vR3;
out vec4 fragColor;
`;

export const splatForceFS = SPLAT_FRAG_IN + `uniform float uDt;
uniform float uPredSuck;
uniform float uResScale;       /* SIM_H / 270: tunables are defined at the reference grid */
void main(){
  float g = exp(-dot(vLocal,vLocal)*4.5);
  int t = int(vR1.x);
  if(t==6){
    /* spiral mouth: a pure radial sink is irrotational and the pressure
     * projection deletes it. The tangential part is divergence-free and
     * SURVIVES the solve — predators are hungry vortices. Spin sign: r3.x. */
    float life = clamp(vR2.x/max(vR3.w,1e-3), 0.0, 1.0);
    float l = length(vLocal);
    vec2 toC = l>1e-3 ? -vLocal/l : vec2(0.0);
    vec2 tang = vec2(-toC.y, toC.x) * (vR3.x>=0.0 ? 1.0 : -1.0);
    vec2 f = (tang + toC*0.5) * uPredSuck * uResScale * life * g;
    fragColor = vec4(f*uDt, 0.0, 0.0);
  } else {
    vec2 dir = vec2(cos(vR1.w), sin(vR1.w));
    fragColor = vec4(dir*vR1.z*uResScale*g*uDt, 0.0, 0.0);
  }
}
`;

export const splatDyeFS = SPLAT_FRAG_IN + `uniform float uDt;
uniform float uEmitScale;
uniform float uEatRate;
uniform float uTempEmitScale;
void main(){
  float g = exp(-dot(vLocal,vLocal)*4.5);
  int t = int(vR1.x);
  if(t==6){
    float life = clamp(vR2.x/max(vR3.w,1e-3), 0.0, 1.0);
    fragColor = vec4(vec3(-uEatRate*g*uDt*life), 0.0);
  } else if(t==10){
    /* temperature emitter: writes heat/cold to alpha (dye.a = temperature) */
    fragColor = vec4(0.0, 0.0, 0.0, vR1.z*uTempEmitScale*g*uDt);
  } else {
    fragColor = vec4(vec3(vR2.z,vR2.w,vR3.x)*vR1.z*uEmitScale*g*uDt, 0.0);
  }
}
`;

export const splatWakeFS = SPLAT_FRAG_IN + `uniform float uDt;
uniform float uWakeDeposit;
void main(){
  float g = exp(-dot(vLocal,vLocal)*4.5);
  float life = clamp(vR2.x/max(vR3.w,1e-3), 0.0, 1.0);
  fragColor = vec4(uWakeDeposit*g*life*uDt, 0.0, 0.0, 0.0);
}
`;

export const splatMaskFS = SPLAT_FRAG_IN + `uniform vec2 uSimTexel;
uniform float uEntityScale;
void main(){
  float rTex = vR1.y*uEntityScale;
  float dTex = length(vLocal)*rTex*1.1;
  float cov = 1.0 - smoothstep(rTex-1.0, rTex, dTex);
  vec2 velTexels = vR0.zw/uSimTexel;                          /* (!!) per axis */
  float spin = (int(vR1.x)==1) ? vR2.z : 0.0;                 /* player only */
  vec2 tang = length(vLocal)>1e-3 ? vec2(-vLocal.y,vLocal.x)/length(vLocal) : vec2(0.0);
  vec2 spinTex = tang * spin * dTex;        /* rim velocity: Magnus emerges in the solve */
  fragColor = vec4((velTexels+spinTex)*cov, 0.0, cov);
}
`;

export const glyphVS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
uniform sampler2D uActors;
uniform vec2  uSimTexel;
uniform float uExtentMul;
uniform float uEntityScale;
flat out vec4 vR0; flat out vec4 vR1; flat out vec4 vR2; flat out vec4 vR3;
flat out float vSlot;
out vec2 vLocal;
void main(){
  int slot = gl_InstanceID;
  vR0 = texelFetch(uActors, ivec2(slot,0), 0);
  vR1 = texelFetch(uActors, ivec2(slot,1), 0);
  vR2 = texelFetch(uActors, ivec2(slot,2), 0);
  vR3 = texelFetch(uActors, ivec2(slot,3), 0);
  vSlot = float(slot);
  vLocal = aCorner;
  if(int(vR1.x)==0){ gl_Position = vec4(-2.0,-2.0,0.0,1.0); return; }
  vec2 extent = vR1.y*uEntityScale*uExtentMul*uSimTexel;
  gl_Position = vec4((vR0.xy + aCorner*extent)*2.0-1.0, 0.0, 1.0);
}
`;

export const ghostVS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
uniform vec2  uGhostPos;
uniform float uGhostRadius;
uniform float uGhostAngle;
uniform float uGhostType;
uniform vec4  uGhostDye;
uniform vec2  uSimTexel;
uniform float uExtentMul;
uniform float uEntityScale;
flat out vec4 vR0; flat out vec4 vR1; flat out vec4 vR2; flat out vec4 vR3;
flat out float vSlot;
out vec2 vLocal;
void main(){
  vR0 = vec4(uGhostPos, 0.0, 0.0);
  vR1 = vec4(uGhostType, uGhostRadius, 0.0, uGhostAngle);
  vR2 = vec4(-1.0, 0.0, uGhostDye.x, uGhostDye.y);
  vR3 = vec4(uGhostDye.z, 0.0, 0.0, 0.0);
  vSlot = -1.0;
  vLocal = aCorner;
  vec2 extent = uGhostRadius*uEntityScale*uExtentMul*uSimTexel;
  gl_Position = vec4((uGhostPos + aCorner*extent)*2.0-1.0, 0.0, 1.0);
}
`;

export const glyphFS = SPLAT_FRAG_IN + SPECIES + `flat in float vSlot;
uniform float uGhost;
uniform float uGhostValid;
uniform int   uSelected;
uniform float uPaintGlow;   /* 0 off, 1 fabricating (purple), 2 dissolving (yellow) */
uniform float uTime;
vec2 rot(vec2 p, float a){ float c=cos(a), s=sin(a); return vec2(c*p.x+s*p.y, -s*p.x+c*p.y); }
void main(){
  int type = int(vR1.x);
  float len = length(vLocal);
  vec4 col = vec4(0.0);
  if(type==1){
    float fill = 1.0-smoothstep(0.52,0.58,len);
    float ring = smoothstep(0.46,0.52,len)*(1.0-smoothstep(0.58,0.64,len));
    vec2 p = rot(vLocal, vR2.w);                    /* spin angle */
    float a = atan(p.y,p.x);
    float ticks = step(0.7,abs(sin(a*1.5)))*step(0.30,len)*(1.0-smoothstep(0.46,0.52,len));
    vec3 c = mix(vec3(0.92,0.95,1.0), vec3(1.0,0.85,0.4), ticks);
    col = vec4(c, max(fill*0.25+ring*0.9, ticks*(0.5+0.4*min(abs(vR2.z)*0.15,1.0))));
    if(uPaintGlow>0.5){       /* wall action LIVE: subtle pulsing halo */
      vec3 gc = uPaintGlow>1.5 ? vec3(1.0,0.85,0.25) : vec3(0.72,0.42,1.0);
      float pulse = 0.55+0.45*sin(uTime*6.0);
      float halo = smoothstep(0.55,0.78,len)*(1.0-smoothstep(0.82,1.0,len));
      col = vec4(mix(col.rgb, gc, min(halo*pulse,1.0)), max(col.a, halo*0.5*pulse));
    }
  } else if(type==2){
    float ring = smoothstep(0.40,0.46,len)*(1.0-smoothstep(0.52,0.58,len));
    vec2 p = rot(vLocal, vR1.w);
    float shaft = (p.x>-0.05 && p.x<0.30 && abs(p.y)<0.07) ? 1.0 : 0.0;
    float head  = (p.x>=0.25 && p.x<0.52 && abs(p.y)<(0.52-p.x)*0.7) ? 1.0 : 0.0;
    float locked = mod(floor(vR2.y), 2.0);
    vec3 c = mix(vec3(0.45,0.95,1.0), vec3(0.55,0.60,0.70), locked);
    col = vec4(c, max(ring*0.9, max(shaft,head)*0.95));
  } else if(type==3){
    float fill = 1.0-smoothstep(0.30,0.36,len);
    float ring = smoothstep(0.42,0.48,len)*(1.0-smoothstep(0.52,0.58,len));
    vec2 p = rot(vLocal, vR1.w);
    float spout = (p.x>0.3 && p.x<0.62 && abs(p.y)<0.10) ? 1.0 : 0.0;
    vec3 dye = vec3(vR2.z,vR2.w,vR3.x);
    vec3 c = normalize(speciesToDisplay(max(dye,vec3(0.0)))+vec3(1e-4))*1.15;
    col = vec4(c, max(max(fill*0.9, ring*0.7), spout*0.85));
  } else if(type==5){
    vec2 p = rot(vLocal, vR1.w);                  /* square, axis-aligned */
    float bx = max(abs(p.x), abs(p.y));
    float fill = 1.0-smoothstep(0.46,0.52,bx);
    float ring = smoothstep(0.52,0.56,bx)*(1.0-smoothstep(0.62,0.68,bx));
    col = vec4(mix(vec3(0.22,0.24,0.30), vec3(1.0,0.72,0.25), ring),
               max(fill*0.9, ring*0.85));
  } else if(type==6){
    float life = clamp(vR2.x/max(vR3.w,1e-3), 0.0, 1.0);
    vec2 p = rot(vLocal, vR2.w*2.5);
    float a = atan(p.y,p.x);
    float blades = smoothstep(0.2,0.6,sin(a*3.0))*(1.0-smoothstep(0.30,0.55,len))*step(0.10,len);
    float ring = smoothstep(0.50,0.56,len)*(1.0-smoothstep(0.60,0.66,len));
    vec3 c = mix(vec3(0.55,0.20,0.75), vec3(1.0,0.40,0.50), life);
    col = vec4(c, max(blades*0.9, ring*0.8)*(0.35+0.65*life));
  } else if(type==7){
    float fr = clamp(vR2.w, 0.0, 1.0);
    float rad = 0.22 + 0.34*fr;
    float iris = smoothstep(rad,rad+0.05,len)*(1.0-smoothstep(rad+0.10,rad+0.16,len));
    float outer = smoothstep(0.60,0.66,len)*(1.0-smoothstep(0.70,0.76,len));
    col = vec4(vec3(0.85,0.35,0.90), max(iris*0.85, outer*0.6));
  } else if(type==9){
    float ring = smoothstep(0.74,0.80,len)*(1.0-smoothstep(0.90,0.96,len));
    float dash = step(0.45, fract(atan(vLocal.y,vLocal.x)*1.9099 + vR1.w));
    vec3 c = vec3(vR2.z,vR2.w,vR3.x);
    col = vec4(c, ring*max(dash,0.3)*0.9);
  } else if(type==8){
    float tier = vR1.z;                /* spin pickups throb by tier */
    float th = tier>0.5 ? 1.0 + (0.04+0.05*tier)*sin(uTime*(2.0+2.2*tier)) : 1.0;
    vec2 p = rot(vLocal, 0.7854)/th;
    float dm = abs(p.x)+abs(p.y);
    float core = 1.0-smoothstep(0.24,0.32,dm);
    float ring = smoothstep(0.52,0.58,len/th)*(1.0-smoothstep(0.64,0.70,len/th));
    vec3 c = normalize(speciesToDisplay(max(vec3(vR2.z,vR2.w,vR3.x),vec3(0.0)))+vec3(1e-4))*1.25;
    if(tier>0.5){
      float hot = 0.55+0.45*sin(uTime*(2.0+2.2*tier));
      c = mix(c, vec3(1.45,0.30,0.22), (0.22+0.18*tier)*hot);
    }
    col = vec4(c, max(core*0.95, ring*0.55));
  } else if(type==10){
    /* temperature emitter: warm core (hot=orange, cold=blue) */
    float fill = 1.0-smoothstep(0.30,0.36,len);
    float ring = smoothstep(0.42,0.48,len)*(1.0-smoothstep(0.52,0.58,len));
    float isHot = step(0.0, vR1.z);
    vec3 c = mix(vec3(0.25,0.55,1.0), vec3(1.0,0.55,0.15), isHot);
    float pulse = 0.7 + 0.3*sin(uTime*3.0);
    col = vec4(c*pulse, max(fill*0.85, ring*0.75));
  }
  if(uGhost>0.5){
    col.rgb = mix(vec3(1.0,0.35,0.30), col.rgb*0.6+vec3(0.2,0.5,0.25), uGhostValid);
    col.a *= 0.55;
  } else if(uSelected>0 && int(vSlot)==uSelected){
    col.rgb = col.rgb*1.4 + vec3(0.15);
    col.a = min(col.a*1.25 + 0.12*(1.0-smoothstep(0.85,1.0,len)), 1.0);
  }
  fragColor = col;
}
`;

export const brightFS = FRAG_HEADER + SPECIES + `uniform sampler2D uDye;
uniform float uThreshold;
uniform vec3  uBloomW;        /* per-species: red blooms like an ember */
void main(){
  vec3 c = max(texture(uDye,vUv).rgb*uBloomW - vec3(uThreshold), vec3(0.0));
  fragColor = vec4(speciesToDisplay(c), 1.0);
}
`;

export const blurFS = FRAG_HEADER + `uniform sampler2D uSrc;
uniform vec2 uDir;
void main(){
  vec3 s = texture(uSrc,vUv).rgb*0.227027;
  s += texture(uSrc, vUv+uDir*1.3846).rgb*0.3162162;
  s += texture(uSrc, vUv-uDir*1.3846).rgb*0.3162162;
  s += texture(uSrc, vUv+uDir*3.2308).rgb*0.0702703;
  s += texture(uSrc, vUv-uDir*3.2308).rgb*0.0702703;
  fragColor = vec4(s, 1.0);
}
`;

export const compositeFS = FRAG_HEADER + SPECIES + `uniform sampler2D uDye;
uniform sampler2D uLevel;
uniform sampler2D uRegions;
uniform sampler2D uBloom;
uniform sampler2D uVelocity;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform sampler2D uCurl;
uniform sampler2D uObstacle;
uniform sampler2D uScoreAcc;
uniform sampler2D uGel;
uniform sampler2D uMedia;
uniform sampler2D uWake;
uniform vec4 uWin;            /* game window rect u0,v0,u1,v1 */
uniform sampler2D uWalls;
uniform vec2  uSimTexel;
uniform int   uDebugMode;
uniform float uTime;
uniform float uTonemapK;
uniform float uBloomStrength;
uniform float uSinkHeat;
uniform float uTriggerHeat;
uniform float uPulsePhase;
uniform float uPulseAmp;
uniform float uSinkHueDrift;
uniform float uDynTrig;
uniform sampler2D uDyn;
uniform float uHueShift;
uniform float uFlowGlow;
uniform float uStreak;
uniform float uCurlTint;
uniform float uSchlieren;
uniform float uSpeciesFx;
uniform float uGelGlow;
uniform float uThermalVis;
uniform float uThermalFloor;
uniform float uTempAmbient;
uniform float uTempMax;
uniform float uResScale;
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
  return c.z*mix(K.xxx, clamp(p-K.xxx,0.0,1.0), c.y);
}
vec3 hueRotate(vec3 col, float a){
  vec3 k = vec3(0.57735026);
  float c = cos(a), s = sin(a);
  return col*c + cross(k,col)*s + k*dot(k,col)*(1.0-c);
}
vec3 heatRamp(float h){
  vec3 c = mix(vec3(0.30,0.05,0.04), vec3(0.95,0.40,0.05), smoothstep(0.0,0.35,h));
  c = mix(c, vec3(1.00,0.85,0.25), smoothstep(0.35,0.70,h));
  c = mix(c, vec3(1.05,1.08,1.35), smoothstep(0.70,1.00,h));
  return c;
}
void main(){
  if(uDebugMode==1){
    vec2 dv = texture(uVelocity,vUv).xy; float m = length(dv);
    fragColor = vec4(hsv2rgb(vec3(atan(dv.y,dv.x)/6.2832+0.5, 0.85, clamp(m*0.012,0.0,1.0))),1.0); return;
  }
  if(uDebugMode==2){ fragColor = vec4(vec3(0.5+texture(uPressure,vUv).r*0.06),1.0); return; }
  if(uDebugMode==3){ float d=texture(uDivergence,vUv).r; fragColor = vec4(vec3(0.5)+vec3(d*2.0,-d*2.0,0.0),1.0); return; }
  if(uDebugMode==4){ float c=texture(uCurl,vUv).r; fragColor = vec4(vec3(0.5)+vec3(c,-c,0.0)*0.08,1.0); return; }
  if(uDebugMode==5){
    float d = texture(uLevel,vUv).r;
    vec3 c = d<0.0 ? vec3(0.85,0.30,0.20) : vec3(0.20,0.50,0.90);
    fragColor = vec4(c*(0.35+0.65*abs(sin(d*0.7))),1.0); return;
  }
  if(uDebugMode==6){ vec4 o=texture(uObstacle,vUv); fragColor = vec4(o.b, 0.5+o.r*0.01, 0.5+o.g*0.01, 1.0); return; }
  if(uDebugMode==7){
    vec4 s = texture(uScoreAcc,vUv);
    fragColor = vec4(vec3(1.0,0.6,0.2)*clamp(s.r*0.05,0.0,1.0) + vec3(0.1,0.5,0.7)*clamp(s.a*0.05,0.0,1.0),1.0); return;
  }
  if(uDebugMode==8){ float g=texture(uGel,vUv).r; fragColor = vec4(vec3(0.4,0.8,0.9)*clamp(g,0.0,1.0),1.0); return; }
  if(uDebugMode==9){ float w9=texture(uWake,vUv).r; fragColor = vec4(vec3(0.9,0.5,0.2)*w9,1.0); return; }
  if(uDebugMode==10){ float tv=texture(uDye,vUv).a; fragColor = vec4(tv*vec3(1.0,0.3,0.1) + max(uTempAmbient-tv,0.0)*vec3(0.1,0.3,1.0), 1.0); return; }

  float Tsim = texture(uDye,vUv).a;

  vec2 v = texture(uVelocity,vUv).xy;
  float spd = length(v)/uResScale;            /* normalized to reference-grid texels/s */
  vec3 d = texture(uDye,vUv).rgb;             /* SPECIES space: r=cargo g=reagent b=builder */
  if(uStreak>0.001 && spd>0.5){
    vec2 off = (v/spd)*uSimTexel*(uStreak*min(spd*0.02,1.0));
    d.r = texture(uDye,vUv-off*0.7).r;        /* cargo: tight, ember-like */
    d.b = texture(uDye,vUv+off*1.8).b;        /* builder: glassy, smeared */
  }
  d.g *= 1.0 + 0.16*uSpeciesFx*sin(uTime*7.0 + dot(vUv,vec2(53.0,91.0)));  /* reagent scintillates */
  d = max(d, vec3(0.0));
  vec3 disp = speciesToDisplay(d);            /* aesthetics enter ONLY here */
  disp *= 1.0 + uFlowGlow*min(spd*0.012,1.0);
  float Lr = 1.0 - exp(-dot(d,vec3(0.5))*uTonemapK*2.0);   /* dye presence, 0..1 */
  float cr = texture(uCurl,vUv).r;
  if(abs(uHueShift)>0.001) disp = hueRotate(disp,uHueShift);
  /* tonemap: exposure scales with absolute temperature (blackbody-inspired).
     thermalFloor = minimum multiplier at T=0 (cold).
     thermalVis = dynamic range added by temperature above the floor. */
  float Tnorm = Tsim / max(uTempMax, 1e-3);   /* 0..1 normalized absolute temperature */
  float tempK = uTonemapK * (uThermalFloor + uThermalVis * Tnorm / (1.0 + Tnorm));
  vec3 col = vec3(1.0) - exp(-disp*tempK);
  vec3 blm = texture(uBloom,vUv).rgb;
  if(abs(uHueShift)>0.001) blm = hueRotate(blm,uHueShift);
  col += blm*uBloomStrength;
  /* curl tint: overall strength = uCurlTint; saturation ~ dye concentration^2 */
  float w = Lr*Lr;
  vec3 tint = cr>0.0 ? vec3(0.85,0.35,1.00) : vec3(0.25,1.00,0.85);
  col += tint*abs(cr)*0.05*uCurlTint*w;
  /* ambient schlieren: ONLY where dye is absent; arriving dye develops it away
     into the curl tint above (the two crossfade on Lr) */
  float s = cr*(1.0 - smoothstep(0.0,0.30,Lr));
  col += mix(vec3(0.16,0.12,0.10), vec3(0.10,0.13,0.18), step(0.0,s))*abs(s)*uSchlieren*0.05;
  /* media + amp field legibility */
  vec3 m = texture(uMedia,vUv).rgb;
  float dev = clamp(length(m-vec3(1.0)),0.0,1.5);
  float hatch = 0.6+0.4*step(0.5,fract((vUv.x-vUv.y*0.5)*80.0));
  col += vec3(0.06,0.04,0.10)*dev*hatch*0.5;
  /* gel membrane: icy panes with a live rim */
  float gel = texture(uGel,vUv).r;
  float gR = texture(uGel,vUv+vec2(uSimTexel.x,0.0)).r;
  float gT = texture(uGel,vUv+vec2(0.0,uSimTexel.y)).r;
  float gEdge = clamp((abs(gel-gR)+abs(gel-gT))*6.0, 0.0, 1.0);
  float mem = smoothstep(0.06,0.45,gel);
  vec3 gcol = mix(vec3(0.45,0.62,0.78), vec3(0.78,0.92,1.05), smoothstep(0.4,1.1,gel));
  col = mix(col, gcol*(0.5+0.4*min(gel,1.3)), mem*0.62*clamp(uGelGlow,0.0,2.0));
  col += vec3(0.45,0.75,1.0)*gEdge*mem*uGelGlow*(0.30+0.18*sin(uTime*2.2+(vUv.x+vUv.y)*34.0));
  /* flow lanes: drawn current, chevron bands marching along the lane */
  vec4 lnv = texture(uDyn,vUv);
  float lm = length(lnv.gb);
  if(lm>0.05){
    vec2 dirn = lnv.gb/lm;
    float pw = clamp(lnv.a,0.0,1.0);     /* powered zones run warm */
    float band = smoothstep(0.45,0.95,sin(dot(vUv*vec2(16.0,9.0), dirn)*22.0 - uTime*4.0));
    col = mix(col, col + mix(vec3(0.05,0.18,0.20), vec3(0.15,0.10,0.03), pw), 0.45*min(lm,1.0));
    col += mix(vec3(0.20,0.62,0.70), vec3(0.95,0.62,0.20), pw)*band*0.16*min(lm,1.0);
  }
  /* dynamite charges: packed amber solid; white-hot where firing */
  float dynv = texture(uDyn,vUv).r;
  if(dynv>0.04){
    float pk = smoothstep(0.04,0.7,dynv);
    float grain = 0.85+0.15*sin((vUv.x*1.7+vUv.y)*900.0);
    col = mix(col, vec3(0.46,0.30,0.11)*grain*(0.55+0.35*dynv), pk*0.85);
    float fire = dynv*smoothstep(uDynTrig*0.55, uDynTrig, texture(uDye,vUv).r);
    col += vec3(1.25,0.95,0.55)*fire*(1.1+0.9*sin(uTime*41.0));
  }
  /* predator wake: dead, murky water */
  float wkm = texture(uWake,vUv).r;
  col = mix(col, col*vec3(0.50,0.56,0.66), wkm*0.4);
  /* zones */
  vec4 z = texture(uRegions,vUv);
  if(z.r>0.01){
    /* whole-region pulse from darkness; CPU raises the beat with flow rate,
     * amplitude rises with it here. No spatial wave: the basin breathes. */
    float w = pow(max(sin(uPulsePhase), 0.0), 2.2);
    vec3 sc = heatRamp(uSinkHeat) * (0.16 + (0.30 + 0.95*uSinkHeat)*w);
    if(uSinkHueDrift>0.001){            /* over threshold: the hue walks */
      const vec3 kx = vec3(0.57735027);
      float ca = cos(uSinkHueDrift), sa = sin(uSinkHueDrift);
      sc = sc*ca + cross(kx,sc)*sa + kx*dot(kx,sc)*(1.0-ca);
    }
    col = mix(col, sc, z.r*0.55);
    /* absorption halo: white rim where red is actually being eaten */
    vec2 e2 = vec2(0.0030, 0.0030*16.0/9.0);
    float rim = z.r - min(min(texture(uRegions,vUv+vec2(e2.x,0.0)).r,
                              texture(uRegions,vUv-vec2(e2.x,0.0)).r),
                          min(texture(uRegions,vUv+vec2(0.0,e2.y)).r,
                              texture(uRegions,vUv-vec2(0.0,e2.y)).r));
    float eat = smoothstep(0.02, 0.22, texture(uDye,vUv).r);
    col += vec3(1.05,1.02,0.92) * clamp(rim,0.0,1.0) * eat * (0.45 + uPulseAmp*0.8*w);
  }
  if(z.g>0.01){
    float st = step(0.5, fract((vUv.x-vUv.y)*40.0 + uTime*0.5));
    col = mix(col, vec3(0.45,0.05,0.07)*(0.55+0.35*st), z.g*0.55);
  }
  if(z.b>0.01){
    vec3 tc = mix(vec3(0.08,0.22,0.28), vec3(0.75,1.05,1.15), uTriggerHeat);
    float p2 = 0.6 + 0.25*sin(uTime*2.0 + vUv.y*14.0);
    col = mix(col, tc*p2, z.b*0.50);
  }
  if(z.a>0.01){
    float st = 0.5+0.3*sin(uTime*3.0 + vUv.x*30.0);
    col = mix(col, vec3(0.55,0.15,0.60)*st, z.a*0.45);
  }
  /* removable walls: panelled slate with a cyan seam (vs immutable dark) */
  vec2 wpair = texture(uWalls,vUv).rg;
  float wallv = wpair.r;
  if(wallv>0.05){
    float hat = 0.85 + 0.15*step(0.5, fract((vUv.x+vUv.y)*120.0));
    float wl=texture(uWalls,vUv-vec2(uSimTexel.x,0.0)).r, wr2=texture(uWalls,vUv+vec2(uSimTexel.x,0.0)).r;
    float wb=texture(uWalls,vUv-vec2(0.0,uSimTexel.y)).r, wt=texture(uWalls,vUv+vec2(0.0,uSimTexel.y)).r;
    float wedge = clamp(abs(wr2-wl)+abs(wt-wb), 0.0, 1.0);
    col = mix(col, vec3(0.16,0.19,0.26)*hat, smoothstep(0.35,0.6,wallv));
    col += vec3(0.20,0.50,0.75)*wedge*0.55;
  }
  if(wpair.g>0.05){                            /* steel: riveted, blast-proof */
    float riv = step(0.92, fract(vUv.x*70.0)*fract(vUv.y*39.4));
    float sl=texture(uWalls,vUv-vec2(uSimTexel.x,0.0)).g, sr=texture(uWalls,vUv+vec2(uSimTexel.x,0.0)).g;
    float sb=texture(uWalls,vUv-vec2(0.0,uSimTexel.y)).g, st=texture(uWalls,vUv+vec2(0.0,uSimTexel.y)).g;
    float sedge = clamp(abs(sr-sl)+abs(st-sb), 0.0, 1.0);
    col = mix(col, vec3(0.23,0.25,0.29) + vec3(0.10)*riv, smoothstep(0.35,0.6,wpair.g));
    col += vec3(0.55,0.60,0.70)*sedge*0.45;
  }
  /* walls */
  float dd = texture(uLevel,vUv).r;
  float solidA = 1.0 - smoothstep(0.0, 1.2, dd);
  col = mix(col, vec3(0.10,0.12,0.17), solidA);
  col += vec3(0.35,0.55,0.95)*(1.0-smoothstep(0.0,2.2,abs(dd)))*0.18;
  vec2 q = vUv-0.5;
  col *= 1.0 - 0.25*dot(q,q);
  if(uWin.z - uWin.x < 0.999){                 /* sub-full game window chrome */
    vec2 wc = 0.5*(uWin.xy + uWin.zw);
    vec2 wh = 0.5*(uWin.zw - uWin.xy);
    vec2 wq = abs(vUv - wc) - wh;
    float wsd = length(max(wq,0.0)) + min(max(wq.x,wq.y),0.0);
    if(wsd > 0.0) col = col*0.06 + vec3(0.015,0.018,0.028);   /* page backdrop */
    float wfr = 1.0 - smoothstep(0.0, uSimTexel.y*2.2, abs(wsd));
    col += vec3(0.16,0.30,0.40)*wfr;                          /* subtle frame */
  }
  fragColor = vec4(col, 1.0);
}
`;

