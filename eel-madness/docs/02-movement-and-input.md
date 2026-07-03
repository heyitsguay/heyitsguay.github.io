# Movement & Input

The physics details the brief calls out — ease-in on swim start, momentum carrying briefly on
stop, arcing turns — all come from one small model: **heading + speed with asymmetric
exponential easing**, fed by a unified intent.

## Intent abstraction

Input devices never touch physics. Both produce the same struct per frame:

```
intent = { active, dirX, dirY, throttle, mouth }   # dir unit-length, throttle ∈ [0,1]
```

- **Keyboard** (WASD + arrows): pressed keys sum to a direction, normalized; `throttle = 1`.
- **Mouth** (Space, hold): `intent.mouth` is true while held. The eel's `mouth` state snaps
  open (τ ≈ 70 ms) and eases shut (τ ≈ 120 ms); an open mouth costs 30% of top speed (drag).
  No mobile mouth input yet — candidates: second finger, double-tap-hold, on-screen button.
- **Pointer** (tap/click and hold, drag to steer): direction = head → pointer.
  `throttle = min(1, dist / 150)` — an *arrive* behavior, so the eel decelerates smoothly
  and settles at the held point instead of orbiting it. Within 14 px the intent goes
  inactive (deadzone against jitter).
- Keyboard wins if both are active. `pointermove` updates the target while held, so dragging
  leads the eel around. Pointer events cover mouse and touch identically.

## Steering model

State: position `(x, y)`, `heading` (rad), `speed`, `effort` (smoothed throttle).

```
# effort: ease-in on start, longer ease-out on stop
target = active ? throttle : 0
tau    = target > effort ? 0.30 : 0.55        # seconds
effort = expApproach(effort, target, dt, tau)

# turning: rate-limited, so direction changes are arcs, never snaps
turnRate = 3.4 + 2.2 * speed01                # rad/s — turns tighter with flow over the body
heading += clamp(angleDiff(desired, heading), ±turnRate * dt)

# speed: asymmetric easing = swim-up ramp vs glide-down momentum
targetSpeed = maxSpeed * effort               # maxSpeed ≈ 1.15 × body length / s
tauS  = targetSpeed > speed ? 0.50 : 0.90     # decel slower than accel → glide
speed = expApproach(speed, targetSpeed, dt, tauS)

x += cos(heading) * speed * dt    (+ head wiggle injection, see 01-eel-wiggle)
y += sin(heading) * speed * dt
```

`expApproach(cur, target, dt, tau) = target + (cur − target) · e^(−dt/τ)` — framerate-
independent easing; every "feel" behavior above is just a τ choice.

Why this shape:

- **Ease-in**: effort τ=0.30 stacked on speed τ=0.50 gives a soft S-curve start — the eel
  visibly *gathers itself* rather than launching.
- **Momentum**: on release, effort decays (0.55 s) into speed decay (0.90 s) — the eel glides
  a body-length or so, wave amplitude relaxing with `speedSm`, before settling into idle sway.
- **Arcing turns**: rate-limited heading + the chain trailing through the turn path is what
  makes reversals read as a fish U-turn instead of a sprite rotation.

## Boundaries

Fixed-camera tank, soft walls: within a 70 px margin, an inward push vector is blended into
the desired direction (stronger the deeper into the margin), so the eel *steers away* from
walls rather than hitting them. A hard clamp 10 px from the edge backstops it; on clamp,
the outward velocity component is killed so it slides along the wall instead of pinning.

## Tuning table

| Constant | Value | Feel it controls |
|---|---|---|
| `effort τ` up / down | 0.30 / 0.55 s | startup gather / throttle release |
| `speed τ` up / down | 0.50 / 0.90 s | acceleration ramp / glide distance |
| `maxSpeed` | 1.15 × body length /s | top speed |
| `turnRate` | 3.4 + 2.2·speed01 rad/s | turn radius |
| arrive radius | 150 px | how early it brakes for a held point |
| wall margin | 70 px | how soon it shies from edges |
