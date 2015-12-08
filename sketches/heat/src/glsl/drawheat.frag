#version 120

precision highp float;

// Vec2 of constants to rescale canvas domain to [0,1]x[0,1].
uniform vec2 u_dst;
// Vec2 of canvas x and y sizes.
uniform vec2 u_size;
// Base heat hue (H) value.
uniform float u_H_heat;
// Time since app (re)start.
uniform float u_time;

// Sampler for the canvas heat texture.
uniform sampler2D s_heat;

// @3 - scaled heat range, used for mapping heat values from [0,1] to [-heatRange, heatRange]. Filled in before compilation.
const float hoffset = @3;
// Heat magnitude thresholds used to control visualization.
const float hthresh1 = 50.;
const float hthresh2 = 3000.;



// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
// Convert a color vec3 in HSV coordinates to a color vec3 in RGB coordinates. Assumes all coordinate ranges are [0,1].
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    return rgb;
}

void main() {
	// This fragment's heat texture value, scaled to range [-0.5, 0.5].
	float tex_heat = texture2D(s_heat, gl_FragCoord.xy * u_dst).r - 0.5;
	// Scaled heat magnitude.
	float heat = abs(hoffset * tex_heat);

	// Gate variables used to control heat visualization.
	// 1. if tex_heat is negative, 0 otherwise.
	float g_neg = float(tex_heat < 0.);
	// 1. if tex_heat is nonnegative, -1. otherwise.
	float g_pos = 1.0 - 2.0 * g_neg;
	// 1. if heat magnitude exceeds the threshold hthresh[1/2] defined above, 0. otherwise.
	float g_thresh1 = float(heat > hthresh1);
	float g_thresh2 = float(heat > hthresh2);

	// Fragment coordinates: x and y.
	float x = gl_FragCoord.x;
	float y = gl_FragCoord.y;
	// Distance between fragment coordinates and the center of the canvas.
	float dx = abs(x - 0.5 * u_size.x);
	float dy = abs(y - 0.5 * u_size.y);

    // GENERATE FRAGMENT HUE.
	// Base heat visualization hue parameter.
	H_base = g_pos * ((0.000182322 * heat + 0.00364643 * (1. - g_thresh1) * max(0., heat - 15.)) + 0.0891714 * (1.0 - g_neg) * (g_thresh1 * 11. * u_time + max(0., heat - (hthresh1 + 1.))));
	// Offset value used in creating the negative heat visualization.
	float neg_offset = g_thresh2 * 1.9 * heat + (1. - g_thresh2) * (1.7 * hthresh2 + 0.2 * heat);
	// Additional component of the heat visualization hue parameter for negative heat.
	H_neg = g_neg * (-0.5 + g_thresh1 * (0.4 * u_time + 0.00328179 * (dx - mod(60. * u_time + neg_offset, 1. + dx) + dy - mod(30. * u_time + neg_offset, 1. + dy))));
	// Final hue.
	float H = mod(u_H_heat + H_base + H_neg, 1.);

	// GENERATE FRAGMENT VALUE (BRIGHTNESS).
	// Constants used in controlling value effects.
	const float v1 = 0.2;
	const float v2 = -0.04;
	// Base heat visualization value parameter.
	V_base = 1. - (1. - g_thresh1) * max(0., v1 * (heat - hthresh1 + 5.)) - g_thresh1 * max(0., 0.5 * v2 * (heat - hthresh1) + 1.0);
	// Final value.
	float V = V_base * min(1.0, 0.1 * heat);

	// Convert HSV color to RGB
	vec3 color_rgb = hsv2rgb(vec3(H, 1.0, V));

	// Write fragment color.
	gl_FragColor = vec4(color_rgb, 1.);
}
