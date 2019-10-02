precision highp float;
precision highp int;

attribute vec3 position;

void main() {

    gl_Position = vec4(position, 1.);
}