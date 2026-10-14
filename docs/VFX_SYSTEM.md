# VFX & Weather System (Pack 3 Integration, 2026-10-14)

## Phase 1 — Inspection results

**Actual count:** 110 usable PNGs (manifest correct). 9 additional sheet files
in `weather/sheets/` (reference only, not integrated). 8 preview contact sheets.

**Verification:**
- Water tiles: 311×312, seamless in 2×2 repeat test ✓
- Splash animations: 6 anims (droplet 4f, entry 5f, ground 6f, large 6f,
  ripple 4f loop, scatter 5f); frames within each anim share dimensions ✓
- All sprites: genuine RGBA transparency ✓
- Style: consistent pixel-art with packs 1–2 ✓

**Converted (53 files)** → `client/img/vfx/`:
- `clouds/` (10): all cloud sprites, max 400px wide
- `rain/` (8): drizzle, short/wind/long streaks, 2 snowflakes (6–28px)
- `splashes/` (16): ground (6f), ripple (4f), droplet (4f) @32px
- `water/` (4): deep 01/02, wave 01/02 @32px seamless (for future water anim)
- `wind/` (7): 3 leaves, dust, pollen, wind streak, feather @16px
- `fog/` (6): patches, strips, wispy, ground @500px wide
- `lighting/` (4): torch glow, gradient, 2 lightning bolts

**Not converted (57):** duplicate rain drizzle frames 02–06, splash entry/
large/scatter anims (redundant with ground), water highlight/ripple overlays,
extra wind debris, glow variants, detail accents. Archived in
`assets/ref/vfx_pack/` (original zip).

## Phase 2 — Implementation

**New module:** `client/js/vfx.mjs`
- `VFX` class: `update(dt, w, h, camX, camY, world)`, `renderBackground()`,
  `renderForeground()`, `renderGlowAt()`
- Object-pooled particles: rain (220 max), splashes (60), wind (40)
- Clouds: 3 parallax depths, storm variants when dark
- Fog: 6 banks, layered front/back, opacity-driven
- Lightning: random strikes during storm (flash + bolt sprite)
- Torch/glow: additive `lighter` composite halo on `light: true` tiles

**Integration:**
- `main.mjs`: VFX instance, `loadVfx()` at boot, update in frame loop,
  weather from server → `vfx.setWeather()`
- `render.mjs`: `renderBackground()` after backdrop; `renderForeground()`
  replaces old line-rain code; glow in tile loop
- `server/game.mjs`: 8 weather kinds (weighted random)

## Phase 3 — Presets

`PRESETS` in vfx.mjs: clear, cloudy, drizzle, rain, heavy, storm, fog, snow.
Each defines: cloud, rain, wind, fog, dark, lightning, snow (0–1).
Transitions: exponential lerp (dt×0.8) — smooth, no abrupt switches.

## Phase 4 — Mobile performance

- Quality presets: high (220 rain), medium (120), low (50). Default medium.
- UI: Help (?) → Visual quality selector (High/Medium/Low), persisted.
- No full-screen per-pixel effects; sprite-based particles only.
- Fog/clouds are large sprites, not shader passes.

## Phase 5 — Tests

- 21/21 automated tests pass.
- Visual verification (headless Chrome):
  - Storm: dark clouds, rain streaks, wind leaves, splashes, dark overlay ✓
  - Rain: streak particles, ground splashes ✓
  - Fog: transition in progress (smooth lerp confirmed) ✓
  - Zero console errors ✓
- New UI icons (backpack, fist) render correctly ✓

## Known issues

- Fog preset takes ~5s to fully transition from storm (by design).
- Water block animation (4 frames converted) not yet wired to tile renderer.
- Unused: 57 pack files archived (duplicates/alternates).
