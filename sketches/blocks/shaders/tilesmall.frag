precision highp float;

uniform vec2 u_dstsmall;
uniform vec2 u_dst;

uniform sampler2D s_heat;
uniform sampler2D s_tilesmall;

void main() {
    vec2 p = gl_FragCoord.xy * u_dstsmall;
    float heatold = texture2D(s_tilesmall, p).r;

    // Compute sum of 10 Tile pixel samples to determine new Tile heat.
    vec2 p0 = p + vec2(2. , 2. ) * u_dst;
    vec2 p1 = p + vec2(8. , 2. ) * u_dst;
    vec2 p2 = p + vec2(13., 2. ) * u_dst;
    vec2 p3 = p + vec2(6. , 6. ) * u_dst;
    vec2 p4 = p + vec2(13., 7. ) * u_dst;
    vec2 p5 = p + vec2(2. , 8. ) * u_dst;
    vec2 p6 = p + vec2(9. , 9. ) * u_dst;
    vec2 p7 = p + vec2(2. , 13.) * u_dst;
    vec2 p8 = p + vec2(7. , 13.) * u_dst;
    vec2 p9 = p + vec2(13., 13.) * u_dst;

    // New Tile heat value. Average over 10 samples.
    float R = 0.1 * (
        texture2D(s_heat, p0).r + texture2D(s_heat, p1).r + texture2D(s_heat, p2).r + texture2D(s_heat, p3).r
      + texture2D(s_heat, p4).r + texture2D(s_heat, p5).r + texture2D(s_heat, p6).r
      + texture2D(s_heat, p7).r + texture2D(s_heat, p8).r + texture2D(s_heat, p9).r
      );

    // G, B are currently unused.

    // Checks whether the Tile's heat has changed, and calls an update if so.
    float A = float(R != heatold);
    gl_FragColor = vec4(R, 0., 0., A);
}