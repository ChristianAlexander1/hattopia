// Pure logic tests: registry, worldgen, farming math. No I/O beyond sqlite file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_W, WORLD_H, BEDROCK_ROWS, growTimeFor, PUNCH_RANGE, TILE, rollWeatherKind } from '../shared/constants.mjs';
import { ITEMS, itemById, isSeed, spliceResult, STARTER_KIT } from '../shared/items.mjs';
import { generateWorld, idx, inBounds } from '../server/world.mjs';
import { growthStage } from '../server/game.mjs';

test('world dimensions are 100x60 with unbreakable bedrock base', () => {
  assert.equal(WORLD_W, 100);
  assert.equal(WORLD_H, 60);
  const g = generateWorld('TEST');
  assert.equal(g.fg.length, 6000);
  for (let x = 0; x < WORLD_W; x++)
    for (let y = WORLD_H - BEDROCK_ROWS; y < WORLD_H; y++) {
      assert.equal(g.fg[idx(x, y)], 7, `bedrock at ${x},${y}`);
      assert.ok(!isFinite(itemById(7).hardness), 'bedrock unbreakable');
    }
});

test('spawn plaza has solid footing and clear air above', () => {
  const g = generateWorld('TEST');
  const S = 30; // flat terrain surface
  for (let x = 46; x <= 54; x++) {
    if (x === 54) continue; // door column: bedrock + white door
    const s = S;
    assert.equal(g.fg[idx(x, s)], 2, `grass footing at ${x}`);
    assert.equal(g.fg[idx(x, s - 1)], 0, `air above spawn at ${x}`);
    assert.equal(g.fg[idx(x, s - 2)], 0, `air above spawn at ${x}`);
  }
  assert.ok(g.spawn.x > 46 * 32 && g.spawn.x < 55 * 32, 'spawn x near plaza');
  assert.equal(g.spawn.y, S * 32, 'spawn feet on the ground');
});

test('every block has hardness, rarity, and valid collision', () => {
  for (const [id, it] of Object.entries(ITEMS)) {
    if (['block', 'bg', 'lock', 'deco'].includes(it.kind)) {
      assert.ok(it.hardness > 0, `${it.name} hardness`);
      assert.ok(['solid', 'none'].includes(it.collision), `${it.name} collision`);
    }
    if (it.kind === 'seed') {
      assert.ok(itemById(it.treeOf), `${it.name} treeOf valid`);
    }
  }
});

test('splice recipes: known pairs produce hybrids, others fail', () => {
  assert.equal(spliceResult(101, 104), 105); // dirt + wood = brick
  assert.equal(spliceResult(104, 101), 105); // order independent
  assert.equal(spliceResult(102, 103), 106); // grass + stone = glass
  assert.equal(spliceResult(104, 105), 108); // wood + brick = door
  assert.equal(spliceResult(101, 101), null); // same seed
  assert.equal(spliceResult(101, 106), null); // no recipe
});

test('growth stages progress with elapsed time', () => {
  const t0 = Date.now();
  const total = growTimeFor(1) * 1000;
  assert.equal(growthStage(101, t0, t0), 0);
  assert.equal(growthStage(101, t0, t0 + total * 0.5), 1);
  assert.equal(growthStage(101, t0, t0 + total * 0.8), 2);
  assert.equal(growthStage(101, t0, t0 + total + 1), 3);
});

test('grow time scales with rarity', () => {
  assert.ok(growTimeFor(1) < growTimeFor(8));
});

test('starter kit gives blocks, seeds, wrench, fist and a world lock', () => {
  const ids = STARTER_KIT.map((s) => s.id);
  assert.ok(ids.includes(1), 'dirt blocks');
  assert.ok(ids.includes(101), 'dirt seeds');
  assert.ok(ids.includes(80), 'wrench');
  assert.ok(ids.includes(81), 'fist');
  assert.ok(ids.includes(50), 'world lock');
});

test('punch range covers ~5 tiles (long-range punch)', () => {
  assert.ok(PUNCH_RANGE >= 5 * TILE && PUNCH_RANGE < 6 * TILE);
});

test('deco objects: unique ids, assets mapped, seeds linked', () => {
  const ids = [29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42];
  const seen = new Set();
  for (const id of ids) {
    const it = itemById(id);
    assert.ok(it, `item ${id} exists`);
    assert.ok(!seen.has(id), `id ${id} unique`); seen.add(id);
    assert.equal(it.kind, 'deco');
    assert.equal(it.layer, 'fg');
    assert.ok(it.tile && it.tile.startsWith('obj_'), `${it.name} has obj_ tile`);
    assert.ok(it.seed >= 129 && it.seed <= 142, `${it.name} seed in 129-142`);
    const seed = itemById(it.seed);
    assert.ok(seed && seed.treeOf === id, `${it.name} seed links back`);
  }
  // doors teleport, lamp glows, chest is non-solid decorative
  assert.equal(itemById(29).action, 'door');
  assert.equal(itemById(30).action, 'door');
  assert.ok(itemById(37).light, 'lamp has light flag');
  assert.equal(itemById(31).collision, 'none', 'chest walk-through decorative');
  assert.equal(itemById(32).collision, 'solid', 'crate solid');
});

test('furniture splice recipes resolve without collisions', () => {
  const pairs = [
    [104, 127, 129], [104, 126, 130], [104, 122, 131], [119, 101, 132],
    [104, 102, 133], [104, 114, 134], [104, 103, 135], [122, 126, 136],
    [122, 128, 137], [102, 101, 138], [102, 120, 139], [104, 106, 140],
    [103, 122, 141], [104, 119, 142],
  ];
  const results = new Set([105, 106, 108]); // pre-existing recipes
  for (const [a, b, r] of pairs) {
    assert.equal(spliceResult(a, b), r, `splice ${a}+${b} = ${r}`);
    assert.equal(spliceResult(b, a), r, 'order independent');
    assert.ok(!results.has(r), `result ${r} unique`); results.add(r);
  }
});

test('rollWeatherKind covers all 8 presets with the documented distribution', () => {
  const kinds = new Set();
  for (let i = 0; i < 2000; i++) kinds.add(rollWeatherKind());
  assert.deepEqual([...kinds].sort(), ['clear', 'cloudy', 'drizzle', 'fog', 'heavy', 'rain', 'snow', 'storm']);
  // deterministic boundaries match the legacy thresholds
  assert.equal(rollWeatherKind(0), 'clear');
  assert.equal(rollWeatherKind(0.349), 'clear');
  assert.equal(rollWeatherKind(0.35), 'cloudy');
  assert.equal(rollWeatherKind(0.96), 'fog');
  assert.equal(rollWeatherKind(0.999), 'snow');
});

test('inBounds guards world edges', () => {
  assert.ok(inBounds(0, 0) && inBounds(99, 59));
  assert.ok(!inBounds(-1, 0) && !inBounds(100, 0) && !inBounds(0, 60));
});

test('crackStageFor maps damage ratio to progressive stages', async () => {
  const { crackStageFor } = await import('../client/js/render.mjs');
  assert.equal(crackStageFor(0, 8), 0, 'no damage -> no cracks');
  assert.equal(crackStageFor(1, 8), 0, '12% -> stage 0');
  assert.equal(crackStageFor(2, 8), 1, '25% -> stage 1');
  assert.equal(crackStageFor(3, 8), 1, '37% -> stage 1');
  assert.equal(crackStageFor(4, 8), 2, '50% -> stage 2');
  assert.equal(crackStageFor(6, 8), 3, '75% -> stage 3');
  assert.equal(crackStageFor(7, 8), 3, '87% -> stage 3');
  assert.equal(crackStageFor(1, 1), 3, 'single-punch block shows heavy cracks on its only hit');
  assert.equal(crackStageFor(0, 0), 0, 'zero hardness safe');
});

test('new world terrain is completely flat', () => {
  const g = generateWorld('FLATTEST');
  const S = 30;
  const aboveOk = new Set([0, 19, 20, 43, 44, 45, 46]); // air, trunk, leaves, door, flowers
  for (let x = 0; x < WORLD_W; x++) {
    assert.equal(g.fg[idx(x, S)], x === 54 ? 7 : 2, `surface at ${x} (bedrock under door)`);
    for (let y = 0; y < S; y++)
      assert.ok(aboveOk.has(g.fg[idx(x, y)]), `only air/trees/door/flowers above surface at ${x},${y}: got ${g.fg[idx(x, y)]}`);
  }
});

test('white exit door sits on bedrock near spawn', () => {
  const g = generateWorld('DOORTEST');
  const S = 30, dx = 54;
  assert.equal(g.fg[idx(dx, S - 1)], 43, 'white door above surface');
  assert.equal(g.fg[idx(dx, S)], 7, 'bedrock directly beneath door');
  const door = itemById(43);
  assert.equal(door.action, 'exit', 'door has exit action');
  assert.ok(!isFinite(door.hardness), 'door unbreakable');
});

test('trees have trunk + canopy and keep spawn/door clear', () => {
  const g = generateWorld('TREETEST');
  const S = 30;
  for (const tx of [12, 24, 36, 68, 80, 90]) {
    for (const dy of [1, 2, 3]) assert.equal(g.fg[idx(tx, S - dy)], 19, `trunk at ${tx},${S - dy}`);
    assert.equal(g.fg[idx(tx, S - 4)], 20, `leaves above trunk at ${tx}`);
    assert.equal(g.fg[idx(tx - 1, S - 5)], 20, `canopy at ${tx - 1}`);
    assert.equal(g.fg[idx(tx + 1, S - 5)], 20, `canopy at ${tx + 1}`);
  }
  for (let x = 44; x <= 60; x++) {
    const id = g.fg[idx(x, S - 1)];
    assert.ok(id === 0 || id === 43, `clear zone at ${x}: got ${id}`);
  }
});

test('flowers are non-solid deco on grass', () => {
  const g = generateWorld('FLOWERTEST');
  const S = 30;
  let count = 0;
  for (let x = 0; x < WORLD_W; x++) {
    const id = g.fg[idx(x, S - 1)];
    if ([44, 45, 46].includes(id)) {
      count++;
      assert.equal(itemById(id).collision, 'none', `flower ${id} non-solid`);
      assert.equal(g.fg[idx(x, S)], 2, `flower ${id} on grass at ${x}`);
    }
  }
  assert.ok(count >= 5, `flowers scattered (found ${count})`);
});
