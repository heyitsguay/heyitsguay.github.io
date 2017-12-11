uniform float time;
uniform vec2 planeSize;
uniform int mode;

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


void main() {
    vec2 vXY = -1. + 2. * vUV;
    vec2 position = floor(vXY * planeSize);
    float j = position.x
            + position.y * planeSize.x * float(mode == 0)
            + position.y * position.x * float(mode == 1);

    float q = cos1(0.05 * time);
    float h = q * sin1(0.25 * j + 0.8585 * time) * cos(0.01468 * (j + time))
            + (1. - q) * cos1(0.063 * j + 2.1 * time)
                * sin(0.00286 * (j + 1.2 * time));
    float ht = mod1(h + 0.01 * time);

    float v = 1. * float(mode == 0) + (0.25 + 0.75 * h) * float(mode == 1);

    vec3 rgb = hsv2rgb(vec3(ht, 1., v));

    gl_FragColor = vec4(rgb, 1.);
}