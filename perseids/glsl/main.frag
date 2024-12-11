precision highp float;
precision highp int;

uniform vec2 uScreenInverse;
uniform sampler2D uStarfieldTex;
uniform sampler2D uShootingStarTex;

void main() {
    vec2 uv = gl_FragCoord.xy * uScreenInverse;
    gl_FragColor = clamp(texture2D(uStarfieldTex, uv) + texture2D(uShootingStarTex, uv), 0., 1.);
}
