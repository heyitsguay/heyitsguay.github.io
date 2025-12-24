#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

// ─────────────────────────────── Uniforms ──────────────────────────────
uniform float time;                 // Current global time in seconds
uniform vec2  resolution;           // Viewport size in pixels (x,y)
uniform float startSeed;            // Global random seed – any change re‑scrambles tiles

uniform vec2  center;               // Scroll offset for tiling (vizMode==0)
uniform float viewScale;            // Zoom factor applied before tiling/centering
uniform vec2  selectedCenter;       // Manual centre when vizMode==1

uniform float baseTime;             // Phase origin for loop clock
uniform int   vizMode;              // 0 = tiled kaleidoscope,-1 = single selected cell

uniform int   minOctave;            // Lower bound for recursion depth (current)
uniform int   numOctaves;           // Maximum additional octaves per tile (hash‑controlled)
uniform int   minOctaveOld;         // Previous value – allows live cross‑fade
uniform float minOctaveTransition;  // 0→ use old, 1→ use new, t→ mix

// ─────────────────────────────── Constants ─────────────────────────────
const float PI  = 3.141592654;
const float TAU = 6.283185307;

const float loopTime      = 20.0;           // Seamless animation period (seconds)
const float halfLoopTime  = loopTime * 0.5; // Pre‑shift so clock starts in middle of period
const float halfLoopFrac  = 1.0 / halfLoopTime;

//=======================================================================
//  Helpers & utilities
//=======================================================================

/**
 * Returns a saw‑tooth local clock that loops every `loopTime` seconds and is
 * phase‑shifted by ½-cycle so t=0 starts mid‑loop – makes temporal blending
 * easier later on.
 */
float getLocalTime() {
    return baseTime + mod(time, loopTime) + halfLoopTime;
}

/**
 * 2‑D-hash → 4‑D vector in [0,1]. Fast, repeatable pseudo‑random that also
 * depends on the global `startSeed` so whole pattern can be re‑seeded.
 */
#define HASH_MODE 1

vec4 hash24(vec2 t) {
    #if HASH_MODE == 0
    vec3 p  = vec3(t, startSeed);
    vec4 p4 = fract(p.xzyz * vec4(0.1031, 0.1030, 0.0973, 0.1099));
    p4     += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
    #else
    vec3 p = vec3(t, 20.0 + 0.5 * abs(startSeed));
    const float dScale = 0.008028184;
    vec4 p4 = fract(vec4(p.x * dScale, p.y * dScale, (p.x + p.y) * dScale, (p.x - p.y) * dScale));
//    vec4 p4 = fract(vec4(p.z + dScale * p.x, p.z + dScale * p.y, p.z * dScale * p.y, p.z * dScale * p.x));
    return p4;
    #endif
}

/** Clamp colour component‑wise to the [0,1] range. */
vec3 saturate(vec3 c) { return clamp(c, 0.0, 1.0); }

/** Sin mapped to [0,1]; handy for animated parameters without negative range. */
float hsin(float x) { return 0.5 + 0.5 * sin(x); }

/** In‑place 2‑D rotation of vector `p` by angle `a` (radians). */
void rot(inout vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
}

/**
 * Tiles the plane by `size`; returns the tile index as integer vec2 while
 * wrapping `p` into local cell space centred at the origin.
 */
vec2 mod2(inout vec2 p, vec2 size) {
    vec2 cell = floor((p + size * 0.5) / size);
    p = mod(p + size * 0.5, size) - size * 0.5;
    return cell;
}

/**
 * Like `mod2` but mirrors every other tile – classic kaleidoscope effect.
 */
vec2 modMirror2(inout vec2 p, vec2 size) {
    vec2 halfSize = size * 0.5;
    vec2 cell = floor((p + halfSize) / size);
    p = mod(p + halfSize, size) - halfSize;
    #if HASH_MODE == 0
    p *= mod(cell, vec2(2.0)) * 2.0 - 1.0;
    #endif
    return cell;
}

/** Cartesian → polar (r,θ) with θ in radians (-π..π). */
vec2 toPolar(vec2 p) { return vec2(length(p), atan(p.y, p.x)); }
/** Polar → Cartesian. */
vec2 toRect(vec2 pol) { return vec2(pol.x * cos(pol.y), pol.x * sin(pol.y)); }

/** Signed‑distance to axis‑aligned rectangle of half‑size `b`. */
float box(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

/** Signed‑distance to circle of radius `r`. */
float circle(vec2 p, float r) { return length(p) - r; }

//=======================================================================
//  Core distance‑field builder
//=======================================================================

/**
 * Constructs a kaleidoscopic SDF inside tile `c`.
 * ‣ Angle is folded into `nsyms` wedges (radial symmetry).
 * ‣ Space is iteratively tiled/rotated/scaled (`numOctaves`) to create
 *    nested shapes. Mixing of box & circle plus dynamic transforms driven by
 *    per‑tile hashes produce rich, unique petals.
 * Returns the minimal signed distance.
 */
float mandala_df(float localTime, vec2 p, vec2 c, int minO) {
    vec4 hc  = hash24(c);
    vec4 hc2 = hash24(c + 12.53);

    // Slow global spin
    rot(p, 0.05 * sin(3.0 * hc.x) * localTime);

    // --- Radial symmetry ------------------------------------------------
    vec2 pol = toPolar(p);
    float nsyms = 2.0 * round(3.0 + 37.0 * hc.x * hc.x);  // 6..~76 spokes
    float sector = TAU / nsyms;
    float n = pol.y / sector;          // Which wedge?
    pol.y  = mod(pol.y, sector);       // Fold angle into first wedge
    if (mod(n, 2.0) > 1.0) {           // Mirror odd wedges for reflectional symmetry
                                       pol.y = sector - pol.y;
    }
    // Sub‑rotation animates petals
    pol.y += 7.0 * cos(localTime * 0.002 * (hc.x + hc.w) - 10.0 * hc.y);
    p = toRect(pol);

    // Work in positive quadrant and shift so shapes sit nicely
    p = abs(p) - vec2(0.5);

    // --- Fractal octaves -----------------------------------------------
    float d = 1e4;
    int limit = minO + int(float(numOctaves) * hc.z);
    for (int i = 0; i < 12; ++i) {   // hard upper bound for unrolling
         if (i >= limit) break;

         mod2(p, vec2(1.0));

         float drift = hsin(0.02 * localTime + 7.0 * sin(hc.x + hc.y));
         rot(p, 0.1 * (hc.x + hc.z) * localTime);

         float sb = box(p, vec2(1.0) * (0.1 + 0.7 * (hc.y + hc.z))) + drift;
         float cb = circle(p - 0.5 * (0.1 + 0.9 * hc.w), 0.5) + drift * cos(0.0333 * localTime - 7.0 * hc.x);

         float dd = 0.0;
         if      (hc2.x < 0.2) dd = max(sb, -cb);
         else if (hc2.x < 0.4) dd = max(sb,  cb);
         else if (hc2.x < 0.6) dd = min(sb,  cb);
         else if (hc2.x < 0.8) dd = sb;
         else                  dd = cb;

         d = min(d, dd);

         // Prepare next octave – grow & twirl space
         p *= 1.5 + 1.0 * (0.5 + 0.5 * sin(0.5 * localTime - 6.5 * (hc.x + hc.w)));
         rot(p, (hc.y + hc.w) * 0.1 * sin(0.03 * localTime - 3.2 * (hc.z + hc.w)));
    }

    return d;
}

//=======================================================================
//  Colour grading & post‑effects
//=======================================================================

/**
 * Applies per‑tile tone‑mapping, contrast curve, radial fade and subtle bloom
 * so the raw SDF bands look polished.
 */
vec3 mandala_postProcess(float localTime, vec3 col, vec2 uv, vec2 c) {
    vec4 hc  = hash24(c + 294.389);
    vec4 hc2 = hash24(c + 101.243);

    float r = length(uv);

    col = clamp(col, 0.0, 1.0);

    // Per‑channel gamma determined by hash & radius (gives colour variety)
    col = pow(col, mix(vec3(0.5 * hc.x, 0.75 * hc.y, 1.5), vec3(0.45), (0.1 + 0.9 * hc.z) * r));

    // Contrast boost (Schlick curve)
    col = col * 0.6 + 0.4 * col * col * (3.0 - 2.0 * col);
    col = clamp(col, 0.0, 1.0);

    // Slight hue twist & per‑tile brightness
    col = mix(col, pow(col, vec3(hc.x + hc2.y)), hc2.z);

    // Vignette & bloom ring near edge of 2×2 tile area
    col *= clamp(0.5 * sqrt(max(5.0 - r * r, 0.0)), 0.5 + 0.5 * hc2.w, 1.0);
    col *= float(r < 2.0);

    vec2 og = gl_FragCoord.xy / resolution.y;
    col += vec3(0.5) * clamp(r - (1.9 - 0.5 * float(hc2.y < 0.08)), 0.0, 0.25) * (0.4 + 0.4 * (og.y + 2.0 * og.x));

    return clamp(col, 0.0, 1.0);
}

//=======================================================================
//  High‑level sampling
//=======================================================================

/**
 * Full sample: zoom, choose tile, evaluate distance‑field, colour it, and
 * post‑process. Handles live cross‑fade when the octave count is changed.
 */
vec3 mandala_sample(float localTime, vec2 p) {
    // Apply user zoom
    vec2 uv = p * viewScale;

    // --- Select kaleidoscope tile --------------------------------------
    vec2 c;
    if (vizMode == 1) {
        c = selectedCenter;   // Single cell mode
    } else {
        uv += center;         // Scroll offset then mirror‑tile
        c = modMirror2(uv, vec2(4.5));
    }

    // Decide which octave limit to use (smooth parameter change)
    float d;
    if (minOctaveTransition == 0.0) {
        d = mandala_df(localTime, uv, c, minOctaveOld);
    } else if (minOctaveTransition == 1.0) {
        d = mandala_df(localTime, uv, c, minOctave);
    } else {
        d = mix(mandala_df(localTime, uv, c, minOctaveOld),
                mandala_df(localTime, uv, c, minOctave),
                minOctaveTransition);
    }

    // --- Convert signed distance to colours ----------------------------
    vec4 hc = hash24(c - 8.675309);
    float r  = 0.5 * (0.1 + hsin(0.1 * (hc.z + hc.w) * localTime - hc.x * hc.x));
    float nd = d / r;
    float md = mod(d, r);

    vec3 col = vec3(0.0);

    // Coloured edge bands
    if (abs(md) < 0.05 * (0.25 + 15.0 * (hc.x * hc.y))) {
        col = (d > 0.0 ? vec3(0.25, 0.25, 0.65)
        : vec3(0.65, 0.25, 0.25 + 0.5 * hsin(0.08 * localTime - 7.0 * hc.z)))
        / abs(nd * (0.5 + hsin(0.05 * (hc.x + hc.w) * localTime - 7.0 * hc.x - 4.0 * hc.y)));
    }

    // Ultra‑thin white outline exactly at zero level‑set
    float whiteScale = 0.05 * exp2(-(0.01 + 2.5 * hc.w));
    if (abs(d) < whiteScale) col = vec3(1.0);

    // Tone & vignette
    col = mandala_postProcess(localTime, col, uv, c);
    return saturate(col);
}

//=======================================================================
//  Temporal blending modes (seamless 20 s loop)
//=======================================================================

/**
 * Linear blend of two phases – simplest option.
 */
vec3 mandala_linear(vec2 p) {
    float t1 = getLocalTime();
    float t0 = t1 - loopTime;
    float w0 = max(0.0, t0 * halfLoopFrac);
    float w1 = 1.0 - w0;
    vec3 s0 = mandala_sample(t0, p);
    vec3 s1 = mandala_sample(t1, p);
    vec3 s2 = mandala_sample(t1 + loopTime, p); // front sample for overlap
    return w1 * max(s1, s2) + w0 * max(s0, s1);
}

/**
 * Linear weights applied *after* max – keeps brightness constant during blend.
 */
vec3 mandala_max_linear(vec2 p) {
    float t1 = getLocalTime();
    float t0 = t1 - loopTime;
    float w0 = max(0.0, t0 * halfLoopFrac);
    float w1 = 1.0 - w0;
    vec3 s0 = mandala_sample(t0, p);
    vec3 s1 = mandala_sample(t1, p);
    vec3 s2 = mandala_sample(t1 + loopTime, p);
    return max(w1 * max(s1, s2), w0 * max(s0, s1)) / max(w0, w1);
}

//=======================================================================
//  Front‑end selector ─ change BLEND_MODE to test others
//=======================================================================
#define BLEND_MODE 1   // 0 = simple, 1 = linear, 2 = max‑linear
vec3 mandala_main(vec2 p) {
    #if   BLEND_MODE == 0
    return mandala_sample(time, p);           // No temporal blend
    #elif BLEND_MODE == 1
    return mandala_linear(p);
    #else
    return mandala_max_linear(p);
    #endif
}

//=======================================================================
//  Fragment entry point
//=======================================================================
out vec4 fragColor;
void main() {
    // Normalised, centred coordinates with aspect correction
    vec2 uv = gl_FragCoord.xy / resolution.xy - 0.5;
    uv.x *= resolution.x / resolution.y;

    vec3 col = mandala_main(uv);
    fragColor = vec4(col, 1.0);
}
