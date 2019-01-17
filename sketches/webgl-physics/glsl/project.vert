precision mediump float;

attribute vec2 points;

varying vec2 coord;

void main() {
    coord = (points * vec2(1, -1) + 1.) / 2.;
    gl_Position = vec4(points, 0., 1.);
}