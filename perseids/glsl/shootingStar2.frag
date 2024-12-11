precision highp float;
precision highp int;

uniform float uTLast;
uniform float uT;
uniform vec2 uScreenInverse;
uniform sampler2D uPongTex;

// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
// Convert a color vec3 in HSV coordinates to a color vec3 in RGB coordinates. Assumes all coordinate ranges are [0,1].
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    return rgb;
}

float cubeRoot(float x) {
    if (x < 0.) {
        return - pow(-x, 1./3.);
    }
    return pow(x, 1./3.);
}

float cube(float x) {
    return x * x * x;
}

float d2(vec2 a, vec2 b) {
    return dot(b-a, b-a);
}

float tMade(float s, float v0, float c) {
    // Compute the time at which a displacement `s` along the shooting star line segment was the tip.
    // s(t) = v0/c*(1-exp(-c*t))
    // so t(s) = -1/c*log(1-s*c/v0)
    return -1./c*log(1.-s*c/v0);
}

vec2 tMadeAndD2ToSegment(vec2 p, vec2 s1, vec2 s2, float v0, float c) {
    float d = d2(s1, s2);
    if (d == 0.0) return vec2(0., d2(p, s1));
    float s = max(0.0, min(1.0, dot(p-s1, s2-s1) / d));
    float tM = tMade(s * sqrt(d), v0, c);
    vec2 proj = s1 + s * (s2 - s1);
    return vec2(tM, d2(p, proj));
}

float tFromTip(vec2 p, vec2 tip, vec2 start, float v) {
    vec2 dirToTip = p - tip;
    vec2 lineDir = normalize(start - tip);
    return max(0.0, dot(dirToTip, lineDir)) / v;
}

float dp(float t, float v0, float c) {
    // Compute the displacement of an object at time t moving with velocity v(t)=v0*exp(-c*t).
    return v0 / c * (1. - exp(-c * t));
}

float brightness(float t, float c) {
    return 1. - exp(c * (t - 1.));
}

vec3 shootingStar(vec2 start, vec2 uv, float t) {
//    if (t > 0.5) return vec3(0., 0., 0.);
    float v0 = 5.;
    float c = 15.;
    vec2 du = vec2(-0.89442719, -0.4472136);

    float dpNow = dp(t, v0, c);

    vec2 pNow = start + dpNow * du;

    //    float d2Tip = d2(uv, pNow);
    vec2 info = tMadeAndD2ToSegment(uv, start, pNow, v0, c);
    float tM = info.x;
    float tAlive = max(0., t - tM);
    float d2Line = info.y;
    float d2Tip = d2(uv, pNow);
    float d2Max = d2(uv, start + v0 / c * du);
    float dLineScaled = 5000000. * d2Line;
    float dTipScaled = 5000000. * d2Tip;

    // Use a cubic polynomial to decay brightness such that it stays dim for a while
    // b(t) = 1 when t <= bt0, then decays according to b(t) = bp0 - bp1 * (t - bp2)^3
    float et = 0.4;
    float bt0 = 0.03;
    float bi = 0.15;
    float bt1 = 2.4;

    float bp0 = bi;
    float q = cubeRoot(1. - 1. / bi);
    float bp2 = (bt1 - q*bt0) / (1. - q);
    float bp1 = (bi - 1.) / cube(bt0 - bp2);

    float bTail = min(1., 50000.*d2Max) * (float(tAlive < bt0) + float(tAlive >= bt0) * max(0., (bp0 - bp1 * cube(tAlive - bp2))));
//    float bTail = float(tAlive < bt0) + float(tAlive >= bt0) * max(0., 1. + bt0 - tAlive);
    float bTip = clamp(2. * t * (1.1*et - t), 0., 1.) * float(t < et) + (5. * et * (1.1*et - et)) * pow(0.001, max(0., t - et)) * float(t >= et);

    float i = min(1., bTip / (1.0 + dTipScaled) + bTail / (1.0 + dLineScaled));
    return vec3(i, 0.95 * i, 0.9 * i);
}

void main() {
    float uvScale = min(uScreenInverse.x, uScreenInverse.y);
    vec2 uv = gl_FragCoord.xy * uvScale;
    float xScale = uvScale / uScreenInverse.x;
    float yScale = uvScale / uScreenInverse.y;
    vec2 start = vec2(0.5 * xScale, 0.5 * yScale);
//    vec3 lastColor = texture2D(uPongTex, uv).xyz;
//    lastColor = lastColor * float(lastColor.x > 0.02);

    float t = mod(uT - 1., 6.);
    vec3 newColor = shootingStar(start, uv, t);
    gl_FragColor = vec4(clamp(newColor, 0.0, 1.0), 1.0);

}
