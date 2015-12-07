precision highp float;

varying vec4 v_heat;

const float heatoffset1 = HEATOFFSET1;
const float heatoffset2 = HEATOFFSET2;

void main() {
    float heat0 = heatoffset2 * (v_heat[0] + heatoffset1);
    gl_FragColor = vec4(heat0, v_heat.yzw);
}