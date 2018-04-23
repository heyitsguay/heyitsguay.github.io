/*
    R - Seeker x velocity.
    G - Seeker y velocity.
*/
uniform sampler2D seekerPosition;
uniform sampler2D seekerVelocity;
uniform sampler2D heat;
uniform float seekerInverse;
uniform float screenInverse;
uniform float seekStrength;
uniform float minSpeed;
uniform float maxSpeed;

const float dScale = 0.1;

void main() {
    vec2 stSeeker = gl_FragCoord.rg * seekerInverse;
    vec2 stWorld = gl_FragCoord.rg * screenInverse;
    float ds = stWorld[0];
    float dt = stWorld[1];

    vec2 pRaw = texture2D(seekerPosition, vec2(0., 0.)).rg;
    vec2 pc = 0.5 * (pRaw + 1.);
    vec2 px = pc + vec2(ds, 0.);
    vec2 py = pc + vec2(dt, 0.);
    float heatc = texture2D(heat, pc).r;
    float heatx = texture2D(heat, px).r;
    float heaty = texture2D(heat, py).r;
    vec2 grad = -dScale * vec2(heatx - heatc, heaty - heatc);

    vec2 oldVelocity = texture2D(seekerVelocity, vec2(0., 0.)).rg;
    vec2 newVelocity = 1 * oldVelocity
                     + seekStrength * grad;
    float newSpeed = min(length(newVelocity), maxSpeed);
    newVelocity = (1. - newSpeed * newSpeed / (maxSpeed * maxSpeed)) * newVelocity;
//    newVelocity = clamp(newVelocity, -maxSpeed, maxSpeed);

    gl_FragColor = vec4(newVelocity, 0., 1.);
}
