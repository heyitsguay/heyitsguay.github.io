/*
    R - Seeker x velocity.
    G - Seeker y velocity.
*/
uniform sampler2D seekerPosition;
uniform sampler2D seekerVelocity;
uniform sampler2D heat;
uniform float stScale;
uniform float seekStrength;
uniform float minSpeed;
uniform float maxSpeed;

const float dScale = 20.;

void main() {
    vec2 st = gl_FragCoord.rg * stScale;
    float ds = st[0];
    float dt = st[1];

    vec2 p = texture2D(seekerPosition, st).rg;
    vec2 n = p + vec2(0., dt);
    vec2 ne = p + vec2(ds, dt);
    vec2 e = p + vec2(ds, 0.);
    vec2 se = p + vec2(ds, -dt);
    vec2 s = p + vec2(0., -dt);
    vec2 sw = p + vec2(-ds, -dt);
    vec2 w = p + vec2(-ds, 0.);
    vec2 nw = p + vec2(-ds, dt);

    float vP  = texture2D(heat, p)[0];
    float vN = texture2D(heat, n)[0];
    float vNE = texture2D(heat, ne)[0];
    float vE = texture2D(heat, e)[0];
    float vSE = texture2D(heat, se)[0];
    float vS = texture2D(heat, s)[0];
    float vSW = texture2D(heat, sw)[0];
    float vW = texture2D(heat, w)[0];
    float vNW = texture2D(heat, nw)[0];

    float dN = vN - vP;
    float dNE = vNE - vP;
    float dE = vE - vP;
    float dSE = vSE - vP;
    float dS = vS - vP;
    float dSW = vSW - vP;
    float dW = vW - vP;
    float dNW = vNW - vP;
    float dValues[7];
    dValues[0] = dNE;
    dValues[1] = dE;
    dValues[2] = dSE;
    dValues[3] = dS;
    dValues[4] = dSW;
    dValues[5] = dW;
    dValues[6] = dNW;

    vec2 directions[7];
    directions[0] = vec2(ds, dt),
    directions[1] = vec2(ds, 0.),
    directions[2] = vec2(ds, -dt),
    directions[3] = vec2(0., -dt),
    directions[4] = vec2(-ds, -dt),
    directions[5] = vec2(-ds, 0.),
    directions[6] = vec2(-ds, dt);

    float dMax = dN;
    vec2 maxDir = vec2(0., dt);
    for(int i = 0; i < 7; i++) {
        float value = dValues[i];
        vec2 direction = directions[i];
        float isBigger = float(value > dMax);
        float isSmaller = 1. - isBigger;
        dMax = dMax * isSmaller + value * isBigger;
        maxDir = maxDir * isSmaller + direction * isBigger;
    }

    float speed = clamp(dScale * dMax, minSpeed, maxSpeed);
    float speedScaled = speed
        / sqrt(float(maxDir[0] != 0.) + float(maxDir[1] != 0.));

    vec2 heatDir = speedScaled * maxDir;

    vec2 oldVelocity = texture2D(seekerVelocity, st).rg - 0.5;
    vec2 newVelocity = mix(oldVelocity, heatDir, seekStrength);
    newVelocity = clamp(newVelocity, -0.5, 0.5);

	gl_FragColor = vec4(newVelocity + 0.5, 0.0, 1.0);
}
