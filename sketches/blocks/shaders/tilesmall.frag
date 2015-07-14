precision highp float;

uniform vec2 u_dst;
uniform float u_tilesize;

uniform sampler2D s_heat;
uniform sampler2D s_magic;
uniform sampler2D s_tilesmall;

void main() {
    vec2 u_dstlarge = vec2(u_tilesize * u_dst[0], u_tilesize * u_dst[1]);
    vec2 p = gl_FragCoord.xy * u_dstlarge;

    vec2 mapsold = texture2D(s_tilesmall, p).rg;

    // Compute sum of 10 Tile pixel samples to determine new Tile heat and magic.
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

    // New Tile magic value. Average over 10 samples.
    float G = 0.1 * (
        texture2D(s_magic, p0).r + texture2D(s_magic, p1).r + texture2D(s_magic, p2).r + texture2D(s_magic, p3).r
      + texture2D(s_magic, p4).r + texture2D(s_magic, p5).r + texture2D(s_magic, p6).r
      + texture2D(s_magic, p7).r + texture2D(s_magic, p8).r + texture2D(s_magic, p9).r
      );

    // B is currently unused.

    // Checks whether the Tile's heat or magic has changed, and calls an update if so.
    A = float(R != mapsold.r || G != mapsold.g);
    gl_FragColor = vec4(R, G, 0., A);
}