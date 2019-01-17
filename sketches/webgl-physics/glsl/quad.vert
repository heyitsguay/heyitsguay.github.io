#ifdef GL_ES
precision mediump float;
#endif

attribute vec2 quad;
varying vec2 index;

void main() {
    index = (quad + 1.) / 2.;
    gl_Position = vec4(quad, 0, 1);
}