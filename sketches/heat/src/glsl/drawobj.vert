#version 120

// Vertex position.
attribute vec2 a_position;
// Vertex color.
attribute vec4 a_color;

// Fragment color.
varying vec4 v_color;

void main() {
	gl_Position = vec4(a_position, 0., 1.);
	v_color = a_color;
}
