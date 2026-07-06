# Food v2: fall from the surface, eat or lose it

> **P4 (docs/10):** every spawned item also rolls a **grade**
> (common/rare/legendary — amount multiplier + buzz/throb falling tells),
> quick-succession eats chain into **combos** (counter popups, escalating eat
> FX, placeholder reward = boost stamina), and the **red beans & rice patch**
> is the first patch-type food (a cloud of individually-eaten grains). Spec
> in docs/10; knobs in tuning.js (`GRADES`, `COMBO`, `FOODS.beansrice`).

Food drops in from above the surface, sinks by its nature, and is gone if it falls out
the bottom of the world — no floor, no pile. **The mouth is automatic:** a probe
segment off the nose tip (`food.probe(eel)` → `intent.mouth`; see docs/02) opens the
jaw whenever food lies ahead, and the eel eats what it meets headfirst. With the mouth
closed (nothing ahead) the whole body is solid and items take an elastic bounce. Eating grants the food's
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
Spawn position: x uniform across the camera window plus a pad (`SPAWN_XPAD` beyond
each side — the world is infinite in x, docs/09, so food falls where you are), y just
above the surface, with a small entry speed. Attempts within `SPAWN_CLEAR` of the eel
are skipped and retried by the process.

## Falling

- Vertical: velocity eases (τ ≈ 0.9 s) toward the type's terminal speed
  (`FALL_MAP(fall)`: 1→24 px/s, 10→180 px/s).
- Sway: lateral velocity tracks the derivative of a sine with the type's amplitude
  (`SWAY_MAP(sway)`) at a shared slow frequency, per-item phase — pinecones flutter
  wide and slow, chocolate drops nearly straight.
- **No self-tumbling:** orientation holds while falling. On body contact the item
  picks up plausible angular velocity from the tangential impact (`TUMBLE_GAIN`),
  then spins down under water damping (`TUMBLE_DAMP`).
- Exit: past `worldH + margin` the item silently despawns. No lifetime otherwise.

## Eat, bounce, flourish

- **Probe** — an isosceles triangle from `PROBE_START` px ahead of the head, running
  `PROBE_LEN` along the heading, apex at the nose and widening to
  `PROBE_LEN × PROBE_WIDTH_FRAC` at the far end; any live item whose radius touches
  it requests the mouth. Longer = earlier jaw; wider fraction = more forgiving aim.
- **Eat** — mouth open past `EAT_MOUTH_MIN` (the probe got it there), item within
  `EAT_RADIUS` of the mouth point, in front of the head. Grants
  `progress.add(axis, amount × AMOUNT_SCALE)` — the global damper (tuning.js, 0.25)
  balances the high spawn rate: lots falls, each bite counts for less. The eat
  pulse still scales with the raw amount.
- **Suck-in** — the sprite swaps to a white-tinted copy (precomputed per type at load
  via an offscreen canvas — no CSS/SVG filters), then chases the moving mouth point
  while shrinking to `EAT_SHRINK` over `EAT_T` ≈ 0.3 s, fading at the tail. The food
  layer is behind the eel, so the eel occludes the shrinking sprite for free.
- **Light pulse** — the eel emits an additive radial pulse (`water.pulse`): color =
  the food's axis signature (`AXES[axis].color`), radius/alpha scale with the food's
  progression amount. A cheeseburger flashes big and rose-pink.
- **Flash + shake** (`tuning.EAT_FX`) — a gentle fullscreen tint in the same axis
  color (peak ~0.10–0.22 opacity, ~0.18 s fade; the div sits above the veil so depth
  can't mute it) and a small decaying camera shake (4–14 px, τ ≈ 0.12 s) applied to
  the rendering camera only — every visual layer shakes together, the sim camera
  stays clean. A bite that levels an axis up (docs/08) hits `LEVELUP_MUL` (1.4×)
  harder on both, applied after the usual caps so the boost always reads.
- **Bounce** — otherwise the spine chain is solid: push-out along the contact normal,
  restitution `BOUNCE_REST`, a kick scaling with eel speed, plus the contact tumble.

## Rendering

Pooled SVG `<image>` elements in `<g id="food">` (behind the eel), one per population
slot (Σ rarity ≈ 27), toggled with `display`; per frame one
`translate · rotate · scale` transform each. White copies are data-URLs generated
once at load.

If Chromium stale-raster residue (docs/04) ever appears around falling items, extend
the damage-rect workaround to the food layer.
