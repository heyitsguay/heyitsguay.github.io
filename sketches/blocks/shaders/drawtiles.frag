precision highp float;

varying vec4 v_color;
varying vec4 v_heat;

// Rescales the heat range to [-0.5, 0.5].
const float heatoffset = HEATOFFSET2;

// Heat values linearly interpolate between Tile color and either the 'hot' or 'cold' const RGBA color vectors below.
const vec3 c_hot  = vec3(0.99216, 0.45490, 0.05882);
const vec3 c_cold = vec3(0.25882, 0.53333, 0.99216);

// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
vec3 hsv2rgb(vec3 c)
{
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    return rgb;
}

void main() {
    // First component is heat.
    float heat = heatoffset * v_heat[0] - 0.5;

    // Check if heat map is positive or negative.
    float iscold = float(heat < 0.0);

    // Linear interpolation used for the heat visual effect is between the Tile's color and c_heat.
    vec3 c_heat = iscold * c_cold + (1.0 - iscold) * c_hot;

    // Convert HSB to RGB, interpolate with c_heat.
    vec3 c_rgb = mix(hsv2rgb(v_color.rgb), c_heat, abs(heat));

    gl_FragColor = vec4(c_rgb, v_color.a);
}