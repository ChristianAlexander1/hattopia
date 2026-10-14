// SQLite persistence via node:sqlite (built into Node 22+). No native deps.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Tests set SPROUT OPIA_DB to a temp file (see tests/setup.mjs) so the
// production database is never touched by the test suite.
const dbPath = process.env.SPROUTOPIA_DB || path.join(dataDir, 'game.db');
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  look TEXT NOT NULL DEFAULT '{}',
  gems INTEGER NOT NULL DEFAULT 0,
  last_world TEXT NOT NULL DEFAULT 'START',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
  player_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (player_id, slot),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS worlds (
  name TEXT PRIMARY KEY,
  fg BLOB NOT NULL,
  bg BLOB NOT NULL,
  seeds TEXT NOT NULL DEFAULT '[]',
  lock TEXT,
  weather TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`);
try { db.exec('ALTER TABLE worlds ADD COLUMN spawn TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE worlds ADD COLUMN signs TEXT'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE players ADD COLUMN password_hash TEXT'); } catch { /* already exists */ }

const q = {
  getPlayerByToken: db.prepare('SELECT * FROM players WHERE token = ?'),
  getPlayerByName: db.prepare('SELECT * FROM players WHERE name = ? COLLATE NOCASE'),
  insertPlayer: db.prepare(`INSERT INTO players (id,name,token,look,gems,last_world,password_hash,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`),
  updatePlayer: db.prepare(`UPDATE players SET look=?,gems=?,last_world=?,updated_at=? WHERE id=?`),
  setPasswordHash: db.prepare(`UPDATE players SET password_hash=? WHERE id=?`),
  getPasswordHash: db.prepare(`SELECT password_hash FROM players WHERE id=?`),
  getInv: db.prepare('SELECT slot,item_id,count FROM inventory WHERE player_id=? ORDER BY slot'),
  clearInv: db.prepare('DELETE FROM inventory WHERE player_id=?'),
  setInvSlot: db.prepare('INSERT OR REPLACE INTO inventory (player_id,slot,item_id,count) VALUES (?,?,?,?)'),
  getWorld: db.prepare('SELECT * FROM worlds WHERE name=?'),
  upsertWorld: db.prepare(`INSERT INTO worlds (name,fg,bg,seeds,lock,weather,spawn,signs,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET fg=excluded.fg,bg=excluded.bg,seeds=excluded.seeds,
      lock=excluded.lock,weather=excluded.weather,spawn=excluded.spawn,signs=excluded.signs,updated_at=excluded.updated_at`),
  listWorlds: db.prepare('SELECT name FROM worlds ORDER BY updated_at DESC LIMIT 50'),
  listWorldMeta: db.prepare('SELECT name, lock FROM worlds ORDER BY updated_at DESC LIMIT 50'),
};

export const store = {
  getPlayerByToken: (t) => q.getPlayerByToken.get(t) || null,
  getPlayerByName: (n) => q.getPlayerByName.get(n) || null,
  createPlayer(p) { q.insertPlayer.run(p.id, p.name, p.token, p.look, p.gems, p.last_world, p.password_hash || null, p.created_at, p.updated_at); },
  savePlayer(p) { q.updatePlayer.run(p.look, p.gems, p.last_world, Date.now(), p.id); },
  setPasswordHash: (id, hash) => q.setPasswordHash.run(hash, id),
  getPasswordHash: (id) => { const r = q.getPasswordHash.get(id); return r ? r.password_hash : null; },
  getInventory: (pid) => q.getInv.all(pid),
  saveInventory(pid, slots) {
    q.clearInv.run(pid);
    slots.forEach((s, i) => { if (s) q.setInvSlot.run(pid, i, s.id, s.count); });
  },
  getWorld: (name) => q.getWorld.get(name) || null,
  saveWorld(w) {
    q.upsertWorld.run(w.name, w.fgBlob, w.bgBlob, w.seedsJson, w.lockJson, w.weatherJson, w.spawnJson, w.signsJson || '[]', w.created_at, Date.now());
  },
  listWorlds: () => q.listWorlds.all().map((r) => r.name),
  listWorldMeta: () => q.listWorldMeta.all(),
};
