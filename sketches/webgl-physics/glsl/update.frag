#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D position;
uniform sampler2D velocity;
uniform sampler2D obstacles;
uniform sampler2D oparticles;
uniform int derivative;
uniform vec2 scale;
uniform float random;
uniform vec2 gravity;
uniform vec2 wind;
uniform float restitution;
uniform vec2 worldsize;
uniform float size;
varying vec2 index;

const float vmax = 5.;

void updatePosition(inout vec2 p, inout vec2 v, vec2 obstacle) {
    // Check for particle-particle collisions
    // Get the horizontal and vertical directions
    float dirx = 2. * float(v[0] >= 0.) - 1.;
    float diry = 2. * float(v[1] >= 0.) - 1.;

    // Point radius
    float r = size / 2. + 1.;

    // Compute sample coordinates
    // 2 midpoint samples
    vec2 coordx = p + vec2(dirx * r, 0.);
    vec2 coordy = p + vec2(0., diry * r);
    // 3 corner samples
//    vec2 coord0 = p + vec2(dirx * r, -diry * r);
//    vec2 coord1 = p + vec2(dirx * r, diry * r);
//    vec2 coord2 = p + vec2(-dirx * r, diry * r);

    // Get particle buffer samples
    vec2 iworldsize = vec2(1., 1.) / worldsize;
    // Sample 2 midpoints
    float samplex = texture2D(oparticles, coordx * iworldsize).x;
    float sampley = texture2D(oparticles, coordy * iworldsize).x;
    // Sample 3 corner points
//    float sample0 = texture2D(oparticles, coord0 * iworldsize).x;
//    float sample1 = texture2D(oparticles, coord1 * iworldsize).x;
//    float sample2 = texture2D(oparticles, coord2 * iworldsize).x;

    // Zero out velocity if there is contact along either dimension
    float multx = float(samplex == 0.);
    float multy = float(sampley == 0.);
    v[0] *= multx;
    v[1] *= multy;

    p += v;
    if (p.y <= 0. || p.x < 0. || p.x > worldsize.x) {
        // Left the world, reset particle.
        p.y += worldsize.y + random + (index.y - 0.5) * sign(random);
        p.x = mod(p.x + random * 10., worldsize.x);
    }
    if (p.x < 0.) {
        // Wrap from left to right
        p.x += worldsize.x + random + (index.x - 0.5) * sign(random);
    }
    if (length(obstacle) > 0.5) {
        // Undo velocity update
        p -= v;
        // Push out of obstacle
        p += 2. * obstacle;
    }
}

void updateVelocity(inout vec2 p, inout vec2 v, vec2 obstacle) {
    v += gravity + wind;
    if (p.y + v.y < -1.) {
        // Left the world, reset particle
        v.x = v.x + random * 0.5 + (index.x - 0.5) * sign(random);
        v.y = 0.;
    }
    if (length(obstacle) > 0.5) {
        if (length(v) < 0.5) {
            v = obstacle * 2. * restitution;
            // velocity too low, jiggle outward
        } else {
            v = reflect(v, obstacle) * restitution; // bounce
        }
    }

    // Clamp velocity
    v = 0.99999 * sign(v) * min(abs(v), vmax);
}

void main() {
    vec4 psample = texture2D(position, index);
    vec4 vsample = texture2D(velocity, index);
    vec2 p = psample.rg;
    vec2 v = vsample.rg;
    vec2 iworldsize = vec2(1., 1.) / worldsize;
    vec2 obstacle = (texture2D(obstacles, p * iworldsize).xy - 0.5) * 2.;
    vec2 result;
    if (derivative == 0) {
        updatePosition(p, v, obstacle);
        result = p;
    } else {
        updateVelocity(p, v, obstacle);
        result = v;
    }
    gl_FragColor = vec4(result.x, result.y, 0, 0);
}