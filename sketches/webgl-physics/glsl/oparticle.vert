#ifdef GL_ES
precision mediump float;
#endif

attribute vec2 index;
uniform sampler2D positions;
uniform sampler2D velocities;
uniform vec2 iptexsize;
uniform vec2 iworldsize;
uniform float size;

varying vec2 velocity;


void main() {
    vec4 psample = texture2D(positions, index * iptexsize);
    vec4 vsample = texture2D(velocities, index * iptexsize);
    vec2 pos = psample.rg;
    velocity = vsample.rg;
    gl_Position = vec4(pos * iworldsize * 2. - 1., 0., 1.);
    gl_PointSize = size;
}