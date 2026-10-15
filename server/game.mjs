// Authoritative game logic: worlds, players, physics validation, farming,
// locks, chat, trading. All sensitive state changes are validated here;
// the client is never trusted for inventory, permissions, or tile edits.
import crypto from 'node:crypto';
import {
  TILE, WORLD_W, WORLD_H, BEDROCK_ROWS, PHYS,
  PUNCH_RANGE, PUNCH_COOLDOWN, DAMAGE_RESTORE_S,
  PICKUP_MAGNET_R, PICKUP_COLLECT_R, TRADE_RANGE,
  INV_SLOTS, MAX_STACK, CHAT_MAX_LEN, CHAT_COOLDOWN_MS,
  SEED_RETURN_CHANCE, growTimeFor, rollWeatherKind,
} from '../shared/constants.mjs';
import { ITEMS, itemById, isSeed, isBlock, spliceResult, STARTER_KIT, GEM_TYPES, gemDropFor } from '../shared/items.mjs';
import { store } from './db.mjs';
import { generateWorld, serializeWorld, deserializeWorld, idx, inBounds } from './world.mjs';
import { hashPassword, verifyPassword, validPassword } from './auth.mjs';

const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// ---------- inventory helpers (server-side only) ----------
function addItem(inv, id, count) {
  let rest = count;
  for (const s of inv) if (s && s.id === id && s.count < MAX_STACK) {
    const take = Math.min(rest, MAX_STACK - s.count); s.count += take; rest -= take;
    if (!rest) return 0;
  }
  for (let i = 0; i < inv.length && rest; i++) if (!inv[i]) {
    const take = Math.min(rest, MAX_STACK); inv[i] = { id, count: take }; rest -= take;
  }
  return rest;
}
function countOf(inv, id) { return inv.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0); }
function removeItem(inv, id, count) {
  if (countOf(inv, id) < count) return false;
  let rest = count;
  for (let i = 0; i < inv.length && rest; i++) {
    const s = inv[i]; if (!s || s.id !== id) continue;
    const take = Math.min(rest, s.count); s.count -= take; rest -= take;
    if (s.count <= 0) inv[i] = null;
  }
  return true;
}
function fitsAll(inv, offers) {
  const sim = inv.map((s) => (s ? { ...s } : null));
  for (const [id, c] of offers) if (addItem(sim, Number(id), c) > 0) return false;
  return true;
}

const VALID_LOOK = /^[0-9a-fA-F]{6}$/;
const VALID_FACES = ['classic', 'happy', 'angry', 'sleepy'];
function validLook(l) {
  if (!l || typeof l !== 'object') return false;
  for (const k of ['skin', 'hair', 'shirt', 'pants'])
    if (!VALID_LOOK.test(l[k] || '')) return false;
  if (l.face !== undefined && !VALID_FACES.includes(l.face)) return false;
  return true;
}
const DEFAULT_LOOK = { skin: 'e3ac72', hair: '', shirt: '', pants: '2f3a5c', face: 'classic' };
const sanitize = (s) => String(s).replace(/[<>&"]/g, '').slice(0, CHAT_MAX_LEN).trim();
const validName = (n) => /^@?[A-Za-z0-9_]{3,16}$/.test(n || '');
const validWorldName = (n) => /^[A-Za-z0-9_]{1,16}$/.test(n || '');

// ---------- farming ----------
export function growthStage(seedId, plantedAt, at = now()) {
  const item = itemById(seedId);
  if (!item) return 3;
  const total = growTimeFor(item.rarity) * 1000;
  const e = at - plantedAt;
  if (e >= total) return 3;
  if (e >= total * 0.66) return 2;
  if (e >= total * 0.33) return 1;
  return 0;
}
const isMature = (seedId, plantedAt, at = now()) => growthStage(seedId, plantedAt, at) === 3;

// ---------- world state ----------
class WorldState {
  constructor(data) {
    this.name = data.name;
    this.fg = data.fg; this.bg = data.bg;
    this.seeds = data.seeds || new Map();
    this.signs = data.signs || new Map(); // idx -> text
    this.damage = new Map(); // idx -> {dmg, at}
    this.lock = data.lock || null; // {ownerId, ownerName, access:[ids]}
    this.weather = data.weather && data.weather.kind ? data.weather : { kind: 'clear', until: now() + 180000 };
    this.players = new Set();
    this.drops = new Map();
    this.nextDropId = 1;
    this.dirty = false;
    this.created_at = data.created_at || now();
    this.spawn = data.spawn || { x: 50 * TILE + TILE / 2, y: 24 * TILE };
    // Find the white exit door (item 43). If the world doesn't have one
    // (old worlds), place it near spawn on solid ground.
    let doorIdx = -1;
    for (let i = 0; i < this.fg.length; i++) {
      if (this.fg[i] === 43) { doorIdx = i; break; }
    }
    if (doorIdx === -1) {
      // place door: 4 tiles right of spawn-x, on the surface
      const dx = 54, dy = 29;
      if (this.fg[dy * WORLD_W + dx] === 0) {
        this.fg[dy * WORLD_W + dx] = 43;
        // ensure solid footing below (bedrock like new worlds)
        if (this.fg[(dy + 1) * WORLD_W + dx] === 0) this.fg[(dy + 1) * WORLD_W + dx] = 7;
        doorIdx = dy * WORLD_W + dx;
        this.dirty = true;
      }
    }
    // Spawn on the ground NEXT TO the door (2 tiles left), not on the
    // door tile itself. Otherwise keep the stored/default spawn.
    if (doorIdx !== -1) {
      const dx = doorIdx % WORLD_W, dy = Math.floor(doorIdx / WORLD_W);
      this.spawn = { x: (dx - 2) * TILE + TILE / 2, y: dy * TILE + TILE / 2 };
    }
  }
  tileSolid(tx, ty) {
    if (!inBounds(tx, ty)) return true;
    const f = this.fg[idx(tx, ty)];
    if (!f) return false;
    return itemById(f)?.collision === 'solid';
  }
  markDirty() { this.dirty = true; }
}

function solidAtFg(fgArr, tx, ty) {
  if (!inBounds(tx, ty)) return true;
  const f = fgArr[idx(tx, ty)];
  return !!f && itemById(f)?.collision === 'solid';
}

// ---------- game ----------
export class Game {
  constructor(sendFn) {
    this.worlds = new Map();
    this.players = new Map(); // id -> player
    this.byWs = new Map();    // ws -> id
    this.trades = new Map();  // playerId -> trade
    this.send = sendFn;       // (player, msg) => void
    this.lastPlayerBroadcast = 0;
    this.lastAutosave = now();
  }

  // ----- players -----
  createPlayer(name, passwordHash = null) {
    const p = {
      id: crypto.randomUUID(), name, token: crypto.randomUUID(),
      x: 0, y: 0, vx: 0, vy: 0, face: 1, anim: 'idle',
      look: { ...DEFAULT_LOOK }, gems: 0,
      inv: new Array(INV_SLOTS).fill(null),
      world: null, ws: null,
      lastPunchAt: 0, lastPlaceAt: 0, lastChatAt: 0, lastDoorAt: 0,
      invDirty: false,
    };
    for (const { id, count } of STARTER_KIT) addItem(p.inv, id, count);
    const t = now();
    store.createPlayer({ id: p.id, name, token: p.token, look: JSON.stringify(p.look), gems: 0, last_world: 'START', password_hash: passwordHash, created_at: t, updated_at: t });
    store.saveInventory(p.id, p.inv);
    return p;
  }

  // Login attempt throttle (per connection): slows password guessing.
  authThrottled(ws) {
    const t = now();
    ws._authFails = (ws._authFails || []).filter((at) => t - at < 60000);
    if (ws._authFails.length >= 5) return true;
    return false;
  }
  authFail(ws) {
    const t = now();
    ws._authFails = ((ws._authFails || []).filter((at) => t - at < 60000)).concat([t]);
  }
  loadPlayer(row) {
    const p = {
      id: row.id, name: row.name, token: row.token,
      x: 0, y: 0, vx: 0, vy: 0, face: 1, anim: 'idle',
      look: { ...DEFAULT_LOOK, ...JSON.parse(row.look || '{}') },
      gems: row.gems || 0,
      inv: new Array(INV_SLOTS).fill(null),
      world: null, ws: null,
      lastPunchAt: 0, lastPlaceAt: 0, lastChatAt: 0, lastDoorAt: 0,
      invDirty: false, lastWorld: row.last_world || 'START',
    };
    for (const r of store.getInventory(p.id)) p.inv[r.slot] = { id: r.item_id, count: r.count };
    return p;
  }

  // ----- worlds -----
  getWorld(name) {
    name = name.toUpperCase();
    let w = this.worlds.get(name);
    if (w) return w;
    const row = store.getWorld(name);
    const data = row ? deserializeWorld(row) : null;
    if (data) {
      w = new WorldState(data);
    } else {
      const g = generateWorld(name);
      w = new WorldState({ name, fg: g.fg, bg: g.bg, seeds: new Map(), lock: null, weather: null });
      // NOTE: do NOT overwrite w.spawn here — the WorldState constructor already
      // scanned for the white door (item 43) and set spawn to it.
      w.markDirty();
    }
    this.worlds.set(name, w);
    return w;
  }
  saveWorld(w) {
    const s = serializeWorld(w);
    store.saveWorld({ name: w.name, fgBlob: s.fg, bgBlob: s.bg, seedsJson: s.seedsJson, lockJson: s.lockJson, weatherJson: s.weatherJson, spawnJson: s.spawnJson, signsJson: s.signsJson, created_at: w.created_at });
    w.dirty = false;
  }

  leaveWorld(p) {
    if (p.world) {
      const old = this.worlds.get(p.world);
      if (old) { old.players.delete(p.id); this.broadcast(old, { t: 'leave', id: p.id }); }
      p.world = null;
    }
    this.send(p, { t: 'leftWorld' });
  }
  joinWorld(p, name) {
    if (!validWorldName(name)) { this.notice(p, 'Invalid world name.'); return; }
    name = name.toUpperCase();
    if (p.world) {
      const old = this.worlds.get(p.world);
      if (old) { old.players.delete(p.id); this.broadcast(old, { t: 'leave', id: p.id }); }
    }
    const w = this.getWorld(name);
    p.world = name;
    p.x = w.spawn.x; p.y = w.spawn.y; p.vx = p.vy = 0;
    w.players.add(p.id);
    store.savePlayer({ ...p, look: JSON.stringify(p.look), last_world: name });
    this.send(p, {
      t: 'world', name, spawn: w.spawn,
      fg: Array.from(w.fg), bg: Array.from(w.bg),
      seeds: [...w.seeds.entries()].map(([i, s]) => ({ x: i % WORLD_W, y: Math.floor(i / WORLD_W), seed: s.seed, plantedAt: s.plantedAt })),
      signs: [...w.signs.entries()].map(([i, text]) => ({ x: i % WORLD_W, y: Math.floor(i / WORLD_W), text })),
      lock: w.lock ? { ownerName: w.lock.ownerName, access: w.lock.access } : null,
      weather: w.weather.kind,
      drops: [...w.drops.values()].map((d) => ({ id: d.id, item: d.item, count: d.count, gemType: d.gemType, x: d.x, y: d.y })),
      players: this.playerList(w),
      canEdit: this.canEdit(p, w),
    });
    this.broadcast(w, { t: 'join', player: this.pubPlayer(p) }, p.id);
    this.notice(p, w.lock ? `Welcome to ${name} (locked by ${w.lock.ownerName}).` : `Welcome to ${name}.`);
  }

  pubPlayer(p) {
    const w = p.world ? this.worlds.get(p.world) : null;
    return {
      id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y),
      vx: Math.round(p.vx), vy: Math.round(p.vy), face: p.face, anim: p.anim,
      look: p.look, owner: !!(w && w.lock && w.lock.ownerId === p.id),
    };
  }
  playerList(w) { return [...w.players].map((id) => this.pubPlayer(this.players.get(id))).filter(Boolean); }
  broadcast(w, msg, exceptId = null) {
    for (const id of w.players) {
      if (id === exceptId) continue;
      const p = this.players.get(id);
      if (p) this.send(p, msg);
    }
  }
  notice(p, text) { this.send(p, { t: 'notice', text }); }

  canEdit(p, w) {
    if (this.isAdmin(p)) return true; // admin bypasses world locks
    if (!w.lock) return true;
    return w.lock.access.includes(p.id);
  }

  // ----- connection lifecycle -----
  // Every player always has a wrench and a fist (both undroppable).
  // Grants them to older accounts that were created before they existed.
  ensureTools(p) {
    let changed = false;
    for (const id of [80, 81]) {
      if (countOf(p.inv, id) < 1) { addItem(p.inv, id, 1); changed = true; }
    }
    // normalize hotbar: Fist first, Wrench second (user request)
    const take = (id) => {
      const i = p.inv.findIndex((s) => s && s.id === id);
      if (i < 0) return null;
      return p.inv.splice(i, 1)[0];
    };
    const fist = take(81), wrench = take(80);
    if (fist || wrench) {
      const rest = p.inv.filter(Boolean);
      p.inv = [fist || { id: 81, count: 1 }, wrench || { id: 80, count: 1 }, ...rest];
      while (p.inv.length < INV_SLOTS) p.inv.push(null);
      p.inv.length = INV_SLOTS;
      changed = true;
    }
    if (changed) {
      p.invDirty = true;
      store.saveInventory(p.id, p.inv);
    }
  }

  onHello(ws, msg) {
    let p = null;
    if (msg.token) {
      const row = store.getPlayerByToken(msg.token);
      if (row) p = this.loadPlayer(row);
    }
    if (!p) {
      if (!validName(msg.name)) { ws.send(JSON.stringify({ t: 'error', text: 'Pick a name: 3-16 letters, numbers, _.' })); return; }
      // Admin shortcut: "admin" (any case, with or without @) resolves to the stored "@Admin"
      // HatID *before* the DB lookup, so plain "admin" finds the account instead of 404ing.
      const loginName = /^@?admin$/i.test(msg.name) ? '@Admin' : msg.name;
      const existing = store.getPlayerByName(loginName);
      if (msg.password !== undefined) {
        // HatID login: name + password (case-insensitive, preserves registered casing)
        if (this.authThrottled(ws)) { ws.send(JSON.stringify({ t: 'error', text: 'Too many attempts. Wait a minute and try again.' })); return; }
        if (!existing) { this.authFail(ws); ws.send(JSON.stringify({ t: 'error', text: 'No HatID found for that name.' })); return; }
        if (!existing.password_hash) { this.authFail(ws); ws.send(JSON.stringify({ t: 'error', text: 'That name has no HatID yet — connect as guest first, then get one from Help.' })); return; }
        if (!verifyPassword(msg.password, existing.password_hash)) { this.authFail(ws); ws.send(JSON.stringify({ t: 'error', text: 'Wrong password.' })); return; }
        p = this.loadPlayer(existing);
        // admin: "admin" -> "@Admin" display name
        if (p.name.toLowerCase() === 'admin' || p.name.toLowerCase() === '@admin') {
          p.name = '@Admin';
        }
      } else {
        // Guest login: name must be free, or a guest name (no HatID)
        if (existing) {
          if (existing.password_hash) ws.send(JSON.stringify({ t: 'error', text: 'That name is protected by a HatID. Log in on the right side.' }));
          else ws.send(JSON.stringify({ t: 'error', text: 'That name is taken.' }));
          return;
        }
        p = this.createPlayer(msg.name);
      }
    }
    this.finishLogin(ws, p, msg.world);
  }

  // Fresh HatID registration from the login screen: only for free names.
  onRegister(ws, msg) {
    if (!validName(msg.name)) { ws.send(JSON.stringify({ t: 'error', text: 'Pick a name: 3-16 letters, numbers, _.' })); return; }
    if (!validPassword(msg.password)) { ws.send(JSON.stringify({ t: 'error', text: 'Password must be 6-64 characters.' })); return; }
    if (store.getPlayerByName(msg.name)) { ws.send(JSON.stringify({ t: 'error', text: 'That name is taken.' })); return; }
    const p = this.createPlayer(msg.name, hashPassword(msg.password));
    this.finishLogin(ws, p, msg.world);
    this.notice(p, 'HatID created! Use your name + password to log in from any device.');
  }

  // In-session "Get HatID": binds a password to the caller's own guest name.
  // Only the authenticated session owner can claim their own name.
  onClaimHatId(p, msg) {
    if (!validPassword(msg.password)) { this.send(p, { t: 'error', text: 'Password must be 6-64 characters.' }); return; }
    if (store.getPasswordHash(p.id)) { this.send(p, { t: 'error', text: 'This name already has a HatID.' }); return; }
    store.setPasswordHash(p.id, hashPassword(msg.password));
    this.send(p, { t: 'hatid_ok' });
    this.notice(p, 'HatID created for ' + p.name + '! Log in with your name + password from any device.');
  }

  finishLogin(ws, p, worldName) {
    p.ws = ws;
    this.players.set(p.id, p);
    this.byWs.set(ws, p.id);
    this.ensureTools(p);
    this.send(p, { t: 'welcome', id: p.id, name: p.name, token: p.token, look: p.look, gems: p.gems });
    this.send(p, { t: 'inv', slots: p.inv, gems: p.gems });
    this.joinWorld(p, worldName && validWorldName(worldName) ? worldName : (p.lastWorld || 'START'));
  }
  onClose(ws) {
    const id = this.byWs.get(ws);
    if (!id) return;
    const p = this.players.get(id);
    this.byWs.delete(ws);
    if (!p) return;
    this.cancelTrade(p, 'Player left');
    if (p.world) {
      const w = this.worlds.get(p.world);
      if (w) { w.players.delete(id); this.broadcast(w, { t: 'leave', id }); }
    }
    store.savePlayer({ ...p, look: JSON.stringify(p.look), last_world: p.world || 'START' });
    store.saveInventory(p.id, p.inv);
    this.players.delete(id);
  }

  // ----- drops -----
  spawnDrop(w, item, count, x, y) {
    const id = w.nextDropId++;
    const d = { id, item, count, x, y, vx: (Math.random() - 0.5) * 120, vy: -160, landed: false };
    w.drops.set(id, d);
    this.broadcast(w, { t: 'dropSpawn', id, item, count, x: Math.round(x), y: Math.round(y) });
    return d;
  }
  // Spawn a floating gem entity (currency, not inventory item)
  // Gems scatter randomly within ~1 block and auto-merge/upgrade when piling up
  spawnGemDrop(w, gemType, count, x, y) {
    // random scatter: left/center/right within 1 block
    const sx = x + (Math.random() - 0.5) * 36;
    const sy = y + (Math.random() - 0.5) * 12;
    // check for nearby same-type gems to merge
    for (const d of w.drops.values()) {
      if (!d.gemType || d.gemType !== gemType) continue;
      if (Math.hypot(d.x - sx, d.y - sy) > 40) continue;
      // merge into existing
      d.count += count;
      this.tryUpgradeGem(w, d);
      this.broadcast(w, { t: 'dropSpawn', id: d.id, item: 0, count: d.count, gemType: d.gemType, x: Math.round(d.x), y: Math.round(d.y) });
      return d;
    }
    const id = w.nextDropId++;
    const d = { id, item: 0, count, gemType, x: sx, y: sy, vx: (Math.random() - 0.5) * 80, vy: -120, landed: false };
    w.drops.set(id, d);
    this.tryUpgradeGem(w, d);
    this.broadcast(w, { t: 'dropSpawn', id, item: 0, count: d.count, gemType: d.gemType, x: Math.round(sx), y: Math.round(sy) });
    return d;
  }
  // Upgrade gem denominations when piled up (10 yellow -> 1 red, 5 red -> 1 purple)
  tryUpgradeGem(w, d) {
    const order = ['yellow', 'red', 'purple', 'green', 'black'];
    const values = { yellow: 1, red: 10, purple: 50, green: 80, black: 100 };
    let idx = order.indexOf(d.gemType);
    while (idx < order.length - 1) {
      const curVal = values[d.gemType];
      const nextType = order[idx + 1];
      const nextVal = values[nextType];
      const totalVal = d.count * curVal;
      if (totalVal >= nextVal && totalVal % nextVal === 0) {
        d.count = totalVal / nextVal;
        d.gemType = nextType;
        idx++;
      } else break;
    }
  }
  giveOrDrop(p, w, id, count, x, y) {
    const rest = addItem(p.inv, id, count);
    p.invDirty = true;
    this.send(p, { t: 'inv', slots: p.inv, gems: p.gems });
    if (rest > 0) this.spawnDrop(w, id, rest, x ?? p.x, y ?? p.y);
  }

  // ----- punch -----
  onPunch(p, msg) {
    const t = now();
    if (t - p.lastPunchAt < PUNCH_COOLDOWN * 1000) return;
    p.lastPunchAt = t;
    const w = this.worlds.get(p.world);
    if (!w) return;
    const tx = Math.floor(msg.tx), ty = Math.floor(msg.ty);
    if (!inBounds(tx, ty)) return;
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    if (dist(p.x, p.y, cx, cy) > PUNCH_RANGE) { this.notice(p, 'Too far to reach.'); return; }
    const i = idx(tx, ty);
    p.face = cx >= p.x ? 1 : -1;

    // Tree first
    const seed = w.seeds.get(i);
    if (seed && w.fg[i] === 0) {
      if (!this.canEdit(p, w)) { this.notice(p, 'This world is locked.'); return; }
      const item = itemById(seed.seed);
      if (isMature(seed.seed, seed.plantedAt)) {
        // HARVEST (researched rules)
        w.seeds.delete(i);
        const fruitId = item.treeOf;
        const fruit = 1 + Math.floor(Math.random() * 4);
        this.giveOrDrop(p, w, fruitId, fruit, cx, cy - 20);
        if (Math.random() < SEED_RETURN_CHANCE) this.giveOrDrop(p, w, seed.seed, 1, cx, cy - 20);
        const gems = Math.floor(Math.random() * (item.rarity + 1));
        if (gems > 0) { p.gems += gems; this.send(p, { t: 'gems', gems: p.gems }); }
        this.broadcast(w, { t: 'tile', tx, ty, fg: 0, bg: w.bg[i], seed: null, dmg: 0 });
        this.broadcast(w, { t: 'fx', kind: 'harvest', x: cx, y: cy });
        this.broadcast(w, { t: 'fx', kind: 'punch', x: cx, y: cy, face: cx >= p.x ? 1 : -1 }, p.id);
      } else {
        w.seeds.delete(i); // uproot growing tree (documented deviation)
        this.broadcast(w, { t: 'tile', tx, ty, fg: 0, bg: w.bg[i], seed: null, dmg: 0 });
        this.broadcast(w, { t: 'fx', kind: 'punch', x: cx, y: cy, face: cx >= p.x ? 1 : -1 }, p.id);
        this.notice(p, 'Uprooted the growing tree.');
      }
      w.markDirty();
      return;
    }

    const fgId = w.fg[i];
    // White exit door: punching it opens the world browser (exit to navigation).
    // Always exits, even for owners — it is a permanent world fixture.
    if (itemById(fgId)?.action === 'exit') {
      if (t - p.lastDoorAt < 2000) return;
      p.lastDoorAt = t;
      this.notice(p, 'You step through the white door...');
      this.leaveWorld(p);
      this.broadcast(w, { t: 'fx', kind: 'door', x: p.x, y: p.y });
      return;
    }
    // Door policy (documented): visitors punch to travel to spawn; players with
    // edit permission punch to break (doors must be removable by owners).
    // Teleport is intra-world movement, never a lock bypass.
    if (itemById(fgId)?.action === 'door') {
      if (!this.canEdit(p, w)) {
        if (t - p.lastDoorAt < 2000) return;
        p.lastDoorAt = t;
        p.x = w.spawn.x; p.y = w.spawn.y; p.vx = p.vy = 0;
        this.notice(p, 'You walk through the door...');
        this.broadcast(w, { t: 'fx', kind: 'door', x: p.x, y: p.y });
        return;
      }
      // editors fall through to normal damage/break below
    }
    // Lock: owner punching picks it up; others cannot damage
    if (fgId === 50 || fgId === 51) {
      if (w.lock && w.lock.ownerId === p.id) {
        w.fg[i] = 0; w.lock = null; w.markDirty();
        this.giveOrDrop(p, w, fgId, 1, cx, cy);
        this.broadcast(w, { t: 'tile', tx, ty, fg: 0, bg: w.bg[i], seed: null, dmg: 0 });
        this.broadcast(w, { t: 'lock', lock: null });
        this.notice(p, 'World unlocked.');
      } else this.notice(p, 'Only the world owner can remove this lock.');
      return;
    }

    if (!this.canEdit(p, w)) { this.notice(p, 'This world is locked.'); return; }
    const isAdmin = this.isAdmin(p);
    const applyDamage = (arr, id, isBg) => {
      const it = itemById(id);
      // admin can break anything (including bedrock)
      if (!it || (!isFinite(it.hardness) && !isAdmin)) { if (id) this.notice(p, 'Unbreakable!'); return; }
      const cur = w.damage.get(i) || { dmg: 0, at: 0 };
      cur.dmg += 1; cur.at = t;
      // admin breaks unbreakable (bedrock) in 1 hit
      const need = isAdmin && !isFinite(it.hardness) ? 1 : it.hardness;
      if (cur.dmg >= need) {
        w.damage.delete(i);
        if (isBg) w.bg[i] = 0; else { if (id === 9) w.signs.delete(i); w.fg[i] = 0; }
        w.markDirty();
        // drops (researched: block, seed, gems, or nothing)
        const roll = Math.random();
        if (roll < 0.55) this.giveOrDrop(p, w, id, 1, cx, cy - 10);
        else if (roll < 0.8 && it.seed) this.giveOrDrop(p, w, it.seed, 1, cx, cy - 10);
        // floating gem drop (configurable by block)
        const gemCfg = gemDropFor(id);
        if (gemCfg && Math.random() < gemCfg.chance) {
          const gemCount = gemCfg.min + Math.floor(Math.random() * (gemCfg.max - gemCfg.min + 1));
          // spawn each gem separately so they scatter (merge/upgrade handled in spawnGemDrop)
          for (let g = 0; g < gemCount; g++)
            this.spawnGemDrop(w, gemCfg.gem, 1, cx, cy - 10);
        }
        const gems = Math.floor(Math.random() * (it.rarity + 1));
        if (gems > 0) { p.gems += gems; this.send(p, { t: 'gems', gems: p.gems }); }
        this.broadcast(w, { t: 'fx', kind: 'break', x: cx, y: cy });
        this.broadcast(w, { t: 'tile', tx, ty, fg: w.fg[i], bg: w.bg[i], seed: null, dmg: 0 });
      } else {
        w.damage.set(i, cur);
        this.broadcast(w, { t: 'tile', tx, ty, fg: w.fg[i], bg: w.bg[i], seed: null, dmg: cur.dmg, hardness: it.hardness });
      }
      // cosmetic punch impact for other players (the puncher spawns its own
      // locally; excluded here to avoid double effects). Server-authoritative
      // damage above is the only thing that affects gameplay.
      this.broadcast(w, { t: 'fx', kind: 'punch', x: cx, y: cy, face: cx >= p.x ? 1 : -1 }, p.id);
    };
    if (fgId) applyDamage(w.fg, fgId, false);
    else if (w.bg[i]) applyDamage(w.bg, w.bg[i], true);
  }

  // ----- place / plant -----
  onPlace(p, msg) {
    const t = now();
    if (t - p.lastPlaceAt < 250) return;
    p.lastPlaceAt = t;
    const w = this.worlds.get(p.world);
    if (!w) return;
    const tx = Math.floor(msg.tx), ty = Math.floor(msg.ty);
    const itemId = Math.floor(msg.item);
    if (!inBounds(tx, ty)) return;
    const item = itemById(itemId);
    if (!item || !isBlock(itemId)) { this.notice(p, "You can't place that."); return; }
    if (countOf(p.inv, itemId) < 1) { this.notice(p, 'None left.'); return; }
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    if (dist(p.x, p.y, cx, cy) > PUNCH_RANGE) { this.notice(p, 'Too far to reach.'); return; }
    if (!this.canEdit(p, w)) { this.notice(p, 'This world is locked.'); return; }
    const i = idx(tx, ty);
    const layer = item.layer;
    if (layer === 'fg') {
      if (w.fg[i] !== 0 || w.seeds.has(i)) { this.notice(p, 'No room there.'); return; }
      // don't place solid block overlapping a player
      for (const id of w.players) {
        const q = this.players.get(id);
        if (q && item.collision === 'solid' && Math.abs(q.x - cx) < 26 && Math.abs(q.y - cy) < 40) {
          this.notice(p, 'Someone is standing there.'); return;
        }
      }
    } else {
      if (w.bg[i] !== 0) { this.notice(p, 'No room there.'); return; }
    }
    // World lock / Diamond lock claims the world
    if (itemId === 50 || itemId === 51) {
      if (w.lock) { this.notice(p, 'This world already has a lock.'); return; }
      w.lock = { ownerId: p.id, ownerName: p.name, access: [p.id], kind: itemId === 51 ? 'diamond' : 'world' };
      this.broadcast(w, { t: 'lock', lock: { ownerName: p.name, access: [p.id] } });
      this.notice(p, `You now own ${w.name}! Punch the lock to remove it.`);
    }
    removeItem(p.inv, itemId, 1);
    p.invDirty = true;
    if (layer === 'fg') {
      if (w.fg[i] === 9) w.signs.delete(i); // replacing an old sign
      w.fg[i] = itemId;
      if (itemId === 9) w.signs.set(i, '');
    } else w.bg[i] = itemId;
    w.markDirty();
    this.send(p, { t: 'inv', slots: p.inv, gems: p.gems });
    this.broadcast(w, { t: 'tile', tx, ty, fg: w.fg[i], bg: w.bg[i], seed: null, dmg: 0, ...(layer === 'fg' && itemId === 9 ? { sign: '' } : {}) });
  }

  onPlant(p, msg) {
    const t = now();
    if (t - p.lastPlaceAt < 250) return;
    p.lastPlaceAt = t;
    const w = this.worlds.get(p.world);
    if (!w) return;
    const tx = Math.floor(msg.tx), ty = Math.floor(msg.ty);
    const seedId = Math.floor(msg.seed);
    if (!inBounds(tx, ty) || !isSeed(seedId)) return;
    if (countOf(p.inv, seedId) < 1) { this.notice(p, 'No seeds left.'); return; }
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    if (dist(p.x, p.y, cx, cy) > PUNCH_RANGE) { this.notice(p, 'Too far to reach.'); return; }
    if (!this.canEdit(p, w)) { this.notice(p, 'This world is locked.'); return; }
    const i = idx(tx, ty);
    if (w.fg[i] !== 0) { this.notice(p, 'Needs an empty tile.'); return; }
    const existing = w.seeds.get(i);
    if (existing) {
      // SPLICING (researched): different seed on a growing tree
      if (isMature(existing.seed, existing.plantedAt)) { this.notice(p, 'That tree is fully grown.'); return; }
      if (existing.seed === seedId) { this.notice(p, 'Already growing that seed.'); return; }
      const result = spliceResult(existing.seed, seedId);
      if (!result) {
        const a = itemById(existing.seed).name, b = itemById(seedId).name;
        this.notice(p, `Hmm, ${a} and ${b} can't be spliced.`);
        return;
      }
      removeItem(p.inv, seedId, 1); p.invDirty = true;
      w.seeds.set(i, { seed: result, plantedAt: t });
      w.markDirty();
      this.send(p, { t: 'inv', slots: p.inv, gems: p.gems });
      this.broadcast(w, { t: 'tile', tx, ty, fg: 0, bg: w.bg[i], seed: { seed: result, plantedAt: t }, dmg: 0 });
      this.broadcast(w, { t: 'fx', kind: 'splice', x: cx, y: cy });
      this.notice(p, `${itemById(existing.seed).name} and ${itemById(seedId).name} spliced into ${itemById(result).name}!`);
      return;
    }
    // planting needs solid support below (researched)
    if (!solidAtFg(w.fg, tx, ty + 1)) { this.notice(p, 'Seeds need solid ground below.'); return; }
    removeItem(p.inv, seedId, 1); p.invDirty = true;
    w.seeds.set(i, { seed: seedId, plantedAt: t });
    w.markDirty();
    this.send(p, { t: 'inv', slots: p.inv, gems: p.gems });
    this.broadcast(w, { t: 'tile', tx, ty, fg: 0, bg: w.bg[i], seed: { seed: seedId, plantedAt: t }, dmg: 0 });
  }

  // ----- drops: pickup / toss -----
  onPickup(p, msg) {
    const w = this.worlds.get(p.world);
    if (!w) return;
    const d = w.drops.get(msg.id);
    if (!d) return;
    if (dist(p.x, p.y, d.x, d.y) > PICKUP_COLLECT_R + 8) return;
    w.drops.delete(msg.id);
    // Gem drops award currency, not inventory items
    if (d.gemType && GEM_TYPES[d.gemType]) {
      const value = GEM_TYPES[d.gemType].value * d.count;
      p.gems += value;
      this.send(p, { t: 'gems', gems: p.gems });
      this.notice(p, `+${value} gems`);
    } else {
      this.giveOrDrop(p, w, d.item, d.count, p.x, p.y);
    }
    this.broadcast(w, { t: 'dropGone', id: msg.id });
  }
  onDropItem(p, msg) {
    const w = this.worlds.get(p.world);
    if (!w) return;
    const id = Math.floor(msg.item), count = clamp(Math.floor(msg.count) || 1, 1, MAX_STACK);
    const item = itemById(id);
    if (!item || item.undroppable) { this.notice(p, "You can't drop that."); return; }
    if (!removeItem(p.inv, id, count)) return;
    p.invDirty = true;
    this.spawnDrop(w, id, count, p.x + p.face * 30, p.y - 10);
    this.send(p, { t: 'inv', slots: p.inv, gems: p.gems });
  }

  // ----- chat -----
  // Public world metadata for the world browser. Never exposes owner ids,
  // access lists, tokens, or internal records.
  onListWorlds(p) {
    const seen = new Set();
    const list = [];
    for (const row of store.listWorldMeta()) {
      const w = this.worlds.get(row.name.toUpperCase());
      seen.add(row.name.toUpperCase());
      let ownerName = null;
      try {
        const lk = w ? w.lock : (row.lock ? JSON.parse(row.lock) : null);
        ownerName = lk?.ownerName || null;
      } catch {}
      list.push({ name: row.name, players: w ? w.players.size : 0, locked: !!(w ? w.lock : row.lock), ownerName });
    }
    // include live worlds not yet persisted
    for (const [name, w] of this.worlds) {
      if (seen.has(name)) continue;
      list.push({ name, players: w.players.size, locked: !!w.lock, ownerName: w.lock?.ownerName || null });
    }
    this.send(p, { t: 'worlds', worlds: list.slice(0, 50), current: p.world });
  }

  onSignText(p, msg) {
    const t = now();
    if (t - (p.lastSignAt || 0) < 500) return; // anti-spam
    p.lastSignAt = t;
    const w = this.worlds.get(p.world);
    if (!w) return;
    const tx = msg.tx | 0, ty = msg.ty | 0;
    if (!inBounds(tx, ty)) return;
    const i = idx(tx, ty);
    if (w.fg[i] !== 9) return; // server authoritative: a sign must exist here
    if (!this.canEdit(p, w)) { this.notice(p, 'This world is locked.'); return; }
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    if (Math.hypot(p.x - cx, p.y - cy) > PUNCH_RANGE) { this.notice(p, 'Too far to reach.'); return; }
    const text = String(msg.text ?? '').replace(/[<>&"]/g, '').trim().slice(0, 80);
    w.signs.set(i, text);
    w.markDirty();
    this.broadcast(w, { t: 'sign', tx, ty, text });
  }

  onChat(p, msg) {
    const t = now();
    if (t - p.lastChatAt < CHAT_COOLDOWN_MS) return;
    p.lastChatAt = t;
    const w = this.worlds.get(p.world);
    if (!w) return;
    let text = sanitize(msg.text);
    if (!text) return;
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.slice(1).split(' ');
      if (cmd === 'join' && rest[0]) { this.joinWorld(p, rest[0]); return; }
      if (cmd === 'help') { this.notice(p, 'Commands: /join WORLDNAME'); return; }
      // ---- admin commands (@Admin only) ----
      if (this.isAdmin(p)) {
        if (cmd === 'find') {
          // open Item Finder dialog; auto-search if a query was given
          const q = rest.join(' ');
          this.send(p, { t: 'find_dialog', q });
          return;
        }
        if (cmd === 'weather' && rest[0]) {
          const kind = rest[0].toLowerCase();
          const valid = ['clear', 'cloudy', 'drizzle', 'rain', 'heavy', 'storm', 'fog', 'snow'];
          if (valid.includes(kind)) {
            w.weather = kind;
            this.broadcast(w, { t: 'weather', kind });
            this.notice(p, 'Weather set to ' + kind);
          } else {
            this.notice(p, 'Valid: ' + valid.join(', '));
          }
          return;
        }
        if (cmd === 'noclip') {
          p.noclip = !p.noclip;
          this.notice(p, 'Noclip ' + (p.noclip ? 'ON' : 'OFF'));
          this.send(p, { t: 'noclip', on: p.noclip });
          return;
        }
        if (cmd === 'clear') {
          let n = 0;
          for (let i = 0; i < w.fg.length; i++) {
            const id = w.fg[i];
            // clear everything except bedrock (7), white door (43), world lock (50)
            if (id !== 0 && id !== 7 && id !== 43 && id !== 50) {
              w.fg[i] = 0; n++;
            }
          }
          w.bg.fill(0);
          w.dirty = true;
          this.broadcast(w, { t: 'world', name: w.name, fg: Array.from(w.fg), bg: Array.from(w.bg),
            seeds: [], signs: [], drops: [...w.drops.values()], lock: w.lock, weather: w.weather,
            spawn: w.spawn, canEdit: true, players: [...w.players.values()].map(pl => ({ id: pl.id, name: pl.name, x: pl.x, y: pl.y, face: pl.face })) });
          this.notice(p, `World cleared (${n} tiles removed, bedrock kept)`);
          return;
        }
        if (cmd === 'admin') {
          this.notice(p, 'Admin commands: /find ITEM, /weather TYPE, /noclip, /clear');
          return;
        }
      }
      this.notice(p, 'Unknown command. Try /help'); return;
    }
    this.broadcast(w, { t: 'chat', from: p.name, id: p.id, text });
  }
  isAdmin(p) {
    return p.name === '@Admin';
  }
  // Item Finder: search items by name (admin only)
  onFindSearch(p, msg) {
    if (!this.isAdmin(p)) return;
    const q = String(msg.q || '').trim().toLowerCase();
    const items = [];
    for (const [id, it] of Object.entries(ITEMS)) {
      if (!q || it.name.toLowerCase().includes(q)) {
        items.push({ id: Number(id), name: it.name });
        if (items.length >= 60) break;
      }
    }
    this.send(p, { t: 'find_results', items });
  }
  // Item Finder: claim selected items into inventory (admin only)
  onFindClaim(p, msg) {
    if (!this.isAdmin(p)) return;
    const ids = Array.isArray(msg.ids) ? msg.ids : [];
    let added = 0;
    for (const rawId of ids.slice(0, 24)) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || !ITEMS[id]) continue;
      addItem(p.inv, id, 1);
      added++;
    }
    if (added) {
      store.saveInventory(p.id, p.inv);
      this.send(p, { t: 'inv', slots: p.inv, gems: p.gems });
      this.notice(p, `Claimed ${added} item${added > 1 ? 's' : ''}.`);
    }
  }

  // ----- appearance -----
  onSetLook(p, msg) {
    if (!validLook(msg.look)) return;
    p.look = { skin: msg.look.skin.toLowerCase(), hair: msg.look.hair.toLowerCase(), shirt: msg.look.shirt.toLowerCase(), pants: msg.look.pants.toLowerCase(), face: VALID_FACES.includes(msg.look.face) ? msg.look.face : 'classic' };
    store.savePlayer({ ...p, look: JSON.stringify(p.look), last_world: p.world || 'START' });
    const w = this.worlds.get(p.world);
    if (w) this.broadcast(w, { t: 'look', id: p.id, look: p.look });
  }

  // ----- wrench / player info -----
  onWrench(p, msg) {
    const w = this.worlds.get(p.world);
    if (!w) return;
    const target = this.players.get(msg.targetId);
    if (!target || target.world !== p.world) return;
    const isOwner = w.lock && w.lock.ownerId === p.id;
    const isSelf = target.id === p.id;
    this.send(p, {
      t: 'wrenchMenu',
      target: {
        id: target.id, name: target.name, world: target.world,
        gems: target.gems, isSelf,
      },
      isLockOwner: isOwner,
      targetHasAccess: !!(w.lock && w.lock.access.includes(target.id)),
    });
  }
  onGrantAccess(p, msg) {
    const w = this.worlds.get(p.world);
    if (!w || !w.lock || w.lock.ownerId !== p.id) { this.notice(p, 'Only the world owner can do that.'); return; }
    const target = this.players.get(msg.playerId);
    if (!target || target.world !== p.world) return;
    const has = w.lock.access.includes(target.id);
    if (msg.grant && !has) w.lock.access.push(target.id);
    if (!msg.grant && has && target.id !== w.lock.ownerId) w.lock.access = w.lock.access.filter((x) => x !== target.id);
    w.markDirty();
    this.broadcast(w, { t: 'lock', lock: { ownerName: w.lock.ownerName, access: [...w.lock.access] } });
    this.notice(p, `${target.name} ${msg.grant ? 'now has' : 'no longer has'} access.`);
    this.notice(target, msg.grant ? `${p.name} gave you access to ${w.name}.` : `${p.name} removed your access to ${w.name}.`);
  }

  // ----- trading (atomic, server-side) -----
  startTrade(a, bId) {
    const w = this.worlds.get(a.world);
    const b = this.players.get(bId);
    if (!b || b.world !== a.world || a.id === b.id) return;
    if (dist(a.x, a.y, b.x, b.y) > TRADE_RANGE) { this.notice(a, 'Get closer to trade.'); return; }
    if (this.trades.has(a.id) || this.trades.has(b.id)) { this.notice(a, 'One of you is already trading.'); return; }
    const trade = { a: a.id, b: b.id, offers: { [a.id]: {}, [b.id]: {} }, locked: {}, confirmed: {}, at: now() };
    this.trades.set(a.id, trade); this.trades.set(b.id, trade);
    this.send(b, { t: 'trade', state: 'invited', by: a.name, byId: a.id });
    this.notice(a, `Trade invite sent to ${b.name}.`);
  }
  tradeOf(p) { return this.trades.get(p.id) || null; }
  tradeState(trade) {
    const fmt = (id) => ({ offers: trade.offers[id], locked: !!trade.locked[id], confirmed: !!trade.confirmed[id] });
    return { t: 'trade', state: 'open', a: fmt(trade.a), b: fmt(trade.b), aId: trade.a, bId: trade.b };
  }
  syncTrade(trade) {
    for (const id of [trade.a, trade.b]) {
      const p = this.players.get(id);
      if (p) this.send(p, this.tradeState(trade));
    }
  }
  cancelTrade(p, reason = 'Trade cancelled.') {
    const trade = this.tradeOf(p);
    if (!trade) return;
    this.trades.delete(trade.a); this.trades.delete(trade.b);
    for (const id of [trade.a, trade.b]) {
      const q = this.players.get(id);
      if (q) { this.send(q, { t: 'trade', state: 'closed' }); if (reason && id !== p.id) this.notice(q, reason); }
    }
    if (reason && p) this.notice(p, reason);
  }
  onTradeMsg(p, msg) {
    const w = this.worlds.get(p.world);
    if (msg.act === 'invite') { this.startTrade(p, msg.targetId); return; }
    if (msg.act === 'accept') {
      const inviter = this.players.get(msg.fromId);
      if (!inviter) return;
      const trade = this.tradeOf(inviter);
      if (!trade || trade.b !== p.id) return;
      this.syncTrade(trade);
      return;
    }
    if (msg.act === 'decline') {
      const inviter = this.players.get(msg.fromId);
      if (inviter) this.notice(inviter, `${p.name} declined the trade.`);
      this.trades.delete(p.id);
      if (inviter) this.trades.delete(inviter.id);
      return;
    }
    const trade = this.tradeOf(p);
    if (!trade) return;
    const other = this.players.get(trade.a === p.id ? trade.b : trade.a);
    if (msg.act === 'cancel') { this.cancelTrade(p); return; }
    if (msg.act === 'add') {
      if (trade.locked[p.id]) return;
      const id = Math.floor(msg.item), count = clamp(Math.floor(msg.count) || 0, 0, MAX_STACK);
      const item = itemById(id);
      if (!item || item.undroppable) return;
      const offered = Object.entries(trade.offers[p.id]).reduce((n, [k, c]) => n + (Number(k) === id ? 0 : 0), 0);
      const already = trade.offers[p.id][id] || 0;
      const available = countOf(p.inv, id) - Object.entries(trade.offers[p.id]).reduce((n, [k, c]) => n + (Number(k) === id ? c : 0), 0) + already;
      void offered;
      const want = clamp(count, 0, available);
      if (want <= 0) delete trade.offers[p.id][id];
      else trade.offers[p.id][id] = want;
      trade.confirmed = {};
      this.syncTrade(trade);
      return;
    }
    if (msg.act === 'lock') {
      trade.locked[p.id] = !trade.locked[p.id];
      trade.confirmed = {};
      this.syncTrade(trade);
      return;
    }
    if (msg.act === 'confirm') {
      if (!trade.locked[p.id] || !other) return;
      // both must be locked
      if (!trade.locked[trade.a] || !trade.locked[trade.b]) { this.notice(p, 'Both players must lock their offers first.'); return; }
      trade.confirmed[p.id] = true;
      if (trade.confirmed[trade.a] && trade.confirmed[trade.b]) this.executeTrade(trade);
      else this.syncTrade(trade);
    }
  }
  executeTrade(trade) {
    const a = this.players.get(trade.a), b = this.players.get(trade.b);
    const w = a ? this.worlds.get(a.world) : null;
    let ok = !!a && !!b && !!w;
    // validate both sides still hold their offers and have room
    const entriesA = Object.entries(trade.offers[trade.a]).map(([k, c]) => [Number(k), c]);
    const entriesB = Object.entries(trade.offers[trade.b]).map(([k, c]) => [Number(k), c]);
    if (ok) {
      for (const [id, c] of entriesA) if (countOf(a.inv, id) < c) ok = false;
      for (const [id, c] of entriesB) if (countOf(b.inv, id) < c) ok = false;
      if (ok && !fitsAll(a.inv, entriesB)) ok = false;
      if (ok && !fitsAll(b.inv, entriesA)) ok = false;
    }
    this.trades.delete(trade.a); this.trades.delete(trade.b);
    if (!ok) {
      for (const pl of [a, b]) if (pl) { this.send(pl, { t: 'trade', state: 'closed' }); this.notice(pl, 'Trade failed: inventory changed.'); }
      return;
    }
    // atomic swap
    for (const [id, c] of entriesA) removeItem(a.inv, id, c);
    for (const [id, c] of entriesB) removeItem(b.inv, id, c);
    for (const [id, c] of entriesA) addItem(b.inv, id, c);
    for (const [id, c] of entriesB) addItem(a.inv, id, c);
    a.invDirty = b.invDirty = true;
    for (const pl of [a, b]) {
      this.send(pl, { t: 'inv', slots: pl.inv, gems: pl.gems });
      this.send(pl, { t: 'trade', state: 'done' });
      this.notice(pl, 'Trade complete!');
    }
    this.broadcast(w, { t: 'fx', kind: 'trade', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }

  // ----- message router -----
  onMessage(ws, raw) {
    const id = this.byWs.get(ws);
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'hello') { this.onHello(ws, msg); return; }
    if (msg.t === 'register') { this.onRegister(ws, msg); return; }
    const p = id ? this.players.get(id) : null;
    if (!p) return;
    switch (msg.t) {
      case 'hatid_claim': this.onClaimHatId(p, msg); break;
      case 'find_search': this.onFindSearch(p, msg); break;
      case 'find_claim': this.onFindClaim(p, msg); break;
      case 'move': {
        const m = msg;
        if (![m.x, m.y, m.vx, m.vy].every(Number.isFinite)) return;
        // speed sanity: reject speed hacks (teleports only via server actions)
        if (Math.abs(m.vx) > PHYS.maxRun * 1.6 || Math.abs(m.vy) > PHYS.maxFall * 1.6) return;
        if (Math.abs(m.x) > WORLD_W * TILE || Math.abs(m.y) > WORLD_H * TILE) return;
        p.x = clamp(m.x, 0, WORLD_W * TILE); p.y = clamp(m.y, 0, WORLD_H * TILE);
        p.vx = m.vx; p.vy = m.vy;
        p.face = m.face === -1 ? -1 : 1;
        p.anim = ['idle', 'run', 'jump', 'fall', 'punch'].includes(m.anim) ? m.anim : 'idle';
        break;
      }
      case 'punch': this.onPunch(p, msg); break;
      case 'place': this.onPlace(p, msg); break;
      case 'plant': this.onPlant(p, msg); break;
      case 'pickup': this.onPickup(p, msg); break;
      case 'dropItem': this.onDropItem(p, msg); break;
      case 'chat': this.onChat(p, msg); break;
      case 'signText': this.onSignText(p, msg); break;
      case 'setLook': this.onSetLook(p, msg); break;
      case 'joinWorld': this.joinWorld(p, msg.name); break;
      case 'leaveWorld': this.leaveWorld(p); break;
      case 'listWorlds': this.onListWorlds(p); break;
      case 'wrench': this.onWrench(p, msg); break;
      case 'grantAccess': this.onGrantAccess(p, msg); break;
      case 'trade': this.onTradeMsg(p, msg); break;
      case 'ping': this.send(p, { t: 'pong' }); break;
    }
  }

  // ----- tick -----
  tick(dtMs) {
    const t = now();
    const dt = dtMs / 1000;
    for (const w of this.worlds.values()) {
      if (w.players.size === 0 && !w.dirty) continue;
      // drops physics
      for (const [id, d] of w.drops) {
        if (!d.landed) {
          d.vy += 1500 * dt;
          d.x += d.vx * dt; d.y += d.vy * dt;
          const tx = Math.floor(d.x / TILE), ty = Math.floor((d.y + 6) / TILE);
          if (solidAtFg(w.fg, tx, ty) || ty >= WORLD_H - BEDROCK_ROWS + 0) {
            if (solidAtFg(w.fg, tx, ty)) { d.y = ty * TILE - 6; d.landed = true; d.vy = 0; d.vx = 0; }
          }
          if (d.y > WORLD_H * TILE) { w.drops.delete(id); this.broadcast(w, { t: 'dropGone', id }); continue; }
        }
        // magnet + collect
        let best = null, bd = PICKUP_MAGNET_R;
        for (const pid of w.players) {
          const pl = this.players.get(pid);
          if (!pl) continue;
          const dd = dist(pl.x, pl.y, d.x, d.y);
          if (dd < bd) { bd = dd; best = pl; }
        }
        if (best) {
          const ang = Math.atan2(best.y - d.y, best.x - d.x);
          d.x += Math.cos(ang) * 320 * dt; d.y += Math.sin(ang) * 320 * dt;
          d.landed = false;
          if (bd < PICKUP_COLLECT_R) {
            w.drops.delete(id);
            this.giveOrDrop(best, w, d.item, d.count, best.x, best.y);
            this.broadcast(w, { t: 'dropGone', id });
          }
        }
      }
      // hazard tiles (lava, spikes): respawn at world spawn
      for (const pid of w.players) {
        const pl = this.players.get(pid);
        if (!pl) continue;
        const tx = Math.floor(pl.x / TILE), ty = Math.floor((pl.y + 20) / TILE);
        if (!inBounds(tx, ty)) continue;
        const fid = w.fg[idx(tx, ty)];
        if (fid && itemById(fid)?.hazard) {
          pl.x = w.spawn.x; pl.y = w.spawn.y; pl.vx = pl.vy = 0;
          this.notice(pl, fid === 15 ? 'Burned by lava!' : 'Spiked!');
        }
      }
      // damage restore (researched: 5s idle) — broadcast cleared cracks
      const cleared = [];
      for (const [i, e] of w.damage) {
        if (t - e.at > DAMAGE_RESTORE_S * 1000) { w.damage.delete(i); cleared.push(i); }
      }
      for (const i of cleared) {
        const tx = i % WORLD_W, ty = Math.floor(i / WORLD_W);
        this.broadcast(w, { t: 'tile', tx, ty, fg: w.fg[i], bg: w.bg[i], seed: null, dmg: 0 });
      }
      // weather cycle
      if (t > w.weather.until) {
        // weather cycle: weighted random preset (see WEATHER_KINDS)
        const kind = rollWeatherKind();
        w.weather = { kind, until: t + (120 + Math.random() * 180) * 1000 };
        w.markDirty();
        this.broadcast(w, { t: 'weather', kind: w.weather.kind });
      }
    }
    // player position broadcast @10Hz
    if (t - this.lastPlayerBroadcast > 100) {
      this.lastPlayerBroadcast = t;
      for (const w of this.worlds.values()) {
        if (w.players.size === 0) continue;
        const list = this.playerList(w);
        for (const pid of w.players) {
          const p = this.players.get(pid);
          if (p) this.send(p, { t: 'players', players: list.filter((x) => x.id !== pid) });
        }
      }
    }
    // autosave
    if (t - this.lastAutosave > 30000) {
      this.lastAutosave = t;
      for (const w of this.worlds.values()) if (w.dirty) this.saveWorld(w);
      for (const p of this.players.values()) {
        if (p.invDirty) { store.saveInventory(p.id, p.inv); p.invDirty = false; }
      }
    }
  }
}
