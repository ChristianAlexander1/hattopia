# Asset Registry — Full Game Asset Integration (2026-10-14)

Source: `asset2.zip` (user-uploaded "Growtopia-Inspired 2D Pixel-Art Asset Collection").
Archived at: `assets/ref/asset_pack/` (original zip preserved).
78 individual files + 5 category sheets. All 78 integrated. 0 skipped.

## 1. Blocks (24) → `client/img/tiles/` (32×32, seamless)

| # | Original file | Game tile | Item ID | Name | Collision | Notes |
|---|---|---|---|---|---|---|
| 1 | block_dirt.png | dirt.png | 1 | Dirt | solid | replaces old art |
| 2 | block_grass_dirt.png | grass.png | 2 | Grass Block | solid | top blades preserved |
| 3 | block_stone.png | stone.png | 3 | Stone | solid | replaces old art |
| 4 | block_wood.png | wood.png | 4 | Wood Planks | solid | replaces old art |
| 5 | block_brick.png | brick.png | 5 | Brick | solid | replaces old art |
| 6 | block_glass.png | glass.png | 6 | Glass Pane | solid | replaces old art |
| 7 | block_bedrock.png | bedrock.png | 7 | Bedrock | solid | replaces old art, unbreakable |
| 8 | block_cave.png | cavebg.png | 10 | Cave Background | none (bg) | replaces old art |
| 9 | block_dirt.png (darkened) | dirtbg.png | 11 | Dirt Background | none (bg) | derived |
| 10 | block_rock.png | rock.png | 13 | Rock | solid | NEW |
| 11 | block_sand.png | sand.png | 14 | Sand | solid | NEW |
| 12 | block_lava.png | lava.png | 15 | Lava | solid | NEW, hazard: respawn |
| 13 | block_water.png | water.png | 16 | Water | solid | NEW |
| 14 | block_ice.png | ice.png | 17 | Ice | solid | NEW |
| 15 | block_snow.png | snow.png | 18 | Snow | solid | NEW |
| 16 | block_trunk.png | trunk.png | 19 | Tree Trunk | solid | NEW |
| 17 | block_leaves.png | leaves.png | 20 | Leaves | solid | NEW |
| 18 | block_bush.png | bush.png | 21 | Bush | none (deco) | NEW |
| 19 | block_metal.png | metal.png | 22 | Metal Block | solid | NEW |
| 20 | block_spike.png | spike.png | 23 | Spikes | none | NEW, hazard: respawn |
| 21 | block_platform.png | platform.png | 24 | Stone Platform | solid | NEW |
| 22 | block_wood_platform.png | woodplatform.png | 25 | Wood Platform | solid | NEW |
| 23 | block_deco_red.png | deco_red.png | 26 | Red Deco Block | solid | NEW |
| 24 | block_deco_blue.png | deco_blue.png | 27 | Blue Deco Block | solid | NEW |
| 25 | block_glow.png | glow.png | 28 | Glow Block | solid | NEW, light: true |

Seeds 113–128 added for items 13–28 (treeOf links, standard growth).

## 2. Objects (21) → `client/img/objects/` (aspect-preserved)

| Original file | Game file | Item ID | Name | Collision | Role |
|---|---|---|---|---|---|
| obj_door_wood.png | door.png | 8 | Door | solid | replaces old door art, action: door |
| obj_door_blue.png | door_blue.png | 72 | Blue Door | solid | NEW variant, action: door |
| obj_door_barn.png | door_barn.png | 73 | Barn Door | solid | NEW variant, action: door |
| obj_door_entrance.png | door_entrance.png | — | — | — | sheet-only deco, not placed (arch too wide) |
| obj_sign_hanging.png | sign.png | 9 | Sign | solid | replaces old sign art |
| obj_torch.png | torch.png | 12 | Torch | none | replaces old torch art, light: true |
| obj_lock.png | worldlock.png | 50 | World Lock | solid | replaces old lock art |
| obj_chest.png | chest.png | 60 | Chest | none | NEW deco, placeable |
| obj_crate.png | crate.png | 61 | Crate | none | NEW deco, placeable |
| obj_bed.png | bed.png | 62 | Bed | none | NEW deco, placeable |
| obj_chair.png | chair.png | 63 | Chair | none | NEW deco, placeable |
| obj_table.png | table.png | 64 | Table | none | NEW deco, placeable |
| obj_mailbox.png | mailbox.png | 65 | Mailbox | none | NEW deco, placeable |
| obj_lamp.png | lamp.png | 66 | Lamp | none | NEW deco, placeable, light: true |
| obj_plant_pot_1.png | plant_pot_1.png | 67 | Potted Plant | none | NEW deco, placeable |
| obj_plant_pot_2.png | plant_pot_2.png | 68 | Potted Fern | none | NEW deco, placeable |
| obj_display_stand.png | display_stand.png | 69 | Display Stand | none | NEW deco, placeable |
| obj_storage_box.png | storage_box.png | 70 | Storage Box | none | NEW deco, placeable |
| obj_ladder.png | ladder.png | 71 | Ladder | none | NEW deco, placeable (no climb system) |
| obj_platform.png | obj_platform.png | — | — | — | duplicate of block_platform, not used separately |
| obj_trees.png | trees.png | — | — | — | not used (flora system covers trees) |

## 3. UI Icons (33) → `client/img/ui/` (64×64)

Integrated into live UI:
- `backpack.png` → Backpack button (replaces 🎒 emoji)
- `fist.png` → Punch button (replaces 👊 emoji)
- `wrench.png` → Wrench tool icon (replaces old procedural)

Available for future use (loaded, not yet wired to buttons):
seed, inventory, clothing, gems, gift, consumables, equipment, trash,
shop, trade, buy_sell, hand, pickup, place_block, break_block,
plant_seed, collect, drop, open_door, world_lock, world_settings,
world_info, access_permissions, door_exit, map, navigation,
world_home, player_permissions, owner_admin, world_crown.

## 4. Sprite sheets (5) — reference only

The sheets (`world_blocks.png`, `world_objects.png`, `ui_world_icons.png`,
`ui_action_icons.png`, `ui_inventory_icons.png`) contain the same art as the
78 individual files. Per the no-duplicate rule, the game uses the individual
files; sheets are archived as reference in `assets/ref/asset_pack/`.

## 5. Code changes

- `shared/items.mjs`: +16 blocks (13–28), +16 seeds (113–128), +14 deco
  objects (60–73). `hazard: true` on lava (15) and spikes (23).
- `client/js/assets.mjs`: TILE_FILES extended (25 tiles + 18 object tiles);
  UI_FILES added (33 icons, loaded into `imgs.ui`).
- `client/js/render.mjs`: objects drawn aspect-preserved centered;
  seed draw 20×30.
- `server/game.mjs`: tick checks hazard tiles → respawn at world spawn.
- `client/index.html`: backpack/punch buttons use pack icons.
- `client/css/style.css`: button img sizing.
- `client/img/icons/wrench.png`: replaced with pack art.

## 6. Not integrated (with reasons)

- `obj_door_entrance.png` (stone arch): too wide for 1-tile placement,
  no multi-tile object system. Archived.
- `obj_platform.png`: visual duplicate of `block_platform.png`. Not used.
- `obj_trees.png`: flora growth system already renders trees. Not used.
- UI icons not yet wired to buttons (shop, trade, etc.): no shop/trade
  button UI exists to attach them to; trade uses wrench dialog. Icons are
  loaded and available.

## 7. Tests

- 21/21 automated tests pass.
- All 78 files converted and verified visually (montages).
- In-game screenshot verified: seamless tiles, new blocks render, no errors.
