precision highp float;
precision highp int;

attribute vec3 position;
attribute vec3 aCenter;
attribute vec3 aColor;
attribute float aFrequency;
attribute float aPhase;

uniform mat4 uMVP;
uniform float uScale;
uniform float uT;
uniform float uStarZInverse;
uniform float uStarZMin;

varying vec3 vColor;




// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
// Convert a color vec3 in HSV coordinates to a color vec3 in RGB coordinates. Assumes all coordinate ranges are [0,1].
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    return rgb;
}


float sigmoid(float x, float c, float m) {
    return 1. / (1. + exp(- (x - c) / m));
}


float cos1(float x) {
    return 0.5 * (cos(x) + 1.);
}


void main() {
    vec3 vertPosition = aCenter + uScale * position;
    gl_Position = uMVP * vec4(vertPosition, 1.);

    float glimmer = sigmoid(-(aCenter.z  + uStarZMin) * uStarZInverse, 0.7, 8.);
    float shade = (1. + (aCenter.z + uStarZMin) * uStarZInverse) * (1. - glimmer)
        + glimmer * cos1(aFrequency * uT - aPhase);

    vColor = hsv2rgb(vec3(aColor.x, aColor.y, shade * aColor.z));

}
