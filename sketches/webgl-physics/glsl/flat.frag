#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D background;
uniform vec4 color;
uniform vec2 worldsize;
varying vec2 index;

const float diag = 0.011344;
const float adjacent = 0.083820;
const float center = 0.619347;

float get(vec2 offset) {
    vec2 p = index + offset / worldsize;
    return length((texture2D(background, p).xy - 0.5) * 2.);
}

void main() {
    float norm =
        get(vec2( 1, -1)) * diag +
        get(vec2( 1,  0)) * adjacent +
        get(vec2( 1,  1)) * diag +
        get(vec2( 0, -1)) * adjacent +
        get(vec2( 0,  0)) * center +
        get(vec2( 0,  1)) * adjacent +
        get(vec2(-1, -1)) * diag +
        get(vec2(-1,  0)) * adjacent +
        get(vec2(-1,  1)) * diag;
	gl_FragColor = mix(vec4(0, 0, 0, 0), color, norm);
}
