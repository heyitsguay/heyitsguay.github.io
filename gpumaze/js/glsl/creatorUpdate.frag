uniform sampler2D creatorsLast;
uniform vec2 arraySize;
uniform float numCreators;

float rand1(vec2 n) {
	return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float rand2(vec2 n) {
	return fract(sin(dot(n, vec2(23.1234, 6.11))) * 6804.9608);
}

vec2 rand(vec2 n) {
    return vec2(rand1(n), rand2(n));
}

void main() {
    float index = gl_FragCoord.y * arraySize[0] + gl_FragCoord.x;
    vec2 newData = vec2(0., 0.);
    if (index < numCreators) {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 data = texture2D(creatorsLast, uv);

        vec2 scale = 0.02 / resolution.xy;
        newData = data.xy + scale * rand(uv);
    }
	gl_FragColor = vec4(newData, 0.0, 1.0);
}
