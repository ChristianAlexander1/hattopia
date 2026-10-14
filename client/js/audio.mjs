// Procedural WebAudio sound effects — no audio assets needed.
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function env(g, t0, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
function tone(freq, dur, type = 'square', vol = 0.12, slide = 0) {
  try {
    const c = ac(), t0 = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    env(g, t0, 0.005, vol, dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  } catch {}
}
function noise(dur, vol = 0.2, low = 400) {
  try {
    const c = ac(), t0 = c.currentTime;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low;
    const g = c.createGain(); env(g, t0, 0.003, vol, dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  } catch {}
}
export const sfx = {
  unlock() { try { ac(); } catch {} },
  punch() { noise(0.09, 0.25, 900); tone(140, 0.08, 'square', 0.08, -60); },
  break_() { noise(0.25, 0.3, 600); tone(90, 0.2, 'triangle', 0.15, -40); },
  place() { tone(520, 0.07, 'square', 0.1, 120); },
  pickup() { tone(880, 0.09, 'sine', 0.12, 440); },
  harvest() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'sine', 0.12), i * 70)); },
  splice() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.12), i * 80)); },
  chat() { tone(660, 0.06, 'sine', 0.07); },
  error() { tone(160, 0.18, 'sawtooth', 0.1, -40); },
  door() { tone(300, 0.15, 'sine', 0.12, 300); setTimeout(() => tone(600, 0.15, 'sine', 0.1, 200), 120); },
  trade() { [523, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'triangle', 0.12), i * 90)); },
  jump() { tone(280, 0.1, 'square', 0.05, 220); },
};
