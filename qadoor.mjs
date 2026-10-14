import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME = process.env.HOME + '/workspace/.chrome/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP = 9353;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, method = 'GET') { const r = await fetch(url, { method }); return r.json(); }
let msgId = 0; const pending = new Map(); const errors = [];
function cdpSend(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('x')); } }, 20000); });
}
async function ev(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval fail'); return r.result.value; }
async function shot(ws, path) { const r = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' }); await (await import('node:fs')).promises.writeFile(path, Buffer.from(r.data, 'base64')); }
const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/qadoor-'+Date.now().toString(36),'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await getJson(`http://127.0.0.1:${CDP}/json/list`); break; } catch { await sleep(200); } }
try {
  const t = await getJson(`http://127.0.0.1:${CDP}/json/new?about:blank`, 'PUT');
  const target = Array.isArray(t) ? t[0] : t;
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256*1024*1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push('EXC:'+(m.params.exceptionDetails.text||'').slice(0,120)); });
  await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable');
  const tag = 'NW' + Date.now().toString(36).toUpperCase();
  const loaded = new Promise((res) => { const h = (raw) => { try { const m = JSON.parse(raw.toString()); if (m.method === 'Page.loadEventFired') { ws.off('message', h); res(); } } catch {} }; ws.on('message', h); });
  await cdpSend(ws, 'Page.navigate', { url: 'http://localhost:8080/' });
  await Promise.race([loaded, sleep(15000)]); await sleep(2500);
  await ev(ws, `document.getElementById('btn-play').click()`); await sleep(400);
  await ev(ws, `document.getElementById('guest-name').value='QA_${tag}';document.getElementById('btn-guest').click()`);
  for (let i = 0; i < 40; i++) { const ok = await ev(ws, `!!(window.__game&&window.__game.me&&window.__game.me.id)`); if (ok) break; await sleep(250); }
  await sleep(1500);
  // join a brand-new world
  await ev(ws, `window.__game.ui.h.onJoinWorld('${tag}')`);
  await sleep(2500);
  // check world data: flatness, door, trees
  const info = await ev(ws, `(() => {
    const w = window.__game.world;
    const W = 100;
    const at = (x,y) => w.fg[y*W+x];
    let flat = true;
    for (let x = 0; x < 100; x++) if (at(x,30) !== (x===54?7:2)) flat = false;
    return {
      world: w.name, flat,
      door: at(54,29), underDoor: at(54,30),
      tree: at(12,29), leaves: at(12,26),
      spawn: w.spawn,
    };
  })()`);
  console.log('world info:', JSON.stringify(info));
  // teleport near door and screenshot
  await ev(ws, `(() => { const g = window.__game; g.me.body.x = 50*32; g.me.body.y = 28*32; g.renderer.snapCamera(g.me.body.x, g.me.body.y); })()`);
  await sleep(800);
  await shot(ws, '/tmp/door_world.png');
  // punch the door via doPunchAt equivalent: simulate pointer on door tile
  const punched = await ev(ws, `(() => {
    const g = window.__game;
    // find door screen pos: door at tile (54,29)
    const dx = (54*32 - g.renderer.cam.x) * g.renderer.scale + g.renderer.w/2;
    const dy = (29*32 - g.renderer.cam.y) * g.renderer.scale + g.renderer.h/2;
    return {dx: Math.round(dx), dy: Math.round(dy)};
  })()`);
  console.log('door screen pos:', JSON.stringify(punched));
  console.log('page errors:', errors.length ? errors : 'none');
} finally { chrome.kill(); }
console.log('done');
