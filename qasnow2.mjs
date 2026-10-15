import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME = process.env.HOME + '/workspace/.chrome/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP = 9365;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, method = 'GET') { const r = await fetch(url, { method }); return r.json(); }
let msgId = 0; const pending = new Map();
function cdpSend(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 30000); });
}
async function ev(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.value; }
const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/qasnow2-'+Date.now().toString(36),'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await getJson(`http://127.0.0.1:${CDP}/json/list`); break; } catch { await sleep(200); } }
try {
  const t = await getJson(`http://127.0.0.1:${CDP}/json/new?about:blank`, 'PUT');
  const target = Array.isArray(t) ? t[0] : t;
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256*1024*1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } });
  await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdpSend(ws, 'Page.navigate', { url: 'http://localhost:8080/?v=snowtest2' });
  await sleep(3000);
  for (let i = 0; i < 30; i++) { const ok = await ev(ws, `!!(window.__game && window.__game.me && window.__game.me.id)`); if (ok) break; await sleep(1000); }
  // join a world with dirt/grass (not bedrock surface)
  await ev(ws, `window.__game.ui.h.onChat('/join SNOWTEST')`);
  await sleep(3000);
  await ev(ws, `window.__game.ui.h.onChat('/weather snow')`);
  await sleep(8000); // wait for transition
  const wv = await ev(ws, `window.__game.vfx.cur.snow`);
  console.log('snow intensity:', wv);
  const shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  await import('node:fs').then(fs => fs.writeFileSync('/tmp/snow_new2.png', buf));
  console.log('screenshot saved');
} finally { chrome.kill(); }
console.log('done');
