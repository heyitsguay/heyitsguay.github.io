/*
    R - Seeker x position
    G - Seeker y position
    B - Seeker orientation (-pi - pi)
*/
uniform sampler2D seekerPosition;
uniform sampler2D seekerVelocity;
uniform float stScale;
uniform float dt;

void main() {
    vec2 st = gl_FragCoord.rg * stScale;
    vec2 velocity = texture2D(seekerVelocity, st).rg - 0.5;
    float orientation = atan(velocity[1], velocity[0]);

    vec2 oldPosition = texture2D(seekerPosition, st).rg;
    gl_FragColor = vec4(oldPosition + dt * velocity, orientation, 1.);
}
