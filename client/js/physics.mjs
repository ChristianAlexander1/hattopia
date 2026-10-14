// Client-side player physics: accel movement, jump w/ coyote+buffer, AABB tile collision.
import { TILE, PHYS } from '../../shared/constants.mjs';

export function makeBody(x, y) {
  return { x, y, vx: 0, vy: 0, w: 20, h: 30, face: 1, onGround: false, coyote: 0, jumpBuf: 0, punchT: 0, anim: 'idle' };
}

export function stepBody(p, inp, solid, dt) {
  const P = PHYS;
  dt = Math.min(dt, 1 / 20);
  // noclip: fly freely (no gravity, no collision), up/down via jump/down inputs
  if (p.noclip) {
    const want = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (want !== 0) p.face = want;
    const spd = P.maxRun * 1.5;
    p.vx += ((want * spd) - p.vx) * Math.min(1, 10 * dt);
    const vyWant = (inp.downHeld ? 1 : 0) - (inp.jumpHeld ? 1 : 0);
    p.vy += ((vyWant * spd) - p.vy) * Math.min(1, 10 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.onGround = false;
    return;
  }
  // horizontal
  const want = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (want !== 0) p.face = want;
  const acc = p.onGround ? P.accel : P.airAccel;
  const target = want * P.maxRun;
  if (p.vx < target) p.vx = Math.min(target, p.vx + acc * dt);
  else if (p.vx > target) p.vx = Math.max(target, p.vx - acc * dt);
  if (want === 0 && p.onGround) {
    const f = P.friction * dt;
    p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
  }
  // jump
  if (p.onGround) p.coyote = P.coyote; else p.coyote -= dt;
  p.jumpBuf -= dt;
  if (p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = -P.jumpVel; p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
  }
  // gravity
  p.vy = Math.min(P.maxFall, p.vy + P.gravity * dt);

  // integrate + collide (axis separated)
  moveAxis(p, solid, p.vx * dt, 0);
  const wasGround = p.onGround;
  p.onGround = false;
  moveAxis(p, solid, 0, p.vy * dt);
  if (!wasGround && p.onGround) p.landT = 0.12;

  if (p.punchT > 0) p.punchT -= dt;
  // animation state
  p.anim = p.punchT > 0 ? 'punch' : !p.onGround ? (p.vy < 0 ? 'jump' : 'fall')
    : Math.abs(p.vx) > 20 ? 'run' : 'idle';
}

function tilesOverlap(p, dx, dy) {
  const l = p.x - p.w / 2 + dx, r = p.x + p.w / 2 + dx;
  const t = p.y - p.h + dy, b = p.y + dy;
  const out = [];
  for (let ty = Math.floor(t / TILE); ty <= Math.floor((b - 0.01) / TILE); ty++)
    for (let tx = Math.floor(l / TILE); tx <= Math.floor((r - 0.01) / TILE); tx++)
      out.push([tx, ty]);
  return out;
}

function moveAxis(p, solid, dx, dy) {
  if (dx === 0 && dy === 0) return;
  if (dx !== 0) {
    p.x += dx;
    let hit = null;
    for (const [tx, ty] of tilesOverlap(p, 0, 0)) {
      if (!solid(tx, ty)) continue;
      hit = [tx, ty]; break; // topmost blocking tile first (ty ascending)
    }
    if (hit) {
      const [tx, ty] = hit;
      // auto step-up for single-block ledges (Growtopia-like feel)
      const top = ty * TILE;
      const stepH = p.y - top;
      let stepped = false;
      if (stepH >= -4 && stepH <= TILE + 4) {
        let headroom = true;
        const l = p.x - p.w / 2, r = p.x + p.w / 2;
        for (let yy = Math.floor((top - p.h + 1) / TILE); yy <= Math.floor((top - 1) / TILE); yy++)
          for (let xx = Math.floor(l / TILE); xx <= Math.floor((r - 0.01) / TILE); xx++)
            if (solid(xx, yy)) { headroom = false; break; }
        if (headroom) { p.y = top; p.onGround = true; stepped = true; }
      }
      if (!stepped) {
        if (dx > 0) p.x = tx * TILE - p.w / 2 - 0.01;
        else p.x = (tx + 1) * TILE + p.w / 2 + 0.01;
        p.vx = 0;
      }
    }
  } else {
    p.y += dy;
    for (const [tx, ty] of tilesOverlap(p, 0, 0)) {
      if (!solid(tx, ty)) continue;
      if (dy > 0) { p.y = ty * TILE; p.vy = 0; p.onGround = true; }
      else { p.y = (ty + 1) * TILE + p.h + 0.01; p.vy = 0; }
      break;
    }
  }
}
