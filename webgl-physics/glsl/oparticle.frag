/* oparticle.frag
 Write particle position information to a particle collision buffer.

 Matthew Guay <matthew.d.guay@gmail.com>
 Last updated: January 8, 2017
*/
#ifdef GL_ES
precision mediump float;
#endif

uniform bool isround;

varying vec2 velocity;

void main() {
    if (isround) {
        // Draw a point in the particle collision buffer in a circle
        // around the point center
        vec2 coord = 2. * (gl_PointCoord - 0.5);
        float val = float(length(coord) < 1.);

        gl_FragColor = vec4(val, velocity[0], velocity[1], 0.);
    } else {
        // Draw a square
        gl_FragColor = vec4(1., velocity[0], velocity[1], 0.);
    }
}
