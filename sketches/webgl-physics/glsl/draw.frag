#ifdef GL_ES
precision mediump float;
#endif

uniform vec4 color;
varying vec2 velocity;

const float delta = 0.2;

void main() {
    vec2 p = 2.0 * (gl_PointCoord - 0.5);
    float a = smoothstep(1. - delta, 1., length(p));
    float e = 0. + length(velocity) / 3.;
    gl_FragColor = pow(mix(color, vec4(0, 0, 0, 0), a), vec4(e));
}