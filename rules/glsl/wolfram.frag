precision highp float;
precision highp int;

uniform float t;
uniform vec2 screenInverse;
uniform vec2 screenSize;
uniform vec2 mousePosition;
uniform float clicked;
uniform sampler2D data;
uniform float updateState;

const float NUM_RULES = 3.;

float rand(vec3 co){
    return fract(sin(dot(co, vec3(12.9898, 78.233, 45.156))) * 63758.5453);
}



void main() {

    vec2 xy = gl_FragCoord.xy * screenInverse;
    float dx = screenInverse[0];
    float dy = screenInverse[1];

    bool left = bool(texture2D(data, xy + vec2(-dx, dy)).r);
    bool center = bool(texture2D(data, xy + vec2(0., dy)).r);
    bool right = bool(texture2D(data, xy + vec2(dx, dy)).r);
    float self = texture2D(data, xy).r;

    float ticksSinceChange = texture2D(data, xy).g;
    float ruleState = texture2D(data, xy).a;


    bool state0 = left ^^ (center || right);
    bool state1 = (left ^^ center ^^ right) && !center;
    bool state2 = (left ^^ center ^^ right);

    float state = float(state0) * float(ruleState == 0.)
                + float(state1) * float(ruleState == 1.)
                + float(state2) * float(ruleState == 2.);

    float ruleUpdate =
        float(distance(xy, mousePosition) < max(dx, dy)) * clicked;

    float newRuleState = mod(ruleState + ruleUpdate, NUM_RULES);

    float halfx = 0.5 * screenSize[0] * dx;

    float absx = abs(xy[0] - halfx) * screenSize[0];
    float absy = (1. - dy - xy[1]) * screenSize[1];
    float freezeMask = float(screenSize[1] - gl_FragCoord.y < 1. || updateState == 0.);
    float finalState = state * (1. - freezeMask)
        + self * freezeMask;

    ticksSinceChange =
        (ticksSinceChange + 1.) * float(abs(self - finalState) < 0.1);

    float dAbs = length(vec2(absx, absy));

	gl_FragColor = vec4(finalState, ticksSinceChange, dAbs, newRuleState);
}
