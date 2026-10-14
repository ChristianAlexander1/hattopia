// All DOM UI: login, HUD, hotbar, inventory, chat, dialogs, trade, toasts.
import { itemById } from '../../shared/items.mjs';
import { itemIcon, itemDesc } from './assets.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor(h) {
    this.h = h; // handlers from main
    this.sel = 0;             // selected hotbar index
    this.inv = new Array(24).fill(null);
    this.detailIdx = -1;
    this.trade = null;
    this.chatOpen = false;
    this._bind();
  }
  _bind() {
    const validName = (n) => /^[A-Za-z0-9_]{3,16}$/.test(n);
    // title screen -> login form
    $('btn-play').onclick = () => {
      $('login').classList.add('hidden');
      $('login-form').classList.remove('hidden');
    };
    $('btn-back').onclick = () => {
      $('login-form').classList.add('hidden');
      $('login').classList.remove('hidden');
      $('login-err').textContent = '';
    };
    // guest login (left panel)
    const guestGo = () => {
      const name = $('guest-name').value.trim();
      if (!validName(name)) { $('login-err').textContent = 'Name: 3-16 chars, letters/numbers/_'; return; }
      $('login-err').textContent = '';
      this.h.onPlay(name);
    };
    $('btn-guest').onclick = guestGo;
    $('guest-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') guestGo(); });
    // HatID login (right panel)
    const hatidGo = () => {
      const name = $('hatid-name').value.trim();
      const pass = $('hatid-pass').value;
      if (!validName(name)) { $('login-err').textContent = 'Name: 3-16 chars, letters/numbers/_'; return; }
      if (!pass) { $('login-err').textContent = 'Enter your HatID password.'; return; }
      $('login-err').textContent = '';
      this.h.onHatIdLogin(name, pass);
    };
    $('btn-hatid').onclick = hatidGo;
    $('hatid-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') hatidGo(); });
    // HatID registration mode
    $('lf-showreg').onclick = (e) => {
      e.preventDefault();
      $('hatid-login').classList.add('hidden');
      $('hatid-reg').classList.remove('hidden');
      $('login-err').textContent = '';
    };
    $('lf-showlogin').onclick = (e) => {
      e.preventDefault();
      $('hatid-reg').classList.add('hidden');
      $('hatid-login').classList.remove('hidden');
      $('login-err').textContent = '';
    };
    $('btn-reg').onclick = () => {
      const name = $('reg-name').value.trim();
      const p1 = $('reg-pass').value, p2 = $('reg-pass2').value;
      if (!validName(name)) { $('login-err').textContent = 'Name: 3-16 chars, letters/numbers/_'; return; }
      if (p1.length < 6 || p1.length > 64) { $('login-err').textContent = 'Password must be 6-64 characters.'; return; }
      if (p1 !== p2) { $('login-err').textContent = 'Passwords do not match.'; return; }
      $('login-err').textContent = '';
      this.h.onRegister(name, p1);
    };
    // in-game "Get HatID" (Help dialog)
    $('btn-hatid-claim').onclick = () => {
      const pw = $('hatid-newpass').value;
      if (pw.length < 6 || pw.length > 64) { this.notice('Password must be 6-64 characters.'); return; }
      this.h.onClaimHatId(pw);
      $('hatid-newpass').value = '';
    };
    document.querySelectorAll('[data-close]').forEach((b) => {
      b.onclick = () => $(b.dataset.close).classList.add('hidden');
    });
    $('btn-inv').onclick = () => { $('inv-panel').classList.toggle('hidden'); if (!$('inv-panel').classList.contains('hidden')) this.renderInv(); };
    $('btn-chat').onclick = () => this.toggleChat();
    $('chat-send').onclick = () => this.sendChat();
    $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.sendChat(); });
    $('btn-world').onclick = () => {
      $('dlg-world').classList.remove('hidden');
      $('world-list').innerHTML = '<div class="wrow dim">Loading…</div>';
      this.h.onListWorlds();
      $('world-input').focus();
    };
    $('world-go').onclick = () => { const w = $('world-input').value.trim(); if (w) { this.h.onJoinWorld(w); $('dlg-world').classList.add('hidden'); } };
    $('btn-help').onclick = () => $('dlg-help').classList.remove('hidden');
    $('btn-options').onclick = () => $('dlg-options').classList.remove('hidden');
    $('btn-about').onclick = () => $('dlg-about').classList.remove('hidden');
    const sq = $('sel-quality');
    if (sq) {
      sq.value = localStorage.getItem('sproutopia_quality') || 'medium';
      sq.onchange = () => {
        localStorage.setItem('sproutopia_quality', sq.value);
        if (window.__game?.vfx) window.__game.vfx.setQuality(sq.value);
        this.notice('Visual quality: ' + sq.value);
      };
    }
    $('btn-weather').onclick = () => {
      const names = { clear: 'Clear', cloudy: 'Cloudy', drizzle: 'Drizzle', rain: 'Rain', heavy: 'Heavy rain', storm: 'Storm', fog: 'Fog', snow: 'Snow' };
      const k = this.weatherKind || 'clear';
      this.notice(`Weather: ${names[k] || k} — it changes on its own.`);
    };
    // sign editor
    this.signTarget = null;
    $('sign-save').onclick = () => {
      const text = $('sign-input').value;
      if (this.signTarget) this.h.onSignText(this.signTarget.tx, this.signTarget.ty, text);
      $('dlg-sign').classList.add('hidden');
    };
    $('sign-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('sign-save').click();
      e.stopPropagation(); // don't trigger game hotkeys while typing
    });
    $('inv-drop').onclick = () => {
      const s = this.inv[this.detailIdx];
      if (s) { this.h.onDropItem(s.id, s.count); $('inv-detail').classList.add('hidden'); }
    };
    $('inv-close-detail').onclick = () => $('inv-detail').classList.add('hidden');
    // trade
    $('trade-add').onclick = () => { $('trade-addrow').classList.toggle('hidden'); this.fillTradeItems(); };
    $('trade-addok').onclick = () => {
      const id = Number($('trade-item').value), count = Math.max(1, Number($('trade-count').value) || 1);
      this.h.onTrade('add', { item: id, count });
    };
    $('trade-alock').onclick = () => this.h.onTrade('lock', {});
    $('trade-confirm').onclick = () => this.h.onTrade('confirm', {});
    $('trade-cancel').onclick = () => this.h.onTrade('cancel', {});
    // wrench
    $('wrench-trade').onclick = () => { $('dlg-wrench').classList.add('hidden'); this.h.onTradeInvite(this.wrenchTarget); };
    $('wrench-access').onclick = () => { this.h.onGrantAccess(this.wrenchTarget, true); $('dlg-wrench').classList.add('hidden'); };
    $('wrench-revoke').onclick = () => { this.h.onGrantAccess(this.wrenchTarget, false); $('dlg-wrench').classList.add('hidden'); };
  }

  // ----- login / hud -----
  showGame() {
    $('login').classList.add('hidden');
    $('login-form').classList.add('hidden');
    for (const id of ['topbar', 'hotbar', 'sidebtns', 'touch']) $(id).classList.remove('hidden');
    if (matchMedia('(pointer:fine)').matches) $('touch').classList.add('hidden');
  }
  loginError(t) { $('login-err').textContent = t; }
  setWorld(n) { $('world-name').textContent = n; }
  setGems(n) { $('gems').textContent = n; }
  setPlayers(n) { $('pcount').textContent = n; }
  setWeather(k) {
    this.weatherKind = k;
    $('btn-weather').textContent = { clear: '☀', cloudy: '⛅', drizzle: '🌦', rain: '🌧', heavy: '🌧', storm: '⛈', fog: '🌫', snow: '❄' }[k] || '☀';
  }
  setConn(ok) { $('conn').classList.toggle('hidden', ok); }

  // ----- hotbar + inventory -----
  onInv(slots, gems) {
    this.inv = slots;
    this.setGems(gems);
    this.renderHotbar();
    if (!$('inv-panel').classList.contains('hidden')) this.renderInv();
  }
  renderHotbar() {
    const hb = $('hotbar'); hb.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const s = this.inv[i];
      const d = document.createElement('div');
      d.className = 'slot' + (i === this.sel ? ' sel' : '');
      if (s) {
        d.innerHTML = `<img src="${itemIcon(s.id)}" alt=""><span class="n">${s.count > 1 ? s.count : ''}</span><span class="k">${i + 1}</span>`;
        d.title = itemById(s.id)?.name || '';
      } else d.innerHTML = `<span class="k">${i + 1}</span>`;
      d.onclick = () => { this.sel = i; this.h.onSelect(i); this.renderHotbar(); };
      hb.appendChild(d);
    }
  }
  selectedItem() {
    return this.inv[this.sel] || null;
  }
  select(i) { this.sel = i; this.renderHotbar(); }
  renderInv() {
    const g = $('inv-grid'); g.innerHTML = '';
    this.inv.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      if (s) {
        d.innerHTML = `<img src="${itemIcon(s.id)}" alt=""><span class="n">${s.count > 1 ? s.count : ''}</span>`;
        d.title = itemById(s.id)?.name || '';
      }
      d.onclick = () => this.showDetail(i);
      g.appendChild(d);
    });
  }
  showDetail(i) {
    const s = this.inv[i];
    this.detailIdx = i;
    const det = $('inv-detail');
    if (!s) { det.classList.add('hidden'); return; }
    $('inv-name').textContent = itemById(s.id)?.name || '???';
    $('inv-count').textContent = ` × ${s.count}`;
    $('inv-desc').textContent = itemDesc(s.id);
    det.classList.remove('hidden');
  }
  toggleChat(force) {
    this.chatOpen = force !== undefined ? force : $('chat-panel').classList.contains('hidden');
    $('chat-panel').classList.toggle('hidden', !this.chatOpen);
    if (this.chatOpen) { $('chat-badge').classList.add('hidden'); $('chat-input').focus(); }
  }
  sendChat() {
    const v = $('chat-input').value.trim();
    if (v) { this.h.onChat(v); $('chat-input').value = ''; }
    if (matchMedia('(pointer:coarse)').matches) $('chat-input').blur();
  }
  addChat(from, text, sys = false) {
    const log = $('chat-log');
    const div = document.createElement('div');
    div.innerHTML = sys ? `<span class="sys">${esc(text)}</span>` : `<b>${esc(from)}</b>: ${esc(text)}`;
    log.appendChild(div);
    while (log.children.length > 80) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
    if (!this.chatOpen && !sys) {
      const b = $('chat-badge'); b.classList.remove('hidden'); b.textContent = '!';
    }
  }
  notice(text, ms = 3200) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, ms);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  }

  // ----- look removed: player uses a fixed sprite sheet -----

  // ----- wrench -----
  showWrenchMenu(data) {
    const t = data.target || {};
    this.wrenchTarget = t.id;
    $('wrench-name').textContent = t.isSelf ? `${t.name} (you)` : t.name;
    $('wrench-info').innerHTML =
      `<div class="wi"><span>🌍 World</span><b>${t.world || '?'}</b></div>` +
      `<div class="wi"><span>◆ Gems</span><b>${t.gems ?? 0}</b></div>`;
    const self = !!t.isSelf;
    $('wrench-trade').classList.toggle('hidden', self);
    $('wrench-access').classList.toggle('hidden', self || !data.isLockOwner || data.targetHasAccess);
    $('wrench-revoke').classList.toggle('hidden', self || !data.isLockOwner || !data.targetHasAccess);
    $('dlg-wrench').classList.remove('hidden');
  }

  // ----- world browser -----
  renderWorldList(worlds, current) {
    const el = $('world-list');
    if (!worlds || !worlds.length) {
      el.innerHTML = '<div class="wrow dim">No worlds yet — be the first!</div>';
      return;
    }
    el.innerHTML = '';
    for (const w of worlds) {
      const b = document.createElement('button');
      b.className = 'wrow' + (w.name === current ? ' cur' : '');
      b.innerHTML = `<b>${esc(w.name)}</b><span>${w.locked ? '🔒 ' : ''}👥 ${w.players}${w.name === current ? ' • here' : ''}</span>`;
      b.onclick = () => {
        if (w.name !== current) this.h.onJoinWorld(w.name);
        $('dlg-world').classList.add('hidden');
      };
      el.appendChild(b);
    }
  }

  // ----- sign editor -----
  showSignEditor(tx, ty, text) {
    this.signTarget = { tx, ty };
    $('sign-input').value = text || '';
    $('dlg-sign').classList.remove('hidden');
    setTimeout(() => $('sign-input').focus(), 50);
  }

  // ----- trade -----
  fillTradeItems() {
    const sel = $('trade-item'); sel.innerHTML = '';
    this.inv.forEach((s) => {
      if (!s || itemById(s.id)?.undroppable) return;
      const o = document.createElement('option');
      o.value = s.id; o.textContent = `${itemById(s.id)?.name} × ${s.count}`;
      sel.appendChild(o);
    });
  }
  onTradeMsg(m, myId, myName) {
    if (m.state === 'invited') {
      this.otherName = m.by;
      let bar = $('trade-invite');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'trade-invite'; bar.className = 'dlg';
        bar.innerHTML = `<div class="dlg-box"><h3>${esc(m.by)} wants to trade</h3>
          <div class="row"><button id="ti-yes">Accept</button><button id="ti-no">Decline</button></div></div>`;
        document.getElementById('app').appendChild(bar);
      } else bar.querySelector('h3').textContent = `${m.by} wants to trade`;
      bar.classList.remove('hidden');
      $('ti-yes').onclick = () => { bar.classList.add('hidden'); this.h.onTrade('accept', { fromId: m.byId }); };
      $('ti-no').onclick = () => { bar.classList.add('hidden'); this.h.onTrade('decline', { fromId: m.byId }); };
      return;
    }
    if (m.state === 'closed' || m.state === 'done') {
      $('dlg-trade').classList.add('hidden');
      if (m.state === 'done') this.notice('Trade complete!');
      this.trade = null; return;
    }
    if (m.state === 'open') {
      this.trade = m;
      $('dlg-trade').classList.remove('hidden');
      const mine = m.aId === myId ? m.a : m.b;
      const theirs = m.aId === myId ? m.b : m.a;
      $('trade-aname').textContent = `${myName} ${mine.locked ? '🔒' : ''}`;
      $('trade-bname').textContent = `${this.otherName || 'Them'} ${theirs.locked ? '🔒' : ''}`;
      const renderOffers = (el, off) => {
        const e = $(el); e.innerHTML = '';
        for (const [id, c] of Object.entries(off)) {
          const d = document.createElement('div'); d.className = 'titem';
          d.innerHTML = `<img src="${itemIcon(Number(id))}" width="24" height="24" style="vertical-align:middle"> ×${c}`;
          d.title = itemById(Number(id))?.name || '';
          e.appendChild(d);
        }
      };
      renderOffers('trade-a', mine.offers);
      renderOffers('trade-b', theirs.offers);
      $('trade-alock').textContent = mine.locked ? '🔓 Unlock' : '🔒 Lock';
      $('trade-confirm').disabled = !(mine.locked && theirs.locked);
    }
  }
}
