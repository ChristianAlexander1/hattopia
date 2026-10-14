// Main: wires net, input, physics, renderer, UI into the game loop.
import { TILE, WORLD_W, WORLD_H, PUNCH_COOLDOWN, PUNCH_RANGE } from '../../shared/constants.mjs';
import { itemById, isSeed } from '../../shared/items.mjs';
import { Net } from './net.mjs';
import { loadAssets } from './assets.mjs';
import { Input } from './input.mjs';
import { makeBody, stepBody } from './physics.mjs';
import { Renderer } from './render.mjs';
import { UI } from './ui.mjs';
import { sfx } from './audio.mjs';
import { VFX, loadVfx } from './vfx.mjs';
import { storage } from './storage.mjs';

// Surface unexpected client errors visibly (instead of a silent blank canvas).
// Also POST full details to the server so the real error is in the server log.
function reportClientError(msg, file, line, col, stack) {
  // Ignore errors from browser extensions/injected scripts (e.g. Brave wallet).
  // Only report errors from our own game files.
  const src = String(file || '') + String(stack || '');
  const m = String(msg || '');
  if (src.includes('ethereum') || src.includes('chrome-extension://') || src.includes('moz-extension://')) return;
  // "Script error." with no file/line/stack is always from an external/injected
  // script (browsers sanitize those); our own errors always have location info.
  if (m === 'Script error.' && !file && !line && !stack) return;
  if (!src.includes('pinggy.net') && !src.includes('localhost') && src) return;
  const el = document.getElementById('err-toast');
  if (el) { el.textContent = 'Error: ' + String(msg).slice(0, 120); el.classList.remove('hidden'); }
  try {
    fetch('/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg: String(msg).slice(0, 300), file, line, col, stack: String(stack || '').slice(0, 800), ua: navigator.userAgent.slice(0, 120) }),
    }).catch(() => {});
  } catch {}
  console.error('[client]', msg, file, line, col);
}
window.addEventListener('error', (e) => {
  reportClientError(e.message || 'unknown error', e.filename, e.lineno, e.colno, e.error && e.error.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  reportClientError('unhandled: ' + (r && r.message || r), '', 0, 0, r && r.stack);
});

const canvas = document.getElementById('game');
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const me = { id: '', name: '', body: makeBody(0, 0), look: { skin: 'e3ac72', hair: '', shirt: '', pants: '2f3a5c', face: 'classic' }, gems: 0 };
const world = {
  name: 'START', fg: new Uint16Array(WORLD_W * WORLD_H), bg: new Uint16Array(WORLD_W * WORLD_H),
  seeds: new Map(), damage: new Map(), drops: new Map(), players: new Map(),
  bubbles: new Map(),
  weather: 'clear', lock: null, spawn: { x: 0, y: 0 }, canEdit: true,
};
const target = { tx: -1, ty: -1, at: 0 };
let lastPunchSend = 0;
const pickupSent = new Set();

function solid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return true;
  const id = world.fg[ty * WORLD_W + tx];
  if (!id) return false;
  return itemById(id)?.collision === 'solid';
}

// ---------- UI handlers ----------
// AUTO_PLAY: skip title/login screens and go straight into the game.
// The login UI is ARCHIVED (see docs/LOGIN_ARCHIVE.md), not deleted.
// Set to false to restore the title + login flow.
const AUTO_PLAY = false;
function autoPlay() {
  if (!AUTO_PLAY) return;
  // hide login UI (kept intact in the DOM for later restore)
  for (const id of ['login', 'login-form']) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }
  // pick a name: saved name, or a random guest name
  let name = storage.get('sproutopia_name');
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name || '')) {
    name = 'Guest' + Math.floor(1000 + Math.random() * 9000);
  }
  sfx.unlock();
  me.name = name;
  net.connect(name);
}
const ui = new UI({
  onPlay: (name) => { sfx.unlock(); me.name = name; net.connect(name); },
  onHatIdLogin: (name, password) => { sfx.unlock(); me.name = name; net.connect(name, password); },
  onRegister: (name, password) => { sfx.unlock(); me.name = name; net.register(name, password); },
  onClaimHatId: (password) => net.claimHatId(password),
  onChat: (text) => net.send({ t: 'chat', text }),
  onSelect: (i) => {},
  onDropItem: (id, count) => net.send({ t: 'dropItem', item: id, count }),
  onJoinWorld: (name) => net.send({ t: 'joinWorld', name }),
  onRespawn: () => { me.body.x = world.spawn.x; me.body.y = world.spawn.y; me.body.vx = me.body.vy = 0; renderer.snapCamera(me.body.x, me.body.y); },
  onLogout: () => location.reload(),
  getLook: () => me.look,
  onSetLook: (look) => { me.look = look; net.send({ t: 'setLook', look }); },
  onTradeInvite: (pid) => net.send({ t: 'trade', act: 'invite', targetId: pid }),
  onGrantAccess: (pid, grant) => net.send({ t: 'grantAccess', playerId: pid, grant }),
  onTrade: (act, data) => net.send({ t: 'trade', act, ...data }),
  onSignText: (tx, ty, text) => net.send({ t: 'signText', tx, ty, text }),
  onListWorlds: () => net.send({ t: 'listWorlds' }),
});

// ---------- net ----------
const net = new Net(onNetMessage, (ok) => ui.setConn(ok));

function onNetMessage(m) {
  switch (m.t) {
    case 'welcome':
      me.id = m.id; me.look = m.look; me.gems = m.gems;
      ui.showGame(); ui.onInv([], m.gems);
      break;
    case 'error': ui.loginError(m.text); sfx.error(); break;
    case 'world': {
      world.name = m.name;
      ui.worldName = m.name; ui.playerName = me.name;
      world.bubbles = new Map();
      world.fg = Uint16Array.from(m.fg); world.bg = Uint16Array.from(m.bg);
      world.seeds = new Map(m.seeds.map((s) => [s.y * WORLD_W + s.x, { seed: s.seed, plantedAt: s.plantedAt }]));
      world.signs = new Map((m.signs || []).map((s) => [s.y * WORLD_W + s.x, s.text]));
      world.damage = new Map(); world.drops = new Map(m.drops.map((d) => [d.id, d]));
      world.players = new Map();
      world.lock = m.lock; world.weather = m.weather; world.spawn = m.spawn; world.canEdit = m.canEdit;
      me.body.x = m.spawn.x; me.body.y = m.spawn.y; me.body.vx = me.body.vy = 0;
      for (const pl of m.players) if (pl.id !== me.id) world.players.set(pl.id, { ...pl, sx: pl.x, sy: pl.y });
      renderer.snapCamera(me.body.x, me.body.y);
      renderer.signShown = new Map(); // reset sign label hysteresis
      ui.setWorld(m.name); ui.setWeather(m.weather); ui.setPlayers(world.players.size + 1);
      target.tx = -1;
      break;
    }
    case 'tile': {
      const i = m.ty * WORLD_W + m.tx;
      const oldFg = world.fg[i];
      world.fg[i] = m.fg; world.bg[i] = m.bg;
      if (m.seed) world.seeds.set(i, { seed: m.seed.seed, plantedAt: m.seed.plantedAt });
      else world.seeds.delete(i);
      // sign text bookkeeping (only touch on real fg change or explicit sign payload)
      if (m.fg !== oldFg) {
        if (m.fg === 9) world.signs.set(i, m.sign ?? '');
        else world.signs.delete(i);
      } else if (m.fg === 9 && m.sign !== undefined) world.signs.set(i, m.sign);
      if (m.dmg > 0) world.damage.set(i, { dmg: m.dmg });
      else world.damage.delete(i);
      if (oldFg && !m.fg) sfx.break_();
      else if (!oldFg && m.fg) sfx.place();
      else if (m.seed) sfx.place();
      else sfx.punch();
      break;
    }
    case 'sign': {
      const i = m.ty * WORLD_W + m.tx;
      if (world.fg[i] === 9) world.signs.set(i, m.text);
      break;
    }
    case 'worlds':
      ui.renderWorldList(m.worlds, m.current);
      break;
    case 'players': {
      const seen = new Set();
      for (const pl of m.players) {
        seen.add(pl.id);
        const e = world.players.get(pl.id);
        if (e) Object.assign(e, pl);
        else world.players.set(pl.id, { ...pl, sx: pl.x, sy: pl.y });
      }
      for (const id of [...world.players.keys()]) if (!seen.has(id)) world.players.delete(id);
      ui.setPlayers(world.players.size + 1);
      break;
    }
    case 'join': {
      const pl = m.player;
      if (pl.id !== me.id && !world.players.has(pl.id)) {
        world.players.set(pl.id, { ...pl, sx: pl.x, sy: pl.y });
        ui.addChat('', `${pl.name} entered the world.`, true);
        ui.setPlayers(world.players.size + 1);
      }
      break;
    }
    case 'leave':
      if (world.players.delete(m.id)) { ui.setPlayers(world.players.size + 1); }
      break;
    case 'look': { const pl = world.players.get(m.id); if (pl) pl.look = m.look; break; }
    case 'inv': ui.onInv(m.slots, m.gems); me.gems = m.gems; break;
    case 'gems': me.gems = m.gems; ui.setGems(m.gems); break;
    case 'chat':
      ui.addChat(m.from, m.text);
      // chat bubble above the sender's head (5 seconds)
      world.bubbles.set(m.id, { text: m.text, until: performance.now() + 5000 });
      if (m.id !== me.id) sfx.chat();
      break;
    case 'notice': ui.notice(m.text); break;
    case 'noclip': me.noclip = m.on; me.body.noclip = m.on; ui.notice('Noclip ' + (m.on ? 'ON — fly through blocks' : 'OFF')); break;
    case 'openWorlds': ui.openWorldBrowser(); break;
    case 'dropSpawn': world.drops.set(m.id, { id: m.id, item: m.item, count: m.count, x: m.x, y: m.y }); break;
    case 'dropGone': world.drops.delete(m.id); pickupSent.delete(m.id); sfx.pickup(); break;
    case 'weather': world.weather = m.kind; ui.setWeather(m.kind); {
      const msgs = { clear: '☀ The sky clears.', cloudy: '☁ Clouds gather.', drizzle: '🌦 Drizzle begins.',
        rain: '🌧 Rain rolls in…', heavy: '🌧 Heavy rain!', storm: '⛈ Storm approaching!', fog: '🌫 Fog rolls in.', snow: '❄ Snow begins to fall.' };
      ui.notice(msgs[m.kind] || msgs.clear);
      break;
    }
    case 'lock':
      world.lock = m.lock;
      ui.notice(m.lock ? `🔒 ${m.lock.ownerName} owns this world.` : '🔓 World is unlocked.');
      break;
    case 'fx':
      renderer.fx(m.kind, m.x, m.y);
      if (m.kind === 'harvest') sfx.harvest();
      else if (m.kind === 'splice') sfx.splice();
      else if (m.kind === 'door') sfx.door();
      else if (m.kind === 'trade') sfx.trade();
      else if (m.kind === 'punch') vfx.spawnPunchCloud(m.x, m.y, m.face || 1);
      break;
    case 'wrenchMenu': ui.showWrenchMenu(m); break;
    case 'trade': ui.onTradeMsg(m, me.id, me.name); break;
  }
}

// ---------- input ----------
function doPunchAt(tx, ty) {
  const nowMs = performance.now();
  if (nowMs - lastPunchSend < PUNCH_COOLDOWN * 1000) return;
  if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return;
  const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
  if (Math.hypot(me.body.x - cx, me.body.y - cy) > PUNCH_RANGE) {
    ui.notice('Too far to reach!');
    return;
  }
  lastPunchSend = nowMs;
  me.body.punchT = PUNCH_COOLDOWN;
  me.body.face = (tx * TILE + TILE / 2) >= me.body.x ? 1 : -1;
  target.tx = tx; target.ty = ty; target.at = nowMs;
  // local impact cloud (cosmetic): only when actually hitting something
  // breakable — the server rebroadcasts to other players, excluding us.
  const hitId = world.fg[ty * WORLD_W + tx];
  const hitIt = itemById(hitId);
  if ((hitIt && isFinite(hitIt.hardness)) || world.seeds.get(ty * WORLD_W + tx)) {
    vfx.spawnPunchCloud(cx, cy, me.body.face);
  }
  net.send({ t: 'punch', tx, ty });
  sfx.punch();
}
// Punch button: reach out in the facing direction — hits the first block
// within range, not just the adjacent tile (long-range punch).
// If the player is standing on a white door (id 43), punch opens the
// world browser instead (exit door).
function punchFaced() {
  // check if player overlaps a white door tile (feet or head)
  const ptx = Math.floor(me.body.x / TILE);
  const feetTy = Math.floor(me.body.y / TILE);
  const headTy = Math.floor((me.body.y - 30) / TILE);
  for (const ty of [feetTy, headTy]) {
    if (ty >= 0 && ty < WORLD_H && world.fg[ty * WORLD_W + ptx] === 43) {
      ui.openWorldBrowser();
      sfx.punch();
      return;
    }
  }
  const pty = Math.floor((me.body.y - 15) / TILE);
  const maxD = Math.floor(PUNCH_RANGE / TILE);
  let tx = ptx + me.body.face, ty = pty;
  for (let d = 1; d <= maxD; d++) {
    const x = ptx + me.body.face * d;
    if (x < 0 || x >= WORLD_W) break;
    if (world.fg[pty * WORLD_W + x]) { tx = x; ty = pty; break; }
    tx = x; ty = pty;
  }
  doPunchAt(tx, ty);
}
function tapTile(tx, ty) {
  const sel = ui.selectedItem();
  if (sel) {
    const it = itemById(sel.id);
    if (it && (it.kind === 'block' || it.kind === 'bg' || it.kind === 'lock' || it.kind === 'deco')) {
      target.tx = tx; target.ty = ty; target.at = performance.now();
      net.send({ t: 'place', tx, ty, item: sel.id });
      return;
    }
    if (it && isSeed(sel.id)) {
      target.tx = tx; target.ty = ty; target.at = performance.now();
      net.send({ t: 'plant', tx, ty, seed: sel.id });
      return;
    }
  }
  // Tapping a sign with empty hand opens the editor (use the punch button to break it)
  if (!sel && tx >= 0 && ty >= 0 && tx < WORLD_W && ty < WORLD_H && world.fg[ty * WORLD_W + tx] === 9) {
    ui.showSignEditor(tx, ty, world.signs.get(ty * WORLD_W + tx) || '');
    return;
  }
  doPunchAt(tx, ty);
}

const input = new Input(canvas, {
  onTap: (tx, ty) => tapTile(tx, ty),
  // Wrench dialog only when the wrench (id 80) is the selected hotbar item.
  // Otherwise a tap on a player just punches the tile (no accidental dialogs).
  // Returns true if the tap was handled (so input.mjs doesn't also punch).
  onTapPlayer: (pid) => {
    const sel = ui.selectedItem();
    if (sel && sel.id === 80) {
      net.send({ t: 'wrench', targetId: pid });
      return true;
    }
    return false;
  },
  onPunchKey: () => punchFaced(),
  onJumpPress: () => { me.body.jumpBuf = 0.12; sfx.jump(); },
  onHotbar: (i) => ui.select(i),
  onToggleInv: () => document.getElementById('btn-inv').click(),
  onEscape: () => document.querySelectorAll('.panel,.dlg').forEach((e) => e.classList.add('hidden')),
});
input.screenToWorld = (sx, sy) => renderer.screenToWorld(sx, sy);
input.tapPlayerAt = (wx, wy) => {
  for (const [id, pl] of world.players) {
    if (Math.abs(pl.x - wx) < 28 && Math.abs(pl.y - 15 - wy) < 30) return id;
  }
  // tapping yourself wrenches yourself (player info)
  if (me.id && Math.abs(me.body.x - wx) < 28 && Math.abs(me.body.y - 15 - wy) < 30) return me.id;
  return null;
};

// ---------- renderer ----------
const renderer = new Renderer(canvas);
const vfx = new VFX();
// quality from localStorage (default medium for mobile)
vfx.setQuality(storage.get('sproutopia_quality') || 'medium');

// ---------- main loop ----------
let last = performance.now(), moveAcc = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  let dt = (nowMs - last) / 1000; last = nowMs;
  if (dt > 0.1) dt = 0.1;

  if (me.id && world.name) {
    // noclip: bypass all tile collision (admin)
    const solidFn = me.noclip ? () => false : solid;
    stepBody(me.body, input, solidFn, dt);
    // keep inside world
    me.body.x = Math.max(12, Math.min(WORLD_W * TILE - 12, me.body.x));

    moveAcc += dt;
    if (moveAcc > 1 / 15) {
      moveAcc = 0;
      net.send({ t: 'move', x: Math.round(me.body.x), y: Math.round(me.body.y), vx: Math.round(me.body.vx), vy: Math.round(me.body.vy), face: me.body.face, anim: me.body.anim });
    }
    // drop pickup
    for (const d of world.drops.values()) {
      if (pickupSent.has(d.id)) continue;
      if (Math.hypot(me.body.x - d.x, me.body.y - 15 - d.y) < 56) {
        pickupSent.add(d.id);
        net.send({ t: 'pickup', id: d.id });
      }
    }
    // smooth remote players
    for (const pl of world.players.values()) {
      pl.sx += (pl.x - pl.sx) * 0.25; pl.sy += (pl.y - pl.sy) * 0.25;
      pl.x = pl.sx; pl.y = pl.sy;
    }
    // target highlight fade
    const showTarget = performance.now() - target.at < 1200 ? { tx: target.tx, ty: target.ty } : null;
    renderer.updateCamera(me.body.x, me.body.y);
    // vfx update (weather from server)
    vfx.setWeather(world.weather || 'clear');
    vfx.update(dt, renderer.w, renderer.h, renderer.cam.x, renderer.cam.y, world, renderer.scale);
    try {
      renderer.draw({ world, me: { id: me.id, name: me.name, x: me.body.x, y: me.body.y, face: me.body.face, anim: me.body.anim, punchT: me.body.punchT, look: me.look, noclip: me.noclip }, players: world.players, target: showTarget, vfx }, nowMs);
    } catch (e) {
      // Report render errors (throttled): a broken frame must never be silent.
      if (!frame._errAt || performance.now() - frame._errAt > 10000) {
        frame._errAt = performance.now();
        reportClientError('render: ' + (e && e.message), '', 0, 0, e && e.stack);
      }
    }
  }
}

// ---------- boot ----------
// The render loop MUST start no matter what: any boot error is caught and
// reported, but never prevents the game from running.
(async () => {
  try {
    // Asset loading must NEVER kill the render loop: a single failed image
    // used to reject the whole boot, leaving a blank canvas with working UI.
    try { await loadAssets(); } catch (e) { console.warn('loadAssets failed', e); }
    try { await loadVfx(); } catch (e) { console.warn('loadVfx failed', e); }
    const savedName = storage.get('sproutopia_name');
    if (savedName) {
      const el = document.getElementById('guest-name');
      if (el) el.value = savedName;
    }
    renderer.draw({ world, me: { id: '', x: 1600, y: 700, face: 1, anim: 'idle', punchT: 0, look: me.look }, players: new Map(), target: null }, performance.now());
  } catch (e) {
    reportClientError('boot: ' + (e && e.message), '', 0, 0, e && e.stack);
  }
  // debug/testing handle (harmless in production)
  window.__game = { net, me, world, ui, input, renderer, vfx };
  requestAnimationFrame(frame);
  // archived login bypass: go straight into the game
  autoPlay();
})();
