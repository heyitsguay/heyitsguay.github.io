#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float time;
uniform vec2 resolution;
uniform float startSeed;
uniform vec2 touch;
uniform vec2 center;
uniform float viewScale;

#define PI  3.141592654
#define TAU (2.0*PI)

float hash21(vec2 t) {
  vec3 p = vec3(t.x, t.y, startSeed);
  vec3 p3 = fract(p * .1031);
  p3 += dot(p3, p3.yzx * 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash21old(vec2 t) {
  t += sign(t);
  return fract(sin(4437.394*t.x + 3971.847*t.y)+startSeed);
}

vec4 hash24(vec2 t) {
  vec3 p = vec3(t.x, t.y, startSeed);
  vec4 p4 = fract(p.xzyz * vec4(.1031, .1030, .0973, .1099));
  p4 += dot(p4, p4.wzxy+33.33);
  return fract((p4.xxyz+p4.yzzw)*p4.zywx);
}

vec4 hash24old(vec2 t) {
  t += sign(t);
  return fract(sin(vec4(4437.394, 4980.462, 3588.902, 5189.583) * t.xxxx + vec4(3971.847, 5083.258, 4481.056, 4828.345) * t.yyyy - 678.732 * startSeed));
}

vec3 saturate(vec3 col) {
  return clamp(col, 0.0, 1.0);
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

vec2 modMirror2(inout vec2 p, vec2 size) {
  vec2 halfsize = size*0.5;
  vec2 c = floor((p + halfsize)/size);
  p = mod(p + halfsize, size) - halfsize;
  p *= mod(c,vec2(2.0))*2.0 - vec2(1.0);
  return c;
}


vec2 toSmith(vec2 p)  {
  // z = (p + 1)/(-p + 1)
  // (x,y) = ((1+x)*(1-x)-y*y,2y)/((1-x)*(1-x) + y*y)
  float d = (1.0 - p.x)*(1.0 - p.x) + p.y*p.y;
  float x = (1.0 + p.x)*(1.0 - p.x) - p.y*p.y;
  float y = 2.0*p.y;
  return vec2(x,y)/d;
}

vec2 fromSmith(vec2 p)  {
  // z = (p - 1)/(p + 1)
  // (x,y) = ((x+1)*(x-1)+y*y,2y)/((x+1)*(x+1) + y*y)
  float d = (p.x + 1.0)*(p.x + 1.0) + p.y*p.y;
  float x = (p.x + 1.0)*(p.x - 1.0) + p.y*p.y;
  float y = 2.0*p.y;
  return vec2(x,y)/d;
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



float mandala_df(float localTime, vec2 p, vec2 c) {
  vec4 hc = hash24(c);
  vec4 hc2 = hash24(c + 12.53);
  rot(p, .05 * sin(3. * hc.x) * localTime);
  vec2 pp = toPolar(p);
//  float a = TAU/(64.*(.12+1.4*hc.x*hc.x));
  float nsyms = 2. * round(3. + 37.*hc.x*hc.x);
  float a = TAU / nsyms;
  float np = pp.y/a;
  pp.y = mod(pp.y, a);
  float m2 = mod(np, 2.0);
  if (m2 > 1.0) {
    pp.y = a - pp.y;
  }
  pp.y += 7. * cos(localTime * .002 * (hc.x + hc.w) - 10.*hc.y);
  p = toRect(pp);
  p = abs(p);
  p -= vec2(0.5);


  float d = 10000.0;

  for (int i = 0; i < 1 + int(3.*hc.z); ++i) {
    mod2(p, vec2(1.0));
    float da = hsin(.02*localTime + 7. * sin(hc.x + hc.y));
    rot(p, .1*(hc.x + hc.z)*localTime);
    float sb = box(p, vec2(1.) * (.1 + .7 * (hc.y + hc.z)) )+ da;
    float cb = circle(p - 0.5*(0.1+0.9*hc.w), (0.5)) + da*cos(.0333*localTime - 7. * hc.x);

//    float dd = sb;
    float dd = float(hc2.x < 0.2) * max(sb, -cb)
               + float(hc2.x >= 0.2 && hc2.x < 0.4) * max(sb, cb)
               + float(hc2.x >= 0.4 && hc2.x < 0.6) * min(sb, cb)
               + float(hc2.x >= 0.6 && hc2.x < 0.8) * sb
               + float(hc2.x >= 0.8) * cb;

    d = min(dd, d);

    p *= 1.5 +1.0*(0.5 + 0.5*sin(0.5*localTime - 6.5*(hc.x + hc.w)));
    rot(p, (hc.y + hc.w)*.1*sin(.03*localTime - 3.2 * (hc.z + hc.w)));
  }


  return d;
}

vec3 mandala_postProcess(float localTime, vec3 col, vec2 uv, vec2 c)
{
  vec4 hc = hash24(c + 294.389);
  vec4 hc2 = hash24(c + 101.243);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  col = clamp(col, 0.0, 1.0);
  col=pow(col,mix(vec3(0.5*hc.x, 0.75*hc.y, 1.5), vec3(0.45), (.1+.9*hc.z)*r));
  col=col*0.6+0.4*col*col*(3.0-2.0*col);  // contrast
//  col=mix(col, vec3(dot(col, vec3(0.33))), -0.4);  // satuation
//  col=mix(col, vec3(dot(col, vec3(0.33))), -0.4 * clamp(hc.x - hc.z, 0., 1.));  // satuation
  //col*=sqrt(1.0 - sin(-.1*localTime + (50.0 - 15.0*hash21(c-1.)*sqrt(r))*r))*(1.0 - sin(0.5*r));
  col = clamp(col, 0.0, 1.0);
  float ff = pow(1.0-0.75*sin(20.0*(r + hc.w)), 0.75);
  col = mix(col, pow(col, vec3(hc.x + hc2.y)), hc2.z);
//  col = pow(col, vec3(ff*.5*hsin(.05*localTime*hc.x - 7. * hc.y), .25*ff*(hc2.x), .2*ff));
  col *= clamp(0.5*sqrt(max(5. - r*r, 0.0)), 0.5 + 0.5 * hc2.w, 1.);
  col *= float(r < 2.);
  vec2 og = gl_FragCoord.xy/resolution.y;
  col += vec3(.5)*clamp(r - (1.9 - 0.5 * float(hc2.y < 0.08)), 0., 0.25) * (.4 + .4*(og.y+2.*og.x));
  return clamp(col, 0.0, 1.0);
}

vec3 mandala_sample(float localTime, vec2 p)
{

  vec2 uv = p;
  uv *= viewScale;
  uv += center;

  vec2 c = modMirror2(uv, vec2(4.5));
  vec4 hc = hash24(c - 8.675309);

  //vec2 nuv = mandala_distort(localTime, uv, c);
  //vec2 nuv2 = mandala_distort(localTime, uv + vec2(0.001), c);

  float d = mandala_df(localTime, uv , c);

  vec3 col = vec3(0.);

  float r = 0.5*(.1+hsin(.05*time - hc.x * hc.x));
  //float r = 0.01 + 0.449*hsin(.2*time);

  float nd = d / r;
  float md = mod(d, r);


  if (abs(md) < 0.05*(.25 + 15.*(hc.x * hc.y))) {
    col = (d > 0.0 ? vec3(0.25,0.25,0.65) : vec3(0.65, 0.25, 0.25 + .5*hsin(.08*time - 7. * hc.z)))/abs(nd*(.5+hsin((0.05 * (hc.x + hc.w))*time - 7.* hc.x - 4. * hc.y)));
  }

  float whiteMultiplier = hc.x + hc.y + hc.z;
  float whiteScale = 0.05 * pow(2., -(0.01 + 2.5 * hc.w));
  // .01 + .19
  // scale * (1 + multiplier * variable)
//  if (abs(d) < .02*(0.5 + 9.5 * hsin(.11*time - 7. * hc.y))*(.5+.5*hc.w)) {
  if (abs(d) < whiteScale*(1. + 0. * hsin(.11*time - 7. * hc.y))) {
    col = vec3(1.0);
  }

  //col = vec3(d,0,0);

  //col *= pow(nf, 1.);

  col = mandala_postProcess(localTime, col, uv, c);;

  //col += 1.0 - pow(nf, 1.0);
  return saturate(col);
}

vec3 mandala_main(vec2 p) {

  float localTime = 1.*time + 30.0;
  vec3 col  = vec3(0.0);
  col += mandala_sample(localTime, p);
  return col;
}

out vec4 fragColor;
void main()
{
  vec2 uv = gl_FragCoord.xy/resolution.xy - vec2(0.5);
  uv.x *= resolution.x/resolution.y;

  vec3 col = mandala_main(uv);
  //col *= clamp(1./(.1 + 100.*length(uv)*length(uv)), 0.,1.);

  fragColor = vec4(col, 1.0);

}
