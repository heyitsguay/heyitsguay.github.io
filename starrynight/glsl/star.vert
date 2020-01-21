precision highp float;
precision highp int;

attribute vec3 position;
attribute vec3 aCenter;
attribute vec3 aColor;

uniform mat4 uMVP;
uniform float uScale;

varying vec3 vColor;

const float dx = 1. / 1920.;
const float dy = 1. / 1080.;

void main() {
    vec3 vertPosition = aCenter + uScale * position;
    float k = 128. / vertPosition[2];
    float x = vertPosition[0] * k * dx ;
    float y = vertPosition[1] * k * dy;
    float z = aCenter[2] / 100.;
//    gl_Position = vec4(x, y, -0.1, 1.);
    gl_Position = uMVP * vec4(vertPosition, 1.);
    vColor = aColor;

}

//void main() {
//    vec3 vertPosition = aCenter + uScale * position;
//    gl_Position = uMVP * vec4(vertPosition, 1.0);
//
//    vColor = aColor;
//}
