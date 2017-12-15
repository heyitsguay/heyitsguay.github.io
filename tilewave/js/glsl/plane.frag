uniform float time;
uniform vec2 planeSize;
uniform int drawMode;
uniform int shadowMode;
uniform float frequency;
uniform float hueShift;

varying vec2 vUV;

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

    vec2 vXY = -1. + 2. * vUV + 0.5 / planeSize;
    vec2 position = floor(vXY * planeSize);
    float dLinear1 = position.x + position.y * planeSize.x;
    float dLinear2 = position.y + position.x * planeSize.y;
    float dHyperbola = position.x * position.y;
    float dL2 = position.x * position.x + position.y * position.y;

    float j = float(drawMode == 0) * dLinear1
            + float(drawMode == 1) * dLinear2
            + float(drawMode == 2) * dHyperbola
            + float(drawMode == 3) * dL2;
    float k = frequency * j / (planeSize.x * planeSize.y);

    float q1 = cos1(0.05 * time);
    float q2 = 0.5 * (cos1(0.0128 * time) + sin1(0.025 * time));
    float q3 = 0.333333 * (q1 + sin1(0.025 * time) + cos1(0.00625 * time));
    float h = q1 * sin1(0.25 * k + 0.8585 * time)
                 * cos(0.01468 * (k + time) / pow(frequency, 1.5))
            + (1. - q1) * cos1(0.063 * k + 1.1 * time)
                * sin(0.00286 * (k + 1.2 * time));
    float ht = mod1(h + 0.01 * time);

    float vFlat = 1.;
    float vSigX = q2 * cos1(0.42 * k + 0.4 * time)
                   + (1. - q2) * cos1((0.08 + 0.01 * cos1(0.06 * time)) * k)
                               * cos1((0.0021 * (k + time)));
    float vSig = sig(mod1(vSigX + hueShift),
                     0.1 + 0.05 * cos1(0.5 * time),
                     30.);
    float vH = sig(mod1(ht + hueShift), 0.2, 40.);

    float v = float(shadowMode == 0) * vFlat
            + float(shadowMode == 1) * vSig
            + float(shadowMode == 2) * vH;

    vec3 rgb = hsv2rgb(vec3(ht, 1., v));

    gl_FragColor = vec4(rgb, 1.);
}