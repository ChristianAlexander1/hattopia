// Sprite-based player renderer. Frames extracted from the user-provided
// sprite sheet into client/img/player/*.png:
//   idle_0..4, runR_0..6, runL_0..5, jump_0..6, fall_0..4, punch_0..4
// x,y = feet position. Frames are scaled to a fixed height and anchored
// at the feet. The sprite has a fixed appearance (no customization).
import { imgs } from './assets.mjs';
import { storage } from './storage.mjs';

const TARGET_H = 30;          // in-world height in px (fits 1-tile tunnels like Growtopia)
const PUNCH_DUR = 0.28;       // must match physics punchT duration

// Skin tones (8 options, dark to light)
export const SKIN_TONES = [
  '#6b4a3a', '#8a6552', '#a67c62', '#c09a7e',
  '#d4a88c', '#e0b89a', '#ecc8a8', '#f5ddba',
];
const SKIN_KEY = 'hattopia_skin';

// Tinted frame cache: skinHex -> Map(frameName -> canvas)
const tintCache = new Map();
let baseSkin = null; // average skin color of original sprite

function getBaseSkin(img) {
  if (baseSkin) return baseSkin;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    // skin-like: warm, not too dark, not grayscale
    if (d[i] > 100 && d[i] > d[i+1] && d[i+1] > d[i+2] - 20) {
      r += d[i]; g += d[i+1]; b += d[i+2]; n++;
    }
  }
  baseSkin = n ? { r: r/n, g: g/n, b: b/n } : { r: 200, g: 160, b: 130 };
  return baseSkin;
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

// Tint a frame: shift skin-like pixels toward the target skin color,
// preserving relative shading.
function tintFrame(img, targetHex) {
  const base = getBaseSkin(img);
  const tgt = hexToRgb(targetHex);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i], g = d[i+1], b = d[i+2];
    // only tint skin-like pixels
    if (r > 100 && r > g && g > b - 20) {
      // ratio of this pixel to base, applied to target
      d[i]   = Math.min(255, Math.max(0, tgt.r * (r / base.r)));
      d[i+1] = Math.min(255, Math.max(0, tgt.g * (g / base.g)));
      d[i+2] = Math.min(255, Math.max(0, tgt.b * (b / base.b)));
    }
  }
  x.putImageData(id, 0, 0);
  return c;
}

export function getSkin() {
  return storage.get(SKIN_KEY) || SKIN_TONES[3];
}
export function setSkin(hex) {
  storage.set(SKIN_KEY, hex);
  tintCache.clear(); // re-tint on next draw
}

function frame(name) {
  const img = (imgs.player && imgs.player[name]) || null;
  if (!img) return null;
  const skin = getSkin();
  // default skin = no tint (use original)
  if (skin === SKIN_TONES[3]) return img;
  let cache = tintCache.get(skin);
  if (!cache) { cache = new Map(); tintCache.set(skin, cache); }
  let tinted = cache.get(name);
  if (!tinted) { tinted = tintFrame(img, skin); cache.set(name, tinted); }
  return tinted;
}

export function drawPlayer(ctx, o) {
  const { x, y, face = 1, anim = 'idle', name = '', isOwner = false, t = 0, punchT = 0, ghost = false } = o;
  const fx = face >= 0 ? 1 : -1;
  const px = Math.round(x), py = Math.round(y);
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.55;
  ctx.imageSmoothingEnabled = false;

  // ---- pick frame ----
  let img = null;
  const punching = punchT > 0 || anim === 'punch';
  if (punching) {
    // one-shot punch sequence driven by punchT progress
    const prog = Math.min(1, Math.max(0, 1 - punchT / PUNCH_DUR));
    const n = Math.min(4, Math.floor(prog * 5));
    img = frame('punch_' + n);
    // punch frames face right; flip for left
    if (fx < 0) { drawFlipped(ctx, img, px, py); img = null; }
  } else if (anim === 'run') {
    if (fx >= 0) img = frame('runR_' + (Math.floor(t * 12) % 7));
    else img = frame('runL_' + (Math.floor(t * 12) % 6));
  } else if (anim === 'jump') {
    img = frame('jump_2');                                   // tucked rising pose
    if (fx < 0) { drawFlipped(ctx, img, px, py); img = null; }
  } else if (anim === 'fall') {
    img = frame('fall_' + (Math.floor(t * 8) % 5));           // flailing fall
    if (fx < 0) { drawFlipped(ctx, img, px, py); img = null; }
  } else {
    img = frame('idle_2');                                   // static idle (no fidget)
    if (fx < 0) { drawFlipped(ctx, img, px, py); img = null; }
  }

  if (img) {
    const s = TARGET_H / img.height;
    const w = Math.round(img.width * s);
    ctx.drawImage(img, Math.round(px - w / 2), Math.round(py - TARGET_H), w, TARGET_H);
  }
  ctx.restore();

  // ---- name tag: white text, dark outline (no box) ----
  // @Admin gets orange name
  if (name) {
    ctx.save();
    ctx.font = '700 12px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const ny = py - TARGET_H - 10;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(name, px, ny);
    ctx.fillStyle = name === '@Admin' ? '#ff8c00' : (isOwner ? '#7dff9a' : '#ffffff');
    ctx.fillText(name, px, ny);
    ctx.restore();
  }
}

function drawFlipped(ctx, img, px, py) {
  if (!img) return;
  const s = TARGET_H / img.height;
  const w = Math.round(img.width * s);
  ctx.save();
  ctx.translate(px, 0); ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, Math.round(py - TARGET_H), w, TARGET_H);
  ctx.restore();
}
