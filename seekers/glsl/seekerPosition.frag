/*
    R - Seeker x position
    G - Seeker y position
    B - Seeker orientation (-pi - pi)
*/
uniform sampler2D seekerPosition;
uniform sampler2D seekerVelocity;
uniform vec2 seekerInverse;
uniform float dt;

void main() {
//    vec2 st = gl_FragCoord.rg * stScale;
    vec2 v = texture2D(seekerVelocity, vec2(0., 0.)).rg;
    float oldOrientation = texture2D(seekerPosition, vec2(0., 0.)).b;
    float isMoving = float(v[0] != 0. || v[1] != 0.);
    float orientation = isMoving * atan(v[1], v[0])
                      + (1. - isMoving) * oldOrientation;

    vec2 oldPosition = texture2D(seekerPosition, vec2(0., 0.)).rg;
    gl_FragColor = vec4(oldPosition + v, orientation, 1.);
}
