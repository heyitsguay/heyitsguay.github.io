precision mediump float;

varying vec2 coord;
uniform float t;
uniform vec3 tint;

void main() {
    float x = coord[0];
    float y = coord[1];
    gl_FragColor = vec4(cos(0.5 * (x * x + y * y)) * sin(0.1 * t), 0.,
    sin(y * y - x * x), 1.);
//    gl_FragColor = vec4(cos(10. * coord[0] + 0.01 * t), 0., coord[1], 1.);
//    gl_FragColor = texture2D(image, coord) + vec4(tint, 0);
}
