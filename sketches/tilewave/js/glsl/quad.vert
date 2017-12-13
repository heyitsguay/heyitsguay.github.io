varying vec2 vUV;

void main() {
	vUV = uv;

    gl_Position = vec4(position, 1.);
//
//   	vec4 mvPosition = modelViewMatrix * vec4(position, 1.);
//	gl_Position = projectionMatrix * mvPosition;
}