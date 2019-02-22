#ifdef GL_ES
precision mediump float;
#endif

attribute vec2 index;
uniform sampler2D positions;
uniform sampler2D velocities;
uniform vec2 ptexsize;
uniform vec2 worldsize;
uniform float size;
varying vec2 velocity;

void main() {
    vec4 psample = texture2D(positions, index / ptexsize);
    vec4 vsample = texture2D(velocities, index / ptexsize);
    vec2 p = psample.rg;
    velocity = vsample.rg;
	gl_Position = vec4(p / worldsize * 2. - 1., 0, 1);
	gl_PointSize = size;
}
