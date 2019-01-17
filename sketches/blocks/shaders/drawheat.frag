precision highp float;

uniform vec2 u_dst;
uniform vec2 u_windowsize;
uniform float u_time;
uniform sampler2D s_heat;

// Multiplicative offset term that translates the renormalized heat values stored in the
// heat map texture into a larger range for rendering purposes.
const float heatrescale = HEATSCALE;
// Base heat hue.
const float basehue = 0.03;
// Constants used for brightness calculation.
const float b1 = 0.2;
const float b2 = -0.04;

// Vector used in the conversion of HSV values to RGB.
const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    return rgb;
}

void main() {
    float x = gl_FragCoord.x;
    float y = gl_FragCoord.y;
    // Heat value in [-0.5, 0.5].
    float heat0 = texture2D(s_heat, gl_FragCoord.xy * u_dst).r - 0.5;
    // Heat magnitude, scaled back into the range [0, maxHeat].
    float heat = abs(heatrescale * heat0);
    // True if heat0 < 0.
    float isnegative = float(heat0 < 0.0);
    // 1 if heat0 >= 0. -1 if heat0 < 0.
    float signheat = 1.0 - 2.0 * isnegative;
    // The first cutoff dictates where in the heat magnitude scale the 'tearing' effect happens.
    float heatcheck1 = float(heat > 50.0);
    // The second cutoff dictates where heat effects start to saturate.
    float heatcheck2 = float(heat < 3000.0);
    // Distance between this pixel and the center of the canvas.
    float dxcenter = abs(x - 0.5 * u_windowsize[0]);
    float dycenter = abs(y - 0.5 * u_windowsize[1]);

    // Heat hue effect below the first cutoff (positive and negative), and the positive heat hue effect above the first
    // cutoff.
    float hueshift1 = signheat * ((0.000182322 * heat + 0.00364643 * max(0.0, heat - 15.0)) * float(heat < 50.0) + 0.291714 * (1.0 - isnegative) * max(0.0, heat - 51.0));

    // Scaled heat values used for the negative heat hue effect.
    float heatsaturated = heatcheck2 * 1.9 * heat + (1.0 - heatcheck2) * (5100.0 + 0.2 * heat);
    // Negative heat hue effect for heat magnitudes above the first cutoff.
    float hueshift2 = isnegative * (-0.5 + heatcheck1 * (0.4 * u_time + 0.00328179 * (dxcenter - mod(60.0 * u_time + heatsaturated, 1.2 + dxcenter) + dycenter - mod(60.0 * u_time + heatsaturated, 1.2 + dycenter))));

    // Final pixel hue.
    float H = mod(basehue + hueshift1 + hueshift2, 1.0);

    // Magnitude-dependent brightness gate variable used to create the 'tear' effect at the first cutoff threshold.
    float Bgate = 1.0 - (1.0 - heatcheck1) * max(0.0, b1 * (heat - 45.0)) - heatcheck1 * max(0.0, 0.5 * b2 * (heat - 50.0) + 1.0);

    // Final pixel brightness
    float B = Bgate * min(1.0, 0.1 * heat);

    gl_FragColor = vec4(hsv2rgb(vec3(H, 1.0, B)), 1.0);
}