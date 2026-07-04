# Food v2: fall from the surface, eat or lose it

Food drops in from above the surface, sinks by its nature, and is gone if it falls out
the bottom of the world — no floor, no pile. The eel eats by meeting an item headfirst
with its mouth open (Space / the mobile eat button); with the mouth closed the whole
body is solid and the item takes an elastic bounce. Eating grants the food's
progression weight (docs/07) and fires the flourish: bubbles + an axis-colored light
pulse + the suck-in animation.

The economy (rarity, fall/sway scales, axis, amount, sizes) lives in `tuning.js`
(`FOODS`, `FALL_MAP`, `SWAY_MAP`); interaction knobs (eat radius, bounce, tumble,
suck-in timing) top `js/food.js`.

## Spawning

Per type, a population-damped Poisson process:

```
cap_i  = rarity_i                       # rarity doubles as the concurrent cap
rate_i = SPAWN_BASE * rarity_i * max(0, 1 − pop_i / cap_i)     # per second
```

Common foods (pinecone 8) are frequent and plentiful; chocolate (1) is a rare event.
Spawn position: x uniform across the world (padded off the walls), y just above the
surface, with a small entry speed. Attempts within `SPAWN_CLEAR` of the eel are
skipped and retried by the process.

## Falling

- Vertical: velocity eases (τ ≈ 0.9 s) toward the type's terminal speed
  (`FALL_MAP(fall)`: 1→12 px/s, 10→90 px/s).
- Sway: lateral velocity tracks the derivative of a sine with the type's amplitude
  (`SWAY_MAP(sway)`) at a shared slow frequency, per-item phase — pinecones flutter
  wide and slow, chocolate drops nearly straight.
- **No self-tumbling:** orientation holds while falling. On body contact the item
  picks up plausible angular velocity from the tangential impact (`TUMBLE_GAIN`),
  then spins down under water damping (`TUMBLE_DAMP`).
- Exit: past `worldH + margin` the item silently despawns. No lifetime otherwise.

## Eat, bounce, flourish

- **Eat** — mouth open past `EAT_MOUTH_MIN`, item within `EAT_RADIUS` of the mouth
  point, in front of the head. Grants `progress.add(axis, amount)`.
- **Suck-in** — the sprite swaps to a white-tinted copy (precomputed per type at load
  via an offscreen canvas — no CSS/SVG filters), then chases the moving mouth point
  while shrinking to `EAT_SHRINK` over `EAT_T` ≈ 0.3 s, fading at the tail. The food
  layer is behind the eel, so the eel occludes the shrinking sprite for free.
- **Light pulse** — the eel emits an additive radial pulse (`water.pulse`): color =
  the food's axis signature (`AXES[axis].color`), radius/alpha scale with the food's
  progression amount. A cheeseburger flashes big and rose-pink.
- **Bounce** — otherwise the spine chain is solid: push-out along the contact normal,
  restitution `BOUNCE_REST`, a kick scaling with eel speed, plus the contact tumble.

## Rendering

Pooled SVG `<image>` elements in `<g id="food">` (behind the eel), one per population
slot (Σ rarity ≈ 27), toggled with `display`; per frame one
`translate · rotate · scale` transform each. White copies are data-URLs generated
once at load.

If Chromium stale-raster residue (docs/04) ever appears around falling items, extend
the damage-rect workaround to the food layer.
