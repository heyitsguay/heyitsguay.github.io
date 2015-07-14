precision highp float;

varying vec4 v_color;

// Tiles space texel dx and dy. Resulting texel values are divided by tileSize, as this multiplication happens after each
// u_dst_tiles access.
uniform vec2 u_dst_tiles;
uniform sampler2D s_tilesmall;

// Heat values linearly interpolate between Tile color and either the 'hot' or 'cold' const RGBA color vectors below.
const vec3 c_hot = vec4(0.99216, 0.45490, 0.05882);
const vec3 c_cold = vec4(0.25882, 0.53333, 0.99216);

// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
vec3 hsv2rgb(vec3 c)
{
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    return rgb;
}

void main() {
    // Texel coordinates of the parent Tile's pixel in tilesmall.
    vec2 xymap = floor(u_dst_tiles * gl.FragCoord.xy);

    // R is heat, G is magic.
    vec2 maps = texture2D(s_tilesmall, xymap).rg - vec2(0.5, 0.5);
    // Check if heat map is positive or negative.
    float negheat = float(maps[0] < 0);

    // Linear interpolation used for the heat visual effect is between the Tile's color and c_heat.
    vec3 c_heat = vec3(negheat, negheat, negheat) * c_cold + vec3(1.0-negheat, 1.0-negheat, 1.0-negheat) * c_hot;

    // Magic alters the H value of the Tile's color
    float H = mod(v_color[0] + maps[1], 1.0);

    // Assemble magic-altered Tile HSB color.
    vec3 c_hsb = vec3(H, v_color.gb);

    // Convert HSB to RGB, interpolate with c_heat
    vec3 c_rgb = mix(hsv2rgb(c_hsb), c_heat, abs(maps[0]));

    gl.FragColor = vec4(c_rgb, v_color.a);
}