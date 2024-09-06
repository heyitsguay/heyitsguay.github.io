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

float d2(vec2 a, vec2 b) {
    return dot(b-a, b-a);
}

float d2ToSegment(vec2 p, vec2 s1, vec2 s2) {
    float d = d2(s1, s2);
    if (d == 0.0) return d2(p, s1);
    float t = max(0.0, min(1.0, dot(p-s1, s2-s1) / d));
    vec2 proj = s1 + t * (s2 - s1);
    return d2(p, proj);
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

vec3 shootingStar(vec2 uv, float t, float tLast) {
    if (t > 0.5) return vec3(0., 0., 0.);
    float v = 5.;
    float c = 10.;
    vec2 start = vec2(0.5, 0.5);
    vec2 du = vec2(-0.89442719, -0.4472136);

    float dpNow = dp(t, v, c);
    float dpLast = dp(tLast, v, c);

    vec2 pNow = start + dpNow * du;
    vec2 pLast = start + dpLast * du;

    float b = 1.; // brightness(t*1.8, 20.);

//    float d2Tip = d2(uv, pNow);
    float d2Line = d2ToSegment(uv, pLast, pNow);
    float dScaled = 20000. * d2Line;
//    float tActive = tFromTip(uv, tip, start, v);

    float i = min(1.0, b / (1.0 + dScaled));
    return vec3(i, 0.95 * i, 0.9 * i);

}

void main() {
    vec2 uv = gl_FragCoord.xy * uScreenInverse;
    vec3 lastColor = texture2D(uPongTex, uv).xyz;
    lastColor = lastColor * float(lastColor.x > 0.02);

    float t = mod(uT - 1., 3.);
    float dt = uT - uTLast;
    float tLast = max(0., t - dt);
    vec3 newColor = shootingStar(uv, t, tLast);
    gl_FragColor = vec4(clamp(0.85 * lastColor + newColor, 0.0, 1.0), 1.0);
}
