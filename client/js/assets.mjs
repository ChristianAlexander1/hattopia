// Asset loading + item icon mapping. All art is original, generated for this game.
import { itemById } from '../../shared/items.mjs';

const TILE_FILES = {
  dirt: 'tiles/dirt.png', grass: 'tiles/grass.png', stone: 'tiles/stone.png',
  wood: 'tiles/wood.png', brick: 'tiles/brick.png', glass: 'tiles/glass.png',
  bedrock: 'tiles/bedrock.png',
  cavebg: 'tiles/cavebg.png', dirtbg: 'tiles/dirtbg.png',
  rock: 'tiles/rock.png', sand: 'tiles/sand.png', lava: 'tiles/lava.png',
  water: 'tiles/water.png', ice: 'tiles/ice.png', snow: 'tiles/snow.png',
  trunk: 'tiles/trunk.png', leaves: 'tiles/leaves.png', bush: 'tiles/bush.png',
  metal: 'tiles/metal.png', spike: 'tiles/spike.png', platform: 'tiles/platform.png',
  woodplatform: 'tiles/woodplatform.png', deco_red: 'tiles/deco_red.png',
  deco_blue: 'tiles/deco_blue.png', glow: 'tiles/glow.png',
  // objects (from asset pack)
  obj_door: 'objects/door.png', obj_door_blue: 'objects/door_blue.png',
  obj_door_barn: 'objects/door_barn.png', obj_sign: 'objects/sign.png',
  obj_torch: 'objects/torch.png', obj_worldlock: 'objects/worldlock.png',
  obj_chest: 'objects/chest.png', obj_crate: 'objects/crate.png',
  obj_bed: 'objects/bed.png', obj_chair: 'objects/chair.png',
  obj_table: 'objects/table.png', obj_mailbox: 'objects/mailbox.png',
  obj_lamp: 'objects/lamp.png', obj_plant1: 'objects/plant_pot_1.png',
  obj_plant2: 'objects/plant_pot_2.png', obj_display: 'objects/display_stand.png',
  obj_storage: 'objects/storage_box.png', obj_ladder: 'objects/ladder.png',
};
const FLORA_FILES = { seed: 'flora/seed.png', sapling: 'flora/sapling.png', tree_young: 'flora/tree_young.png', tree_mature: 'flora/tree_mature.png' };
// Only icons actually referenced by the UI are preloaded (the rest stay on
// disk for future features; see docs/ASSET_REGISTRY.md).
const UI_FILES = {
  backpack: 'ui/backpack.png', fist: 'ui/fist.png',
};

export const imgs = { tiles: {}, flora: {}, player: {}, ui: {}, wrench: null, gem: null, backdrop: null };

const PLAYER_FRAMES = [];
for (const n of ['idle_0', 'idle_1', 'idle_2', 'idle_3', 'idle_4',
  'runR_0', 'runR_1', 'runR_2', 'runR_3', 'runR_4', 'runR_5', 'runR_6',
  'runL_0', 'runL_1', 'runL_2', 'runL_3', 'runL_4', 'runL_5',
  'jump_0', 'jump_1', 'jump_2', 'jump_3', 'jump_4', 'jump_5', 'jump_6',
  'fall_0', 'fall_1', 'fall_2', 'fall_3', 'fall_4',
  'punch_0', 'punch_1', 'punch_2', 'punch_3', 'punch_4']) PLAYER_FRAMES.push(n);

function load(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

export async function loadAssets() {
  const jobs = [];
  for (const [k, f] of Object.entries(TILE_FILES))
    jobs.push(load('img/' + f).then((im) => { imgs.tiles[k] = im; }));
  for (const [k, f] of Object.entries(FLORA_FILES))
    jobs.push(load('img/' + f).then((im) => { imgs.flora[k] = im; }));
  for (const [k, f] of Object.entries(UI_FILES))
    jobs.push(load('img/' + f).then((im) => { imgs.ui[k] = im; }));
  for (const n of PLAYER_FRAMES)
    jobs.push(load('img/player/' + n + '.png').then((im) => { imgs.player[n] = im; }));
  jobs.push(load('img/icons/wrench.png').then((im) => { imgs.wrench = im; }));
  jobs.push(load('img/icons/gem.png').then((im) => { imgs.gem = im; }));
  jobs.push(load('img/backdrop.png').then((im) => { imgs.backdrop = im; }));
  await Promise.all(jobs);
}

// URL (string) for an inventory icon of an item id. Used by <img> tags.
export function itemIcon(id) {
  const it = itemById(id);
  if (!it) return '';
  if (id === 80) return 'img/icons/wrench.png';
  if (id === 81) return 'img/ui/fist.png';
  if (it.kind === 'seed') return 'img/flora/seed.png';
  if (it.tile && TILE_FILES[it.tile]) return 'img/' + TILE_FILES[it.tile];
  return 'img/tiles/dirt.png';
}

// Canvas image for a foreground/background tile id.
export function tileImage(id) {
  const it = itemById(id);
  if (!it || !it.tile) return null;
  return imgs.tiles[it.tile] || null;
}

export function itemDesc(id) {
  const it = itemById(id);
  if (!it) return '';
  const parts = [];
  parts.push({ block: 'Block', bg: 'Background', seed: 'Seed', lock: 'Lock', tool: 'Tool', deco: 'Decor' }[it.kind] || it.kind);
  if (it.rarity) parts.push(`Rarity ${it.rarity}`);
  if (it.kind === 'seed') {
    const tree = itemById(it.treeOf);
    parts.push(`Grows a ${tree ? tree.name : 'tree'}`);
  }
  if (it.kind === 'lock') parts.push('Place to claim a world');
  if (it.action === 'door') parts.push('Punch to travel to spawn (visitors); owners punch to break');
  if (it.kind === 'deco' && !it.action) parts.push('Decorative');
  if (id === 80) parts.push('Tap a player to see their info, trade, or manage access');
  if (id === 81) parts.push('Punch blocks from a distance');
  return parts.join(' · ');
}
