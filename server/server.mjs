// HTTP static server + WebSocket host + game tick loop.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.mjs';
import { store, db } from './db.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(dir, '..', 'client');
const SHARED = path.join(dir, '..', 'shared');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/health') {
      let activeWorlds = 0;
      for (const w of game.worlds.values()) if (w.players.size) activeWorlds++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, uptime: Math.floor(process.uptime()), players: game.players.size, worlds: activeWorlds }));
      return;
    }
    if (urlPath === '/') urlPath = '/index.html';
    // /shared/* is served from the repo-root shared dir (imported by client modules)
    const base = urlPath.startsWith('/shared/') ? SHARED : CLIENT;
    const rel = urlPath.startsWith('/shared/') ? urlPath.slice('/shared/'.length) : urlPath;
    const file = path.normalize(path.join(base, rel));
    if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { res.writeHead(500); res.end('error'); }
});

const game = new Game((p, msg) => {
  if (p.ws && p.ws.readyState === 1) {
    try { p.ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
  }
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try { game.onMessage(ws, raw.toString()); }
    catch (e) { console.error('msg error:', e.message); }
  });
  ws.on('close', () => { try { game.onClose(ws); } catch (e) { console.error(e.message); } });
  ws.on('error', () => {});
});

// 20 Hz game tick
let last = Date.now();
setInterval(() => {
  const t = Date.now();
  try { game.tick(t - last); } catch (e) { console.error('tick error:', e.message); }
  last = t;
}, 50);

server.listen(PORT, HOST, () => {
  console.log(`Sproutopia server listening on http://${HOST}:${PORT}`);
});

// Graceful shutdown: persist everything, close the database, then exit.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}: saving and shutting down...`);
  try {
    for (const w of game.worlds.values()) if (w.dirty) game.saveWorld(w);
    for (const p of game.players.values()) {
      store.savePlayer({ ...p, look: JSON.stringify(p.look), last_world: p.world || 'START' });
      store.saveInventory(p.id, p.inv);
    }
  } catch (e) { console.error('shutdown save error:', e.message); }
  try { db.close(); } catch { /* already closed */ }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { game };
