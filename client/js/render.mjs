// Canvas renderer: backdrop, tiles, trees, drops, players, weather, effects.
import { TILE, WORLD_W, WORLD_H, growTimeFor } from '../../shared/constants.mjs';
import { itemById } from '../../shared/items.mjs';
import { tileImage, imgs } from './assets.mjs';
import { drawPlayer } from './player_draw.mjs';

function stageOf(seedId, plantedAt, at) {
  const it = itemById(seedId);
  if (!it) return 3;
  const total = growTimeFor(it.rarity) * 1000;
  const e = at - plantedAt;
  return e >= total ? 3 : e >= total * 0.66 ? 2 : e >= total * 0.33 ? 1 : 0;
}

const imgCache = new Map();
function cachedImg(url) {
  if (!imgCache.has(url)) {
    const im = new Image(); im.src = url; imgCache.set(url, im);
  }
  return imgCache.get(url);
}

// ---- procedural pixel-art crack overlays (damage stages) ----
// Deterministic (seeded) so every client renders identical cracks for the
// same stage. Two material palettes: dark brown for organic blocks
// (dirt/grass/wood/leaves), dark gray for mineral blocks (stone/metal/...).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CRACK_COLORS = { brown: '#3a2310', gray: '#232327' };
const crackCanvases = {}; // `${palette}:${stage}` -> canvas
function crackCanvas(palette, stage) {
  const key = palette + ':' + stage;
  if (crackCanvases[key]) return crackCanvases[key];
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  const rnd = mulberry32(1234 + stage * 777 + (palette === 'brown' ? 11 : 101));
  g.fillStyle = CRACK_COLORS[palette];
  const walkers = stage === 1 ? 1 : stage === 2 ? 2 : 3;
  const steps = stage === 1 ? 11 : stage === 2 ? 17 : 24;
  const spawnWalker = () => {
    // start from a random edge, head inward
    const edge = (rnd() * 4) | 0;
    let x, y, dx, dy;
    if (edge === 0) { x = (rnd() * TILE) | 0; y = 0; dx = 0; dy = 1; }
    else if (edge === 1) { x = (rnd() * TILE) | 0; y = TILE - 1; dx = 0; dy = -1; }
    else if (edge === 2) { x = 0; y = (rnd() * TILE) | 0; dx = 1; dy = 0; }
    else { x = TILE - 1; y = (rnd() * TILE) | 0; dx = -1; dy = 0; }
    return { x, y, dx, dy };
  };
  const branches = [];
  for (let wI = 0; wI < walkers; wI++) {
    let w = spawnWalker();
    for (let s = 0; s < steps; s++) {
      g.fillRect(w.x, w.y, 1, 1);
      if (rnd() < 0.3) g.fillRect(w.x + (rnd() < 0.5 ? 1 : -1), w.y, 1, 1); // 2px joints
      if (rnd() < 0.22 && branches.length < stage + 1) branches.push({ ...w });
      // jittered random walk, biased inward
      w.x += w.dx + ((rnd() * 3) | 0) - 1;
      w.y += w.dy + ((rnd() * 3) | 0) - 1;
      w.x = Math.max(0, Math.min(TILE - 1, w.x));
      w.y = Math.max(0, Math.min(TILE - 1, w.y));
    }
  }
  for (const b of branches) {
    let { x, y } = b;
    const n = 5 + ((rnd() * 5) | 0);
    for (let s = 0; s < n; s++) {
      g.fillRect(x, y, 1, 1);
      x += ((rnd() * 3) | 0) - 1; y += ((rnd() * 3) | 0) - 1;
      x = Math.max(0, Math.min(TILE - 1, x)); y = Math.max(0, Math.min(TILE - 1, y));
    }
  }
  crackCanvases[key] = c;
  return c;
}
const ORGANIC_TILES = /dirt|grass|wood|trunk|leaf|bush|plant|seed|sapling/;
function crackPaletteFor(tileName) {
  return ORGANIC_TILES.test(tileName || '') ? 'brown' : 'gray';
}
// damage ratio -> crack stage: 0-24% none, 25-49% subtle, 50-74% branching, 75-99% heavy
export function crackStageFor(dmg, hardness) {
  if (!hardness || hardness <= 0) return 0;
  const k = Math.min(1, dmg / hardness);
  return k < 0.25 ? 0 : k < 0.5 ? 1 : k < 0.75 ? 2 : 3;
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0 };
    this.scale = 1;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.particles = [];
    this.rain = [];
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    const portrait = this.h >= this.w;
    this.scale = Math.min(2.5, Math.max(0.8, this.h / ((portrait ? 15 : 11.5) * TILE)));
  }
  updateCamera(px, py) {
    const k = 0.12;
    this.cam.x += (px - this.cam.x) * k;
    this.cam.y += (py - 40 - this.cam.y) * k;
    this.cam.x = Math.max(this.w / 2 / this.scale - 200, Math.min(WORLD_W * TILE + 200 - this.w / 2 / this.scale, this.cam.x));
    this.cam.y = Math.max(-100, Math.min(WORLD_H * TILE + 100 - this.h / 2 / this.scale, this.cam.y));
  }
  snapCamera(px, py) { this.cam.x = px; this.cam.y = py - 40; }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  wrapSignText(ctx, text) {
    ctx.font = 'bold 13px system-ui, sans-serif';
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const wd of words) {
      const t = cur ? cur + ' ' + wd : wd;
      if (ctx.measureText(t).width > 260 && cur) { lines.push(cur); cur = wd; }
      else cur = t;
      if (lines.length === 1 && ctx.measureText(cur).width > 260) break;
    }
    if (cur) lines.push(cur);
    const out = lines.slice(0, 2);
    if (lines.length > 2) out[1] = out[1].replace(/…?$/, '…');
    return out.length ? out : [''];
  }
  screenToWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.scale + this.cam.x, y: (sy - this.h / 2) / this.scale + this.cam.y };
  }
  fx(kind, x, y) {
    const n = kind === 'break' ? 14 : kind === 'harvest' ? 10 : 16;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 160;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
        life: 0.5 + Math.random() * 0.4, t: 0,
        color: kind === 'harvest' ? '#7dff9a' : kind === 'splice' ? '#c58bff' : kind === 'trade' ? '#ffd75e' : '#c9a06a',
        size: 2 + Math.random() * 3,
      });
    }
  }
  draw(state, nowMs) {
    const { ctx } = this;
    const t = nowMs / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // backdrop (screen space, slight parallax) — cover-fit, anchored bottom
    if (imgs.backdrop) {
      const bw = imgs.backdrop.width, bh = imgs.backdrop.height;
      const s = Math.max(this.w / bw, this.h / bh);
      const dw = bw * s, dh = bh * s;
      let ox = (this.w - dw) / 2 - this.cam.x * 0.05;
      ox = Math.min(0, Math.max(this.w - dw, ox)); // keep screen covered
      ctx.drawImage(imgs.backdrop, ox, this.h - dh, dw, dh);
    } else { ctx.fillStyle = '#87ceeb'; ctx.fillRect(0, 0, this.w, this.h); }
    // vfx: clouds + distant fog (behind tiles)
    if (state.vfx) state.vfx.renderBackground(ctx, this.w, this.h, this.cam.x);

    // world space
    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-Math.round(this.cam.x), -Math.round(this.cam.y));

    const w = state.world;
    const x0 = Math.max(0, Math.floor((this.cam.x - this.w / 2 / this.scale) / TILE) - 1);
    const x1 = Math.min(WORLD_W - 1, Math.ceil((this.cam.x + this.w / 2 / this.scale) / TILE) + 1);
    const y0 = Math.max(0, Math.floor((this.cam.y - this.h / 2 / this.scale) / TILE) - 1);
    const y1 = Math.min(WORLD_H - 1, Math.ceil((this.cam.y + this.h / 2 / this.scale) / TILE) + 1);

    // background layer
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const id = w.bg[ty * WORLD_W + tx];
      if (!id) continue;
      const im = tileImage(id);
      if (im) { ctx.globalAlpha = 0.85; ctx.drawImage(im, tx * TILE, ty * TILE, TILE, TILE); ctx.globalAlpha = 1; }
    }
    // foreground layer
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const i = ty * WORLD_W + tx;
      const id = w.fg[i];
      if (id) {
        // animated water: cycle the 4 pack frames on a global clock (falls back to static tile)
        const im = id === 16 && state.vfx ? (state.vfx.waterFrame(t) || tileImage(id)) : tileImage(id);
        const it = itemById(id);
        if (im) {
          if (it && it.tile && it.tile.startsWith('obj_')) {
            // objects: preserve aspect, centered in tile
            const s = Math.min(TILE / im.width, TILE / im.height);
            const dw = im.width * s, dh = im.height * s;
            ctx.drawImage(im, tx * TILE + (TILE - dw) / 2, ty * TILE + (TILE - dh) / 2, dw, dh);
          } else {
            ctx.drawImage(im, tx * TILE, ty * TILE, TILE, TILE);
          }
        }
        // torch/glow light halo (world space)
        if (it && it.light && state.vfx)
          state.vfx.renderGlowAt(ctx, tx * TILE + TILE / 2, ty * TILE + TILE / 2, TILE * 1.2, id !== 28);
        const dg = w.damage.get(i);
        if (dg && dg.dmg > 0) {
          const it2 = itemById(id);
          const hard = it2?.hardness || 5;
          const stage = crackStageFor(dg.dmg, hard);
          if (stage > 0) {
            // subtle darkening for depth + pixel-art crack overlay
            const k = Math.min(1, dg.dmg / hard);
            ctx.fillStyle = `rgba(0,0,0,${0.06 + k * 0.12})`;
            ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
            ctx.drawImage(crackCanvas(crackPaletteFor(it2?.tile), stage), tx * TILE, ty * TILE);
          }
        }
      }
      // trees / seeds
      const s = w.seeds.get(i);
      if (s) {
        const st = stageOf(s.seed, s.plantedAt, nowMs);
        const im = st === 0 ? imgs.flora.seed : st === 1 ? imgs.flora.sapling : st === 2 ? imgs.flora.tree_young : imgs.flora.tree_mature;
        if (im) {
          if (st === 0) ctx.drawImage(im, tx * TILE + 6, ty * TILE - 10, 20, 30);
          else ctx.drawImage(im, tx * TILE - 16, (ty + 1) * TILE - 96, 64, 96);
          if (st === 3) { // sparkle on mature
            ctx.fillStyle = `rgba(255,255,200,${0.4 + 0.3 * Math.sin(t * 4 + tx)})`;
            ctx.fillRect(tx * TILE + 12, ty * TILE - 70, 3, 3);
          }
        }
      }
    }
    // target highlight
    if (state.target) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.strokeRect(state.target.tx * TILE + 1, state.target.ty * TILE + 1, TILE - 2, TILE - 2);
    }
    // drops
    for (const d of w.drops.values()) {
      const it = itemById(d.item);
      let im = null;
      if (it && it.tile) im = tileImage(d.item);
      else if (it && it.kind === 'seed') im = imgs.flora.seed;
      if (d.item === 80) im = imgs.wrench;
      const bob = Math.sin(t * 3 + d.id) * 3;
      if (im) ctx.drawImage(im, d.x - 11, d.y - 11 + bob, 22, 22);
      else { ctx.fillStyle = '#ffd75e'; ctx.fillRect(d.x - 8, d.y - 8 + bob, 16, 16); }
    }
    // punch impact clouds (world space; above tiles, below players/names)
    if (state.vfx && typeof state.vfx.renderPunchClouds === 'function') state.vfx.renderPunchClouds(ctx);
    // players (remote first, me last)
    const mePl = {
      id: state.me.id, name: state.me.name || '', x: state.me.x, y: state.me.y,
      face: state.me.face, anim: state.me.anim, look: state.me.look,
    };
    const all = [...state.players.values(), mePl];
    for (const pl of all) {
      const isMe = pl.id === state.me.id;
      drawPlayer(ctx, {
        x: pl.x, y: pl.y, face: pl.face, anim: pl.anim,
        look: pl.look, name: pl.name || '',
        isOwner: w.lock && w.lock.ownerId === pl.id,
        t, punchT: isMe ? state.me.punchT : (pl.anim === 'punch' ? 0.2 : 0),
      });
    }
    // sign proximity labels (world space; show within ~3.5 tiles, hide beyond ~4.5)
    if (w.signs && w.signs.size) {
      if (!this.signShown) this.signShown = new Map();
      const SHOW = 3.5 * TILE, HIDE = 4.5 * TILE;
      const drawn = [];
      for (const [i, text] of w.signs) {
        if (!text || w.fg[i] !== 9) { this.signShown.delete(i); continue; }
        const sx = (i % WORLD_W) * TILE + TILE / 2;
        const sy = Math.floor(i / WORLD_W) * TILE;
        const d = Math.hypot(state.me.x - sx, state.me.y - (sy + TILE / 2));
        const was = this.signShown.get(i) || false;
        const show = d < SHOW ? true : d > HIDE ? false : was;
        this.signShown.set(i, show);
        if (!show) continue;
        const lines = this.wrapSignText(ctx, text);
        ctx.font = 'bold 13px system-ui, sans-serif';
        const tw = Math.min(280, Math.max(...lines.map((l) => ctx.measureText(l).width)));
        const bw = tw + 20, bh = lines.length * 18 + 14;
        let bx = sx - bw / 2, by = sy - 10 - bh;
        // de-overlap: nudge upward against already-drawn labels
        for (let n = 0; n < 3; n++) {
          const overlap = drawn.some((r) => bx < r.x + r.w && bx + bw > r.x && by < r.y + r.h && by + bh > r.y);
          if (!overlap) break;
          by -= bh + 6;
        }
        drawn.push({ x: bx, y: by, w: bw, h: bh });
        ctx.fillStyle = 'rgba(20,13,8,0.92)';
        this.roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 3; this.roundRect(ctx, bx, by, bw, bh, 6); ctx.stroke();
        ctx.strokeStyle = '#e0b36a'; ctx.lineWidth = 1; this.roundRect(ctx, bx + 2, by + 2, bw - 4, bh - 4, 4); ctx.stroke();
        ctx.fillStyle = '#ffe9c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        lines.forEach((l, n) => ctx.fillText(l, sx, by + 8 + n * 18));
      }
    }
    // particles
    this.particles = this.particles.filter((pt) => (pt.t += 1 / 60) < pt.life);
    for (const pt of this.particles) {
      pt.x += pt.vx / 60; pt.y += pt.vy / 60; pt.vy += 500 / 60;
      ctx.globalAlpha = 1 - pt.t / pt.life;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // vfx: rain, splashes, wind, fog, lightning (in front of tiles)
    if (state.vfx) state.vfx.renderForeground(ctx, this.w, this.h);
  }
}
