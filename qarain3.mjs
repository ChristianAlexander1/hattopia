import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME = process.env.HOME + '/workspace/.chrome/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP = 9363;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, method = 'GET') { const r = await fetch(url, { method }); return r.json(); }
let msgId = 0; const pending = new Map();
function cdpSend(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 30000); });
}
async function ev(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.value; }
const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/qarain3-'+Date.now().toString(36),'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await getJson(`http://127.0.0.1:${CDP}/json/list`); break; } catch { await sleep(200); } }
try {
  const t = await getJson(`http://127.0.0.1:${CDP}/json/new?about:blank`, 'PUT');
  const target = Array.isArray(t) ? t[0] : t;
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256*1024*1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } });
  await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdpSend(ws, 'Page.navigate', { url: 'http://localhost:8080/?v=jumptest' });
  await sleep(3000);
  // auto-play should be on (no login needed)
  for (let i = 0; i < 30; i++) { const ok = await ev(ws, `!!(window.__game && window.__game.me && window.__game.me.id)`); if (ok) break; await sleep(1000); }
  const name = await ev(ws, `window.__game?.me?.name || 'not connected'`);
  console.log('connected as:', name);
  // set heavy weather
  await ev(ws, `window.__game.ui.h.onChat('/weather heavy')`);
  await sleep(5000);
  // jump: simulate jump key
  await ev(ws, `(() => { const g = window.__game; if (g.input) { g.input.jump = true; setTimeout(() => g.input.jump = false, 300); } return 'jump'; })()`);
  await sleep(800); // mid-jump
  let shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  let buf = Buffer.from(shot.data, 'base64');
  await import('node:fs').then(fs => fs.writeFileSync('/tmp/heavy_jump1.png', buf));
  console.log('jump screenshot 1 saved');
  await sleep(800);
  shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
  buf = Buffer.from(shot.data, 'base64');
  await import('node:fs').then(fs => fs.writeFileSync('/tmp/heavy_jump2.png', buf));
  console.log('jump screenshot 2 saved');
} finally { chrome.kill(); }
console.log('done');
