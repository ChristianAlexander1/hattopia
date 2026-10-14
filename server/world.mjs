// World generation + serialization. Tile arrays are Uint16Array(WORLD_W*WORLD_H).
import { TILE, WORLD_W, WORLD_H, BEDROCK_ROWS } from '../shared/constants.mjs';

export const idx = (x, y) => y * WORLD_W + x;
export const inBounds = (x, y) => x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;

// Item ids (must match shared/items.mjs)
const DIRT = 1, GRASS = 2, STONE = 3, BEDROCK = 7, CAVE_BG = 10, DIRT_BG = 11;

function hash(x) { // deterministic pseudo-random per column
  let h = (x * 374761393 + 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export function generateWorld(name) {
  const fg = new Uint16Array(WORLD_W * WORLD_H);
  const bg = new Uint16Array(WORLD_W * WORLD_H);
  const base = 30;
  for (let x = 0; x < WORLD_W; x++) {
    const hill = Math.round(Math.sin(x * 0.18) * 2 + Math.sin(x * 0.05 + 1.7) * 3);
    const surface = base + hill;
    for (let y = 0; y < WORLD_H; y++) {
      const i = idx(x, y);
      if (y >= WORLD_H - BEDROCK_ROWS) { fg[i] = BEDROCK; continue; }
      if (y < surface) continue;
      if (y === surface) fg[i] = GRASS;
      else if (y < surface + 6) fg[i] = hash(x * 7 + y) < 0.12 ? STONE : DIRT;
      else fg[i] = hash(x * 3 + y * 5) < 0.75 ? STONE : DIRT;
      // background layer underground
      if (y > surface + 1) bg[i] = hash(x + y * 11) < 0.6 ? CAVE_BG : DIRT_BG;
    }
  }
  // Flattened spawn plaza near x=50: solid ground with an air pocket above
  const sx = 50;
  const surfaceAt = (x) => base + Math.round(Math.sin(x * 0.18) * 2 + Math.sin(x * 0.05 + 1.7) * 3);
  for (let x = sx - 4; x <= sx + 4; x++) {
    const surface = surfaceAt(x);
    for (let y = surface - 4; y < surface; y++) fg[idx(x, y)] = 0;
    fg[idx(x, surface)] = GRASS; // guaranteed footing
  }
  const spawnSurface = surfaceAt(sx);
  return { fg, bg, spawn: { x: sx * TILE + TILE / 2, y: spawnSurface * TILE } };
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
