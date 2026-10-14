# Sproutopia — Master Implementation Pass: Final Acceptance Report
**Date:** 2026-10-14 · **Scope:** Phases 0–10 of the master implementation prompt
**Repo:** `~/workspace/growtopia/` · **Tests:** 39/39 pass (`npm test`, isolated DB)

Status labels: COMPLETE AND VERIFIED · IMPLEMENTED BUT UNVERIFIED ·
PARTIALLY IMPLEMENTED · NOT IMPLEMENTED · BLOCKED

---

## 1. What was built, file by file

- `shared/items.mjs` — 14 new deco items (ids 29–42) + 14 seeds (129–142) +
  14 splice recipes; `isBlock()` accepts `kind:'deco'`; door detection via
  `action:'door'`. **COMPLETE AND VERIFIED**
- `shared/constants.mjs` — stale `WEATHERS` replaced by `WEATHER_KINDS` +
  `rollWeatherKind()` (centralized weighted weather). **COMPLETE AND VERIFIED**
- `server/game.mjs` — sign edit validation/broadcast; door policy
  (visitor teleport / editor break); wired jump/pickup/error/door sounds;
  door FX broadcast; deterministic drop table (unchanged logic, now tested).
  **COMPLETE AND VERIFIED**
- `server/world.mjs` — `signs: Map` on WorldState; signs in snapshots and
  `signsJson` serialization. **COMPLETE AND VERIFIED**
- `server/db.mjs` — backward-compatible `worlds.signs TEXT` migration;
  `listWorldMeta()` (public metadata only); `SPROUT OPIA_DB` override.
  **COMPLETE AND VERIFIED**
- `server/server.mjs` — `GET /health`; `HOST` env; graceful SIGINT/SIGTERM
  shutdown (saves worlds + players, closes SQLite). **COMPLETE AND VERIFIED**
- `client/index.html`, `client/css/style.css`, `client/js/ui.mjs` — sign
  editor dialog (Save/Cancel); world browser list UI; 44px touch targets;
  8 weather icons + explanatory weather button. **COMPLETE AND VERIFIED**
- `client/js/render.mjs` — proximity sign labels (hysteresis 3.5/4.5 tiles,
  wrap, nudge, styled, above world); animated water via 4 VFX frames on a
  global clock. **COMPLETE AND VERIFIED**
- `client/js/vfx.mjs` — world-space rain splashes (column from camera/scale;
  ripple on water, ground otherwise). **COMPLETE AND VERIFIED**
- `client/js/assets.mjs` — UI icon preloads trimmed to the 2 actually used
  (backpack, fist); deco item descriptions (incl. door policy). **COMPLETE AND VERIFIED**
- `tests/setup.mjs` (new), `tests/logic.test.mjs`, `tests/sync.test.mjs`,
  `tests/vfx.test.mjs` (new) — isolation + 18 new tests.
  **COMPLETE AND VERIFIED**
- `docs/DEPLOY.md` (new), `docs/LEDGER.md`, `.env.example` — hosting docs,
  full ledger, env documentation. **COMPLETE AND VERIFIED**

## 2. Test report — COMPLETE AND VERIFIED
- `npm test` (with `tests/setup.mjs` hook → unique temp SQLite DB per run,
  cleaned at exit): **39 tests, 39 passed, 0 failed.**
- New coverage: deco registry/recipes/placement/sync/permissions/doors (7),
  sign edit/broadcast/permissions/range/nonexistent/destroy/serialization
  (7), water frames + splash classification/cleanup (6), weather
  distribution + boundary rolls (1), deterministic drops — block/seed/gems
  via stubbed `Math.random` (1), door policy visitor/editor (1), world
  browser metadata allowlist (1).
- Production DB verified unchanged by the suite (49 players / 1 world /
  255 inventory rows before and after).

## 3. Browser verification report — COMPLETE AND VERIFIED
Headless Chrome (CDP-driven) against the live server with the new code:
login, gameplay, world browser, sign render/editor, weather, mobile
emulation, 2-player multiplayer, soak (5× dialog open/close). **Zero console
errors, zero failed requests.** Screenshots: `qa10_desktop`,
`qa10_worldbrowser`, `qa10_sign_near`, `qa10_sign_far`,
`qa10_sign_editor`, `qa10_mobile` (in `/tmp/`).
Multiplayer: Alice and Bob see each other; server `/health` reported
players:2 during the session.

## 4. Asset integration report — COMPLETE AND VERIFIED
All 82 registry items validated: every `tile` key maps to an existing file
under `client/img/` (via the real `TILE_FILES` mapping); 37/37 seeds resolve
to valid blocks; all splice recipes reference valid items. The 14 deco
sprites were montage-verified with correct transparency in Phase 1. No
generated placeholders, no proprietary runtime assets; `assets/ref/**`
remains reference-only and unshipped.

## 5. Sign system report — COMPLETE AND VERIFIED
Server-authoritative edits (tile must exist, edit permission, range,
500ms anti-spam, 80-char cap preserving punctuation/Unicode, same-world
broadcast). Persistence: `worlds.signs` column (backward-compatible),
`signsJson` in snapshots; placing creates empty text, breaking removes it.
UI: editor dialog (Save/Cancel); floating labels with show/hide hysteresis,
two-line wrapping, overlap nudging, styled dark/brown, rendered above world.
Browser-verified near (label shown) and far (label hidden). One design note:
sign item (id 9) currently has no seed/recipe — it is unobtainable in normal
play (pre-existing gap, see §16).

## 6. Water and splash report — COMPLETE AND VERIFIED
Water tiles animate through 4 VFX frames on a synchronized global clock
(static tile fallback; collision unchanged). Rain splashes compute the real
world column from camera/scale; first visible surface decides: ripple on
water (id 16), ground splash otherwise. Browser-verified with both splash
kinds present; 6 unit tests pass.

## 7. World browser report — COMPLETE AND VERIFIED
`listWorldMeta()` exposes only `{name, players, locked}` (max 50, persisted
+ live worlds merged). Browser-verified: START row showed lock icon, player
count, and "here" marker; rows join via the existing server-authoritative
flow; manual name input retained.

## 8. Mobile/UI report — COMPLETE AND VERIFIED (emulation only)
8 weather icons; weather button explains the current auto-changing weather;
44px minimum touch targets; responsive world list; 390×844 emulation
verified with zero errors. **Physical iPhone Safari: IMPLEMENTED BUT
UNVERIFIED** (no device available; never claimed otherwise).

## 9. Hygiene/isolation report — COMPLETE AND VERIFIED
Dead code removed (stale `WEATHERS`, unused icon preloads, disconnected
`listWorlds`); dead sounds wired (jump, pickup, error, door); centralized
weather; test DB fully isolated via `SPROUT OPIA_DB` + setup hook.
Production data untouched by tests (verified by row counts).

## 10. Door policy and interaction report — COMPLETE AND VERIFIED
Policy (documented in code + item descriptions + tested): in any world,
punching a door as a **visitor** (no edit permission) teleports to spawn —
intra-world movement, never a lock bypass (unchanged behavior); punching as
an **editor** (owner/access) damages/breaks the door — previously doors were
permanent and unremovable. Punch-button row-scan kept as intended behavior
(documented decision, not changed).

## 11. Drop table report — COMPLETE AND VERIFIED
Deterministic tests with stubbed `Math.random`: roll < 0.55 → block;
0.55–0.8 (+ seed) → seed; gems = `floor(rand × (rarity+1))` (stone:
rarity 3 → 3 gems at rand 0.9, no item at high roll). All pass; no logic
changes were needed.

## 12. Storage assessment — NOT IMPLEMENTED (deliberate, per prompt)
Secure containers require: new DB table + migration, 4 message types,
open-session anti-duplication locks, container UI, removal semantics.
Feasible against this architecture (atomic-trade patterns exist) but too
large/risky for this pass — duplication bugs are the worst kind in
multiplayer. Chest and Storage Box remain explicitly decorative (item
descriptions say so). No fake storage UI was built.

## 13. Hosting report — COMPLETE AND VERIFIED
`GET /health` → `{ok, uptime, players, worlds}` (verified via curl);
`HOST`/`PORT`/`SPROUT OPIA_DB` env config (`.env.example` updated); graceful
shutdown on SIGINT/SIGTERM verified (saves + clean exit); `docs/DEPLOY.md`
covers reverse-proxy WebSocket notes, volume persistence, backup/restore,
and shutdown behavior. No hardcoded tunnel URLs. No deployment performed
(per instructions).

## 14. Data safety report — COMPLETE AND VERIFIED
No player/world rows reset, deleted, or overwritten at any point. Schema
change is a single backward-compatible `ADD COLUMN`. Test suite runs
against a temp DB (production counts verified unchanged). Live server
restarted via safe two-step kill/start; autosave + disconnect saves kept
data intact across the restart.

## 15. Boundaries respected
- Browser-only: no native/offline builds added; the earlier offline idea
  stays reversed per the user's explicit "jangan di bikin offline".
- Original art only; `assets/ref/**` untouched and unshipped.
- No manual tunnels opened (keepalive ownership respected); no paid
  hosting touched; no physical-iPhone claims made.
- No future features implemented while earlier phases were incomplete;
  server authority preserved throughout.

## 16. Residual risks and follow-ups
1. **Physical iPhone Safari untested** — emulation only; needs a real device.
2. **Sign unobtainable** (id 9: no seed/recipe) — pre-existing design gap;
   the sign system works end-to-end but players can't acquire signs in
   normal play. Game-design decision for the user.
3. **Same-browser tabs share a login token** — second tab takes over the
   session (first tab becomes a ghost). Acceptable session semantics, but a
   "connected elsewhere" notice would be nicer.
4. **Storage containers** — design deferred (see §12).
5. **Very long unbroken words** in sign labels could use stronger
   wrapping/ellipsis (minor).
6. Public tunnel URL may rotate/expire (free Pinggy); always health-check
   via the keepalive before sharing.
