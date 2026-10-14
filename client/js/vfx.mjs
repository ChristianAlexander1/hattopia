// VFX system: weather, particles, clouds, fog, lighting.
// Uses pack-3 assets from client/img/vfx/. Object-pooled particles,
// capped counts, quality scaling for mobile.
import { TILE, WORLD_W, WORLD_H } from '../../shared/constants.mjs';

const VFX_FILES = {
  clouds: ['cloud_small.png', 'cloud_medium.png', 'cloud_large.png', 'cloud_soft.png',
    'cloud_wispy_1.png', 'cloud_wispy_2.png', 'cloud_storm_1.png', 'cloud_storm_rain.png',
    'cloud_strip_white.png', 'cloud_strip_dark.png'],
  rain: ['rain_drizzle_01.png', 'rain_streak_short_01.png', 'rain_streak_short_02.png',
    'rain_streak_wind_01.png', 'rain_streak_wind_02.png', 'rain_streak_long_01.png',
    'snowflake_1.png', 'snowflake_2.png'],
  splashes: {
    ground: ['splash_ground_frame_01.png', 'splash_ground_frame_02.png', 'splash_ground_frame_03.png',
      'splash_ground_frame_04.png', 'splash_ground_frame_05.png', 'splash_ground_frame_06.png'],
    ripple: ['splash_ripple_frame_01.png', 'splash_ripple_frame_02.png',
      'splash_ripple_frame_03.png', 'splash_ripple_frame_04.png'],
    droplet: ['splash_droplet_frame_01.png', 'splash_droplet_frame_02.png',
      'splash_droplet_frame_03.png', 'splash_droplet_frame_04.png'],
  },
  wind: ['leaf_oak.png', 'leaf_maple.png', 'leaf_brown.png', 'dust_cluster.png',
    'pollen_cluster.png', 'wind_streak_1.png', 'feather.png'],
  fog: ['fog_patch_1.png', 'fog_patch_2.png', 'fog_strip_1.png',
    'fog_strip_2.png', 'fog_wispy_1.png', 'fog_ground_1.png'],
  lighting: ['glow_torch.png', 'glow_gradient.png', 'lightning_bolt_1.png', 'lightning_bolt_2.png'],
  water: ['water_deep_01.png', 'water_deep_02.png', 'water_wave_01.png', 'water_wave_02.png'],
  // punch impact clouds: 5-frame burst sequence (expand + dissipate), from the
  // user-supplied reference strip (cropped to punch_0..punch_4.png).
  punch: ['punch_0.png', 'punch_1.png', 'punch_2.png', 'punch_3.png', 'punch_4.png'],
};

export const vfxImgs = { clouds: {}, rain: {}, splashes: { ground: [], ripple: [], droplet: [] }, wind: {}, fog: {}, lighting: {}, water: [], punch: [] };

function load(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

export async function loadVfx() {
  const jobs = [];
  // Defensive: VFX_FILES categories are guarded so a stale/mismatched
  // cached module can never reject the whole load (which used to blank
  // the canvas while the DOM UI kept working).
  const safe = (arr) => Array.isArray(arr) ? arr : [];
  for (const f of safe(VFX_FILES.clouds))
    jobs.push(load('img/vfx/clouds/' + f).then((im) => { vfxImgs.clouds[f] = im; }));
  for (const f of safe(VFX_FILES.rain))
    jobs.push(load('img/vfx/rain/' + f).then((im) => { vfxImgs.rain[f] = im; }));
  for (const [k, arr] of Object.entries(VFX_FILES.splashes || {}))
    safe(arr).forEach((f, i) => jobs.push(load('img/vfx/splashes/' + f).then((im) => { vfxImgs.splashes[k][i] = im; })));
  for (const f of safe(VFX_FILES.wind))
    jobs.push(load('img/vfx/wind/' + f).then((im) => { vfxImgs.wind[f] = im; }));
  for (const f of safe(VFX_FILES.fog))
    jobs.push(load('img/vfx/fog/' + f).then((im) => { vfxImgs.fog[f] = im; }));
  for (const f of safe(VFX_FILES.lighting))
    jobs.push(load('img/vfx/lighting/' + f).then((im) => { vfxImgs.lighting[f] = im; }));
  safe(VFX_FILES.water).forEach((f, i) =>
    jobs.push(load('img/vfx/water/' + f).then((im) => { vfxImgs.water[i] = im; })));
  safe(VFX_FILES.punch).forEach((f, i) =>
    jobs.push(load('img/vfx/' + f).then((im) => { vfxImgs.punch[i] = im; })));
  await Promise.all(jobs);
}

// Weather presets: target parameters. Transitions lerp toward these.
export const PRESETS = {
  clear:   { cloud: 0.25, rain: 0,    wind: 0.2, fog: 0,    dark: 0,    lightning: 0, snow: 0 },
  cloudy:  { cloud: 0.7,  rain: 0,    wind: 0.3, fog: 0.1,  dark: 0.15, lightning: 0, snow: 0 },
  drizzle: { cloud: 0.6,  rain: 0.25, wind: 0.3, fog: 0.15, dark: 0.2,  lightning: 0, snow: 0 },
  rain:    { cloud: 0.8,  rain: 0.6,  wind: 0.5, fog: 0.2,  dark: 0.35, lightning: 0, snow: 0 },
  heavy:   { cloud: 0.9,  rain: 1.0,  wind: 0.7, fog: 0.25, dark: 0.45, lightning: 0, snow: 0 },
  storm:   { cloud: 1.0,  rain: 1.0,  wind: 1.0, fog: 0.3,  dark: 0.55, lightning: 1, snow: 0 },
  fog:     { cloud: 0.4,  rain: 0,    wind: 0.1, fog: 1.0,  dark: 0.25, lightning: 0, snow: 0 },
  snow:    { cloud: 0.8,  rain: 0,    wind: 0.4, fog: 0.3,  dark: 0.3,  lightning: 0, snow: 1 },
};

const QUALITY = {
  high: { rain: 220, splash: 60, wind: 40, cloud: 14 },
  medium: { rain: 120, splash: 30, wind: 20, cloud: 9 },
  low: { rain: 50, splash: 12, wind: 8, cloud: 5 },
};

export class VFX {
  constructor() {
    this.quality = 'medium';
    this.cur = { ...PRESETS.clear };
    this.target = 'clear';
    this.rainPool = [];
    this.splashPool = [];
    this.windPool = [];
    this.punchClouds = []; // impact bursts: {x,y,vx,vy,t,life,scale,face}
    this.clouds = [];
    this.fogBanks = [];
    this.lightningT = 0;
    this.lightningX = 0;
    this.time = 0;
    this.windDir = 1;
  }

  setWeather(name) {
    if (PRESETS[name]) this.target = name;
  }

  setQuality(q) {
    if (QUALITY[q]) this.quality = q;
  }

  // Current water animation frame (global clock => all water tiles stay in sync).
  // Returns null until the frames finish loading; caller falls back to the static tile.
  waterFrame(t) {
    const seq = vfxImgs.water;
    if (!seq.length || !seq[0]) return null;
    return seq[Math.floor(t / 0.55) % seq.length];
  }

  // Punch impact cloud: short burst at the impact point (world coords).
  // Each burst plays the 5-frame expand sequence, drifts slightly toward the
  // facing direction, then fades out via alpha. Pooled (max 40), oldest
  // recycled — never accumulates.
  spawnPunchCloud(x, y, face = 1) {
    if (this.punchClouds.length >= 40) this.punchClouds.shift();
    this.punchClouds.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 12,
      vx: face * (26 + Math.random() * 22),
      vy: -16 - Math.random() * 14,
      t: 0,
      life: 0.42 + Math.random() * 0.08, // ~420-500ms; fade portion ~250ms
      scale: 1.0 + Math.random() * 0.35,
      face,
    });
  }

  updatePunchClouds(dt) {
    const cs = this.punchClouds;
    for (let i = cs.length - 1; i >= 0; i--) {
      const c = cs[i];
      c.t += dt;
      if (c.t >= c.life) { cs.splice(i, 1); continue; }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= 1 - 1.6 * dt; // ease the drift
      c.vy *= 1 - 1.6 * dt;
    }
  }

  // World-space render: call after tiles, before players/names.
  renderPunchClouds(ctx) {
    const frames = vfxImgs.punch || [];
    if (!frames.length || !frames[0]) return;
    for (const c of this.punchClouds) {
      const k = c.t / c.life;
      const fi = Math.min(frames.length - 1, Math.floor(k * frames.length));
      const im = frames[fi];
      if (!im) continue;
      // full opacity through the impact phase, smooth alpha fade for the tail
      ctx.globalAlpha = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
      const s = c.scale * 1.35;
      const dw = im.width * s, dh = im.height * s;
      if (c.face < 0) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(-1, 1);
        ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(im, c.x - dw / 2, c.y - dh / 2, dw, dh);
      }
    }
    ctx.globalAlpha = 1;
  }
  // column at the drop's screen x for the first non-empty tile, classify the
  // surface (water => ripple, anything else => ground splash), and place the
  // effect at that surface's screen position. No splash if there is no surface.
  spawnSurfaceSplash(sx, w, h, camX, camY, scale, world) {
    if (!world || !world.fg || !scale) return;
    const wx = camX + (sx - w / 2) / scale;
    const tx = Math.floor(wx / TILE);
    if (tx < 0 || tx >= WORLD_W) return;
    const yTop = Math.max(0, Math.floor((camY - h / 2 / scale) / TILE) - 1);
    const yBot = Math.min(WORLD_H - 1, Math.ceil((camY + h / 2 / scale) / TILE) + 1);
    for (let ty = yTop; ty <= yBot; ty++) {
      const id = world.fg[ty * WORLD_W + tx];
      if (!id) continue;
      const kind = id === 16 ? 'ripple' : 'ground';
      const px = (tx * TILE + TILE / 2 - camX) * scale + w / 2;
      const py = (ty * TILE - camY) * scale + h / 2;
      this.splashPool.push({ x: px, y: py, t: 0, kind });
      return;
    }
    // no surface in this column: drop falls out of view, no splash
  }

  // --- update ---
  update(dt, w, h, camX, camY, world, scale = 1) {
    this.time += dt;
    if (typeof this.updatePunchClouds === 'function') this.updatePunchClouds(dt);
    const tgt = PRESETS[this.target];
    const k = Math.min(1, dt * 0.8); // smooth transition
    for (const key of Object.keys(this.cur))
      this.cur[key] += (tgt[key] - this.cur[key]) * k;

    const q = QUALITY[this.quality];
    const c = this.cur;

    // clouds: maintain count based on cloud param
    const wantClouds = Math.round(q.cloud * (0.3 + c.cloud));
    while (this.clouds.length < wantClouds) {
      const stormy = c.lightning > 0.5 || c.dark > 0.4;
      const pool = stormy
        ? ['cloud_storm_1.png', 'cloud_storm_rain.png', 'cloud_strip_dark.png']
        : ['cloud_small.png', 'cloud_medium.png', 'cloud_large.png', 'cloud_soft.png',
           'cloud_wispy_1.png', 'cloud_wispy_2.png', 'cloud_strip_white.png'];
      const f = pool[(Math.random() * pool.length) | 0];
      const depth = 0.2 + Math.random() * 0.6; // parallax depth
      this.clouds.push({
        img: f, x: Math.random() * (w + 400) - 200, y: Math.random() * h * 0.45,
        v: (8 + Math.random() * 20) * (0.5 + c.wind), depth,
        scale: 0.6 + Math.random() * 0.8,
      });
    }
    if (this.clouds.length > wantClouds + 2) this.clouds.length = wantClouds + 2;
    for (const cl of this.clouds) {
      cl.x += cl.v * dt * this.windDir;
      if (cl.x > w + 250) { cl.x = -250; cl.y = Math.random() * h * 0.45; }
      if (cl.x < -300) { cl.x = w + 200; cl.y = Math.random() * h * 0.45; }
    }

    // rain particles (pooled)
    const wantRain = Math.round(q.rain * c.rain);
    const wantSnow = Math.round(q.rain * 0.7 * c.snow);
    while (this.rainPool.length < wantRain + wantSnow) {
      const isSnow = this.rainPool.length >= wantRain;
      this.rainPool.push({
        x: Math.random() * w, y: Math.random() * h,
        v: isSnow ? 60 + Math.random() * 60 : 650 + Math.random() * 350,
        snow: isSnow, sway: Math.random() * Math.PI * 2,
      });
    }
    if (this.rainPool.length > wantRain + wantSnow) this.rainPool.length = wantRain + wantSnow;

    const windX = c.wind * 160 * this.windDir;
    for (const r of this.rainPool) {
      r.y += r.v * dt;
      r.x += windX * dt * (r.snow ? 1.5 : 0.25);
      if (r.snow) { r.sway += dt * 2; r.x += Math.sin(r.sway) * 30 * dt; }
      if (r.y > h + 20) {
        // world-aware splash: classify the actual surface under this drop
        if (!r.snow && c.rain > 0.1 && this.splashPool.length < q.splash && Math.random() < 0.35)
          this.spawnSurfaceSplash(r.x, w, h, camX, camY, scale, world);
        r.y = -20; r.x = Math.random() * (w + 100) - 50;
      }
      if (r.x > w + 50) r.x = -40; if (r.x < -50) r.x = w + 40;
    }

    // splashes: advance frames
    for (let i = this.splashPool.length - 1; i >= 0; i--) {
      const s = this.splashPool[i];
      s.t += dt * 14; // 14 fps
      if (s.t >= vfxImgs.splashes[s.kind].length) this.splashPool.splice(i, 1);
    }

    // wind particles (leaves, dust) — no leaves/pollen/feather during rain,
    // they would be washed down; only wind streaks in wet weather.
    const wantWind = Math.round(q.wind * (0.2 + c.wind));
    const isWet = (c.rain || 0) > 0.1;
    // when it starts raining, remove leaves/pollen/feather immediately
    if (isWet) {
      const dryTypes = ['leaf_oak.png', 'leaf_maple.png', 'leaf_brown.png', 'pollen_cluster.png', 'feather.png'];
      for (let i = this.windPool.length - 1; i >= 0; i--) {
        if (dryTypes.includes(this.windPool[i].img)) this.windPool.splice(i, 1);
      }
    }
    while (this.windPool.length < wantWind) {
      const types = isWet
        ? ['wind_streak_1.png', 'wind_streak_1.png', 'dust_cluster.png']
        : ['leaf_oak.png', 'leaf_maple.png', 'leaf_brown.png', 'dust_cluster.png', 'pollen_cluster.png', 'feather.png'];
      this.windPool.push({
        img: types[(Math.random() * types.length) | 0],
        x: Math.random() * w, y: Math.random() * h * 0.8,
        v: 40 + Math.random() * 80, ph: Math.random() * 6.28, rot: Math.random() * 6.28,
      });
    }
    if (this.windPool.length > wantWind) this.windPool.length = wantWind;
    for (const p of this.windPool) {
      p.ph += dt * 3;
      p.x += (p.v * (0.3 + c.wind) * this.windDir + Math.sin(p.ph) * 25) * dt;
      p.y += Math.cos(p.ph * 0.7) * 20 * dt - 8 * dt;
      p.rot += dt * 2;
      if (p.x > w + 30) { p.x = -20; p.y = Math.random() * h * 0.8; }
      if (p.x < -30) { p.x = w + 20; p.y = Math.random() * h * 0.8; }
    }

    // fog banks
    const wantFog = Math.round(6 * c.fog);
    while (this.fogBanks.length < wantFog) {
      const fs = ['fog_patch_1.png', 'fog_patch_2.png', 'fog_strip_1.png', 'fog_wispy_1.png', 'fog_ground_1.png'];
      this.fogBanks.push({
        img: fs[(Math.random() * fs.length) | 0],
        x: Math.random() * w, y: h * 0.4 + Math.random() * h * 0.5,
        v: 6 + Math.random() * 14, alpha: 0.25 + Math.random() * 0.3,
      });
    }
    if (this.fogBanks.length > wantFog) this.fogBanks.length = wantFog;
    for (const f of this.fogBanks) {
      f.x += f.v * dt * this.windDir;
      if (f.x > w + 300) f.x = -300;
      if (f.x < -350) f.x = w + 250;
    }

    // lightning
    if (c.lightning > 0.5) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 2 + Math.random() * 6;
        this.lightningX = Math.random() * w;
        this.flash = 0.25;
      }
    }
    if (this.flash > 0) this.flash -= dt;
  }

  // --- render: background layer (clouds, distant fog) ---
  renderBackground(ctx, w, h, camX) {
    for (const cl of this.clouds) {
      const im = vfxImgs.clouds[cl.img];
      if (!im) continue;
      const px = cl.x - camX * cl.depth * 0.3;
      const dw = im.width * cl.scale, dh = im.height * cl.scale;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(im, px, cl.y, dw, dh);
    }
    ctx.globalAlpha = 1;
    for (const f of this.fogBanks) {
      const im = vfxImgs.fog[f.img];
      if (!im) continue;
      ctx.globalAlpha = f.alpha * 0.5 * this.cur.fog;
      ctx.drawImage(im, f.x, f.y, im.width * 1.5, im.height);
    }
    ctx.globalAlpha = 1;
  }

  // --- render: foreground layer (rain, splashes, wind, fog, lightning) ---
  renderForeground(ctx, w, h) {
    const c = this.cur;
    if (c.rain > 0.03 || c.snow > 0.03) {
      for (const r of this.rainPool) {
        let im;
        if (r.snow) im = vfxImgs.rain[r.v % 2 < 1 ? 'snowflake_1.png' : 'snowflake_2.png'];
        else if (c.rain < 0.3) im = vfxImgs.rain['rain_drizzle_01.png'];
        else if (c.wind > 0.6) im = vfxImgs.rain['rain_streak_wind_01.png'];
        else if (c.rain > 0.8) im = vfxImgs.rain['rain_streak_long_01.png'];
        else im = vfxImgs.rain['rain_streak_short_01.png'];
        if (!im) continue;
        ctx.globalAlpha = r.snow ? 0.9 : 0.55;
        ctx.drawImage(im, r.x - im.width / 2, r.y - im.height / 2);
      }
      ctx.globalAlpha = 1;
    }

    // 5. splashes
    for (const s of this.splashPool) {
      const frames = vfxImgs.splashes[s.kind];
      const im = frames[Math.floor(s.t)];
      if (!im) continue;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(im, s.x - 16, s.y - 24, 32, 32);
    }
    ctx.globalAlpha = 1;

    // 6. wind particles
    for (const p of this.windPool) {
      const im = vfxImgs.wind[p.img];
      if (!im) continue;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(im, -8, -8, 16, 16);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // 7. fog in front (near)
    for (const f of this.fogBanks) {
      const im = vfxImgs.fog[f.img];
      if (!im) continue;
      ctx.globalAlpha = f.alpha * this.cur.fog;
      ctx.drawImage(im, f.x - 100, f.y, im.width * 1.5, im.height);
    }
    ctx.globalAlpha = 1;

    // 8. lightning flash + bolt
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(220,230,255,${this.flash * 1.6})`;
      ctx.fillRect(0, 0, w, h);
      const bolt = vfxImgs.lighting[Math.random() < 0.5 ? 'lightning_bolt_1.png' : 'lightning_bolt_2.png'];
      if (bolt && this.flash > 0.12)
        ctx.drawImage(bolt, this.lightningX, 0, 64, h * 0.6);
    }

    // 9. dark overlay for storm/heavy
    if (c.dark > 0.02) {
      ctx.fillStyle = `rgba(20,30,60,${c.dark * 0.5})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // torch/glow rendering hook: call from tile loop
  renderGlowAt(ctx, x, y, size, warm = true) {
    const im = vfxImgs.lighting[warm ? 'glow_torch.png' : 'glow_gradient.png'];
    if (!im) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 + 0.1 * Math.sin(this.time * 5 + x);
    ctx.drawImage(im, x - size, y - size, size * 2, size * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
