#version 120

precision highp float;

// Fragment color.
varying vec4 v_color;

void main() {
	glFragColor = v_color;
}
