import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME = process.env.HOME + '/workspace/.chrome/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP = 9355;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, method = 'GET') { const r = await fetch(url, { method }); return r.json(); }
let msgId = 0; const pending = new Map(); const errors = [];
function cdpSend(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('x')); } }, 20000); });
}
async function ev(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'EVAL_EXC'; return r.result.value; }
const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/qatunnel-'+Date.now().toString(36),'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await getJson(`http://127.0.0.1:${CDP}/json/list`); break; } catch { await sleep(200); } }
try {
  const t = await getJson(`http://127.0.0.1:${CDP}/json/new?about:blank`, 'PUT');
  const target = Array.isArray(t) ? t[0] : t;
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256*1024*1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push('EXC:'+JSON.stringify(m.params.exceptionDetails).slice(0,300)); else if (m.method === 'Log.entryAdded' && ['error'].includes(m.params.entry.level)) errors.push('LOG:'+(m.params.entry.text||'').slice(0,200)); });
  await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable'); await cdpSend(ws, 'Log.enable');
  await cdpSend(ws, 'Network.enable');
  const failed = [];
  const netH = (raw) => { try { const m = JSON.parse(raw.toString()); if (m.method === 'Network.loadingFailed') failed.push(m.params.errorText + ' ' + (m.params.type||'')); } catch {} };
  ws.on('message', netH);
  const TUN = 'https://zxnoh-2a04-4e41-10-1609--9aee-9609.free.pinggy.net';
  const loaded = new Promise((res) => { const h = (raw) => { try { const m = JSON.parse(raw.toString()); if (m.method === 'Page.loadEventFired') { ws.off('message', h); res(); } } catch {} }; ws.on('message', h); });
  await cdpSend(ws, 'Page.navigate', { url: TUN + '/' });
  await Promise.race([loaded, sleep(20000)]); await sleep(4000);
  console.log('failed requests:', failed.length ? failed.slice(0,10) : 'none');
  const tag = Date.now().toString(36);
  await ev(ws, `document.getElementById('btn-play').click()`);
  await sleep(500);
  await ev(ws, `document.getElementById('guest-name').value='TUN_${tag}';document.getElementById('btn-guest').click()`);
  for (let i = 0; i < 60; i++) { const ok = await ev(ws, `!!(window.__game&&window.__game.me&&window.__game.me.id)`); if (ok) break; await sleep(500); }
  await sleep(3000);
  const state = await ev(ws, `(() => {
    const g = window.__game;
    if (!g) return 'no __game';
    const cv = document.getElementById('game');
    const c = document.createElement('canvas'); c.width=4; c.height=4;
    const ctx = c.getContext('2d'); ctx.drawImage(cv,0,0,4,4);
    const d = ctx.getImageData(0,0,4,4).data;
    let a=0; for (let i=3;i<d.length;i+=4) a+=d[i];
    return JSON.stringify({ game: !!g, world: g.world.name, fgLen: g.world.fg.length, alpha: (a/16).toFixed(0), toast: document.getElementById('err-toast').textContent });
  })()`);
  console.log('state:', state);
  console.log('page errors:', errors.length ? errors : 'none');
} finally { chrome.kill(); }
console.log('done');
