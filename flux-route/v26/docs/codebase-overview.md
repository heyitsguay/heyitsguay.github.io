# FLUX ROUTE — Codebase Overview

> Last updated: 2026-06-24

## What This Is

FLUX ROUTE is a browser-based fluid puzzle game built on a WebGL2 Navier-Stokes simulation. Players steer a ball through a fluid field, placing fans and emitters to route colored dye into target zones. The game runs entirely client-side with no build step — just static HTML/JS/GLSL served from a file server or GitHub Pages.

The codebase lives at `flux-route/agrav/` within a GitHub Pages site.

---

## Technology

- **Rendering**: Raw WebGL2 (no framework). All simulation and rendering happens in GPU fragment shaders.
- **UI**: Vanilla HTML/CSS DOM overlays + `lil-gui` for developer panels.
- **Module system**: ES modules (`type="module"` in index.html). No bundler.
- **Dependencies**: Only `lil-gui` (vendored in `lib/`).
- **Quality presets**: 7 tiers from `low` (320×180 sim) to `maxx` (1920×1080 sim). Stored in localStorage, changing quality reloads the page.

---

## Directory Structure

```
agrav/
├── index.html              Entry point (canvas, DOM overlays, script tags)
├── css/style.css            All styles (HUD, menus, editor, overlays)
├── js/
│   ├── state.js             Shared mutable state bag (S), tools, species vectors
│   ├── config.js            Quality presets, DEFAULT_PARAMS, pulse system
│   ├── gl-core.js           WebGL2 context, ALL GPU resources, shader compilation
│   ├── simulation.js        Physics substep pipeline (15 GPU passes per tick)
│   ├── input.js             Keyboard, mouse, touch, toolbar, tool placement
│   ├── levels.js            Level loading, manifest parsing, canvas painting
│   ├── main.js              Boot, frame loop, HUD, scoring, switches, events
│   ├── panel.js             Tuning panel (dev mode), localStorage config persistence
│   └── editor.js            Level editor (dev mode), lil-gui, poly/entity editing
├── shaders/
│   ├── common.js            Shared GLSL snippets (FRAG_HEADER, OBST, ZONES, SPECIES)
│   ├── sources.js           All fragment shader source strings (~62KB, ~1470 lines)
│   └── index.js             Assembles GLSL object consumed by gl-core.js
├── levels/
│   ├── manifest.json        Auto-generated level registry (game-epochs + developer-epochs)
│   ├── epoch-names.json     Epoch prefix → display name mapping
│   ├── e1-p1_welcome.json   Level files (JSON + companion .png)
│   └── ...
├── lib/lil-gui.min.js       Vendored GUI library
├── gen-manifest.sh          Bash script to regenerate manifest.json from level files
├── level-design-guide.md    Level authoring reference
└── docs/
    ├── architecture.md              Detailed architecture document (~34KB)
    ├── shader-game-architecture.md   GPU buffer atlas, shader passes, CPU↔GPU I/O
    └── mobile-parity.md              Mobile input/UI parity tracking
```

---

## Module Dependency Graph

```
state.js ─────────────────────────────── (leaf — no deps)
    ↑
config.js ────────────────────────────── (imports state)
    ↑
shaders/ (common.js → sources.js → index.js)  ── (pure GLSL strings, no JS deps)
    ↑
gl-core.js ───────────────────────────── (imports config, shaders/)
    ↑                    ↑
simulation.js            levels.js ───── (imports state, config — no gl-core)
    ↑                    ↑
    └─── input.js ───────┘───────────── (imports state, config, gl-core)
              ↑
         panel.js ───────────────────── (imports state, config — no gl-core)
              ↑
         editor.js ──────────────────── (imports state, config, gl-core, levels)
              ↑
         main.js ────────────────────── (imports ALL — the root)
```

> **Note:** This is NOT a linear chain. `simulation.js`, `levels.js`, `input.js`, `panel.js`, and `editor.js` are all siblings that import from the foundation modules independently. `main.js` is the only module that imports all of them.

**Circular dependency avoidance**: `simulation.js` cannot import `input.js`. Instead, `main.js` calls `setInputRef()` to pass a shared reference object. Similarly, `editor.js` and `input.js` use a `_cb` callback registry pattern — `main.js` registers functions like `loadLevel`, `showToast`, `togglePanel` into `_cb` at boot.

---

## Key Architectural Patterns

### The `S` Object (state.js)
A single mutable bag holding ALL runtime state: game flow, player position, tool selection, scoring, touch state, edit mode flags. Every module imports `S` and reads/writes directly — no getters/setters.

### The `params` Object (config.js)
A mutable copy of `DEFAULT_PARAMS` (~90 tunable floats). The tuning panel edits `params` directly. Per-level overrides are applied at `loadLevel()`. The pulse system (`pulseParam()` / `PV()`) provides temporary event-driven overrides.

### RES_SCALE Normalization (config.js)
`RES_SCALE = SIM_H / 270`. All physics tunables are defined at 480×270 reference resolution. Entity sizes, forces, traversal times are quality-invariant because shaders/CPU multiply by RES_SCALE where needed.

### Ping-Pong Textures (gl-core.js)
Most simulation fields use `makePP()` — two render targets that alternate as read/write each substep. Call `pp.swap()` after writing. The caller must swap explicitly (not automatic).

### Callback Pattern (_cb)
Modules that can't import main.js (circular dep) accept a callback registry. `main.js` calls `initInput({loadLevel, showToast, ...})` at boot to inject functions. `editor.js` uses the same pattern via `initEditor(callbacks)`.

### Overlay Canvas (`#ovc` / `octx`)
A second HTML5 Canvas (2D context) layered over the WebGL canvas. Used by `main.js` for drawing switch wires, gauges, and event animations, and by `editor.js` for drawing the design grid, polygon preview, and selection highlights. The 2D context is shared — `main.js` calls `setEditorCtx(octx)` to give the editor access.

---

## Simulation Pipeline (simulation.js)

Each frame runs 1–4 substeps at DT = 1/120s. Each substep executes these GPU passes in order:

1. **actorUpdate** — player physics, predator AI, piston springs, collisions (GPU)
2. **splatMask** — rasterize actor boundaries into dynMask
3. **gelUpdate** — R+B precipitation, dissolve, erosion (if gel enabled)
4. **obstacleCompose** — merge level SDF + dynMask + gel + walls → obstacle field
5. **splatForce** — fans/emitters/predator suction → velocity (additive blend)
6. **splatDye** — emitter injection / predator eating → dye (additive blend)
7. **splatWake + wakeUpdate** — predator wake deposit + decay
8. **advect velocity** — semi-Lagrangian with per-species viscosity
9. **curl + vorticity** — confinement with media/wake/species modulation
10. **reactForce** — exothermic R×G forces, dynamite detonation, lane/amp forces
11. **pressure projection** — divergence → Jacobi iteration → gradient subtract
12. **advect dye** — at DYE resolution (higher than SIM)
13. **dyePost** — zone absorption, solid decay, gel/dynamite chemistry, temperature
14. **dynUpdate** — dynamite charge evolution (per-substep for fast chain reactions)
15. **scoreAccum** — accumulate delivered dye for win condition

### Splat Mechanism
N_ACTORS (64) instanced quads drawn with additive blending. The vertex shader culls instances by type. Four target types: velocity force, dye, boundary mask, wake.

### Readback (ReadbackChannel)
Ring of 3 PBOs with fence sync for async GPU→CPU data transfer. Reads telemetry (player position, delivered dye, per-actor data) + switch state + material sums.

---

## Rendering Pipeline (main.js → renderFrame)

After simulation, the rendering pass:

1. **Bloom extraction** (`brightFS`) — threshold-gate bright pixels
2. **Gaussian blur** — multi-pass separable blur on bloom texture (configurable `BLUR_PASSES`)
3. **Composite** (`compositeFS`) — the big shader (~200 lines) combining:
   - Species-to-display color mapping via `speciesToDisplay()` (curated palette, not literal RGB)
   - Streak/motion-smear (red stays tight, blue smears glassy)
   - Tonemap with blackbody-inspired temperature scaling (`thermalFloor` + `thermalVis * Tnorm`)
   - Bloom application with `redBloomBoost` (scales bloom by local red concentration)
   - Per-species curl tint (vortex coloring, weighted by `Lr²·dot(speciesFraction, uCurlTint)`)
   - Ambient schlieren (invisible current visualization, crossfades with curl tint on dye density)
   - Gel membrane rendering (icy panes with live rim glow)
   - Iridescent thin-film cosine-palette animation on idle win zones
   - Media field + amp hatch pattern visualization
   - Debug visualization modes (11 modes, cycled via Tab key)

### Species Color Model
The simulation uses 3 independent dye species stored as RGB in simulation textures:
- **R channel** = Red species (cargo) — the primary delivery species
- **G channel** = Green species (reagent) — catalytic, scintillates
- **B channel** = Blue species (builder) — combines with red to form gel

Display colors are mapped via `speciesToDisplay()` in the shader using curated palette vectors (not literal RGB). Each species has independent viscosity, curl confinement, and rendering behavior.

---

## Game Mechanics

### Zones (encoded as pixel colors in level canvas)
| Color | Zone | Purpose |
|-------|------|---------|
| `#ff0000` | Solid | Wall (impassable) |
| `#00ff00` | Sink/Win | Intake zone — absorbs dye, scores delivery |
| `#0000ff` | Drain | Removes dye (penalty) |
| `#00ffff` | Trigger | Gate trigger (dye flow opens/closes things) |
| `#000080` | Sensor | Low-blue sensor for switch conditions |

### Actors (64 GPU slots)
| Type | Name | Description |
|------|------|-------------|
| 1 | Player | WASD-controlled ball |
| 2 | Fan | Pushes fluid (player-placed or level) |
| 3 | Emitter | Injects colored dye |
| 5 | Piston | Spring-loaded oscillating obstacle |
| 6 | Predator | AI-driven dye consumer |
| 7 | Nest | Predator spawner |
| 8 | Pickup | Collectible (grants tools/spin tiers) |
| 10 | TempEmitter | Injects/removes heat |

### Polygon Types (level editor)
`solid`, `removable`, `sand`, `slate`, `concrete`, `steel`, `win`, `drain`, `media`, `flow`, `door`, `gel`, `dynamite`, `multiplier`, `switch`

> **Note:** `switch` is a special kind that creates a sensor rect (rectangle mode only), not a paint polygon. It goes into `editData.switches[]`, not `editData.polys[]`.

### Switches
Rect-based sensors that detect dye volume/flow/pressure. Can target actors and polygons to enable/disable them. Evaluated per-frame from GPU readback data.

### Temperature System
Fourth "species" channel (stored in dye.a). R×G reactions generate heat. Heat modulates viscosity, curl confinement, reaction rates. Gel formation stops above a threshold. Dynamite detonates by temperature.

---

## Level System

### Manifest-Driven Loading
`gen-manifest.sh` scans `levels/` and builds `manifest.json` from `epoch-names.json`. At boot, `loadLevels()` fetches the manifest, then each level JSON.

### Level File Format
Each level is a JSON file with fields: `name`, `size`, `playerStart`, `polys[]`, `actors[]`, `switches[]`, `budgets`, `wells`, `events[]`, `callouts[]`, `mediaZones[]`, `tempZones[]`, `config` (param overrides), `win` (`{fraction, holdSec}`). Companion `.png` thumbnails are displayed in the level select grid.

### Attract Level
When `S.levelIdx === -1` (title screen), the engine runs `ATTRACT_LEVEL` — a special idle-mode level with no player, no win condition, just fluid eye candy behind the menu.

### Epoch Organization
Levels are grouped into epochs. There are two categories:
- **game-epochs** — visible to all players
- **developer-epochs** — only visible after entering the BULLFROG developer mode sequence at the title screen

### File Naming Convention
`{epoch_prefix}-p{puzzle_number}_{slug}.json` — e.g., `e1-p1_welcome.json`

---

## Developer Mode

Activated by typing **BULLFROG** (case-insensitive) at the title screen. Provides:
- Developer epochs in level select
- EDITOR button on title screen
- Tuning panel (T key)
- Debug visualization modes (Tab key)

---

## Keyboard Shortcuts

### Player Mode (always active in-level)
| Key | Action |
|-----|--------|
| W/A/S/D, Arrows | Move |
| U / O | Spin CCW / CW |
| 1-6 | Select tool (fan, blue, green, sand, slate, concrete; steel/lane via toolbar) |
| 0 | Deselect tool |
| [ ] | Rotate hovered entity |
| Shift | Aim mode |
| Shift+Click | Place / paint |
| Shift+RClick | Delete hovered |
| R | Reset level |
| N | Next level (after win) |
| , . | Prev / next level |
| Space | Pause |
| ESC | Menu |
| / or ? | Toggle shortcut help overlay |

### Developer Mode (when devMode active)
| Key | Action |
|-----|--------|
| T | Toggle tuning panel |
| Tab | Cycle debug view (11 modes) |
| X | Chemistry pulse demo |

### Editor Mode (when in level editor)
| Key | Action |
|-----|--------|
| J | Select mode |
| I | Entity mode |
| L | Rectangle mode |
| K | Polygon mode |
| Y | Toggle editor panel |
| Enter | Close polygon |
| R | Restart simulation |
| Del | Delete selected |
| Ctrl+Z | Undo |

---

## Tuning Panel (panel.js)

~90 tunable parameters organized into groups:
- **flow** — curl, dissipation, warm start
- **species physics** — per-species viscosity and curl confinement
- **zones & scoring** — absorption rates, win scale
- **emitters & tools** — fan/emitter strengths, brush sizes
- **player** — thrust, drag, spin
- **bodies** — masses, restitution, piston springs
- **gel** — reaction, dissolve, erosion rates
- **exothermics** — explosion forces, dynamite, lanes
- **rendering** — tonemap, bloom (including `redBloomBoost`), curl tint (per-species: `curlTintRed/Green/Blue`), schlieren, streak
- **temperature** — heat rates, cooling, activation energy, diffusion (`tempDiffuse`), friction heat (`spinHeat`)

Configs persist to localStorage. Log-scale sliders use a getter/setter proxy pattern.

---

## Editor (editor.js)

Full level editor accessed via the EDITOR button (dev mode only). Features:
- **Modes**: select, polygon, rectangle, entity (shortcuts: J/I/L/K)
- **Polygon editing**: click to place vertices, Enter to close
- **Entity placement**: fans, emitters (red/blue/green), pistons, nests, pickups (no predator — those are spawned by nests at runtime)
- **Per-polygon properties**: kind, angle, strength (log-scale 0.001–1.5 for flow), enabled, ID
- **Switch creation**: rect-based with threshold, mask, kind, hold/latch
- **Undo**: Ctrl+Z (actor + poly state snapshots)
- **Import/Export**: JSON I/O for level data
- **ID generation**: `{kind}{N}` per-kind sequential (e.g., `emitter1`, `flow1`, `switch1`)
- **Grid snap**: Alt bypasses snap

---

## CSS Architecture

Single `style.css` file. Key conventions:
- `--ui` CSS variable for responsive sizing (set from JS based on viewport)
- `.loading` class on `<body>` — opacity 0 during boot, removed after assets load
- `.ov` class — absolute-positioned overlay (HUD, stats, keys)
- All menu/overlay positioning uses `calc(var(--ui) * N)` for resolution independence

---

## Gotchas & Invariants

1. **S.lastTelem must never be reassigned** — ReadbackChannel stores a reference to it at construction. Only mutate its contents.
2. **Ping-pong swap is manual** — `runFS()` does NOT auto-swap. The caller must call `pp.swap()` after writing.
3. **writeActor writes to BOTH ping-pong copies** — writing only one loses the data on the next swap.
4. **localStorage configs can override DEFAULT_PARAMS** — if rendering looks wrong after a param rename, the user may have stale localStorage values. Clear with the tuning panel's config dropdown.
5. **RES_SCALE normalization** — any new force/distance param must be multiplied by `RES_SCALE` where used to remain quality-invariant.
6. **Half-float fallback** — on devices without `EXT_color_buffer_float`, the engine uses `RGBA16F` with `SCORE_SCALE = 1/64` compensation.
7. **Shader sources are template literals** — in `sources.js`, composed by concatenating shared snippets from `common.js`. Search for uniform names across the full file.
8. **Quality default is ambiguous** — `config.js` initializes `qualityName = "ultra"` then tries `localStorage.getItem("fluxroute.quality") || "high"`. So the default is `"high"` for new users (empty localStorage), and the `"ultra"` initializer is just a fallback for invalid stored values.
9. **DYE resolution ≠ SIM resolution** — dye advection runs at `DYE_W × DYE_H` (up to 1920×1080) while simulation runs at `SIM_W × SIM_H` (up to 960×540 at cray quality). The two grids are different and shaders use different texel sizes.
10. **gen-manifest.sh requires Python 3** — it's a bash wrapper around an inline Python script. Must be run from the `agrav/` directory (or pass the path as arg).
11. **The `switch` poly kind creates a switch entry, not a polygon** — despite being in the `polyKind` dropdown, it appends to `editData.switches[]` and is handled completely differently from regular polygons.

---

## Future Directions

- **Sandbox mode**: stripped-down editor for player-facing creative play (falling sand genre inspired)
- **Mobile ergonomics**: major effort to make all controls work well on touch (see `docs/mobile-parity.md`)
- **In-game menu system**: hotbar + context panel + radial menu, drawing from crafting game UI patterns
