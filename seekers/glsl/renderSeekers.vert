//precision highp float;
//
//attribute vec2 offset;
//attribute float id;

//uniform int numSeekers;
uniform vec2 seekerInverse;
uniform vec2 screenInverse;
uniform sampler2D seekerPosition;

#define PI 3.1415927

vec2 rotate(vec2 v, float a) {
    float s = sin(a);
    float c = cos(a);
    mat2 m = mat2(c, -s, s, c);
    return m * v;
}

vec2 scale(vec2 v) {
    return 2. * v * screenInverse;
}

void main() {
//    int x = int(index / numSeekers);
//    int y = mod(index, numSeekers);
//
//    vec4 seekerInfo = texture2D(seekerPosition, seekerInverse * vec2(y, x));
//    vec2 position = seekerInfo.rg;
//    float orientation = seekerInfo.b;
//    vec2 vertexPosition = position + rotate(scle(offset), orientation);
//	gl_Position = vec4(vertexPosition, 1., 1.);
//	gl_Position = vec4(offset, 0.1, 1.);

    vec4 seekerInfo = texture2D(seekerPosition, vec2(0., 0.));
    vec2 pos = seekerInfo.rg;
    float orientation = seekerInfo.b;
    vec2 finalPos = pos + scale(rotate(position.rg, -orientation));
    gl_Position = vec4(finalPos, 0., 1.);

}
