import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME = process.env.HOME + '/workspace/.chrome/chrome-headless-shell-linux64/chrome-headless-shell';
const CDP = 9361;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url, method = 'GET') { const r = await fetch(url, { method }); return r.json(); }
let msgId = 0; const pending = new Map(); const errs = [];
function cdpSend(ws, method, params = {}) {
  const id = ++msgId;
  return new Promise((res, rej) => { pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 30000); });
}
async function ev(ws, expr) { const r = await cdpSend(ws, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'EVAL_EXC:' + JSON.stringify(r.exceptionDetails).slice(0,300); return r.result.value; }

const chrome = spawn(CHROME, ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${CDP}`,'--user-data-dir=/tmp/qaweather-'+Date.now().toString(36),'about:blank'], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { await getJson(`http://127.0.0.1:${CDP}/json/list`); break; } catch { await sleep(200); } }

const weathers = ['clear', 'cloudy', 'drizzle', 'rain', 'heavy', 'storm', 'fog', 'snow'];
try {
  const t = await getJson(`http://127.0.0.1:${CDP}/json/new?about:blank`, 'PUT');
  const target = Array.isArray(t) ? t[0] : t;
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256*1024*1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errs.push('EXC:'+JSON.stringify(m.params.exceptionDetails).slice(0,200)); });
  await cdpSend(ws, 'Page.enable'); await cdpSend(ws, 'Runtime.enable');
  await cdpSend(ws, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cdpSend(ws, 'Page.navigate', { url: 'http://localhost:8080/' });
  await sleep(3000);

  // Click Play Online
  let r = await ev(ws, `(() => { const b = document.getElementById('btn-play'); if (b) { b.click(); return 'clicked'; } return 'not found'; })()`);
  console.log('play:', r);
  await sleep(1500);

  // Enable HatID mode, fill login
  r = await ev(ws, `(() => {
    const cb = document.getElementById('hatid-mode');
    if (cb && !cb.checked) cb.click();
    document.getElementById('hatid-name').value = 'admin';
    document.getElementById('hatid-pass').value = 'akmj';
    const btn = document.getElementById('btn-hatid');
    if (btn) { btn.click(); return 'login clicked'; }
    return 'btn not found';
  })()`);
  console.log('login:', r);

  // Wait for game
  for (let i = 0; i < 30; i++) {
    const ok = await ev(ws, `!!(window.__game && window.__game.me && window.__game.me.id)`);
    if (ok) break;
    await sleep(1000);
  }
  const state = await ev(ws, `window.__game?.me?.name || 'not connected'`);
  console.log('connected as:', state);
  await sleep(2000);

  // Test each weather via chat
  for (const w of weathers) {
    await ev(ws, `(() => {
      const ui = window.__game?.ui;
      if (ui && ui.h && ui.h.onChat) { ui.h.onChat('/weather ${w}'); return 'sent'; }
      return 'no ui';
    })()`);
    await sleep(4000); // let weather transition
    const shot = await cdpSend(ws, 'Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    await import('node:fs').then(fs => fs.writeFileSync(`/tmp/weather_${w}.png`, buf));
    console.log(`weather ${w}: screenshot saved`);
  }

  // back to clear
  await ev(ws, `window.__game?.ui?.h?.onChat('/weather clear')`);
  console.log('page errors:', errs.length ? errs : 'none');
} finally { chrome.kill(); }
console.log('done');
