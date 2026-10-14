// VFX unit tests: water animation sequencing, surface splash classification,
// spawn positions, and splash cleanup. Runs in node (VFX class is DOM-free).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VFX, vfxImgs } from '../client/js/vfx.mjs';
import { WORLD_W, WORLD_H } from '../shared/constants.mjs';

function fakeWorld() {
  const fg = new Uint16Array(WORLD_W * WORLD_H);
  // ground row at y=40, water pool at x=10..12
  for (let x = 0; x < WORLD_W; x++) fg[40 * WORLD_W + x] = 2; // grass
  for (let x = 10; x <= 12; x++) fg[40 * WORLD_W + x] = 16; // water
  return { fg };
}

test('waterFrame cycles through loaded frames on a global clock', () => {
  vfxImgs.water.length = 0;
  const v = new VFX();
  assert.equal(v.waterFrame(1), null, 'null before frames load');
  vfxImgs.water.push('f0', 'f1', 'f2', 'f3');
  assert.equal(v.waterFrame(0), 'f0');
  assert.equal(v.waterFrame(0.5), 'f0');
  assert.equal(v.waterFrame(0.55), 'f1');
  assert.equal(v.waterFrame(1.1), 'f2');
  assert.equal(v.waterFrame(1.7), 'f3');
  assert.equal(v.waterFrame(2.3), 'f0', 'wraps around');
  assert.equal(v.waterFrame(100.0), v.waterFrame(100.0 + 2.2), 'periodic (global sync)');
  vfxImgs.water.length = 0;
});

test('spawnSurfaceSplash: ground splash at the visible surface', () => {
  const v = new VFX();
  const world = fakeWorld();
  const w = 1400, h = 900, scale = 1;
  const camX = 50 * 32, camY = 35 * 32; // looking at ground row 40
  // drop at screen x of tile 50
  const sx = w / 2;
  v.spawnSurfaceSplash(sx, w, h, camX, camY, scale, world);
  assert.equal(v.splashPool.length, 1, 'one splash spawned');
  const s = v.splashPool[0];
  assert.equal(s.kind, 'ground');
  // expected screen pos of tile (50,40) top: tile center x, tile top y
  assert.ok(Math.abs(s.x - (w / 2 + 16)) < 1, `x at tile center, got ${s.x}`);
  assert.ok(Math.abs(s.y - (h / 2 + (40 * 32 - camY))) < 1, `y at surface, got ${s.y}`);
});

test('spawnSurfaceSplash: ripple on water tiles', () => {
  const v = new VFX();
  const world = fakeWorld();
  const w = 1400, h = 900, scale = 1;
  const camX = 11 * 32, camY = 35 * 32;
  v.spawnSurfaceSplash(w / 2, w, h, camX, camY, scale, world);
  assert.equal(v.splashPool.length, 1);
  assert.equal(v.splashPool[0].kind, 'ripple', 'water surface -> ripple');
});

test('spawnSurfaceSplash: no splash when the column has no surface', () => {
  const v = new VFX();
  const fg = new Uint16Array(WORLD_W * WORLD_H); // empty world
  const w = 1400, h = 900;
  v.spawnSurfaceSplash(w / 2, w, h, 50 * 32, 20 * 32, 1, { fg });
  assert.equal(v.splashPool.length, 0, 'no surface, no splash');
});

test('spawnSurfaceSplash: ignores out-of-range columns and missing world', () => {
  const v = new VFX();
  v.spawnSurfaceSplash(-5000, 1400, 900, 50 * 32, 35 * 32, 1, fakeWorld());
  v.spawnSurfaceSplash(700, 1400, 900, 50 * 32, 35 * 32, 1, null);
  v.spawnSurfaceSplash(700, 1400, 900, 50 * 32, 35 * 32, 0, fakeWorld());
  assert.equal(v.splashPool.length, 0);
});

test('splashes expire and are removed safely', () => {
  const v = new VFX();
  vfxImgs.splashes.ground.push('g0', 'g1');
  v.splashPool.push({ x: 1, y: 2, t: 0, kind: 'ground' });
  // advance past the 2-frame sequence at 14fps
  v.update(1, 1400, 900, 0, 0, null);
  assert.equal(v.splashPool.length, 0, 'expired splash removed');
  vfxImgs.splashes.ground.length = 0;
});

test('punch clouds: spawn, drift toward facing, fade and cleanup', () => {
  const v = new VFX();
  v.spawnPunchCloud(100, 200, 1);
  v.spawnPunchCloud(100, 200, -1);
  assert.equal(v.punchClouds.length, 2, 'two clouds spawned');
  const [r, l] = v.punchClouds;
  assert.ok(r.vx > 0 && l.vx < 0, 'drift follows facing direction');
  const x0 = r.x;
  v.updatePunchClouds(0.1);
  assert.ok(r.x > x0, 'cloud moves right over time');
  assert.ok(r.t > 0, 'age advances with dt');
  // expire: life ~0.42-0.5s
  v.updatePunchClouds(1.0);
  assert.equal(v.punchClouds.length, 0, 'expired clouds removed, no accumulation');
});

test('punch clouds: pool capped at 40, oldest recycled', () => {
  const v = new VFX();
  for (let i = 0; i < 60; i++) v.spawnPunchCloud(i, i, 1);
  assert.equal(v.punchClouds.length, 40, 'pool never exceeds 40');
});

test('punch cloud render: frame sequence and alpha fade (no darkening)', () => {
  const v = new VFX();
  vfxImgs.punch.length = 0;
  vfxImgs.punch.push('f0', 'f1', 'f2', 'f3', 'f4');
  v.spawnPunchCloud(100, 200, 1);
  const drawn = [];
  const ctx = {
    set globalAlpha(a) { drawn.push(a); },
    get globalAlpha() { return 1; },
    drawImage() {}, save() {}, restore() {}, translate() {}, scale() {},
  };
  v.renderPunchClouds(ctx);
  assert.ok(drawn[0] === 1, 'full opacity at spawn');
  // age past the impact phase -> fading
  v.punchClouds[0].t = v.punchClouds[0].life * 0.8;
  drawn.length = 0;
  v.renderPunchClouds(ctx);
  assert.ok(drawn[0] > 0 && drawn[0] < 1, 'smooth alpha fade, never dark fill');
  vfxImgs.punch.length = 0;
});
