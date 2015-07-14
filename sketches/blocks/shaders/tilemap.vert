attribute vec2 a_position;
attribute vec4 a_maps;

varying vec4 v_maps;

void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_maps = a_maps;
}