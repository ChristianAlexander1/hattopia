// Original item registry (clean-room design, mechanics inspired by research).
// id: stable numeric id. kind: 'block' | 'bg' | 'seed' | 'lock' | 'tool' | 'deco'
// collision: 'solid' | 'none'. layer: 'fg' | 'bg' | 'item' (inventory-only)

export const ITEMS = {
  1:  { name: 'Dirt',          kind: 'block', layer: 'fg', collision: 'solid', hardness: 3,        rarity: 1, seed: 101, tile: 'dirt' },
  2:  { name: 'Grass Block',   kind: 'block', layer: 'fg', collision: 'solid', hardness: 4,        rarity: 2, seed: 102, tile: 'grass' },
  3:  { name: 'Stone',         kind: 'block', layer: 'fg', collision: 'solid', hardness: 7,        rarity: 3, seed: 103, tile: 'stone' },
  4:  { name: 'Wood Planks',   kind: 'block', layer: 'fg', collision: 'solid', hardness: 5,        rarity: 4, seed: 104, tile: 'wood' },
  5:  { name: 'Brick',         kind: 'block', layer: 'fg', collision: 'solid', hardness: 9,        rarity: 6, seed: 105, tile: 'brick' },
  6:  { name: 'Glass Pane',    kind: 'block', layer: 'fg', collision: 'solid', hardness: 2,        rarity: 5, seed: 106, tile: 'glass', transparent: true },
  7:  { name: 'Bedrock',       kind: 'block', layer: 'fg', collision: 'solid', hardness: Infinity, rarity: 99, seed: null, tile: 'bedrock' },
  8:  { name: 'Door',          kind: 'block', layer: 'fg', collision: 'solid', hardness: 6,        rarity: 8, seed: 108, tile: 'obj_door', action: 'door' },
  9:  { name: 'Sign',          kind: 'block', layer: 'fg', collision: 'solid', hardness: 4,        rarity: 3, seed: null, tile: 'obj_sign' },
  10: { name: 'Cave Background', kind: 'bg', layer: 'bg', collision: 'none', hardness: 3,         rarity: 2, seed: null, tile: 'cavebg' },
  11: { name: 'Dirt Background', kind: 'bg', layer: 'bg', collision: 'none', hardness: 2,         rarity: 1, seed: null, tile: 'dirtbg' },
  12: { name: 'Torch',         kind: 'block', layer: 'fg', collision: 'none',  hardness: 1,        rarity: 4, seed: null, tile: 'obj_torch', light: true },

  // New blocks from asset pack (2026-10-14)
  13: { name: 'Rock',          kind: 'block', layer: 'fg', collision: 'solid', hardness: 8,        rarity: 4, seed: 113, tile: 'rock' },
  14: { name: 'Sand',          kind: 'block', layer: 'fg', collision: 'solid', hardness: 2,        rarity: 2, seed: 114, tile: 'sand' },
  15: { name: 'Lava',          kind: 'block', layer: 'fg', collision: 'solid', hardness: 10,       rarity: 15, seed: 115, tile: 'lava', hazard: true },
  16: { name: 'Water',         kind: 'block', layer: 'fg', collision: 'solid', hardness: 1,        rarity: 2, seed: 116, tile: 'water' },
  17: { name: 'Ice',           kind: 'block', layer: 'fg', collision: 'solid', hardness: 3,        rarity: 3, seed: 117, tile: 'ice' },
  18: { name: 'Snow',          kind: 'block', layer: 'fg', collision: 'solid', hardness: 2,        rarity: 2, seed: 118, tile: 'snow' },
  19: { name: 'Tree Trunk',    kind: 'block', layer: 'fg', collision: 'solid', hardness: 5,        rarity: 4, seed: 119, tile: 'trunk' },
  20: { name: 'Leaves',        kind: 'block', layer: 'fg', collision: 'solid', hardness: 2,        rarity: 3, seed: 120, tile: 'leaves' },
  21: { name: 'Bush',          kind: 'block', layer: 'fg', collision: 'none',  hardness: 1,        rarity: 2, seed: 121, tile: 'bush' },
  22: { name: 'Metal Block',   kind: 'block', layer: 'fg', collision: 'solid', hardness: 12,       rarity: 8, seed: 122, tile: 'metal' },
  23: { name: 'Spikes',        kind: 'block', layer: 'fg', collision: 'none',  hardness: 6,        rarity: 10, seed: 123, tile: 'spike', hazard: true },
  24: { name: 'Stone Platform',kind: 'block', layer: 'fg', collision: 'solid', hardness: 4,        rarity: 4, seed: 124, tile: 'platform' },
  25: { name: 'Wood Platform', kind: 'block', layer: 'fg', collision: 'solid', hardness: 4,        rarity: 4, seed: 125, tile: 'woodplatform' },
  26: { name: 'Red Deco Block',kind: 'block', layer: 'fg', collision: 'solid', hardness: 5,        rarity: 5, seed: 126, tile: 'deco_red' },
  27: { name: 'Blue Deco Block',kind: 'block', layer: 'fg', collision: 'solid', hardness: 5,       rarity: 5, seed: 127, tile: 'deco_blue' },
  28: { name: 'Glow Block',    kind: 'block', layer: 'fg', collision: 'solid', hardness: 6,        rarity: 10, seed: 128, tile: 'glow', light: true },

  // Locks
  50: { name: 'World Lock',    kind: 'lock',  layer: 'fg', collision: 'solid', hardness: 10,       rarity: 20, seed: null, tile: 'obj_worldlock' },

  // Decorative objects from asset pack (2026-10-14, integrated 2026-10-15).
  // kind 'deco': placeable furniture/doors. Doors teleport like the wooden door.
  // Chest/storage are decorative until container storage is implemented.
  // Ladder is decorative (no climbing mechanic).
  29: { name: 'Blue Door',     kind: 'deco', layer: 'fg', collision: 'solid', hardness: 6,        rarity: 8, seed: 129, tile: 'obj_door_blue', action: 'door' },
  30: { name: 'Barn Door',     kind: 'deco', layer: 'fg', collision: 'solid', hardness: 6,        rarity: 8, seed: 130, tile: 'obj_door_barn', action: 'door' },
  31: { name: 'Chest',         kind: 'deco', layer: 'fg', collision: 'none',  hardness: 4,        rarity: 10, seed: 131, tile: 'obj_chest' },
  32: { name: 'Crate',         kind: 'deco', layer: 'fg', collision: 'solid', hardness: 4,        rarity: 4, seed: 132, tile: 'obj_crate' },
  33: { name: 'Bed',           kind: 'deco', layer: 'fg', collision: 'none',  hardness: 4,        rarity: 5, seed: 133, tile: 'obj_chair' }, // note: bed.png/chair.png art is swapped; this maps to the bed visual
  34: { name: 'Chair',         kind: 'deco', layer: 'fg', collision: 'none',  hardness: 3,        rarity: 4, seed: 134, tile: 'obj_bed' }, // maps to the chair visual
  35: { name: 'Table',         kind: 'deco', layer: 'fg', collision: 'none',  hardness: 5,        rarity: 5, seed: 135, tile: 'obj_table' },
  36: { name: 'Mailbox',       kind: 'deco', layer: 'fg', collision: 'none',  hardness: 4,        rarity: 6, seed: 136, tile: 'obj_mailbox' },
  37: { name: 'Lamp',          kind: 'deco', layer: 'fg', collision: 'none',  hardness: 3,        rarity: 7, seed: 137, tile: 'obj_lamp', light: true },
  38: { name: 'Potted Plant',  kind: 'deco', layer: 'fg', collision: 'none',  hardness: 2,        rarity: 3, seed: 138, tile: 'obj_plant1' },
  39: { name: 'Potted Fern',   kind: 'deco', layer: 'fg', collision: 'none',  hardness: 2,        rarity: 3, seed: 139, tile: 'obj_plant2' },
  40: { name: 'Display Stand', kind: 'deco', layer: 'fg', collision: 'none',  hardness: 4,        rarity: 6, seed: 140, tile: 'obj_display' },
  41: { name: 'Storage Box',   kind: 'deco', layer: 'fg', collision: 'none',  hardness: 4,        rarity: 6, seed: 141, tile: 'obj_storage' },
  42: { name: 'Ladder',        kind: 'deco', layer: 'fg', collision: 'none',  hardness: 3,        rarity: 4, seed: 142, tile: 'obj_ladder' },

  // Tools (inventory-only)
  80: { name: 'Wrench',        kind: 'tool',  layer: 'item', collision: 'none', rarity: 1, undroppable: true },
  81: { name: 'Fist',          kind: 'tool',  layer: 'item', collision: 'none', rarity: 0, undroppable: true },

  // Seeds (plantable; treeOf = block id grown)
  101: { name: 'Dirt Seed',  kind: 'seed', layer: 'item', treeOf: 1, rarity: 1, seedTile: 'seed' },
  102: { name: 'Grass Seed', kind: 'seed', layer: 'item', treeOf: 2, rarity: 2, seedTile: 'seed' },
  103: { name: 'Stone Seed', kind: 'seed', layer: 'item', treeOf: 3, rarity: 3, seedTile: 'seed' },
  104: { name: 'Wood Seed',  kind: 'seed', layer: 'item', treeOf: 4, rarity: 4, seedTile: 'seed' },
  105: { name: 'Brick Seed', kind: 'seed', layer: 'item', treeOf: 5, rarity: 6, seedTile: 'seed' },
  106: { name: 'Glass Seed', kind: 'seed', layer: 'item', treeOf: 6, rarity: 5, seedTile: 'seed' },
  108: { name: 'Door Seed',  kind: 'seed', layer: 'item', treeOf: 8, rarity: 8, seedTile: 'seed' },
  113: { name: 'Rock Seed',  kind: 'seed', layer: 'item', treeOf: 13, rarity: 4, seedTile: 'seed' },
  114: { name: 'Sand Seed',  kind: 'seed', layer: 'item', treeOf: 14, rarity: 2, seedTile: 'seed' },
  115: { name: 'Lava Seed',  kind: 'seed', layer: 'item', treeOf: 15, rarity: 15, seedTile: 'seed' },
  116: { name: 'Water Seed', kind: 'seed', layer: 'item', treeOf: 16, rarity: 2, seedTile: 'seed' },
  117: { name: 'Ice Seed',   kind: 'seed', layer: 'item', treeOf: 17, rarity: 3, seedTile: 'seed' },
  118: { name: 'Snow Seed',  kind: 'seed', layer: 'item', treeOf: 18, rarity: 2, seedTile: 'seed' },
  119: { name: 'Trunk Seed', kind: 'seed', layer: 'item', treeOf: 19, rarity: 4, seedTile: 'seed' },
  120: { name: 'Leaves Seed',kind: 'seed', layer: 'item', treeOf: 20, rarity: 3, seedTile: 'seed' },
  121: { name: 'Bush Seed',  kind: 'seed', layer: 'item', treeOf: 21, rarity: 2, seedTile: 'seed' },
  122: { name: 'Metal Seed', kind: 'seed', layer: 'item', treeOf: 22, rarity: 8, seedTile: 'seed' },
  123: { name: 'Spike Seed', kind: 'seed', layer: 'item', treeOf: 23, rarity: 10, seedTile: 'seed' },
  124: { name: 'Platform Seed', kind: 'seed', layer: 'item', treeOf: 24, rarity: 4, seedTile: 'seed' },
  125: { name: 'WoodPlat Seed', kind: 'seed', layer: 'item', treeOf: 25, rarity: 4, seedTile: 'seed' },
  126: { name: 'Red Deco Seed', kind: 'seed', layer: 'item', treeOf: 26, rarity: 5, seedTile: 'seed' },
  127: { name: 'Blue Deco Seed', kind: 'seed', layer: 'item', treeOf: 27, rarity: 5, seedTile: 'seed' },
  128: { name: 'Glow Seed',  kind: 'seed', layer: 'item', treeOf: 28, rarity: 10, seedTile: 'seed' },
  // Furniture seeds (spliced; treeOf = deco object id)
  129: { name: 'Blue Door Seed',  kind: 'seed', layer: 'item', treeOf: 29, rarity: 8, seedTile: 'seed' },
  130: { name: 'Barn Door Seed',  kind: 'seed', layer: 'item', treeOf: 30, rarity: 8, seedTile: 'seed' },
  131: { name: 'Chest Seed',      kind: 'seed', layer: 'item', treeOf: 31, rarity: 10, seedTile: 'seed' },
  132: { name: 'Crate Seed',      kind: 'seed', layer: 'item', treeOf: 32, rarity: 4, seedTile: 'seed' },
  133: { name: 'Bed Seed',        kind: 'seed', layer: 'item', treeOf: 33, rarity: 5, seedTile: 'seed' },
  134: { name: 'Chair Seed',      kind: 'seed', layer: 'item', treeOf: 34, rarity: 4, seedTile: 'seed' },
  135: { name: 'Table Seed',      kind: 'seed', layer: 'item', treeOf: 35, rarity: 5, seedTile: 'seed' },
  136: { name: 'Mailbox Seed',    kind: 'seed', layer: 'item', treeOf: 36, rarity: 6, seedTile: 'seed' },
  137: { name: 'Lamp Seed',       kind: 'seed', layer: 'item', treeOf: 37, rarity: 7, seedTile: 'seed' },
  138: { name: 'Plant Seed',      kind: 'seed', layer: 'item', treeOf: 38, rarity: 3, seedTile: 'seed' },
  139: { name: 'Fern Seed',       kind: 'seed', layer: 'item', treeOf: 39, rarity: 3, seedTile: 'seed' },
  140: { name: 'Display Seed',    kind: 'seed', layer: 'item', treeOf: 40, rarity: 6, seedTile: 'seed' },
  141: { name: 'Storage Seed',    kind: 'seed', layer: 'item', treeOf: 41, rarity: 6, seedTile: 'seed' },
  142: { name: 'Ladder Seed',     kind: 'seed', layer: 'item', treeOf: 42, rarity: 4, seedTile: 'seed' },
};

export const itemById = (id) => ITEMS[id] || null;
export const isSeed = (id) => ITEMS[id]?.kind === 'seed';
export const isBlock = (id) => ['block', 'bg', 'lock', 'deco'].includes(ITEMS[id]?.kind);

// Splice recipes: sorted [seedA, seedB] -> resulting seed id. Whimsical pairings,
// in the spirit of the researched splicing system (original recipes).
const spliceKey = (a, b) => (a < b ? `${a}+${b}` : `${b}+${a}`);
export const SPLICE_RECIPES = {
  [spliceKey(101, 104)]: 105, // Dirt Seed + Wood Seed = Brick Seed
  [spliceKey(102, 103)]: 106, // Grass Seed + Stone Seed = Glass Seed
  [spliceKey(104, 105)]: 108, // Wood Seed + Brick Seed = Door Seed
  // Furniture recipes (2026-10-15): splice to grow decorative objects
  [spliceKey(104, 127)]: 129, // Wood + Blue Deco = Blue Door
  [spliceKey(104, 126)]: 130, // Wood + Red Deco = Barn Door
  [spliceKey(104, 122)]: 131, // Wood + Metal = Chest
  [spliceKey(119, 101)]: 132, // Trunk + Dirt = Crate
  [spliceKey(104, 102)]: 133, // Wood + Grass = Bed
  [spliceKey(104, 114)]: 134, // Wood + Sand = Chair
  [spliceKey(104, 103)]: 135, // Wood + Stone = Table
  [spliceKey(122, 126)]: 136, // Metal + Red Deco = Mailbox
  [spliceKey(122, 128)]: 137, // Metal + Glow = Lamp
  [spliceKey(102, 101)]: 138, // Grass + Dirt = Potted Plant
  [spliceKey(102, 120)]: 139, // Grass + Leaves = Potted Fern
  [spliceKey(104, 106)]: 140, // Wood + Glass = Display Stand
  [spliceKey(103, 122)]: 141, // Stone + Metal = Storage Box
  [spliceKey(104, 119)]: 142, // Wood + Trunk = Ladder
};
export const spliceResult = (seedA, seedB) => {
  if (seedA === seedB) return null;
  return SPLICE_RECIPES[spliceKey(seedA, seedB)] || null;
};

// Starter kit for new players
export const STARTER_KIT = [
  { id: 81, count: 1 },   // Fist (punch) — slot 1
  { id: 80, count: 1 },   // Wrench — slot 2
  { id: 1, count: 20 },   // Dirt x20
  { id: 101, count: 5 },  // Dirt Seed x5
  { id: 102, count: 3 },  // Grass Seed x3
  { id: 50, count: 1 },   // World Lock (so ownership can be tried)
];
