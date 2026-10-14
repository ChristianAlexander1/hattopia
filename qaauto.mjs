import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME = process.env.HOME + '/workspace/.chrome/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP = 9357;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, method = 'GET') { const r = await fetch(url, { method }); return r.json(); }
let msgId = 0; const pending = new Map(); const errs = [];
function cdpSend(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('x')); } }, 20000); });
}
async function ev(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'EVAL_EXC'; return r.result.value; }
const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/qaauto-'+Date.now().toString(36),'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await getJson(`http://127.0.0.1:${CDP}/json/list`); break; } catch { await sleep(200); } }
try {
  const t = await getJson(`http://127.0.0.1:${CDP}/json/new?about:blank`, 'PUT');
  const target = Array.isArray(t) ? t[0] : t;
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256*1024*1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errs.push('EXC:'+JSON.stringify(m.params.exceptionDetails).slice(0,200)); });
  await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Page.navigate', { url: 'http://localhost:8080/' });
  // wait for auto-play to connect (no manual login)
  for (let i = 0; i < 40; i++) { const ok = await ev(ws, `!!(window.__game&&window.__game.me&&window.__game.me.id)`); if (ok) break; await sleep(500); }
  await sleep(2000);
  const state = await ev(ws, `(() => {
    const g = window.__game;
    const loginHidden = document.getElementById('login').classList.contains('hidden');
    const formHidden = document.getElementById('login-form').classList.contains('hidden');
    return JSON.stringify({ connected: !!(g&&g.me&&g.me.id), playerName: g?.me?.name, world: g?.world?.name, loginHidden, formHidden });
  })()`);
  console.log('state:', state);
  console.log('page errors:', errs.length ? errs : 'none');
} finally { chrome.kill(); }
console.log('done');
