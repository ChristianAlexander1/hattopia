import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME = process.env.HOME + '/workspace/.chrome/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP = 9354;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, method = 'GET') { const r = await fetch(url, { method }); return r.json(); }
let msgId = 0; const pending = new Map(); const errors = [];
function cdpSend(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('x')); } }, 20000); });
}
async function ev(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval fail'); return r.result.value; }
async function shot(ws, path) { const r = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }); await (await import('node:fs')).promises.writeFile(path, Buffer.from(r.data, 'base64')); }
const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/qadoor2-'+Date.now().toString(36),'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await getJson(`http://127.0.0.1:${CDP}/json/list`); break; } catch { await sleep(200); } }
try {
  const t = await getJson(`http://127.0.0.1:${CDP}/json/new?about:blank`, 'PUT');
  const target = Array.isArray(t) ? t[0] : t;
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256*1024*1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push('EXC:'+(m.params.exceptionDetails.text||'').slice(0,120)); });
  await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable');
  // mobile viewport
  await cdpSend(ws, 'Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, hasTouch: true });
  const tag = 'DX' + Date.now().toString(36).toUpperCase();
  const loaded = new Promise((res) => { const h = (raw) => { try { const m = JSON.parse(raw.toString()); if (m.method === 'Page.loadEventFired') { ws.off('message', h); res(); } } catch {} }; ws.on('message', h); });
  await cdpSend(ws, 'Page.navigate', { url: 'http://localhost:8080/' });
  await Promise.race([loaded, sleep(15000)]); await sleep(2500);
  await ev(ws, `document.getElementById('btn-play').click()`); await sleep(400);
  await ev(ws, `document.getElementById('guest-name').value='QD_${tag}';document.getElementById('btn-guest').click()`);
  for (let i = 0; i < 40; i++) { const ok = await ev(ws, `!!(window.__game&&window.__game.me&&window.__game.me.id)`); if (ok) break; await sleep(250); }
  await sleep(1200);
  await ev(ws, `window.__game.ui.h.onJoinWorld('${tag}')`);
  await sleep(2200);
  // move player next to door and punch it via real input path (select fist, tap door)
  await ev(ws, `(() => {
    const g = window.__game;
    g.ui.sel = 0; // fist
    g.me.body.x = 52*32; g.me.body.y = 28*32;
    g.renderer.snapCamera(g.me.body.x, g.me.body.y);
  })()`);
  await sleep(600);
  // dispatch pointer tap on the door tile (touch-like)
  const tapped = await ev(ws, `(() => {
    const g = window.__game;
    const cv = document.getElementById('game');
    const r = cv.getBoundingClientRect();
    // door tile (54,29) -> screen coords
    const sx = (54*32+16 - g.renderer.cam.x) * g.renderer.scale + g.renderer.w/2;
    const sy = (29*32+16 - g.renderer.cam.y) * g.renderer.scale + g.renderer.h/2;
    const opts = { bubbles: true, cancelable: true, clientX: r.left+sx, clientY: r.top+sy, pointerId: 7, pointerType: 'touch', isPrimary: true };
    cv.dispatchEvent(new PointerEvent('pointerdown', opts));
    cv.dispatchEvent(new PointerEvent('pointerup', opts));
    return { sx: Math.round(sx), sy: Math.round(sy) };
  })()`);
  console.log('tapped at:', JSON.stringify(tapped));
  await sleep(1500);
  const dlgOpen = await ev(ws, `!document.getElementById('dlg-world').classList.contains('hidden')`);
  console.log('world browser open after door punch:', dlgOpen);
  await shot(ws, '/tmp/door_exit.png');
  console.log('page errors:', errors.length ? errors : 'none');
} finally { chrome.kill(); }
console.log('done');
