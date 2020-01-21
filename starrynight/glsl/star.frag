precision highp float;
precision highp int;

uniform float uT;

varying vec3 vColor;

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

void main() {
//    vec3 hsv = vec3(vColor.x, vColor.y, cos1(uT) * vColor.z);
    vec3 hsv = vec3(cos1(uT), 1, vColor.z);

//    gl_FragColor = vec4(hsv2rgb(hsv), 1.0);
    gl_FragColor = vec4(vColor, 1.);
}
