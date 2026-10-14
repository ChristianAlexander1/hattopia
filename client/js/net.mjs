// WebSocket client with auto-reconnect and guest token persistence.
export class Net {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.ws = null;
    this.token = localStorage.getItem('sproutopia_token') || '';
    this.lastName = localStorage.getItem('sproutopia_name') || '';
    this.lastWorld = 'START';
    this.connected = false;
    this.retryMs = 1000;
    this.wantClose = false;
  }
  connect(name, password) {
    if (name) { this.lastName = name; localStorage.setItem('sproutopia_name', name); }
    this.wantClose = false;
    this._pendingPassword = password || undefined;
    this._open();
  }
  register(name, password) {
    this.lastName = name; localStorage.setItem('sproutopia_name', name);
    this.wantClose = false;
    this._open({ t: 'register', name, password });
  }
  claimHatId(password) {
    this.send({ t: 'hatid_claim', password });
  }
  _open(helloOverride) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true; this.retryMs = 1000;
      this.onStatus(true);
      if (helloOverride) ws.send(JSON.stringify(helloOverride));
      else ws.send(JSON.stringify({ t: 'hello', name: this.lastName, token: this.token || undefined, password: this._pendingPassword, world: this.lastWorld }));
      this._pendingPassword = undefined;
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome' && m.token) {
        this.token = m.token; localStorage.setItem('sproutopia_token', m.token);
      }
      this.onMessage(m);
    };
    ws.onclose = () => {
      this.connected = false; this.onStatus(false);
      if (!this.wantClose) {
        setTimeout(() => this._open(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 1.6, 10000);
      }
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  send(o) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(o)); return true; } catch { return false; }
    }
    return false;
  }
}
