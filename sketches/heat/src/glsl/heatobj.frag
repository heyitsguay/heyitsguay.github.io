#version 120

precision highp float;

// Fragment heat value.
varying float v_heat;

// @1: heat rescaling term, value filled in before shader compilation.
// Regular: 0.0001
// Mobile: 1/255
 const float heat_scale = @1;

// @2: heat offset term, value filled in before shader compilation.
// Regular: 5000.
// Mobile: 128.
const float heat_offset = @2;

void main() {
	glFragColor = vec4(heat_scale * (v_heat + heat_offset), 0., 0., 1.);
}
