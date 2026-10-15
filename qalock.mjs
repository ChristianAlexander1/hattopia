import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME = process.env.HOME + '/workspace/.chrome/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP = 9367;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, method = 'GET') { const r = await fetch(url, { method }); return r.json(); }
let msgId = 0; const pending = new Map();
function cdpSend(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 30000); });
}
async function ev(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.value; }
const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/qalock-'+Date.now().toString(36),'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await getJson(`http://127.0.0.1:${CDP}/json/list`); break; } catch { await sleep(200); } }
try {
  const t = await getJson(`http://127.0.0.1:${CDP}/json/new?about:blank`, 'PUT');
  const target = Array.isArray(t) ? t[0] : t;
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256*1024*1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } });
  await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
  await cdpSend(ws, 'Page.navigate', { url: 'http://localhost:8080/?v=locktest' });
  await sleep(3000);
  for (let i = 0; i < 30; i++) { const ok = await ev(ws, `!!(window.__game && window.__game.me && window.__game.me.id)`); if (ok) break; await sleep(1000); }
  // Give locks and place them
  await ev(ws, `window.__game.ui.h.onChat('/find diamond')`);
  await sleep(1000);
  const results = await ev(ws, `window.__game.findResults || 'no results var'`);
  console.log('find results type:', typeof results);
  // Claim diamond lock via direct WS
  await ev(ws, `
    window.__game.net.send({ t: 'find_claim', ids: [50, 51, 143, 144] });
    'claimed'
  `);
  await sleep(1000);
  const inv = await ev(ws, `JSON.stringify(window.__game.ui.invSlots?.slice(0,5) || [])`);
  console.log('inv sample:', inv.substring(0, 200));
  // Check sprites load
  const sprites = await ev(ws, `
    const { imgs } = await import('./js/assets.mjs').catch(() => ({}));
    'check via window'
  `);
  // Take screenshot of inventory with new items
  await ev(ws, `window.__game.ui.h.onChat('/find lock')`);
  await sleep(1500);
  const shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  await import('node:fs').then(fs => fs.writeFileSync('/tmp/lock_test.png', buf));
  console.log('screenshot saved');
} finally { chrome.kill(); }
console.log('done');
