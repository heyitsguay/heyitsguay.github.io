uniform sampler2D maze;
uniform vec2 screenSize;
uniform vec2 screenCenter;
uniform float iTileSize;


// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
const vec4 K = vec4(1., 2. / 3., 1. / 3., 3.);
// Convert a color vec3 in HSV coordinates to a color vec3 in RGB coordinates. Assumes all coordinate ranges are [0,1].
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + K.xyz) * 6. - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0., 1.), c.y);
    return rgb;
}


float mod1(float x) {
    return mod(mod(x, 1.) + 1., 1.);
}


void main() {
    // Position of this fragment in world coordinates
    vec2 posWorld = screenCenter + gl_FragCoord.xy - 0.5 * screenSize;
    // Position of this fragment in maze coordinates
    vec2 posMaze = floor(iTileSize * posWorld);

    float state = texture2D(maze, posMaze).x;

    float h = mod1(posWorld * 0.01);
    float v = float(state > 0);

	gl_FragColor = vec4(hsv2rgb(vec3(h, 1., v)), 1.0);
}
