# The Eel Wiggle

The crux of the project: a convincing swim animation built from an SVG path whose boundary
vertices move over time. This document specifies the model and why each piece exists.

## Approach in one paragraph

The eel is not an animated path in the keyframe sense — it's a **simulated spine** (a chain of
~44 points) from which we **regenerate the path `d` every frame**. The head is driven by
steering physics; the rest of the chain trails it. A traveling sine wave is layered on top at
render time. The outline is the spine inflated by a width profile and smoothed with Catmull-Rom
curves. Decorations are SVG elements pinned to parametric positions along the spine.

This separates three concerns that would otherwise fight each other:

1. **Where the eel goes** (head physics — see [02-movement-and-input](02-movement-and-input.md))
2. **How the body follows** (chain constraint — turning, coiling, history of motion)
3. **How it undulates** (render-time wave — never disturbs the simulation)

## 1. Spine chain (follow-the-leader)

`N = 44` points, segment length `SEG = bodyLength / (N-1)`. Each frame, after the head moves:

```
for i in 1..N-1:
    dir = normalize(p[i] - p[i-1])          # direction the segment already points
    dir = clampAngle(dir, prevSegDir, MAX_BEND)   # limit bend per segment (~0.26 rad)
    p[i] = p[i-1] + dir * SEG
    prevSegDir = dir
```

Properties that make this the right primitive:

- The body **traces the head's path through turns** for free — arc into a turn and the body
  sweeps through the same arc a beat later. This is most of what reads as "eel".
- It's unconditionally stable (it's a constraint, not a force integration).
- The bend limit prevents hairpin kinks when the head reverses sharply; the body instead
  folds into a smooth U, like a real eel.

## 2. Traveling wave (the undulation)

Real eels swim anguilliform: a wave travels head → tail, growing in amplitude toward the tail.
We add this **at render time only**, as a lateral offset along each spine point's normal:

```
t_i     = i / (N-1)                          # 0 at head, 1 at tail
env(t)  = 0.10 + 0.90 * t^1.4                # amplitude envelope: a little head sway, most at tail
A       = widthScale * (2.0 + 6.0 * speedSm) # px; grows with smoothed speed
offset_i = A * env(t_i) * sin(phase - t_i * WAVELENGTHS * 2π)     # WAVELENGTHS ≈ 1.5
r_i     = p_i + n_i * offset_i               # rendered spine point
```

`phase` advances at `freq = 1.1 + 2.3 * speedSm` Hz — the eel always idles with a slow gentle
wave (it never looks dead), and beats faster/bigger as it speeds up. `speedSm` is a smoothed
speed fraction so amplitude eases in and out rather than snapping.

**Head wiggle injection.** A pure render-time wave leaves the *simulated* path straight, so
long straight swims look like a ribbon on rails. Fix: inject a small lateral oscillation into
the head's actual position each frame, as the *delta* of a sine (so it never accumulates
drift): `x += perp * (sin(phase) - prevSin) * headAmp`. The chain then records a genuinely
sinuous path, and the render wave rides on top of it. `headAmp` is kept small — the head
should barely wiggle; the wave envelope puts the visible motion in the body and tail.

## 3. Outline generation (spine → path `d`)

A width profile gives the slender black body its shape (half-widths in px at reference length,
scaled by `widthScale`; see `WPROF` in eel.js for current values): a wide nose base (`w(0)` is
the nose-cap radius), an ovular head bulge peaking around t=0.13, a neck dip at t=0.30, then a
long gentle taper to a pointed tail. Values are interpolated with smoothstep between control
points.

Per frame:

1. Compute tangents of the **rendered** spine `r` by central difference; normals are tangents
   rotated 90°. (Using post-wave normals avoids pinching at high wave amplitude.)
2. Offset: `top_i = r_i + n_i * w_i`, `bot_i = r_i - n_i * w_i`.
3. Assemble a closed loop: `[top_0..top_43, bot_43..bot_0, headContour]`. The head's front
   is an **authored jaw-to-nose contour** (`HEAD_PTS` in eel.js): 9 points in the head's
   local frame — jaw root, chin, lower lip, mouth-crease corner, upper lip, nose, snout top —
   ordered mouth-edge → eye-edge so it splices the bottom edge back around to the top.
   Plenty of samples across the front keeps the Catmull-Rom fit blunt and round (a lone tip
   point collapses the snout to a cone, however the widths are tuned).

   **The mouth** is a notch in this contour: the mouth-corner point is a pivot, and each
   contour point carries a weight for how much it rotates about that pivot when the mouth
   opens (lower-jaw points swing down, upper-snout points counter-tilt up). The mouth is
   automatic — food on the nose probe (docs/02) eases `mouth` 0→1 (snap open ~70 ms,
   close ~120 ms), a dark interior
   polygon under the body shows through the notch, and an open mouth adds drag (−30% top
   speed). Contour verticals scale by `sideSm`, so the head squashes flat mid-roll — exactly
   when the traversal order mirrors — and the flip never pops.
4. Convert the loop to cubic Béziers via closed Catmull-Rom (`c1 = P1 + (P2−P0)/6`,
   `c2 = P2 − (P3−P1)/6`) and emit one `d` string. ~90 points → ~5 KB string; one
   `setAttribute` per frame, well within budget (measured pattern: path regen is far cheaper
   than layout/paint of many separate elements).

The body is styled black (`#0b0b0e`) with a translucent pale-teal **stroke** — the stroke reads
as a continuous fin membrane / water-contact glow and separates the dark body from dark water
without SVG filters (blur filters on an animated path are a mobile perf trap).

## 4. Composition system (decorations riding the spine)

Any SVG element can be pinned to the spine via a parametric position `s ∈ [0,1]`:

```
pointAt(s) → { x, y, tangent, normal }     # interpolated along rendered spine
```

Each decoration sets its transform (or cx/cy) from this each frame.

**Side view + free 2D swimming needs a side convention.** The eye and wig live on the eel's
"up" side, but the eel can face any direction — when it turns to face the other way, a naive
`scaleY(-1)` mirror pops. Instead we track a continuous **side factor**:

```
targetSide = sign(dot(headNormal, worldUp))   # which side of the spine currently faces up
sideSm     = expApproach(sideSm, targetSide, dt, ~0.15)   # smoothed −1..+1
```

Decorations offset along `normal * sideSm`: when the eel swings through vertical, the eye and
wig slide across the spine over a few frames — it reads as the eel *rolling* to keep its face
up, which is exactly what a real fish-shaped thing would do. No pop.

- **Eye**: one big cute eye — anchored at `s ≈ 0.045` plus a forward push along the heading
  so it sits on the face, offset `normal * sideSm` above the spine. Slightly elliptical
  — wider than tall (long axis along the heading), large pupil leading toward the heading (the eel looks
  where it's going), a small highlight, and short eyelashes fanning over the upper rim with
  tail-swept tips. **Lash length is an EEL MAGIC cosmetic** (4 → 8 across the axis,
  via `setMagic`), as is the **makeup**: a purple eyeshadow crescent over the lid and
  red lipstick stroked along the lip contour points, both fading in with the makeup
  dial and hue-shifting slowly once the `makeupHue` threshold passes (docs/07).
- **Wig**: long platinum-blonde *locks* (thick filled ribbons, not stroked strands) rooted
  along a mammal-skull hairline over the back of the head (see below). Each lock is its own
  tiny trailing chain (the same follow-the-leader trick
  as the body): the root is pinned to the scalp, free points get sway forces (a strong idle
  billow term runs even at rest — the water owns the hair) plus a weak pull (τ ≈ 2.6 s)
  toward a rest pose lying back along the body with slowly-wandering lift, then the
  fixed-length constraint runs root-outward. The chain is then inflated by a width profile
  into a tapered ribbon, like a mini eel body. The result is hair that genuinely **drifts in
  the wake** — streams behind during a swim, sweeps across during the side-roll, billows at
  rest.

  **The hairline is a skull oval.** Imagine the oval of a mammal skull sitting on the spine
  (center at `WIG_OVAL_S`, radii `WIG_OVAL_RA` along the body × `WIG_OVAL_RB` upward). Locks
  root along its arc, in the head frame where 0° points at the nose and 90° is straight up:
  from `WIG_ARC_START` (≈80°, just shy of the crown) back and down to `WIG_ARC_END` (≈155°,
  the nape). Lock length grows front→back, so the longest hair hangs from the nape. Roots sit
  `WIG_ROOT_PROUD` off the oval surface; per-lock jitter, fixed at startup, is along the arc
  (`WIG_ATTACH_ASTD`, degrees) and radial (`WIG_ATTACH_RSTD`, kept small so roots hug the
  skull). The oval frame lives on the rendered spine at `WIG_OVAL_S`, so the hairline rides
  the head through turns and squashes with `sideSm` mid-roll like every other decoration.
  Count/length/thickness knobs: `WIG_LOCKS`, `WIG_POINTS`, `WIG_THICK`, `WIG_THICK_VAR` in
  eel.js; **hair color is in style.css** (`#eel-wig path` — fill is the hair, stroke is the
  lock edge).
- **Dorsal fringe**: the translucent stroke on the body path doubles as the continuous
  dorsal/ventral fin membrane eels have; a dedicated fin ribbon path is a roadmap item.

A note on realism: real eels undulate laterally, which a true side view wouldn't show. The
stylized in-plane wave is the correct choice anyway — it's the universally-read cartoon of
"swimming eel", and it's what makes the animation visible at all.

Later decorations (fins, accessories, expressions) plug into the same `pointAt(s)` contract.

## Risks & tuning notes

- **Every feel knob is a named constant at the top of `eel.js`**, grouped by system: spine
  (`MAX_BEND`), wave (`FREQ_*`, `AMP_*`, `ENV_*`, `WAVELENGTHS`), head injection
  (`HEADWIG_*`), steering/speed (`TURN_RATE_*`, `MAX_SPEED_BL`, `TAU_*`, `WALL_*`),
  eye/lashes (`EYE_*`, `PUPIL_*`, `LASH_*`), wig (`WIG_*`). No tuning number hides in a
  function body — only math identities, epsilons, and per-lock/per-point phase strides
  (pure decorrelation, not feel) stay inline. The core of the swim feel is `MAX_BEND`
  plus the wave and head-injection groups.
- If turns look too stiff → raise `MAX_BEND`; too noodly → lower it.
- If fast swimming looks frantic → lower `FREQ_SLOPE` before touching amplitude.
- Watch for outline self-intersection at max bend + max amplitude near the thick head section;
  if it appears, cap `env * A` against local radius of curvature (not needed at current
  values).
