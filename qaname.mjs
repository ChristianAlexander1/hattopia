import { spawn } from 'node:child_process';
const CHROME = process.env.HOME + '/workspace/.chrome/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP = 9356;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, method = 'GET') { const r = await fetch(url, { method }); return r.json(); }
let msgId = 0; const pending = new Map();
import WebSocket from 'ws';
function cdpSend(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('x')); } }, 20000); });
}
async function ev(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'EVAL_EXC:'+JSON.stringify(r.exceptionDetails).slice(0,200); return r.result.value; }
const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/qaname-'+Date.now().toString(36),'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await getJson(`http://127.0.0.1:${CDP}/json/list`); break; } catch { await sleep(200); } }
try {
  const t = await getJson(`http://127.0.0.1:${CDP}/json/new?about:blank`, 'PUT');
  const target = Array.isArray(t) ? t[0] : t;
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256*1024*1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const errs = [];
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errs.push('EXC:'+JSON.stringify(m.params.exceptionDetails).slice(0,250)); });
  await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable');
  // Simulate RETURNING user: pre-seed localStorage with a saved name
  await cdpSend(ws, 'Page.navigate', { url: 'http://localhost:8080/' });
  await sleep(2500);
  await ev(ws, `localStorage.setItem('sproutopia_name','RETURNING_USER')`);
  // Reload: boot now runs with savedName set (the exact condition that broke the user's phone)
  await cdpSend(ws, 'Page.navigate', { url: 'http://localhost:8080/' });
  await sleep(4000);
  const state = await ev(ws, `(() => {
    const g = window.__game;
    const cv = document.getElementById('game');
    const c = document.createElement('canvas'); c.width=4; c.height=4;
    const ctx = c.getContext('2d'); ctx.drawImage(cv,0,0,4,4);
    const d = ctx.getImageData(0,0,4,4).data;
    let a=0; for (let i=3;i<d.length;i+=4) a+=d[i];
    return JSON.stringify({ game: !!g, frameRunning: typeof requestAnimationFrame === 'function', canvasAlpha: (a/16).toFixed(0), guestNameField: document.getElementById('guest-name') ? document.getElementById('guest-name').value : 'MISSING' });
  })()`);
  console.log('state:', state);
  console.log('page errors:', errs.length ? errs : 'none');
} finally { chrome.kill(); }
console.log('done');
