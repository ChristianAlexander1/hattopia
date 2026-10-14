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

// Surface unexpected client errors visibly (instead of a silent blank canvas).
window.addEventListener('error', (e) => {
  const msg = (e.message || 'unknown error').slice(0, 120);
  const el = document.getElementById('err-toast');
  if (el) { el.textContent = 'Error: ' + msg; el.classList.remove('hidden'); }
  console.error('[client]', e.message, e.filename, e.lineno);
});

const canvas = document.getElementById('game');
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const me = { id: '', name: '', body: makeBody(0, 0), look: { skin: 'e3ac72', hair: '', shirt: '', pants: '2f3a5c', face: 'classic' }, gems: 0 };
const world = {
  name: 'START', fg: new Uint16Array(WORLD_W * WORLD_H), bg: new Uint16Array(WORLD_W * WORLD_H),
  seeds: new Map(), damage: new Map(), drops: new Map(), players: new Map(),
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
const ui = new UI({
  onPlay: (name) => { sfx.unlock(); me.name = name; net.connect(name); },
  onHatIdLogin: (name, password) => { sfx.unlock(); me.name = name; net.connect(name, password); },
  onRegister: (name, password) => { sfx.unlock(); me.name = name; net.register(name, password); },
  onClaimHatId: (password) => net.claimHatId(password),
  onChat: (text) => net.send({ t: 'chat', text }),
  onSelect: (i) => {},
  onDropItem: (id, count) => net.send({ t: 'dropItem', item: id, count }),
  onJoinWorld: (name) => net.send({ t: 'joinWorld', name }),
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
      if (m.id !== me.id) sfx.chat();
      break;
    case 'notice': ui.notice(m.text); break;
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
function punchFaced() {
  const ptx = Math.floor(me.body.x / TILE);
  const pty = Math.floor((me.body.y - 24) / TILE);
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
  onTapPlayer: (pid) => net.send({ t: 'wrench', targetId: pid }),
  onPunchKey: () => punchFaced(),
  onJumpPress: () => { me.body.jumpBuf = 0.12; sfx.jump(); },
  onHotbar: (i) => ui.select(i),
  onToggleInv: () => document.getElementById('btn-inv').click(),
  onEscape: () => document.querySelectorAll('.panel,.dlg').forEach((e) => e.classList.add('hidden')),
});
input.screenToWorld = (sx, sy) => renderer.screenToWorld(sx, sy);
input.tapPlayerAt = (wx, wy) => {
  for (const [id, pl] of world.players) {
    if (Math.abs(pl.x - wx) < 34 && Math.abs(pl.y - 22 - wy) < 44) return id;
  }
  // tapping yourself wrenches yourself (player info)
  if (me.id && Math.abs(me.body.x - wx) < 34 && Math.abs(me.body.y - 22 - wy) < 44) return me.id;
  return null;
};

// ---------- renderer ----------
const renderer = new Renderer(canvas);
const vfx = new VFX();
// quality from localStorage (default medium for mobile)
vfx.setQuality(localStorage.getItem('sproutopia_quality') || 'medium');

// ---------- main loop ----------
let last = performance.now(), moveAcc = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  let dt = (nowMs - last) / 1000; last = nowMs;
  if (dt > 0.1) dt = 0.1;

  if (me.id && world.name) {
    stepBody(me.body, input, solid, dt);
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
      if (Math.hypot(me.body.x - d.x, me.body.y - 22 - d.y) < 56) {
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
    renderer.draw({ world, me: { id: me.id, name: me.name, x: me.body.x, y: me.body.y, face: me.body.face, anim: me.body.anim, punchT: me.body.punchT, look: me.look }, players: world.players, target: showTarget, vfx }, nowMs);
  }
}

// ---------- boot ----------
(async () => {
  // Asset loading must NEVER kill the render loop: a single failed image
  // used to reject the whole boot, leaving a blank canvas with working UI.
  try { await loadAssets(); } catch (e) { console.warn('loadAssets failed', e); }
  try { await loadVfx(); } catch (e) { console.warn('loadVfx failed', e); }
  const savedName = localStorage.getItem('sproutopia_name');
  if (savedName) document.getElementById('name-input').value = savedName;
  renderer.draw({ world, me: { id: '', x: 1600, y: 700, face: 1, anim: 'idle', punchT: 0, look: me.look }, players: new Map(), target: null }, performance.now());
  // debug/testing handle (harmless in production)
  window.__game = { net, me, world, ui, input, renderer, vfx };
  requestAnimationFrame(frame);
})();
