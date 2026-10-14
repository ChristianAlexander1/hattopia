// Sprite-based player renderer. Frames extracted from the user-provided
// sprite sheet into client/img/player/*.png:
//   idle_0..4, runR_0..6, runL_0..5, jump_0..6, fall_0..4, punch_0..4
// x,y = feet position. Frames are scaled to a fixed height and anchored
// at the feet. The sprite has a fixed appearance (no customization).
import { imgs } from './assets.mjs';

const TARGET_H = 48;          // in-world height in px (1.5 tiles)
const PUNCH_DUR = 0.28;       // must match physics punchT duration

function frame(name) {
  return (imgs.player && imgs.player[name]) || null;
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
  if (name) {
    ctx.save();
    ctx.font = '700 12px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const ny = py - TARGET_H - 10;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(name, px, ny);
    ctx.fillStyle = isOwner ? '#7dff9a' : '#ffffff';
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
