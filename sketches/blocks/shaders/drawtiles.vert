attribute vec2 a_position;
attribute vec4 a_color;
attribute vec4 a_heat;

varying vec4 v_color;
varying vec4 v_heat;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_color = a_color;
    v_heat = a_heat;
}