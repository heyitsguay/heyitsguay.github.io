#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#define NUM_PARTICLES 200
#define T_SPEED 0.2
#define FIREWORK_SCALE 15.
#define GRAVITY 0.33

#define R_MIN 5.
#define R_MAX 15.
#define PI 3.1415927

uniform float time;
uniform vec2 resolution;
uniform vec2 iResolution;

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
  Firework(0., 0.1, 1., 1., 1., 1., 0., 1., 0., 0., 25.),
  Firework(1., 0.01, 1., 3., 0.3, 1., 0., 1., 0., 0., 25.),
  Firework(0.5, 0.3, 0.6, 1., 1., 1., 1., 2., 4., 0., 22.),
  Firework(1., 1., 1.8, 4., 1., 1., 0.5, 0.2, 0., 1., 6.)
);

float Hash11(float t) {
  return fract(sin(t*34.1674));
}

float sigmoid(float x, float c, float m) {
  return 1. / (1. + exp(-m*(x-c)));
}


vec2 Hash12(float t) {
  float x = fract(sin(t*553.2379));
  float y = fract(sin(t*670.3438));
  return vec2(x, y);
}

vec3 Hash13(float t) {
  float x = fract(sin(t*483.9812));
  float y = fract(sin(t*691.3455));
  float z = fract(sin(t*549.7206));
  return vec3 (x, y, z);
}

vec4 Hash14(float t) {
  float x = fract(sin(t*281.3812));
  float y = fract(sin(t*601.8855));
  float z = fract(sin(t*459.0926));
  float w = fract(sin(t*330.8649));
  return vec4(x, y, z, w);
}

vec2 Rand2(vec2 t) {
  float x = fract(sin(t.x*3526.1061 - 0.*t.y));
  float y = fract(sin(t.x*6711.6523 + 0.*t.y));
  return vec2(x, y);
}

vec2 RandDirection(float seed, float rMin, float rMax, float rPow, float nPetals, float round) {
  vec3 xyt = Hash13(seed);
  float r = mix(rMin, rMax, (pow(xyt.x, rPow)));
  r = mix(r, float(int(r)), round);
  float theta = 2. * PI * (xyt.y + xyt.z);
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

  int tCycle = int(mod(T_SPEED * 0.8 * time, 999999.));
  float u = fract(T_SPEED*0.8*time);

  float mx = max(resolution.x, resolution.y);
  float imx = min(iResolution.x, iResolution.y);
  vec2 xy = gl_FragCoord.xy * imx;
  float xMax = resolution.x * imx;
  float yMax = resolution.y * imx;

  float hill1Mask = sigmoid(xy.y, yMax * (0.25 + 0.1 * sin(3. * xy.x)), 1000.);
  float hill2Mask = sigmoid(xy.y, yMax * (0.33 + 0.08 * cos(5. * xy.x)), 500.);

  float yp = xy.y / yMax;
  float dColor = (0.5 + 1.2 * (1. - yp*yp));
  vec3 color = vec3(0.025*dColor, 0., 0.075*dColor);
  color *= 0.2 + 0.8*hill2Mask;
  float hy = Hash11(0.141*gl_FragCoord.y);
  float starColor = 0.2 + 0.7 * pow(Hash11(gl_FragCoord.x + 18.2*hy), 3.);
  float starFlicker = (0.85 + 0.15 * cos(6. * time + 7.9 * hy));
  color += 0.66 * hill2Mask * starColor * starFlicker * float(fract(31.163*xy.x*(hy+0.2)) < 0.02 && fract(51.853 * xy.y * starColor) < 0.02);

  float dHouse2 = 0.1 + 0.5*float(fract(31.163*xy.x*starColor) + sin(51.853 * xy.y * (hy+0.2)));
  color += max(vec3(0),(1. - hill2Mask) * 0.4 * min(vec3(1.,1.,1.), vec3(1., 0.7, 0.)* 0.003 / dHouse2));
  vec3 hsf = Hash13(float(tCycle + 1));
  float h = hsf.x;
  float s = 0.3 + 0.7 * hsf.y;
  float launchDist = (1. + 2. * hsf.z*hsf.z*hsf.z);
  float finalScale = launchDist * FIREWORK_SCALE;
  float launchFactor = (launchDist - 1.) * 0.5;

  vec2 rand1 = Hash12(float(tCycle+1)*0.674);
  vec2 center = vec2(0.2 + 0.6*rand1.x, 0.4-0.033*launchFactor+(0.4-0.15*launchFactor)*rand1.y);

  vec2 rand2 = Hash12(50. + 49. * sin(float(tCycle+1)*0.853));
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

  int idx = int(4. * Hash11(float(tCycle+15)));
  Firework firework = fireworks[idx];

  vec2 uv = finalScale * (gl_FragCoord.xy-center*resolution) * imx ;

  float tRamp = min(1., 10. * (1. - t));
  vec3 cBase = hsv2rgb(vec3(h, s, tRamp));

  vec2 mn = Hash12(float(tCycle + 1) * 31.49);
  float sizeBase = 0.2 + 0.8 * mn.x;

  float rAddOn = float(idx == 3) * mn.y * 2.;

  //float nPetalsFinal = float(firework.nPetals > 0.) * (1. + mn.y);

  for (int i = 0; i < NUM_PARTICLES; i++) {

    float size = sizeBase * mix(1., mix(1., tRamp * (1.1 + sin( t * float(i))), t*t), firework.sparkleScale);

    vec2 dir = RandDirection(
      float(i+1) + sin(float(tCycle+1)),
      firework.rMin,
      firework.rMax + rAddOn,
      firework.rPow,
      firework.nPetals,
      firework.rRound);
    dir.y *= firework.dirYScale;
    dir.y -= (1. + firework.gravityScale*t*t)*GRAVITY * sizeBase * sizeBase * t;

    float tRate = log(1. + (firework.burstRate + 5. * float(idx == 3) * float(2 - int(rAddOn))) * t);
    float d = length(uv - dir * tRate);
    float at = abs(t - 0.015);
    float bump = 0.012 / (1. + 40000. * at*at);
    float t3 = (t+0.2)*(t+0.2)*(t+0.2);
    float t6 = t3*t3;
    float t24 = t6*t6*t6*t6;

    float brightness = 0.25* bump + sqrt(size)*firework.brightnessScale*0.0013/(1.+ 9. * t24);
    float hNew = mod(float(i)*0.12, 1.);
    vec3 cNew = hsv2rgb(vec3(hNew, s, tRamp));
    vec3 particleColor = mix(cBase, cNew, firework.colorShift);
    color += hill1Mask *  (0.75*bump + brightness * particleColor) / pow(d + 0.005, 1.25+size);
  }
  }
  color *= 0.75 + 0.25*hill2Mask;
  color *= hill1Mask;

  //color += (1. - hill1Mask) * 1.5 * vec3(1., 0.8, 0.)*starColor * float(abs(fract(-8.*xy.y) - fract(8.*xy.x*xy.x)) < 0.0002);
  //float dHouse1 = float(0.01+abs(fract(-8.*xy.y) - fract(8.*xy.x*xy.x)));

  float hx = Hash11(gl_FragCoord.x);
  float dHouse1 = 0.01 + 0.5*float(fract(31.163*xy.x*starColor) + sin(51.853 * xy.y * (hx+0.2)));

  color += (1. - hill1Mask) * 1.5 * min(vec3(1.,1.,1.), vec3(1., 0.7, 0.)* 0.00002 / dHouse1);
  fragColor = vec4(color, 1.0);
}