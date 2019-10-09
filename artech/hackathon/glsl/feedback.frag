precision highp float;
precision highp int;

uniform float aspectRatio;
uniform vec2 screenInverse;
uniform vec2 attractorPosition;
uniform float attractorSpeed;

uniform sampler2D field;

void main() {
    // Normalized fragment position in [0,1]x[0,1]
    vec2 position = gl_FragCoord.xy * screenInverse;

    // Field value at this position
    float value = 0.996 * texture2D(field, position).r;

    vec2 dMouse = vec2(position[0], position[1] * aspectRatio) -
        vec2(attractorPosition[0], attractorPosition[1] * aspectRatio);

    float d = length(dMouse);

    float cSpeed = 1. + 200. * attractorSpeed;

    // Add around the mouse
    value +=  0.03 * cSpeed / (1. + 50. * d);
    value = min(1., value);


	gl_FragColor = vec4(value, 0., 0.0, 1.0);
}
