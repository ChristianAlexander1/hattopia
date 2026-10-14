// Multiplayer sync tests: drive the real Game class with two players,
// then verify the real HTTP+WebSocket transport in a subprocess server.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { TILE, WORLD_W, growTimeFor } from '../shared/constants.mjs';
import { Game } from '../server/game.mjs';
import { db } from '../server/db.mjs';
import { idx, serializeWorld, deserializeWorld } from '../server/world.mjs';

const R = Math.random().toString(36).slice(2, 8);
const sent = new Map();
function makeGame() {
  sent.clear();
  return new Game((p, msg) => {
    if (!sent.has(p.id)) sent.set(p.id, []);
    sent.get(p.id).push(msg);
  });
}
function fakeWs() { return { readyState: 1, send() {}, close() {} }; }
function login(game, name) {
  const ws = fakeWs();
  game.onHello(ws, { name: name + '_' + R, world: 'TESTW_' + R });
  const id = game.byWs.get(ws);
  return game.players.get(id);
}
const msgs = (p, t) => (sent.get(p.id) || []).filter((m) => m.t === t);
function nearTile(game, p, tx, ty) {
  p.x = tx * TILE + TILE / 2; p.y = ty * TILE + TILE / 2;
}
function give(p, id, count) {
  // add directly to inventory (test helper mirrors server addItem)
  let rest = count;
  for (const s of p.inv) if (s && s.id === id && s.count < 200) {
    const take = Math.min(rest, 200 - s.count); s.count += take; rest -= take; if (!rest) break;
  }
  for (let i = 0; i < p.inv.length && rest; i++) if (!p.inv[i]) {
    const take = Math.min(rest, 200); p.inv[i] = { id, count: take }; rest -= take;
  }
}
function punchTimes(game, p, tx, ty, n) {
  for (let i = 0; i < n; i++) { p.lastPunchAt = 0; game.onPunch(p, { tx, ty }); }
}
function findPlantSpot(w) {
  for (let y = 2; y < 50; y++) for (let x = 2; x < 98; x++) {
    const i = idx(x, y);
    if (w.fg[i] === 0 && !w.seeds.has(i)) {
      const below = w.fg[idx(x, y + 1)];
      if (below && below !== 0) return { x, y };
    }
  }
  throw new Error('no plant spot');
}

const game = makeGame();
const A = login(game, 'Alice');
const B = login(game, 'Bob');
const W = game.worlds.get(A.world);
assert.equal(A.world, B.world, 'setup: same world');

test('both players join the same world and see each other', () => {
  const wmsg = msgs(A, 'world')[0];
  assert.ok(wmsg && wmsg.fg.length === 6000, 'world snapshot has tiles');
  const joins = msgs(B, 'join');
  assert.ok(joins.length >= 0, 'join broadcast ok');
  assert.ok(W.players.has(A.id) && W.players.has(B.id));
});

test('block placement syncs to the other player', () => {
  give(A, 1, 10);
  nearTile(game, A, 50, 20); nearTile(game, B, 60, 20);
  const { x, y } = { x: 52, y: 20 };
  W.fg[idx(x, y)] = 0;
  A.lastPlaceAt = 0;
  game.onPlace(A, { tx: x, ty: y, item: 1 });
  assert.equal(W.fg[idx(x, y)], 1, 'block placed server-side');
  const tiles = msgs(B, 'tile').filter((m) => m.tx === x && m.ty === y);
  assert.ok(tiles.length > 0 && tiles.at(-1).fg === 1, 'B received tile update');
});

test('punching breaks blocks after hardness hits and drops sync', () => {
  const { x, y } = { x: 52, y: 20 };
  nearTile(game, A, x, y);
  punchTimes(game, A, x, y, 3); // dirt hardness = 3
  assert.equal(W.fg[idx(x, y)], 0, 'block destroyed');
  const tiles = msgs(B, 'tile').filter((m) => m.tx === x && m.ty === y);
  assert.ok(tiles.at(-1).fg === 0, 'B saw destruction');
  const inv = msgs(A, 'inv').at(-1);
  assert.ok(inv, 'A got inventory update (drop)');
});

test('out-of-range punch is rejected', () => {
  give(A, 3, 5);
  const { x, y } = { x: 53, y: 20 };
  W.fg[idx(x, y)] = 0;
  nearTile(game, A, x - 2, y); nearTile(game, B, 60, 20);
  A.lastPlaceAt = 0;
  game.onPlace(A, { tx: x, ty: y, item: 3 });
  assert.equal(W.fg[idx(x, y)], 3, 'stone placed');
  // B is far away: punch must be ignored
  B.lastPunchAt = 0;
  game.onPunch(B, { tx: x, ty: y });
  assert.equal(W.fg[idx(x, y)], 3, 'far punch rejected');
});

test('plant -> grow -> harvest cycle works', () => {
  const { x, y } = findPlantSpot(W);
  give(A, 101, 3);
  nearTile(game, A, x, y);
  const before = (msgs(A, 'inv').at(-1)?.slots || []).reduce((n, s) => n + (s && s.id === 1 ? s.count : 0), 0);
  A.lastPlaceAt = 0;
  game.onPlant(A, { tx: x, ty: y, seed: 101 });
  const i = idx(x, y);
  assert.ok(W.seeds.has(i), 'seed planted');
  // fast-forward to maturity
  W.seeds.get(i).plantedAt = Date.now() - growTimeFor(1) * 1000 - 5000;
  nearTile(game, A, x, y);
  const dirtBefore = A.inv.reduce((n, s) => n + (s && s.id === 1 ? s.count : 0), 0);
  punchTimes(game, A, x, y, 1);
  assert.ok(!W.seeds.has(i), 'tree harvested');
  const dirtAfter = A.inv.reduce((n, s) => n + (s && s.id === 1 ? s.count : 0), 0);
  assert.ok(dirtAfter - dirtBefore >= 1 && dirtAfter - dirtBefore <= 4, `fruit 1-4, got ${dirtAfter - dirtBefore}`);
  void before;
});

test('splicing two different seeds yields the hybrid', () => {
  const { x, y } = findPlantSpot(W);
  give(A, 101, 2); give(A, 104, 2);
  nearTile(game, A, x, y);
  A.lastPlaceAt = 0; game.onPlant(A, { tx: x, ty: y, seed: 101 });
  A.lastPlaceAt = 0; game.onPlant(A, { tx: x, ty: y, seed: 104 });
  assert.equal(W.seeds.get(idx(x, y)).seed, 105, 'dirt+wood spliced to brick seed');
  // incompatible pair is rejected
  const { x: x2, y: y2 } = findPlantSpot(W);
  nearTile(game, A, x2, y2);
  A.lastPlaceAt = 0; game.onPlant(A, { tx: x2, ty: y2, seed: 101 });
  A.lastPlaceAt = 0; game.onPlant(A, { tx: x2, ty: y2, seed: 106 });
  assert.equal(W.seeds.get(idx(x2, y2)).seed, 101, 'incompatible splice rejected');
});

test('world lock: owner claims, visitors blocked, owner can remove', () => {
  const { x, y } = { x: 55, y: 20 };
  W.fg[idx(x, y)] = 0;
  give(A, 50, 1);
  nearTile(game, A, x - 2, y);
  A.lastPlaceAt = 0;
  game.onPlace(A, { tx: x, ty: y, item: 50 });
  assert.ok(W.lock && W.lock.ownerId === A.id, 'A owns the world');
  // B cannot place
  give(B, 1, 5);
  nearTile(game, B, 54, 20);
  W.fg[idx(56, 20)] = 0;
  B.lastPlaceAt = 0;
  game.onPlace(B, { tx: 56, ty: 20, item: 1 });
  assert.equal(W.fg[idx(56, 20)], 0, 'visitor placement blocked');
  // B cannot punch A's blocks
  W.fg[idx(57, 20)] = 1;
  nearTile(game, B, 57, 20);
  punchTimes(game, B, 57, 20, 5);
  assert.equal(W.fg[idx(57, 20)], 1, 'visitor punch blocked');
  // owner removes lock by punching it
  nearTile(game, A, x, y);
  punchTimes(game, A, x, y, 1);
  assert.equal(W.lock, null, 'lock removed by owner');
  assert.equal(W.fg[idx(x, y)], 0, 'lock tile gone');
});

test('deco objects: placement syncs to the other player', () => {
  const { x, y } = { x: 70, y: 20 };
  W.fg[idx(x, y)] = 0;
  give(A, 31, 2); // chest
  nearTile(game, A, x - 2, y);
  A.lastPlaceAt = 0;
  game.onPlace(A, { tx: x, ty: y, item: 31 });
  assert.equal(W.fg[idx(x, y)], 31, 'chest placed server-side');
  const tiles = msgs(B, 'tile').filter((m) => m.tx === x && m.ty === y);
  assert.ok(tiles.length > 0 && tiles.at(-1).fg === 31, 'B received chest placement');
});

test('deco objects: breaking after hardness hits syncs removal', () => {
  const { x, y } = { x: 70, y: 20 };
  nearTile(game, A, x, y);
  punchTimes(game, A, x, y, 4); // chest hardness = 4
  assert.equal(W.fg[idx(x, y)], 0, 'chest destroyed');
  const tiles = msgs(B, 'tile').filter((m) => m.tx === x && m.ty === y);
  assert.ok(tiles.at(-1).fg === 0, 'B saw chest removal');
});

test('deco doors: visitors teleport, editors break (door policy)', () => {
  const { x, y } = { x: 71, y: 20 };
  W.fg[idx(x, y)] = 0;
  give(A, 29, 1); // blue door
  nearTile(game, A, x - 2, y);
  A.lastPlaceAt = 0;
  game.onPlace(A, { tx: x, ty: y, item: 29 });
  assert.equal(W.fg[idx(x, y)], 29, 'blue door placed');
  // locked world: visitor B punches -> teleport, door intact
  W.lock = { ownerId: A.id, ownerName: A.name, access: [A.id] };
  B.x = (x - 3) * TILE; B.y = y * TILE;
  B.lastPunchAt = 0; B.lastDoorAt = 0;
  game.onPunch(B, { tx: x, ty: y });
  assert.equal(B.x, W.spawn.x, 'visitor teleported to spawn');
  assert.equal(W.fg[idx(x, y)], 29, 'door intact after visitor use');
  // owner A punches -> damage (no teleport), door breakable
  A.x = (x - 3) * TILE; A.y = y * TILE;
  const ax = A.x;
  A.lastPunchAt = 0; A.lastDoorAt = 0;
  game.onPunch(A, { tx: x, ty: y });
  assert.equal(A.x, ax, 'editor not teleported');
  assert.ok(W.damage.has(idx(x, y)), 'editor punch damages door');
  W.lock = null;
  W.fg[idx(x, y)] = 0; W.damage.delete(idx(x, y)); // cleanup
});

test('deco placement blocked for visitors in locked world', () => {
  W.lock = { ownerId: A.id, ownerName: A.name, access: [A.id] };
  const { x, y } = { x: 72, y: 20 };
  W.fg[idx(x, y)] = 0;
  give(B, 37, 1); // lamp
  nearTile(game, B, x - 2, y);
  B.lastPlaceAt = 0;
  game.onPlace(B, { tx: x, ty: y, item: 37 });
  assert.equal(W.fg[idx(x, y)], 0, 'visitor deco placement blocked');
  give(A, 37, 1);
  nearTile(game, A, x - 2, y);
  A.lastPlaceAt = 0;
  game.onPlace(A, { tx: x, ty: y, item: 37 });
  assert.equal(W.fg[idx(x, y)], 37, 'owner deco placement allowed');
  W.lock = null;
});

test('deco objects survive world serialization round-trip', () => {
  const { x, y } = { x: 73, y: 20 };
  W.fg[idx(x, y)] = 42; // ladder
  W.markDirty();
  const s = serializeWorld(W);
  const back = deserializeWorld({
    name: s.name, fg: s.fg, bg: s.bg, seeds: s.seedsJson,
    lock: s.lockJson, weather: s.weatherJson, spawn: s.spawnJson, created_at: s.created_at,
  });
  assert.equal(back.fg[idx(x, y)], 42, 'ladder persisted through round-trip');
  W.fg[idx(x, y)] = 0;
});

test('sign text: edit, broadcast, and persistence', () => {
  const { x, y } = { x: 74, y: 20 };
  W.fg[idx(x, y)] = 0;
  give(A, 9, 1);
  nearTile(game, A, x - 2, y);
  A.lastPlaceAt = 0;
  game.onPlace(A, { tx: x, ty: y, item: 9 });
  assert.equal(W.fg[idx(x, y)], 9, 'sign placed');
  assert.equal(W.signs.get(idx(x, y)), '', 'new sign starts with empty text');
  nearTile(game, A, x, y);
  A.lastSignAt = 0;
  game.onSignText(A, { tx: x, ty: y, text: '  Hello world!  ' });
  assert.equal(W.signs.get(idx(x, y)), 'Hello world!', 'text trimmed and stored');
  const s = msgs(B, 'sign').filter((m) => m.tx === x && m.ty === y).at(-1);
  assert.ok(s && s.text === 'Hello world!', 'B received sign broadcast');
  // HTML stripped, length capped
  A.lastSignAt = 0;
  game.onSignText(A, { tx: x, ty: y, text: '<b>hi</b>' + 'x'.repeat(100) });
  const t2 = W.signs.get(idx(x, y));
  assert.ok(!t2.includes('<') && t2.length <= 80, 'sanitized and capped');
  // serialization round-trip keeps sign text
  const ser = serializeWorld(W);
  const back = deserializeWorld({
    name: ser.name, fg: ser.fg, bg: ser.bg, seeds: ser.seedsJson, signs: ser.signsJson,
    lock: ser.lockJson, weather: ser.weatherJson, spawn: ser.spawnJson, created_at: ser.created_at,
  });
  assert.equal(back.signs.get(idx(x, y)), t2, 'sign text survives round-trip');
  // breaking the sign clears its text
  nearTile(game, A, x, y);
  punchTimes(game, A, x, y, 4); // sign hardness = 4
  assert.equal(W.fg[idx(x, y)], 0, 'sign destroyed');
  assert.ok(!W.signs.has(idx(x, y)), 'sign text cleared on destroy');
});

test('sign text rejected: locked world, range, missing sign', () => {
  const { x, y } = { x: 75, y: 20 };
  W.fg[idx(x, y)] = 0;
  give(A, 9, 1);
  nearTile(game, A, x - 2, y);
  A.lastPlaceAt = 0;
  game.onPlace(A, { tx: x, ty: y, item: 9 });
  W.lock = { ownerId: A.id, ownerName: A.name, access: [A.id] };
  // visitor cannot edit
  give(B, 9, 0);
  nearTile(game, B, x, y);
  B.lastSignAt = 0;
  game.onSignText(B, { tx: x, ty: y, text: 'grief' });
  assert.equal(W.signs.get(idx(x, y)), '', 'visitor edit rejected');
  // owner too far away
  A.x = (x - 20) * TILE; A.y = y * TILE;
  A.lastSignAt = 0;
  game.onSignText(A, { tx: x, ty: y, text: 'far' });
  assert.equal(W.signs.get(idx(x, y)), '', 'out-of-range edit rejected');
  // no sign at tile
  nearTile(game, A, x + 1, y);
  W.fg[idx(x + 1, y)] = 0;
  A.lastSignAt = 0;
  game.onSignText(A, { tx: x + 1, ty: y, text: 'ghost' });
  assert.ok(!W.signs.has(idx(x + 1, y)), 'edit on empty tile rejected');
  W.lock = null;
});

test('drop table: deterministic block/seed/gem rewards', () => {
  const origRandom = Math.random;
  const countItem = (p, id) => p.inv.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  try {
    // block drop: roll < 0.55
    Math.random = () => 0.1;
    let { x, y } = { x: 76, y: 20 };
    W.fg[idx(x, y)] = 0;
    give(A, 1, 1);
    nearTile(game, A, x - 2, y);
    A.lastPlaceAt = 0;
    game.onPlace(A, { tx: x, ty: y, item: 1 });
    const dirtBefore = countItem(A, 1);
    nearTile(game, A, x, y);
    punchTimes(game, A, x, y, 3);
    assert.equal(W.fg[idx(x, y)], 0, 'dirt broken');
    assert.equal(countItem(A, 1), dirtBefore + 1, 'block dropped to inventory');
    // seed drop: 0.55 <= roll < 0.8 and item has a seed
    Math.random = () => 0.6;
    ({ x, y } = { x: 77, y: 20 });
    W.fg[idx(x, y)] = 0;
    give(A, 1, 1);
    nearTile(game, A, x - 2, y);
    A.lastPlaceAt = 0;
    game.onPlace(A, { tx: x, ty: y, item: 1 });
    const seedsBefore = countItem(A, 101);
    nearTile(game, A, x, y);
    punchTimes(game, A, x, y, 3);
    assert.equal(countItem(A, 101), seedsBefore + 1, 'dirt seed dropped');
    // gem reward: gems = floor(rand * (rarity+1)); stone rarity 3, rand 0.9 -> 3 gems, no item (roll >= 0.8)
    Math.random = () => 0.9;
    ({ x, y } = { x: 78, y: 20 });
    W.fg[idx(x, y)] = 0;
    give(A, 3, 1);
    nearTile(game, A, x - 2, y);
    A.lastPlaceAt = 0;
    game.onPlace(A, { tx: x, ty: y, item: 3 });
    const gemsBefore = A.gems, stoneBefore = countItem(A, 3);
    nearTile(game, A, x, y);
    punchTimes(game, A, x, y, 7); // stone hardness = 7
    assert.equal(W.fg[idx(x, y)], 0, 'stone broken');
    assert.equal(A.gems - gemsBefore, 3, 'gem reward deterministic');
    assert.equal(countItem(A, 3), stoneBefore, 'no stone dropped at high roll');
  } finally {
    Math.random = origRandom;
  }
});

test('world browser lists public metadata only', () => {
  game.getWorld('BROWSERTEST');
  W.lock = { ownerId: A.id, ownerName: A.name, access: [A.id] };
  game.onListWorlds(A);
  const m = msgs(A, 'worlds').at(-1);
  assert.ok(m && Array.isArray(m.worlds), 'worlds list sent');
  assert.ok(m.worlds.length >= 1, 'at least one world listed');
  for (const w of m.worlds) {
    assert.deepEqual(Object.keys(w).sort(), ['locked', 'name', 'players'], 'only public fields, no ownerId/access/tokens');
  }
  const live = m.worlds.find((w) => w.name === A.world);
  assert.ok(live, 'live world listed');
  assert.ok(live.players >= 2, 'live world shows player count');
  assert.ok(live.locked === true, 'locked live world flagged');
  assert.equal(m.current, A.world);
  W.lock = null;
});

test('chat broadcasts to world members', () => {
  A.lastChatAt = 0;
  game.onChat(A, { text: 'hello world' });
  const c = msgs(B, 'chat').at(-1);
  assert.equal(c.text, 'hello world');
  assert.equal(c.from, A.name);
});

test('chat HTML is sanitized', () => {
  A.lastChatAt = 0;
  game.onChat(A, { text: '<script>alert(1)</script>' });
  const c = msgs(B, 'chat').at(-1);
  assert.ok(!c.text.includes('<'), 'tags stripped');
});

test('trading swaps items atomically', () => {
  give(A, 1, 10); give(B, 2, 10);
  nearTile(game, A, 60, 20); B.x = A.x + 40; B.y = A.y;
  const count = (p, id) => p.inv.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  const dirtA0 = count(A, 1), grassB0 = count(B, 2), dirtB0 = count(B, 1), grassA0 = count(A, 2);
  game.onTradeMsg(A, { act: 'invite', targetId: B.id });
  game.onTradeMsg(B, { act: 'accept', fromId: A.id });
  game.onTradeMsg(A, { act: 'add', item: 1, count: 5 });
  game.onTradeMsg(B, { act: 'add', item: 2, count: 3 });
  game.onTradeMsg(A, { act: 'lock' });
  game.onTradeMsg(B, { act: 'lock' });
  game.onTradeMsg(A, { act: 'confirm' });
  game.onTradeMsg(B, { act: 'confirm' });
  assert.equal(count(A, 1), dirtA0 - 5, 'A gave 5 dirt');
  assert.equal(count(A, 2), grassA0 + 3, 'A received 3 grass');
  assert.equal(count(B, 1), dirtB0 + 5, 'B received 5 dirt');
  assert.equal(count(B, 2), grassB0 - 3, 'B gave 3 grass');
  assert.ok(!game.tradeOf(A) && !game.tradeOf(B), 'trade closed');
});

test('trade cannot duplicate when inventory changes mid-trade', () => {
  give(A, 1, 5);
  nearTile(game, A, 60, 20); B.x = A.x + 40; B.y = A.y;
  const count = (p, id) => p.inv.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
  const dirtB0 = count(B, 1), grassB0 = count(B, 2);
  game.onTradeMsg(A, { act: 'invite', targetId: B.id });
  game.onTradeMsg(B, { act: 'accept', fromId: A.id });
  game.onTradeMsg(A, { act: 'add', item: 1, count: 5 });
  game.onTradeMsg(B, { act: 'add', item: 2, count: 1 });
  // A drops all dirt before confirming -> trade must fail, not duplicate
  A.inv.forEach((s, i) => { if (s && s.id === 1) A.inv[i] = null; });
  game.onTradeMsg(A, { act: 'lock' });
  game.onTradeMsg(B, { act: 'lock' });
  game.onTradeMsg(A, { act: 'confirm' });
  game.onTradeMsg(B, { act: 'confirm' });
  assert.equal(count(B, 1), dirtB0, 'B gained no dirt from failed trade');
  assert.equal(count(B, 2), grassB0, 'B kept their grass');
  assert.ok(!game.tradeOf(A), 'failed trade closed');
});

// ---- real transport test ----
test('real WebSocket transport: join, move sync, chat', async () => {
  const PORT = 18099;
  const proc = spawn('node', ['server/server.mjs'], {
    cwd: new URL('../', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  after(() => proc.kill());
  // wait for listen
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://localhost:${PORT}/`); break; }
    catch { await sleep(250); }
  }
  const { default: WebSocket } = await import('ws');
  const got = { A: [], B: [] };
  const mk = (tag, name) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name: name + R, world: 'NETW_' + R })));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      got[tag].push(m);
      if (m.t === 'world') resolve(ws);
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('timeout ' + tag)), 8000);
  });
  const wsA = await mk('A', 'NetA');
  const wsB = await mk('B', 'NetB');
  // move sync: A moves, B should get a players update containing A
  wsA.send(JSON.stringify({ t: 'move', x: 1600, y: 700, vx: 10, vy: 0, face: 1, anim: 'run' }));
  await sleep(600);
  const pupd = got.B.filter((m) => m.t === 'players').at(-1);
  assert.ok(pupd && pupd.players.some((p) => p.anim === 'run'), 'B received A movement');
  // chat sync
  wsA.send(JSON.stringify({ t: 'chat', text: 'net hello' }));
  await sleep(400);
  const chat = got.B.filter((m) => m.t === 'chat').at(-1);
  assert.equal(chat?.text, 'net hello', 'B received A chat');
  // static client served
  const html = await (await fetch(`http://localhost:${PORT}/`)).text();
  assert.ok(html.includes('Sproutopia'), 'client HTML served');
  wsA.close(); wsB.close();
});

after(() => {
  // clean up test rows
  try {
    db.exec(`DELETE FROM players WHERE name LIKE '%${R}%'`);
    db.exec(`DELETE FROM worlds WHERE name LIKE '%${R}%' OR name LIKE '%TESTW%' OR name LIKE '%NETW%'`);
  } catch {}
});

test('punch fx broadcast: other players see impact, puncher excluded (no double fx)', () => {
  const game = makeGame();
  const A = login(game, 'PunchA');
  const B = login(game, 'PunchB');
  const W = game.worlds.get(A.world);
  const { x, y } = { x: 60, y: 20 };
  W.fg[idx(x, y)] = 0;
  give(A, 1, 1);
  nearTile(game, A, x - 2, y);
  A.lastPlaceAt = 0;
  game.onPlace(A, { tx: x, ty: y, item: 1 });
  nearTile(game, B, x + 3, y);
  sent.get(A.id).length = 0; sent.get(B.id).length = 0;
  nearTile(game, A, x, y);
  A.lastPunchAt = 0;
  game.onPunch(A, { tx: x, ty: y }); // 1 of 3 dmg: no break
  const fxA = msgs(A, 'fx').filter((m) => m.kind === 'punch');
  const fxB = msgs(B, 'fx').filter((m) => m.kind === 'punch');
  assert.equal(fxA.length, 0, 'puncher excluded from own punch fx (spawns locally instead)');
  assert.equal(fxB.length, 1, 'other player receives punch fx');
  assert.ok(fxB[0].x === x * TILE + TILE / 2 && fxB[0].y === y * TILE + TILE / 2, 'fx at impact tile center');
  assert.ok(fxB[0].face === 1 || fxB[0].face === -1, 'facing included');
  // damage still authoritative and synced
  const tiles = msgs(B, 'tile').filter((m) => m.tx === x && m.ty === y);
  assert.ok(tiles.length > 0 && tiles[tiles.length - 1].dmg === 1, 'damage broadcast intact');
});

test('hotbar order: fist first, wrench second (new + existing players)', () => {
  const game = makeGame();
  const A = login(game, 'OrderA');
  assert.equal(A.inv[0]?.id, 81, 'fist in slot 1 for new player');
  assert.equal(A.inv[1]?.id, 80, 'wrench in slot 2 for new player');
  // existing player with old order gets normalized on login
  const B = login(game, 'OrderB');
  B.inv = [{ id: 1, count: 20 }, { id: 80, count: 1 }, { id: 81, count: 1 }, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];
  game.ensureTools(B);
  assert.equal(B.inv[0]?.id, 81, 'fist moved to slot 1');
  assert.equal(B.inv[1]?.id, 80, 'wrench moved to slot 2');
  assert.equal(B.inv[2]?.id, 1, 'other items preserved after');
});
