// HatID tests: registration, password login, guest protection, claim, throttle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.mjs';
import { store } from '../server/db.mjs';
import { hashPassword, verifyPassword, validPassword } from '../server/auth.mjs';

test('scrypt hash/verify round-trip', () => {
  const h = hashPassword('secret123');
  assert.ok(h.startsWith('scrypt$'));
  assert.ok(verifyPassword('secret123', h));
  assert.ok(!verifyPassword('wrong', h));
  assert.ok(!verifyPassword('secret123', 'garbage'));
  assert.ok(validPassword('123456') && !validPassword('12345') && !validPassword('x'.repeat(65)));
});

let tagN = 0;
const tag = (prefix) => `${prefix}_${(++tagN).toString(36)}${Date.now().toString(36).slice(-3)}`;

function freshGame() {
  const inbox = new Map(); // playerName -> [messages via game send]
  const game = new Game((p, m) => {
    if (!inbox.has(p.name)) inbox.set(p.name, []);
    inbox.get(p.name).push(m);
  });
  return { game, inbox };
}
function mkWs() {
  return { errs: [], send(s) { this.errs.push(JSON.parse(s)); } };
}
const welcomeGot = (inbox, name) => (inbox.get(name) || []).some((m) => m.t === 'welcome');
const lastErr = (ws) => ws.errs.length ? ws.errs[ws.errs.length - 1] : null;

test('HatID: register -> login with password, wrong password rejected', () => {
  const { game, inbox } = freshGame();
  const name = tag('HatUser');
  const ws = mkWs();
  game.onRegister(ws, { t: 'register', name, password: 'pw12345' });
  assert.ok(welcomeGot(inbox, name), 'registered user gets welcome');
  assert.ok(store.getPlayerByName(name).password_hash?.startsWith('scrypt$'), 'hash stored');

  // correct password login on a new connection
  const ws2 = mkWs();
  game.onHello(ws2, { t: 'hello', name, password: 'pw12345' });
  assert.ok(welcomeGot(inbox, name), 'password login works');

  // wrong password
  const ws3 = mkWs();
  game.onHello(ws3, { t: 'hello', name, password: 'nope-nope' });
  assert.ok(/Wrong password/.test(lastErr(ws3).text), 'wrong password rejected');

  // guest attempt on HatID-protected name
  const ws4 = mkWs();
  game.onHello(ws4, { t: 'hello', name });
  assert.ok(/HatID/.test(lastErr(ws4).text), 'guest blocked on HatID name');
});

test('HatID: guest claim binds password to own session only', () => {
  const { game } = freshGame();
  const name = tag('ClaimUser');
  const ws = mkWs();
  game.onHello(ws, { t: 'hello', name }); // guest
  const p = game.players.get(game.byWs.get(ws));
  assert.ok(p, 'guest logged in');
  assert.equal(store.getPasswordHash(p.id), null, 'no hash yet');

  game.onMessage(ws, JSON.stringify({ t: 'hatid_claim', password: 'claimpw1' }));
  assert.ok(store.getPasswordHash(p.id)?.startsWith('scrypt$'), 'hash set after claim');

  // another session claims only its own name
  const other = tag('OtherUser');
  const wsB = mkWs();
  game.onHello(wsB, { t: 'hello', name: other });
  const pB = game.players.get(game.byWs.get(wsB));
  game.onMessage(wsB, JSON.stringify({ t: 'hatid_claim', password: 'evilpass' }));
  assert.ok(store.getPasswordHash(pB.id)?.startsWith('scrypt$'), 'other user claims own name');
  assert.ok(verifyPassword('claimpw1', store.getPasswordHash(p.id)), 'original hash untouched');
});

test('HatID: password login throttled after 5 failures', () => {
  const { game, inbox } = freshGame();
  const name = tag('Throttle');
  game.onRegister(mkWs(), { t: 'register', name, password: 'throttle1' });
  assert.ok(welcomeGot(inbox, name), 'registered');
  const ws = mkWs();
  for (let i = 0; i < 5; i++) game.onHello(ws, { t: 'hello', name, password: 'wrong' + i });
  game.onHello(ws, { t: 'hello', name, password: 'throttle1' }); // 6th: correct pw but throttled
  assert.ok(/Too many attempts/.test(lastErr(ws).text), 'throttled after 5 fails');
});

test('HatID: register rejects taken names and weak passwords', () => {
  const { game } = freshGame();
  const name = tag('DupUser');
  game.onRegister(mkWs(), { t: 'register', name, password: 'duppass1' });
  const ws = mkWs();
  game.onRegister(ws, { t: 'register', name, password: 'another1' });
  assert.ok(/taken/.test(lastErr(ws).text), 'duplicate rejected');
  const ws2 = mkWs();
  game.onRegister(ws2, { t: 'register', name: tag('WeakUser'), password: '123' });
  assert.ok(/6-64/.test(lastErr(ws2).text), 'weak password rejected');
});
