uniform vec2 mousePositionNow;
uniform vec2 mousePositionLast;
uniform float mouseHeat;
uniform float mouseSize;
uniform vec2 dst;
uniform vec2 screenSize;

uniform sampler2D heat;

const float cDiff = 0.225;
const float cDecay = 0.999;

const float w1 = 1.;
const float w2 = 0.5;
const float w3 = 6.;

// Based on `minimum_distance()` in https://stackoverflow.com/a/1501725
float min_distance(vec2 x1, vec2 x2, vec2 p) {
    // Return the minimum distance between the line segment x1x2 and
    // the point p
    float L2 = dot(x1 - x2, x1 - x2);
    if (L2 == 0.0) { return distance(x1, p); }
    float t = max(0., min(1., dot(p - x1, x2 - x1) / L2));
    vec2 projection = x1 + t * (x2 - x1);
    return distance(projection, p);
}

void main() {
    float ds = dst[0];
    float dt = dst[1];

    vec2 p = gl_FragCoord.xy * dst;

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

    float laplacian = w1 * (vN + vE + vS + vW)
                      + w2 * (vNE + vSE + vSW + vNW)
                      - w3 * vP;

    float isNotBorder = 1. - float(
        gl_FragCoord.x == 0.5 || gl_FragCoord.x == screenSize.x - 1.5
     || gl_FragCoord.y == 0.5 || gl_FragCoord.y == screenSize.y - 1.5);

    float d = min_distance(mousePositionLast,
                           mousePositionNow,
                           gl_FragCoord.xy);

    float dCheck = float(d < mouseSize);

    float newHeat = cDecay * (vP + cDiff * laplacian)
                  + dCheck * mouseHeat;
    newHeat = clamp(newHeat, 0., 1.) * isNotBorder;

	gl_FragColor = vec4(newHeat, 0.0, 0.0, 1.0);
}
