#version 120

// Vertex position (x, y).
attribute vec2 a_position;
// Vertex heat.
attribute float a_heat;


// Fragment heat
varying float v_heat;

void main() {
	gl_Position = vec4(a_position, 0., 1.);
	v_heat = a_heat;
}
