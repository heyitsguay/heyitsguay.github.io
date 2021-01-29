#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif


in vec3 position;

void main() {

    gl_Position = vec4(position, 1.);
}
