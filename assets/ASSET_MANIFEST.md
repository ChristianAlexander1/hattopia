# Asset Manifest — Sproutopia

All shipped artwork is original. Since the 2026-10-14 visual overhaul, tiles,
flora, icons and the sky backdrop are drawn procedurally pixel-by-pixel by
`scripts/draw_assets.py` (deterministic, seeded RNG) in the researched
2D-sandbox style; the character is drawn procedurally by
`client/js/player_draw.mjs`. No Growtopia art is shipped in the game.

## Reference library (`assets/ref/`, NOT shipped in the game)

Proprietary Growtopia art, kept strictly as visual reference for drawing the
original replacements above. See `assets/ref/README.md` for sources and
license status. Scope of the 2026-10-14 pass: PLAYER + BLOCKS only.

- `ref/player/` — decoded player sheets: `player_body_only.png` (128×64,
  4×2 grid of 32×32 body frames), `player_face.png` (256×256, 8×8 face
  variants), `player_eyes.png` (256×256, 8×8 eye variants),
  `player_arm.png` (8×16). Plus `_preview_*.png` contact sheets and
  `manifest.json` (sheet sizes, grids, render notes).
- `ref/blocks/` — `tiles_page1_atlas.png` (1024×1024, 32×32 tile grid) and
  verified 32×32 crops (`tile_dirt/lava/bedrock/rock/cavebg/wood.png`) with
  `manifest.json` (item IDs, names, atlas coordinates, collision, hardness
  from decoded `items.dat`; per-tile verification notes).
- Known gap: Grass (id 16) metadata points at atlas tile (0,6), which is
  empty/black in this atlas version — documented in the manifest; grass-topped
  dirt variants exist elsewhere in the atlas.

## Shipped game assets (`client/img/`)

| File | Game object(s) |
|------|----------------|
| `tiles/dirt.png` | Dirt block (id 1), Dirt Background uses dirtbg |
| `tiles/grass.png` | Grass Block (id 2) |
| `tiles/stone.png` | Stone (id 3) |
| `tiles/wood.png` | Wood Planks (id 4) |
| `tiles/brick.png` | Brick (id 5) |
| `tiles/glass.png` | Glass Pane (id 6) |
| `tiles/bedrock.png` | Bedrock (id 7, unbreakable) |
| `tiles/door.png` | Door (id 8; punch to teleport to spawn) |
| `tiles/sign.png` | Sign (id 9) |
| `tiles/worldlock.png` | World Lock (id 50) |
| `tiles/torch.png` | Torch (id 12, decorative) |
| `tiles/cavebg.png` | Cave Background (id 10) |
| `tiles/dirtbg.png` | Dirt Background (id 11) |
| `flora/seed.png` | All seed item icons + growth stage 0 |
| `flora/sapling.png` | Growth stage 1 |
| `flora/tree_young.png` | Growth stage 2 |
| `flora/tree_mature.png` | Growth stage 3 (harvestable) |
| `icons/wrench.png` | Wrench tool (id 80) |
| `icons/gem.png` | Gems (currency, reserved for future UI) |
| `backdrop.png` | Parallax sky background |

## Procedural (drawn in code, no image files)
- Player character (`client/js/player_draw.mjs`) — customizable skin/hair/shirt/pants,
  idle/run/jump/fall/punch states
- Damage cracks overlay, rain particles, harvest/break/splice particles
- All UI icons/buttons (emoji + CSS)
- All sound effects (`client/js/audio.mjs`, WebAudio synthesis)

## Regenerating
Edit `scripts/build_assets.py` if the source grids change, then run
`npm run assets` from the repo root.
