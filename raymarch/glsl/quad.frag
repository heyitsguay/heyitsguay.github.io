precision highp float;
precision highp int;

uniform float t;
uniform vec2 screenInverse;
uniform vec2 attractorPosition;
uniform vec2 mousePosition;
uniform float aspectRatio;
uniform float ticksSinceMotion;

uniform sampler2D field;

// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
// Convert a color vec3 in HSV coordinates to a color vec3 in RGB coordinates. Assumes all coordinate ranges are [0,1].
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    return rgb;
}

float cos1(float x) {
    return 0.5 * (cos(x) + 1.);
}

float sin1(float x) {
    return 0.5 * (sin(x) + 1.);
}

float mod1(float x) {
    return mod(mod(x, 1.) + 1., 1.);
}

float sig(float x, float c, float m) {
    return 1. / (1. + exp(-m * (x - c)));
}

void main() {
    // Uncomment to speed up the flow of time
//    float t2 = 10. * t;
    // App run time, wrapped in a trig function to make it flow forward and
    // backward
    float tt = 20. * (1. - cos(0.01745329251 * (t + 15.)));
    // Uncomment to use sped-up time
//    tt = 10. * (1. - cos(0.01745329251 * (t2 + 15.)));

    // Normalized fragment position
    vec2 xy = gl_FragCoord.xy * screenInverse;
    // Field strength at fragment
    float f = texture2D(field, xy).r;

    // Correct aspect ratio for the rest of the calculations
    xy[1] *= aspectRatio;
    // Aspect ratio-corrected mouse position
    vec2 mouse = vec2(mousePosition[0],
                      mousePosition[1] * aspectRatio);

    // Recenter screen coordinates to have a center origin
    vec2 uv = xy - vec2(0.5, 0.5 * aspectRatio);
    float u = uv[0];
    float v = uv[1];

    // Rotate coordinates in a time-dependent manner
    // Rotation angle and its cos and sin
    float theta = 6.28318530718 * mod1(0.005 * tt);
    float ct = cos(theta);
    float st = sin(theta);
    // Compute rotated coordinates
    float ur = ct * u + st * v;
    float vr = -st * u + ct * v;
    // Slow time-varying modulator
    float dc = 0.75 * cos1(0.021 * tt);
    // ??
    float uc = dc + (1. - dc) * ur;
    float vc = dc + (1. - dc) * vr;
    // Rotated-ish coordinates times time elapsed, sort of
    float ut = uc * tt;
    float vt = vc * tt;
    float rt = (uc * uc + vc * vc) * tt;
    // hmod governs how the fragment field value affects the fragment hue
    float hmod = 0.33 + (3. + 0.1 * tt) * f;
    // Compute the main hue variable
    float dh = sin(cos1(0.05 * rt) +
                   0.3 * cos(0.1 * (0.5 + sin1(ut)) * hmod) *
                         sin(uv[0] * uv[1] * tt * hmod + 2. * cos(0.27 * ut)));
    // Scale hue to lie between reddish and yellowish
    float h = mod1(0.93 + 0.21 * dh);
    // smod governs how the fragment field value affects the fragment saturation
    float smod = 1. + f * f;
    // Compute saturation
    float s = min(1., (f + 0.25 * cos1(0.8 * tt)) * smod);
    // Compute brightness
    float b = min(1., 0.8 + 0.21 * f * f );
    // HSV color
    vec3 hsv = vec3(h, s, b);
    // Converted to RGB color
    vec3 rgb = hsv2rgb(hsv);

    // Place a semitransparent pip at the cursor location
    vec2 dMouse = (xy - mouse);
    float cursorMask = min(1., 0.75 +
        0.25 * float(length(dMouse) > 3. * screenInverse[0]) +
        0.005 * ticksSinceMotion);
    gl_FragColor = vec4(rgb * cursorMask, 1.0);
}
