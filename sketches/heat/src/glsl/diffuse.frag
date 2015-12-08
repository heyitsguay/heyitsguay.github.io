#version 120

precision highp float;

// Vec2 of constants to rescale canvas domain to [0,1]x[0,1].
uniform vec2 u_dst;
// Diffusion coefficient.
uniform float u_cdiff;
// Decay coefficient.
uniform float u_cdecay;

// Canvas heat texture sampler.
uniform sampler2D s_heat;
// Entity heat texture sampler.
uniform sampler2D s_entity;

// Diffusion update weighting constants.
const float w1 = 1.0; // N/S/E/W neighbor weights
const float w2 = 0.5; // diagonal neighbor weights
const float w3 = 6.0; // self weight

void main() {
	// This fragment's (self) heat texture coordinate.
	vec2 p = gl_FragCoord.xy * u_dst;

	// s (horizontal) and t (vertical) components of u_dst.
	float ds = u_dst[0];
	float dt = u_dst[1];

	// Vector between self and north neighbor.
	vec2 dn = vec2(0, dt);

	// Vector between self and northeast neighbor.
	vec2 dne = vec2(ds, dt);

	// Vector between self and east neighbor.
	vec2 de = vec2(ds, 0);

	// Vector between self and southeast neighbor.
	vec2 dse = vec2(ds, -dt);

	// Neighbor locations.
	vec2 n = p + dn; // north
	vec2 ne = p + dne; // northeast
	vec2 e = p + de; // east
	vec2 se = p + dse; // southeast
	vec2 s = p - dn; // south
	vec2 sw = p - dne; // southwest
	vec2 w = p - de; // west
	vec2 nw = p - dse; // southwest

	// Neighbor + self heat values. Values are rescaled from [0, 1] to [-0.5, 0.5]
	float heat_p  = texture2D(s_heat, p )[0] + texture2D(s_entity, p )[0] - 1.0;
    float heat_n  = texture2D(s_heat, n )[0] + texture2D(s_entity, n )[0] - 1.0;
    float heat_ne = texture2D(s_heat, ne)[0] + texture2D(s_entity, ne)[0] - 1.0;
    float heat_e  = texture2D(s_heat, e )[0] + texture2D(s_entity, e )[0] - 1.0;
    float heat_se = texture2D(s_heat, se)[0] + texture2D(s_entity, se)[0] - 1.0;
    float heat_s  = texture2D(s_heat, s )[0] + texture2D(s_entity, s )[0] - 1.0;
    float heat_sw = texture2D(s_heat, sw)[0] + texture2D(s_entity, sw)[0] - 1.0;
    float heat_w  = texture2D(s_heat, w )[0] + texture2D(s_entity, w )[0] - 1.0;
    float heat_nw = texture2D(s_heat, nw)[0] + texture2D(s_entity, nw)[0] - 1.0;

    // Compute laplacian of heat map.
    float laplacian = w1 * (heat_n  + heat_e  + heat_s  + heat_w)
                    + w2 * (heat_ne + heat_se + heat_sw + heat_nw)
                    - w3 *  heat_p;

    gl_FragColor = vec4(u_cdecay * (heat_p + u_cdiff * laplacian) + 0.5, 0., 0., 1.);

}
