precision highp float;

uniform vec2 u_dst;

uniform sampler2D s_heat;
uniform sampler2D s_entityheat;
uniform sampler2D s_tileheat;

const float w1 = 1.0; // NESW neighbor weighting
const float w2 = 0.5; // diagonal neighbor weighting
const float w3 = 6.0; // self weighting
const float iw3 = 0.166666666; // inverse of w3, for scaling the conductance parameter.

void main() {
    // Self texel coordinates.
    vec2 p = gl_FragCoord.xy * u_dst;

    // Conductance.
    float conductance = iw3 * texture2D(s_tileheat, p)[0];

    // Decay
    float decay = texture2D(s_tileheat, p)[1];

    float ds = u_dst[0];
    float dt = u_dst[1];

    // 1.0 when on the texture border, 0.0 otherwise. Use to set a 0 boundary for the heat diffusion.
    float borderCheck = float(p[0] < 0.00001 || p[0] > 0.99999 || p[1] < 0.00001 || p[1] > 0.99999);

    // Neighbor texel coordinates.
    vec2 n  = p + vec2( 0.,  dt);
    vec2 ne = p + vec2( ds,  dt);
    vec2 e  = p + vec2( ds,  0.);
    vec2 se = p + vec2( ds, -dt);
    vec2 s  = p + vec2( 0., -dt);
    vec2 sw = p + vec2(-ds, -dt);
    vec2 w  = p + vec2(-ds,  0.);
    vec2 nw = p + vec2(-ds,  dt);

    // Heat values.
    float valp  = texture2D(s_heat, p ).r + texture2D(s_entityheat, p ).r - 1.0;
    float valn  = texture2D(s_heat, n ).r + texture2D(s_entityheat, n ).r - 1.0;
    float valne = texture2D(s_heat, ne).r + texture2D(s_entityheat, ne).r - 1.0;
    float vale  = texture2D(s_heat, e ).r + texture2D(s_entityheat, e ).r - 1.0;
    float valse = texture2D(s_heat, se).r + texture2D(s_entityheat, se).r - 1.0;
    float vals  = texture2D(s_heat, s ).r + texture2D(s_entityheat, s ).r - 1.0;
    float valsw = texture2D(s_heat, sw).r + texture2D(s_entityheat, sw).r - 1.0;
    float valw  = texture2D(s_heat, w ).r + texture2D(s_entityheat, w ).r - 1.0;
    float valnw = texture2D(s_heat, nw).r + texture2D(s_entityheat, nw).r - 1.0;

    float laplacian = w1 * (valn  + vale  + vals  + valw )
                    + w2 * (valne + valse + valsw + valnw)
                    - w3 * valp;

    // Heat intensity, packed into the R channel.
    float R = (1.0 - borderCheck) * decay * (valp + conductance * laplacian) + 0.5;

    // No G,B,A channel usage so far.
    gl_FragColor = vec4(R, 0., 0., 0.);
}