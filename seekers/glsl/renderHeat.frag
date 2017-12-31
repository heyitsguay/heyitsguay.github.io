uniform sampler2D texture;

varying vec2 vUV;

// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
// Convert a color vec3 in HSV coordinates to a color vec3 in RGB coordinates. Assumes all coordinate ranges are [0,1].
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    return rgb;
}

void main() {
	float heat = 0.8 * texture2D(texture, vUV).x;
	float v = clamp(10. * (heat - 0.5), 0., 1.);
	gl_FragColor = vec4(hsv2rgb(vec3(heat, 1., v)), 1.);
}
