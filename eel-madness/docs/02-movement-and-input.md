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
- **Mouth (automatic — no key, no button):** `intent.mouth` is set by the game, not a
  device: main.js feeds it `food.probe(eel)` — true while any food item intersects the
  probe: a narrow isosceles triangle from the nose tip forward along the heading,
  apex at the nose, opening to `PROBE_WIDTH_FRAC` of its length at the far end
  (`PROBE_START`, `PROBE_LEN`, `PROBE_WIDTH_FRAC` in food.js). Aim at food and the
  mouth opens by itself, staying open until the food is eaten or the probe misses.
  The eel's `mouth` state still snaps open (τ ≈ 70 ms) and eases shut (τ ≈ 120 ms);
  an open mouth costs 30% of top speed (drag), so lining up a catch has a real cost.
- **Speed burst (hold Shift, or the touch ⚡ sprint button):** `intent.boost`, gated
  by the `speedBurst` EEL MAGIC dial in main.js. The eel handles stamina/easing
  itself (see docs/07); `getBoost()` reports Shift only — the ⚡ button rides
  ui.js → main like greet/flare. (The two-finger gesture is retired, 2026-07-05.)
- **Eel-light flare (hold J, or the touch ✦ button):** `intent.flare`, gated by the
  `eelLight` dial in main.js exactly like boost. The eel owns the flare state machine —
  green light stamina, ignition pulse, hold-to-sustain (docs/10 follow-up 2).
- **Greet (I, or the touch greet button):** edge-triggered via `consumeGreet()`;
  main.js gates it on the `greet` dial and its cooldown (docs/07).
- **Esc** toggles the pause menu (ui.js listens for it directly).
- **UI guard:** pointer-downs on `#ui` (pause button, menu, greet button) never reach
  steering — the window listener ignores targets inside it.
- **Pointer** (tap/click and hold, drag to steer): direction = head → pointer.
  `throttle = min(1, dist / 150)` — an *arrive* behavior, so the eel decelerates smoothly
  and settles at the held point instead of orbiting it. Within 14 px the intent goes
  inactive (deadzone against jitter).
- **Virtual joystick (touch devices, 2026-07-05):** on `pointer: coarse` devices the
  joystick is the ONE steering authority — field touches do nothing (no accidental
  darting, and the tap gesture stays free to become the revamp's "aim"). The pad
  (`#joypad`, bottom corner; side is a title-screen Setting, `body.stick-right`)
  is a fixed **zone**: the stick origin floats to wherever the touch first lands
  inside it, direction = the vector from that origin to the drag point, and
  throttle ramps to full at `JOY_R` px past a small deadzone. Pointer capture
  keeps the stick tracking off-pad; the nub is pure feedback. Mouse (and pen)
  press-and-hold steering below is unchanged, locked to one pointer at a time.
- Keyboard wins over the joystick, which wins over the held mouse pointer.
  `pointermove` updates the target while held, so dragging leads the eel around.

## Steering model

State: position `(x, y)`, `heading` (rad), `speed`, `effort` (smoothed throttle).

```
# effort: ease-in on start, longer ease-out on stop
target = active ? throttle : 0
tau    = target > effort ? 0.30 : 0.55        # seconds
effort = expApproach(effort, target, dt, tau)

# turning: rate-limited, so direction changes are arcs, never snaps
boostF   = 1 + boostAmt * boost01             # the speed-burst multiplier (1 → up to 2.5)
turnRate = (3.4 + 2.2 * speed01) / boostF     # rad/s — tighter with flow over the body,
                                              # proportionally wider mid-burst
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
- **Burst = commitment**: the same factor that multiplies top speed during a speed burst
  *divides* the turn rate, so a burst trades agility for speed — you commit to a line and
  carve wide arcs until you ease off.

## Boundaries

The sea is infinite along x (docs/09) — there are no side walls. The surface and the
floor keep the original soft-wall treatment: within a 70 px margin, an inward push
vector is blended into the desired direction (stronger the deeper into the margin), so
the eel *steers away* rather than hitting them. A hard clamp 10 px inside the edge
backstops it; on clamp, the outward velocity component is killed so it slides along
the boundary instead of pinning.

## Tuning table

All of these are named constants at the top of `eel.js` (steering/speed group) or
`input.js` (pointer group):

| Constant | Value | Feel it controls |
|---|---|---|
| `TAU_EFFORT_UP` / `_DOWN` | 0.30 / 0.55 s | startup gather / throttle release |
| `TAU_SPEED_UP` / `_DOWN` | 0.50 / 0.90 s | acceleration ramp / glide distance |
| `MAX_SPEED_BL` | 1.15 body lengths /s | top speed |
| `TURN_RATE_BASE` + `TURN_RATE_SLOPE`·speed01 | 3.4 + 2.2 rad/s | turn radius |
| turn ÷ (1 + `boostAmt`·boost01) | ÷1.5 → ÷2.5 | burst arcs widen with the speed gain (BOOST in tuning.js) |
| `POINTER_ARRIVE` (input.js) | 150 px | how early it brakes for a held point |
| `POINTER_DEADZONE` (input.js) | 14 px | jitter deadzone around a held point |
| `JOY_R` (input.js) | 48 px | stick drag for full throttle |
| `JOY_DEADZONE` (input.js) | 8 px | stick wobble that still reads as idle |
| `WALL_MARGIN` / `WALL_PUSH` | 70 px / 1.2 | how soon / how hard it shies from the surface/floor |
