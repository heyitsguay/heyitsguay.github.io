#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

const float PI = 3.14159265;
const float TAU = 2. * PI;

uniform float time;
uniform vec2 resolution;
uniform float startSeed;

uniform float dScale; // 50. = 4**2.82
uniform float shadowDecay; // 0.1
uniform float shadowOnset; // 100. = 10**2
uniform float shadowStrength; // 0.03
uniform float onsetStrength; // 1.
uniform float innerGlow; // 0.8
uniform float outerShadow; // 0.
uniform float patternStrength; // 0.03
uniform float patternFrequency; // 2.
uniform float patternPhase; // 0.
uniform float maxBrightness; // 0.9
uniform float nSymmetries; // 4
uniform float recurseScale; // 0.5 = 2**-1
uniform int nRecursions; // 4
uniform float recursionDecay;
uniform float rotPerLevel; // 0.0625 = 4**-2
uniform float wiggleBase; // 0.0125 = 4**-3.16
uniform float wiggleRadSlope;
uniform float wiggleRadStart;
uniform float wiggleFrequency; // 4
uniform float wiggleRScale; // 4
uniform float wiggleTScale; // 1
uniform float hyperbolaWidth; // 0.0005 = 10**-3.3
uniform float hyperbolaScale; // 1
uniform float circle1Width; // 0.1
uniform float circle2Width; // 0.05
uniform float tentacleBlunter; // 0.008 = 10**-3.09


float hash21(vec2 t) {
  vec3 p = vec3(t.x, t.y, startSeed);
  vec3 p3 = fract(p * .1031);
  p3 += dot(p3, p3.yzx * 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 hash24(vec2 t) {
  vec3 p = vec3(t.x, t.y, startSeed);
  vec4 p4 = fract(p.xzyz * vec4(.1031, .1030, .0973, .1099));
  p4 += dot(p4, p4.wzxy+33.33);
  return fract((p4.xxyz+p4.yzzw)*p4.zywx);
}


vec3 saturate(vec3 col) {
  return clamp(col, 0.0, 1.0);
}
float saturate(float col) {
  return clamp(col, 0., 1.);
}


float hsin(float x) {
  return 0.5 + 0.5*sin(x);
}


float hcos(float x) {
  return .5 + .5*sin(x);
}


void rot(inout vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  p = vec2(c*p.x + s*p.y, -s*p.x + c*p.y);
}

vec2 mod2(inout vec2 p, vec2 size)  {
  vec2 c = floor((p + size*0.5)/size);
  p = mod(p + size*0.5,size) - size*0.5;
  return c;
}


vec2 toRect(vec2 p) {
  return vec2(p.x*cos(p.y), p.x*sin(p.y));
}


vec2 toPolar(vec2 p) {
  return vec2(length(p), atan(p.y, p.x));
}


float box(vec2 p, vec2 b) {
  vec2 d = abs(p)-b;
  //return max(d.x,d.y)-b.x;
  return length(max(d,vec2(0))) + min(max(d.x,d.y),0.0);
}


float circle(vec2 p, float r) {
  return length(p) - r;
}

float hyperbola(vec2 p, float r) {
  return abs(p.x * p.y) - r;
}


float shadow_df(vec2 p, float phase) {
  vec2 pp = toPolar(p);
  //float a = TAU / nSymmetries;
  float r = pp.x;
  float t = pp.y;
  pp.y = abs(pp.y - PI); //pp.y/nSymmetries;
  p = toRect(pp);
  //p = abs(p);
  //p -= vec2(0.5);

  float d = 10000.;

  float recurseScaleNow = recurseScale;

  vec2 q = p;
  for(int i = 0; i < nRecursions; ++i) {
    //mod2(p, vec2(1.));
//    vec2 q = p;
    rot(q, rotPerLevel * TAU * float(i));

//    rot(q, wiggleBase*sin(wiggleFrequency * (wiggleRScale*r+wiggleTScale*t + saturate(wiggleRadSlope * (r - wiggleRadStart)) * (floor(rotPerLevel * float(i))))*TAU));
    rot(q, wiggleBase*sin(time * phase + wiggleFrequency * (wiggleRScale*r+wiggleTScale*t + float(mod(float(i), 1. / rotPerLevel)))*TAU));
    float sb = hyperbola(q,
      hyperbolaWidth * pow(float(nRecursions - i) / float(nRecursions), hyperbolaScale));
    float cb = circle(p, circle1Width);
    float cb2 = circle(p, circle2Width);
    float dd = min(sb, cb) + (tentacleBlunter + 0.001 * float(i * i))*cb2; // min(sb, cb);
    d = min(dd, d);
    q *= recurseScaleNow;
    recurseScaleNow = pow(recurseScaleNow, recursionDecay);
  }

  return d;
}


vec3 shadow_sample(vec2 p) {
  vec2 q = vec2(p.x, p.y);
  float d = shadow_df(q, 1.);
//  for (float i = 1.; i < 3.; ++i) {
//    d = min(d, shadow_df(q, 1. - 0.1 * i));
//  }
  d *= dScale;
//  float d = dScale * shadow_df(q);

  vec2 w = vec2(p.x, p.y);
  w.y += time;

  float intensity = 1. - shadowStrength * exp(-shadowDecay * (d * d))
                    + onsetStrength * exp(-shadowOnset * (d * d))
                    + innerGlow * float(d < 0.)
//                   - (outerShadow + patternStrength * hsin(patternFrequency * (p.x * p.x + p.y * p.y) + patternPhase)) * float(d > 0.);
                   - (outerShadow - patternStrength * sqrt(dot(p, p))) * float(d > 0.);

  return  maxBrightness * saturate(intensity * vec3(1, 1, 1));
}


vec3 shadow_main(vec2 p) {
  vec3 col = vec3(0.);
  vec2 unit = 1. / resolution.xy;
  const int aa = 2;
  const float ainv = 1. / float(aa);
  const float normalizer = ainv * ainv;
  for(int y = 0; y < aa; ++y) {
    for(int x = 0; x < aa; ++x) {
      col += shadow_sample(p - unit * ainv * vec2(x, y));
    }
  }
  col *= normalizer;
  return col;
}


out vec4 fragColor;
void main() {
  // Normalized pixel coordinates (from 0 to 1)
  vec2 uv = gl_FragCoord.xy/resolution.xy - vec2(0.5, 0.5);
  uv.x *= resolution.x / resolution.y;

  const float r = 0.1;

  vec3 col = shadow_main(uv);

  // Output to screen
  fragColor = vec4(col,1.0);
}
