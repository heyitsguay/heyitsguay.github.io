#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define NUM_PARTICLES 120.
#define T_SPEED 0.2
#define FIREWORK_SCALE 15.
#define GRAVITY 0.33
#define RING_STEP 0.5

#define TWOPI 6.28318530718

uniform float time;
uniform vec2 resolution;
uniform vec2 iResolution;
uniform float startSeed;
uniform float numParticles;
uniform float skyGlow;
uniform float frontHillDensity;
uniform float frontHillGlow;
uniform float backHillDensity;
uniform float backHillGlow;
uniform float starGlow;

struct Firework {
  float sparkleScale;
  float rMin;
  float rMax;
  float rPow;
  float dirYScale;
  float brightnessScale;
  float colorShift;
  float gravityScale;
  float nPetals;
  float rRound;
  float burstRate;
};

const Firework fireworks[4] = Firework[4](
  Firework(0., 0.1, 1., 0., 1., 1., 0., 1., 0., 0., 25.),
  Firework(1., 0.01, 1., 1., 0.3, 1., 0., 1., 0., 0., 25.),
  Firework(0.5, 0.3, 0.6, 0., 1., 1., 1., 2., 2., 0., 22.),
  Firework(1., RING_STEP, 1.5 * RING_STEP, 0., 1., 0.6, 0.5, 0.2, 0., 1., 6.)
);

const float iRingStep = 1. / RING_STEP;

//float sigmoid(float x, float c, float m) {
//  return 1. / (1. + exp(-m*(x-c)));
//}

float sigmoid(float x, float c, float m) {
  return clamp(0.5 + m * (x - c), 0., 1.);
}

float Hash11(float t) {
  return fract(sin(t*34.1674));
}

vec2 Hash12(float t) {
  return fract(sin(t * vec2(553.2379, 670.3438)));
}

vec3 Hash13(float t) {
  return fract(sin(t * vec3(483.9812, 691.3455, 549.7206)));
}

vec2 RandDirection(float seed, float rMin, float rMax, float rPow, float nPetals, float doRound) {
  vec3 xyt = Hash13(seed);
  float rScale = xyt.x * (1. - rPow) + xyt.x * xyt.x * xyt.x;
  float r = mix(rMin, rMax, rScale);
//  float r = mix(rMin, rMax, pow(xyt.x, rPow));
  r = mix(r, float(int(r * iRingStep)) * RING_STEP, doRound);
  float theta = TWOPI * (xyt.y + xyt.z);
  r *= mix(1., 1.+ cos(nPetals*theta), nPetals > 0.);
  return vec2(r*cos(theta), r*sin(theta));
}

// All components are in the range [01], including hue.
vec3 hsv2rgb(vec3 c)
{
    const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

out vec4 fragColor;
void main(void) {
  float tt = T_SPEED * 0.8 * time;
  float tCycle = 1. + floor(mod(tt, 99999.));
  float u = fract(tt);

  float imx = min(iResolution.x, iResolution.y);
  vec2 xy = gl_FragCoord.xy * imx;
  float yMax = resolution.y * imx;

  float hill1Mask = sigmoid(xy.y, yMax * (0.25 + 0.1 * sin(3. * xy.x)), 150.);
  float hill2Mask = sigmoid(xy.y, yMax * (0.33 + 0.08 * cos(5. * xy.x)), 50.);

  float yp = gl_FragCoord.y * iResolution.y;
  float dColor = (0.25 + skyGlow * (1. - yp * yp));
  vec3 color = vec3(0.025*dColor, 0., 0.075*dColor);
  color *= 0.2 + 0.8*hill2Mask;
  float hy = Hash11(0.141*gl_FragCoord.y);
  float starColor = 0.2 + 0.7 * pow(Hash11(gl_FragCoord.x + 18.2*hy), 3.);
  float starFlicker = (0.85 + 0.15 * cos(6. * time + 7.9 * hy));
  color += starGlow * hill2Mask * starColor * starFlicker * float(fract(31.163*xy.x*(hy+0.2)) < 0.02 && fract(51.853 * xy.y * starColor) < 0.02);

  float dHouse2 = 0.1 + 0.5*float(fract(31.163*xy.x*starColor) + sin(0.0001 * time + 51.853 * xy.y * (hy+0.2)));
  color += max(vec3(0),(1. - hill2Mask) * backHillGlow * min(vec3(1.,1.,1.), vec3(1., 0.7, 0.)* backHillDensity / dHouse2));
  vec3 hsf = Hash13(startSeed + 0.7132 * tCycle);
  float h = hsf.x;
  float s = 0.3 + 0.7 * hsf.y;
  float launchDist = (1. + 2. * hsf.z*hsf.z*hsf.z);
  float finalScale = launchDist * FIREWORK_SCALE;
  float launchFactor = (launchDist - 1.) * 0.5;

  vec2 rand1 = Hash12(tCycle * 1.674 + startSeed);
  vec2 center = vec2(0.2 + 0.6*rand1.x, 0.5-0.133*launchFactor+(0.35-0.1*launchFactor)*rand1.y);

  vec2 rand2 = Hash12(startSeed + 0.85358 * tCycle);
  vec2 start = vec2(0.3 + 0.4 * rand2.x, 0.);

  if (u < 0.2) {
    float t = 5. * u;
    vec2 p = t * center + (1. - t) * start;
    vec2 uv = finalScale * (gl_FragCoord.xy-p*resolution) * imx;
    vec3 cStart = hsv2rgb(vec3(h, 0.5*s, 0.6));
    float d = length(uv);
    color += 0.033 * cStart /d;

  } else {

  float t = 1.25 * (u-0.2);

  int idx = int(4. * Hash11(startSeed + tCycle * 0.1185));
  Firework firework = fireworks[idx];

  vec2 uv = finalScale * (gl_FragCoord.xy-center*resolution) * imx ;

  float tRamp = min(1., 10. * (1. - t));
  vec3 cBase = hsv2rgb(vec3(h, s, tRamp));

  vec2 mn = Hash12(startSeed + tCycle * 3.149);
  float sizeBase = 0.2 + 0.8 * mn.x;

  float rAddOn = float(idx == 3) * mn.y * 2.;

  float nPetalsFinal = firework.nPetals + float(firework.nPetals > 0.) * round(3. * mn.y);

  for (float i = 0.; i < numParticles; i++) {

    float size = sizeBase * mix(1., tRamp * (1.5 + 1.5 * sin(t * i)), firework.sparkleScale);

    vec2 dir = RandDirection(
      i + fract(0.17835497 * tCycle),
      firework.rMin,
      firework.rMax + RING_STEP*rAddOn,
      firework.rPow,
      nPetalsFinal,
      firework.rRound);
    dir.y *= firework.dirYScale;
    dir.y -= (1. + firework.gravityScale*t*t*t)*GRAVITY * sizeBase * sizeBase * t;

    float tRate = log(1. + (firework.burstRate + 5. * float(idx == 3) * float(2 - int(rAddOn))) * t);
    float d = length(uv - dir * tRate);
    float at = abs(t - 0.015);
    float bump = 0.012 / (1. + 40000. * at*at);
    float t3 = (t+0.2)*(t+0.2)*(t+0.2);
    float t6 = t3*t3;
    float t24 = t6*t6*t6*t6;

    float brightness = sqrt(size)*firework.brightnessScale*0.0013/(1.+ 9. * t24);
    float hNew = mod(i*0.1618033988, 1.);
    vec3 cNew = hsv2rgb(vec3(hNew, s, tRamp));
    vec3 particleColor = mix(cBase, cNew, firework.colorShift);
    float ds = d + 0.004;
    color += hill1Mask *  (bump + brightness * particleColor) / (ds*ds);
  }
  }
  color *= 0.75 + 0.25*hill2Mask;
  color *= hill1Mask;

  //color += (1. - hill1Mask) * 1.5 * vec3(1., 0.8, 0.)*starColor * float(abs(fract(-8.*xy.y) - fract(8.*xy.x*xy.x)) < 0.0002);
  //float dHouse1 = float(0.01+abs(fract(-8.*xy.y) - fract(8.*xy.x*xy.x)));

  float dHouse1 = 0.01 + 0.5*float(fract(31.163*xy.x*starColor) + sin(51.853 * xy.y * (hy+0.2)));

//  color += (1. - hill1Mask) * frontHillGlow * min(vec3(1.,1.,1.), vec3(1., 0.7, 0.) * frontHillDensity  / dHouse2);
  color += (1. - hill1Mask) * 0.5 * (0.5 - 1.5 * length(xy - vec2(0.5, 0))) * vec3(0.1, 0.4, 0);
  fragColor = vec4(color, 1.0);
}
