#ifdef GL_ES
precision mediump float;
#endif

uniform float groove;
uniform float tick;
uniform float hbase;
uniform vec4 color;
uniform bool isround;

varying vec2 velocity;

const float delta = 0.4;
const float PI = 3.14159265;

const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
// Thanks to sam at http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl (May 19, 2015).
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    vec3 rgb = c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    return rgb;
}

float atan2(in float y, in float x) {
    bool s = (abs(x) > abs(y));
    return mix(PI*0.5 - atan(x,y), atan(y,x), float(s));
}

void main() {
    // Generate hue from velocity direction
    float angle = atan2(velocity[1], velocity[0]);
    float h = mod(hbase + (angle + PI) / (2. * PI)
                + mod(groove * tick, 1.), 1.);

    // Generate saturation from velocity magnitude
    float s = 1. / (1. + 0.2 * length(velocity));

    vec4 col = vec4(hsv2rgb(vec3(h, s, 1.)), 1.);

//    vec2 p = 2.0 * (gl_PointCoord - 0.5);
//    float a = smoothstep(1. - delta, 1., length(p));
//    float e = 0. + length(velocity) / 3.;
//    gl_FragColor = pow(mix(color, vec4(0, 0, 0, 0), a), vec4(e));
//    gl_FragColor = mix(col, vec4(0, 0, 0, 0), a);

    vec2 d = 2.0 * (gl_PointCoord - 0.5);
    float l = length(d);

    if (isround) {

        col.a = 1. - 1. / (1. + exp(-6. * (l - 1.)));
        col *= float(l < 1.);

    }

    gl_FragColor = col;
}