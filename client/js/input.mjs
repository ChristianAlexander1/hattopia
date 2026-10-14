// Keyboard + touch input. Canvas taps are resolved to tiles by main via screenToWorld.
export class Input {
  constructor(canvas, cb) {
    this.cb = cb;
    this.keys = {};
    this.touch = { left: false, right: false, jump: false };
    this.screenToWorld = null; // set by main: (sx,sy) => {x,y} world px
    this.tapPlayerAt = null;   // set by main: (wx,wy) => playerId | null

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); cb.onJumpPress && cb.onJumpPress(); }
      if (e.code === 'KeyF') cb.onPunchKey && cb.onPunchKey();
      if (e.code === 'KeyE' || e.code === 'KeyB') cb.onToggleInv && cb.onToggleInv();
      if (/^Digit[1-8]$/.test(e.code)) cb.onHotbar && cb.onHotbar(Number(e.code.slice(5)) - 1);
      if (e.code === 'Escape') cb.onEscape && cb.onEscape();
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // tap detection on canvas
    let downAt = 0, downX = 0, downY = 0;
    canvas.addEventListener('pointerdown', (e) => { downAt = performance.now(); downX = e.clientX; downY = e.clientY; });
    canvas.addEventListener('pointerup', (e) => {
      const dt = performance.now() - downAt;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dt < 400 && moved < 14) this._tap(e.clientX, e.clientY);
    });

    // touch buttons
    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = (e) => { e.preventDefault(); this.touch[key] = true; if (key === 'jump') cb.onJumpPress && cb.onJumpPress(); };
      const off = (e) => { e.preventDefault(); this.touch[key] = false; };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    bind('t-left', 'left'); bind('t-right', 'right'); bind('t-jump', 'jump');
    const tp = document.getElementById('t-punch');
    if (tp) tp.addEventListener('pointerdown', (e) => { e.preventDefault(); cb.onPunchKey && cb.onPunchKey(); });
  }
  _tap(sx, sy) {
    if (!this.screenToWorld) return;
    const wpt = this.screenToWorld(sx, sy);
    if (this.tapPlayerAt) {
      const pid = this.tapPlayerAt(wpt.x, wpt.y);
      if (pid) { this.cb.onTapPlayer && this.cb.onTapPlayer(pid); return; }
    }
    const tx = Math.floor(wpt.x / 32), ty = Math.floor(wpt.y / 32);
    this.cb.onTap && this.cb.onTap(tx, ty, sx, sy);
  }
  get left() { return !!(this.keys.ArrowLeft || this.keys.KeyA || this.touch.left); }
  get right() { return !!(this.keys.ArrowRight || this.keys.KeyD || this.touch.right); }
  get jumpHeld() { return !!(this.keys.Space || this.keys.ArrowUp || this.keys.KeyW || this.touch.jump); }
}
