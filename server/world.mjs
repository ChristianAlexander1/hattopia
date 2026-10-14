// World generation + serialization. Tile arrays are Uint16Array(WORLD_W*WORLD_H).
import { TILE, WORLD_W, WORLD_H, BEDROCK_ROWS } from '../shared/constants.mjs';

export const idx = (x, y) => y * WORLD_W + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;

// Item ids (must match shared/items.mjs)
const DIRT = 1, GRASS = 2, STONE = 3, BEDROCK = 7, CAVE_BG = 10, DIRT_BG = 11;
const TRUNK = 19, LEAVES = 20, WHITE_DOOR = 43;
const FLOWERS = [44, 45, 46]; // red, yellow, white

// New-world layout constants (shared with tests via export)
export const GEN = {
  surfaceY: 30,      // flat grass surface row
  spawnX: 50,        // spawn tile x
  doorX: 54,         // white door tile x (on surface, bedrock beneath)
  clearX0: 44, clearX1: 60, // keep-clear zone: no trees/flowers
  treeXs: [12, 24, 36, 68, 80, 90],
};

function hash(x) { // deterministic pseudo-random in [0,1)
  let h = (x * 374761393 + 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function generateWorld(name) {
  const fg = new Uint16Array(WORLD_W * WORLD_H);
  const bg = new Uint16Array(WORLD_W * WORLD_H);
  const S = GEN.surfaceY;
  for (let x = 0; x < WORLD_W; x++) {
    for (let y = 0; y < WORLD_H; y++) {
      const i = idx(x, y);
      if (y >= WORLD_H - BEDROCK_ROWS) { fg[i] = BEDROCK; continue; }
      if (y < S) continue;
      if (y === S) fg[i] = GRASS;
      else if (y <= S + 4) fg[i] = DIRT;
      else fg[i] = hash(x * 3 + y * 5) < 0.7 ? STONE : DIRT;
      if (y > S + 1) bg[i] = hash(x + y * 11) < 0.6 ? CAVE_BG : DIRT_BG;
    }
  }
  // Trees: trunk (3 high) + leaf canopy, clear of spawn/door zone
  for (const tx of GEN.treeXs) {
    if (tx >= GEN.clearX0 && tx <= GEN.clearX1) continue;
    fg[idx(tx, S - 1)] = TRUNK;
    fg[idx(tx, S - 2)] = TRUNK;
    fg[idx(tx, S - 3)] = TRUNK;
    for (const [lx, ly] of [[-1, -4], [0, -4], [1, -4], [-1, -5], [0, -5], [1, -5], [0, -6]])
      fg[idx(tx + lx, S + ly)] = LEAVES;
  }
  // Flowers: scattered on the grass, clear of spawn/door zone
  let placed = 0;
  for (let x = 2; x < WORLD_W - 2 && placed < 14; x++) {
    if (x >= GEN.clearX0 && x <= GEN.clearX1) continue;
    const h = hash(x * 13 + 7);
    if (h < 0.55) continue; // natural spacing
    // skip if a tree trunk is here
    if (fg[idx(x, S - 1)] !== 0) continue;
    fg[idx(x, S - 1)] = FLOWERS[Math.floor(h * 97) % FLOWERS.length];
    placed++;
  }
  // White exit door on the surface with bedrock directly beneath
  const dx = GEN.doorX;
  fg[idx(dx, S)] = BEDROCK;      // replaces grass under the door
  fg[idx(dx, S - 1)] = WHITE_DOOR;
  const sx = GEN.spawnX;
  return { fg, bg, spawn: { x: sx * TILE + TILE / 2, y: S * TILE } };
}

export function serializeWorld(w) {
  return {
    name: w.name,
    fg: Buffer.from(w.fg.buffer),
    bg: Buffer.from(w.bg.buffer),
    seedsJson: JSON.stringify([...w.seeds.entries()].map(([i, s]) => ({ i, ...s }))),
    signsJson: JSON.stringify([...(w.signs || [])]),
    lockJson: w.lock ? JSON.stringify(w.lock) : null,
    weatherJson: JSON.stringify(w.weather),
    spawnJson: JSON.stringify(w.spawn),
    created_at: w.created_at,
  };
}

export function deserializeWorld(row) {
  const fg = new Uint16Array(row.fg.buffer, row.fg.byteOffset, row.fg.length / 2);
  const bg = new Uint16Array(row.bg.buffer, row.bg.byteOffset, row.bg.length / 2);
  const seeds = new Map();
  for (const s of JSON.parse(row.seeds)) seeds.set(s.i, { seed: s.seed, plantedAt: s.plantedAt });
  const signs = new Map();
  try { for (const [i, text] of JSON.parse(row.signs || '[]')) signs.set(i, text); } catch { /* legacy row */ }
  return {
    name: row.name,
    fg: new Uint16Array(fg), bg: new Uint16Array(bg),
    seeds, signs,
    lock: row.lock ? JSON.parse(row.lock) : null,
    weather: JSON.parse(row.weather || '{}'),
    spawn: row.spawn ? JSON.parse(row.spawn) : null,
    created_at: row.created_at,
  };
}
