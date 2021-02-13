#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float time;
uniform vec2 resolution;
uniform float startSeed;

#define PI  3.141592654
#define TAU (2.0*PI)

float hash21(vec2 t) {
  t += sign(t) * (1. + abs(t));
  return fract(sin(4437.394*t.x + 3971.847*t.y - 678.732 * startSeed));
}

vec4 hash24(vec2 t) {
  t += sign(t);
  return fract(sin(vec4(4437.394, 4980.462, 3588.902, 5189.583) * t.xxxx + vec4(3971.847, 5083.258, 4481.056, 4828.345) * t.yyyy - 678.732 * startSeed));
}

vec3 saturate(vec3 col) {
  return clamp(col, 0.0, 1.0);
}

float hsin(float x) {
  return 0.5 + 0.5*sin(x);
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
  vec2 pp = toPolar(p);
  float a = TAU/(64.*(.1+1.4*hc.x));
  float np = pp.y/a;
  pp.y = mod(pp.y, a);
  float m2 = mod(np, 2.0);
  if (m2 > 1.0) {
    pp.y = a - pp.y;
  }
  pp.y += localTime/40.0* cos(10.*hc.y);
  p = toRect(pp);
  p = abs(p);
  p -= vec2(0.5);

  float d = 10000.0;

  for (int i = 0; i < 1 + int(3.*hc.z); ++i) {
    mod2(p, vec2(1.0));
    float da = hsin(.02*localTime*sin(hc.x + hc.y));

    float sb = box(p, vec2(1. * (.5 + .5 * hc.w * sin(.047*time)))) + da ;
    float cb = circle(p - 0.5*(0.1+0.45 * (hc.x + hc.w)), (0.5)) + da*cos(.0333*localTime);

    float dd = max(sb, -cb);
    d = min(dd, d);

    p *= 1.1;//1.5 +0.75*(0.5 + 0.5*sin(0.5*localTime) * cos(hc.);
    rot(p, 1. * (hc.z + hc.w)*sin(.098*localTime));;
  }


  return d;
}

vec3 mandala_postProcess(float localTime, vec3 col, vec2 uv, vec2 c)
{
  vec4 hc = hash24(c);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  col = clamp(col, 0.0, 1.0);
  col=pow(col,mix(vec3(0.5, 0.75*hc.y, 1.5), vec3(0.45), r));
  col=col*0.6+0.4*col*col*(3.0-2.0*col);  // contrast
  col=mix(col, vec3(dot(col, vec3(0.33))), -0.4);  // satuation
  //col*=sqrt(1.0 - sin(-.1*localTime + (50.0 - 15.0*hash21(c-1.)*sqrt(r))*r))*(1.0 - sin(0.5*r));
  col = clamp(col, 0.0, 1.0);
  float ff = pow(1.0-0.6*sin((4. + 50. * hc.x*hc.w)*(0.*a + .5*(hc.z + hc.y)*r -0.01*localTime + hc.z)), .5*(hc.x+hc.y));
  col = pow(col, vec3(ff*.8*hsin(.05*localTime*hc.x), .5*ff*hc.w, .2*ff));
//  col *= 0.7*sqrt(max(4. - r*r, 0.0));
  col *= 0.9*clamp(4. - r * r, 0., 1.);
  col += clamp(r - 2., 0., 0.1);
  return clamp(col, 0.0, 1.0);
}

vec2 mandala_distort(float localTime, vec2 uv, vec2 c) {
  float lt = 0.1*localTime;
  //vec2 suv = toSmith(uv)+10.*sin(hash21(c));
  //suv += 1.0*vec2(cos(lt - c.x), sin(sqrt(2.0)*lt));
  //suv *= vec2(1.5 + 1.0*sin(sqrt(2.0)*time), 1.5 + 1.0*sin(time));
  //uv = fromSmith(suv);
  //modMirror2(uv, vec2(5.3));
  return uv;
}

vec3 mandala_sample(float localTime, vec2 p)
{
  float lt = 0.8*localTime;
  vec2 uv = p;
  uv *=12.;
  uv += vec2(2., 1.) * 0.1*time;
  //rot(uv, lt);
  //uv *= 0.2 + 1.1 - 1.1*cos(0.1*time);

  vec2 c = modMirror2(uv, vec2(4.5));

//vec2 nuv = mandala_distort(localTime, uv, c);
//vec2 nuv2 = mandala_distort(localTime+1./60., uv, c);
  float d = mandala_df(localTime, uv , c);
  float d2 = mandala_df(localTime+1./60., uv, c);

  float nl = length(d - d2);
  float nf = 1.0 - smoothstep(0.0, 0.6, nl);

  vec3 col = vec3(0.);

  float r = 0.5*(.1+hsin(.1*time - hash21(c))*hash21(c));
  //float r = 0.01 + 0.449*hsin(.2*time);

  float nd = d / r;
  float md = mod(d, r);


  if (abs(md) < 0.05*(.25 + 1.75*hash21(c+2.))) {
    col = (d > 0.0 ? vec3(0.25,0.25,0.65) : vec3(0.65, 0.25, 0.25 + .5*hsin(.022*time)))/abs(nd*(.5+hsin(.031*time)));
  }

  if (abs(d) < .02*(0.5 + 1.5 * hsin(.019*time))*(.5+.5*hash21(c))) {
    col = vec3(1.0);
  }

  //col = vec3(d,0,0);

  col *= pow(nf, 1.);


  col = mandala_postProcess(localTime, col, uv, c);;
  col += 1.0 - pow(nf, 1.0);
  col *= clamp(4. - length(uv)*length(uv), 0., 1.);


  return saturate(col);
}

vec3 mandala_main(vec2 p) {

  float localTime = 1.*time + 30.0;
  vec3 col  = vec3(0.0);
  vec2 unit = 1./resolution.xy;
  const int aa = 3;
  for(int y = 0; y < aa; ++y)
  {
    for(int x = 0; x < aa; ++x)
    {
      col += mandala_sample(localTime, p - 0.*unit + unit*vec2(x, y));
    }
  }

  col /= float(aa*aa);
  return col;
}

out vec4 fragColor;
void main()
{
  float time = 0.1*time;
  vec2 uv = gl_FragCoord.xy/resolution.xy - vec2(0.5);
  uv.x *= resolution.x/resolution.y;

  vec3 col = mandala_main(uv);
//  col *= clamp(1. / ())

  fragColor = vec4(col, 1.0);

}