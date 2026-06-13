# Mobile ↔ Desktop Parity Investigation

> [!IMPORTANT]
> This document inventories all layout code that uses hard-coded `px` units,
> proposes a responsive strategy, and explores a viewport-camera model for
> high-DPI mobile play.

---

## 1. Current state

### 1.1 Viewport meta

```html
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
```
Correct — prevents browser zoom/pinch interference.

### 1.2 Canvas sizing

The `<canvas id="gl">` has fixed `width="1920" height="1080"` attributes.
The CSS stretches it to `inset:0; width:100%; height:100%` — so CSS layout is
responsive, but the **backbuffer is always 1920×1080** regardless of device.

Portrait mode applies a CSS `transform: rotate(90deg)` to both canvases
and uses `width:100vh; height:100vw` for the rotated dimensions.

### 1.3 Simulation resolution vs display resolution

The sim grid (SIM_W × SIM_H) is determined by the quality preset, not the
display. On high-DPI phones (3× density), CSS pixels are already tiny, but
the sim texels are projected through the same 16:9 viewport regardless.

---

## 2. px audit — CSS (`style.css`)

### 2.1 Font sizes (13 unique values)

| Value | Elements | Notes |
|-------|----------|-------|
| `54px` | `#menu h1` | Title screen "FLUX ROUTE" |
| `26px` | `#win div` | "FLOW SUSTAINED" overlay |
| `17px` | `#msg` | In-game messages |
| `15px` | `.mbtn` | Menu buttons |
| `14px` | `#toast`, `#fatal p`, `#options h2` | Toast notifications, error, options |
| `13px` | `#callouts .co`, `#toolbar button` | Callout text, toolbar labels |
| `12px` | `.ov`, `#menu .sub`, `#panel .ph`, `#options .card` | HUD, subtitle, panel headers |
| `11px` | `#stats`, `#keys`, `#panel`, `#menu .credits`, `--font-size` (lil-gui) | Small info text |
| `10px` | `#panel textarea` | Panel textarea |

### 2.2 Spacing/padding (selected)

| Property | Elements | Value |
|----------|----------|-------|
| `padding` | `#callouts .co` | `0` (ok) |
| `padding` | `.mbtn` | `10px 46px` |
| `padding` | `#win div` | `18px 34px` |
| `padding` | `#ioBox .iocard` | `14px` |
| `padding` | `#panel` | `10px 14px 24px` |
| `gap` | `.iorow`, `#toolbar`, `#options .orow`, `#panel .prow` | `6–14px` |
| `margin` | `#menu .sub` | `margin-bottom:26px` |

### 2.3 Positioning (absolute/fixed offsets)

| Property | Elements | Value |
|----------|----------|-------|
| `left` | `#hud`, `#stats` | `12px` |
| `right` | `#keys` | `12px` |
| `top` | `#hud` | `20px` |
| `bottom` | `#stats`, `#keys`, `#toolbar` | `8px`, `34px` |
| `left` | `#toolbar` | `10px` |
| `bottom` | `#menu .credits` | `16px` |
| `left/right` | `.credits-l`, `.credits-r` | `18px` |

### 2.4 Fixed widths

| Property | Elements | Value |
|----------|----------|-------|
| `width` | `#panel` | `340px` |
| `width` | `#panel label` | `110px` |
| `width` | `#panel .pv` | `52px` |
| `min-width` | `.mbtn` | `200px` |
| `min-width` | `#options .card` | `300px` |

### 2.5 Decorative/fine (low priority)

`border-width`, `text-shadow` offsets, `border-radius`, `box-shadow` blur
— these are all 1–8px decorative sizes that look acceptable at any scale.

---

## 3. px audit — JavaScript (`main.js`)

| Location | Code | Purpose |
|----------|------|---------|
| `layoutChrome` L193-197 | `wx0 + "px"`, `wyTop - 30 + "px"` | Position HUD/toolbar at game-window edges |
| `spawnCallout` L458 | `(13 * c.size).toFixed(1) + "px"` | Dynamic callout font size |
| `updateCallouts` L469 | `p[0] + "px"`, `p[1] + "px"` | Position callouts at screen coords |
| `updateMenuWash` L549-552 | `.left`, `.top`, `.width`, `.height` | Position menu backdrop wash |

**Verdict on JS px:** The `layoutChrome` and `updateCallouts` functions
compute screen-space pixel positions from UV via `getBoundingClientRect()`.
These are already responsive in principle — they produce CSS `px` from
actual layout measurements. The issue is only with **magic constants** like
`- 30`, `+ 10`, `- 60` and the base `13` font size.

---

## 4. Strategy

### 4.1 Tiered approach

Not all `px` values need the same treatment:

| Tier | What | Strategy | Unit |
|------|------|----------|------|
| **A** | Font sizes (all 13 values) | Scale with viewport | `clamp(Xpx, Yvw, Zpx)` |
| **B** | HUD/toolbar/overlay positioning | Scale with viewport | `vmin` or calculated |
| **C** | Panel width + internal sizing | Responsive sidebar | `min(340px, 90vw)` |
| **D** | Padding/gap/margin on UI panels | Scale proportionally | `em` or `vmin` |
| **E** | Decorative (borders, shadows) | Leave as `px` | `px` (fine) |
| **F** | JS computed positions | Already responsive | Keep `px` (from `getBoundingClientRect`) |

### 4.2 Recommended base unit

Use `vmin` as the reference unit for game UI elements. On a 1920×1080
desktop, `1vmin = 10.8px`. On a 375×812 iPhone, `1vmin = 3.75px`.

Define a CSS custom property for the "design scale":
```css
:root {
  --ui: min(1vmin, 6px);  /* caps at ~6px so desktop doesn't over-scale */
}
```

Then express sizes as multiples:
```css
#menu h1 { font-size: calc(var(--ui) * 9); }    /* 54px equiv at 1080p */
#toolbar button { font-size: calc(var(--ui) * 2.2); }
```

### 4.3 JS magic constants

Replace hardcoded pixel offsets in `layoutChrome` with `vmin`-aware calculations:
```js
const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
const uiScale = Math.min(vmin, 6);  // matches CSS --ui
hud.style.top = Math.max(0.5 * uiScale, wyTop - 5 * uiScale) + "px";
```

### 4.4 Callout font sizing

Currently: `(13 * c.size).toFixed(1) + "px"`.
Proposal: read computed `--ui` from CSS and scale:
```js
const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui'));
el.style.fontSize = (2.2 * ui * c.size).toFixed(1) + "px";
```

---

## 5. Viewport camera concept

> [!TIP]
> This section explores the idea of the game being "zoomed in" on mobile,
> with the player navigating a dye grid larger than one screen.

### 5.1 Current model

The full 16:9 UV space `[0,1]²` is always visible. The composite shader
renders the entire simulation in one pass. On a small phone, the fluid
detail is tiny — individual texels may be sub-pixel.

### 5.2 Camera model

Introduce a **viewport rectangle** in UV space: `[camU0, camV0, camU1, camV1]`.
The composite shader would sample `uDye` within this sub-rect instead of `[0,1]²`.

**Advantages:**
- Mobile players see 2-4× more detail; the fluid is beautiful up close
- Levels could be much larger than one screen (exploration element)
- Natural zoom/pan with pinch gestures (already have touch infrastructure)

**Challenges:**
- Composite shader needs UV remapping (straightforward)
- HUD positions must map through the camera (already have `uvToScreen`)
- Switch wires/gauges on the overlay canvas need the same transform
- Level design: need to ensure the player can see enough context
- Win condition: player must be able to find the sink zone

### 5.3 Implementation sketch

```
Camera state: S.cam = { u0, v0, u1, v1, zoom }
Default: { u0:0, v0:0, u1:1, v1:1, zoom:1 }  (current behavior)
Mobile: { u0:0.2, v0:0.2, u1:0.8, v1:0.8, zoom:2 }  (zoomed 2×)

Composite shader change:
  vec2 worldUV = mix(uCam.xy, uCam.zw, vUv);
  vec4 d = texture(uDye, worldUV);

Pan: player movement auto-scrolls with deadzone
Pinch: adjusts zoom level (clamp to 1×–4×)
```

### 5.4 Decision: ship responsive first (Option A)

CSS `px` → responsive conversion ships first as a standalone cosmetic pass.
Camera model and UI redesign are separate future milestones.

---

## 6. Recommended implementation order

1. **CSS custom property `--ui`** — define the base scale unit
2. **Tier A: font sizes** — convert all 13 font-size declarations to `calc(var(--ui) * N)`
3. **Tier B: positioning** — convert HUD/toolbar/overlay absolute offsets to `vmin`
4. **Tier C: panel** — `width: min(340px, 90vw)` + internal em-based sizing
5. **Tier D: padding/gap** — convert to `em` or `calc(var(--ui) * N)` where appropriate
6. **JS constants** — update `layoutChrome`, `spawnCallout` to use `--ui`-based math
7. **Verify on devices** — test on iPhone SE (375×667), iPhone 14 Pro (393×852), iPad
8. **(Later) Camera model** — implement UV sub-rect viewport for zoomed mobile play

---

## 7. Resolved design questions

1. **Panel / toolbar / entity UX:** The entire tool UI, entity placement,
   and manipulation flow needs a redesign for both desktop and mobile.
   Radial menus, standard game UI patterns, and unified desktop/mobile
   interaction models are under consideration. **Out of scope for this
   responsive pass** — acknowledged as a dedicated future milestone.

2. **Credits positioning:** Track **screen edges** (not game window).
   Pavel's credit text must be abbreviated for portrait mode.

3. **Toolbar:** Deferred to the UI redesign milestone (see #1).

4. **lil-gui:** Keep as-is for desktop. If a future UI redesign finds a
   better pattern that bridges desktop/mobile and looks nicer, lil-gui
   can be replaced then. For now, use best-effort `px` sizing on desktop.

---

## 8. Future scope: UI redesign milestone

> [!NOTE]
> This section captures requirements for a future dedicated milestone.

**Goals:**
- Unified interaction model that works well on both desktop and mobile
- Standard game UI patterns (radial menus, tap-hold-drag, etc.)
- Entity placement/manipulation that isn't awkward on touch devices
- Mobile-friendly level editor (currently very desktop-centric)
- Minimize parallel code paths for desktop vs mobile

**Considerations:**
- The current tool set (fan, blue emitter, green emitter, slate, steel, lane,
  erase) is mature enough to design around
- Touch interactions: tap-to-place, drag-to-rotate, pinch-to-adjust-strength
- Desktop interactions: click-to-place, scroll-to-rotate, shift-drag for painting
- Radial menus could unify both: long-press on mobile / right-click on desktop
- lil-gui replacement candidate: custom panel system that works on both platforms

