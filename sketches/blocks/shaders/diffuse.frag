precision highp float;

uniform vec2 u_dst;

// Hacky workaround variable to reuse this code with two different heat/magic maps but only one tilemap.
// 0 or 2
uniform int u_idxcdct;

uniform sampler2D s_map;
uniform sampler2D s_entitymap;
uniform sampler2D s_tilemap;

const float w1 = 1.0; // NESW neighbor weighting
const float w2 = 0.5; // diagonal neighbor weighting
const float w3 = 6.0; // self weighting
const float iw3 = 0.166666666; // inverse of w3, for scaling the conductance parameter.

void main() {
    // Self texel coordinates.
    vec2 p = gl_FragCoord.xy * u_dst;

    int idxdecay = u_idxcdct + 1;

    // Conductance.
    float cdct = iw3 * texture2D(s_map, p)[u_idxcdct];

    // Decay
    float decay = texture2D(s_map, p)[idxdecay];

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
    float valp  = texture2D(s_map, p ).r + texture2D(s_entitymap, p ).r - 1.0;
    float valn  = texture2D(s_map, n ).r + texture2D(s_entitymap, n ).r - 1.0;
    float valne = texture2D(s_map, ne).r + texture2D(s_entitymap, ne).r - 1.0;
    float vale  = texture2D(s_map, e ).r + texture2D(s_entitymap, e ).r - 1.0;
    float valse = texture2D(s_map, se).r + texture2D(s_entitymap, se).r - 1.0;
    float vals  = texture2D(s_map, s ).r + texture2D(s_entitymap, s ).r - 1.0;
    float valsw = texture2D(s_map, sw).r + texture2D(s_entitymap, sw).r - 1.0;
    float valw  = texture2D(s_map, w ).r + texture2D(s_entitymap, w ).r - 1.0;
    float valnw = texture2D(s_map, nw).r + texture2D(s_entitymap, nw).r - 1.0;

    float laplacian = w1 * (valn  + vale  + vals  + valw )
                    + w2 * (valne + valse + valsw + valnw)
                    - w3 * valp;

    // Map intensity, packed into the R channel.
    float R = (1.0 - borderCheck) * decay * (valp + cdct * laplacian) + 0.5;

    // New map conductance from Tiles, packed into the G channel.
    float G = texture2D(s_tilemap, p)[u_idxcdct];

    // New map decay rate
    float B = texture2D(s_tilemap, p)[idxdecay];

    // No A channel usage so far.
    gl_FragColor = vec4(R, G, B, 0.);
}