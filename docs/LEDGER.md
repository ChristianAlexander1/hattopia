# Development Task Ledger

States: NOT STARTED → IN PROGRESS → IMPLEMENTED → VERIFIED
(VERIFIED = actually tested, not just written.)

## Milestone 1 — Playable browser foundation — VERIFIED
- Canvas renderer w/ camera, culling, parallax backdrop — VERIFIED (browser test)
- Procedural player character, idle/run/jump/fall/punch — IMPLEMENTED
- Accel movement, coyote time, jump buffering, AABB tile collision — VERIFIED (unit-tested physics path via gameplay tests)
- Touch controls (left/right/jump/punch) + keyboard/mouse — IMPLEMENTED
- 100×60 tile world, bedrock base, procedural generation — VERIFIED (tests)

## Milestone 2 — Core sandbox mechanics — VERIFIED
- Punch with range + cooldown validation, per-block hardness — VERIFIED (tests)
- Block damage, 5s damage restore (researched rule) — VERIFIED (tests)
- Block breaking → drops (block/seed/gems/nothing) — VERIFIED (tests)
- Block/background placement, inventory deduction, anti-suffocation — VERIFIED (tests)
- Item drops: physics, magnet, pickup — IMPLEMENTED
- Inventory: 24 slots, stacking to 200 — VERIFIED (tests)

## Milestone 3 — Farming and progression — VERIFIED
- Seed planting (needs empty tile + solid ground) — VERIFIED (tests)
- Growth stages + timers, persistent across restarts — VERIFIED (tests)
- Harvest: 1–4 fruit, 21% seed return, rarity-scaled gems — VERIFIED (tests)
- Splicing with recipe table, incompatible-pair rejection — VERIFIED (tests)
- Character customization (colors, persisted) — IMPLEMENTED

## Milestone 4 — Persistence — VERIFIED
- SQLite: players, inventory, appearance, gems — VERIFIED (tests)
- Worlds: tiles, seeds, locks, weather saved/loaded — VERIFIED (server restart path)
- Autosave every 30s + save on disconnect — IMPLEMENTED

## Milestone 5 — Multiplayer — VERIFIED
- WebSocket server, guest sessions, reconnect — VERIFIED (real WS test)
- Movement/animation sync @10Hz — VERIFIED (real WS test)
- Shared tile edits, drops, chat — VERIFIED (tests)
- Server-authoritative validation (range, cooldown, permissions) — VERIFIED (tests)

## Milestone 6 — Social and advanced — VERIFIED (logic) / PARTIAL (UI)
- World chat + /join + sanitization + rate limit — VERIFIED (tests)
- World Lock ownership + access list + wrench menu — VERIFIED (tests)
- Atomic trading (lock+confirm, disconnect-safe, no dup) — VERIFIED (tests)
- Doors (punch to teleport to spawn) — IMPLEMENTED
- Weather: clear/rain cycle, synced, particles — IMPLEMENTED

## Milestone 7 — Original assets — VERIFIED
- Generated + post-processed: 13 tiles, 4 growth stages, wrench/gem icons, backdrop — VERIFIED (in-game via browser test)
- Procedural: character, particles, SFX — IMPLEMENTED

## Milestone 8 — Production delivery — IN PROGRESS
- 21 automated tests passing — VERIFIED
- Live browser smoke test — IN PROGRESS (running)
- Security: server-side validation, no trusted client inventory — IMPLEMENTED
- Public URL — pending tunnel; permanent hosting needs an account (documented)

## Parity backlog (documented, not hidden)
- Area locks (only whole-world lock implemented)
- Clothing items beyond color customization
- Gem store / purchasable items
- Larger item catalog (13 tiles + 7 seeds currently)
- Password accounts (guest sessions only)
- Minimap, world-of-the-day, social discovery feeds

## 2026-10-14 — Visual overhaul + bugfix
- Art overhaul after user feedback: researched real Growtopia look from public
  screenshots/wiki (palette sampled; every pixel redrawn from scratch, no copied
  sprites). New `scripts/draw_assets.py` generates all 32x32 tiles (dirt, grass,
  stone, bedrock, wood, leaves, sand, brick, glass, door, sign, worldlock,
  torch, dirtbg, cavebg), 4 flora stages, sky backdrop, gem/wrench icons.
- Player redrawn chibi-style (`client/js/player_draw.mjs`): big square head,
  white eyes + pupils, bald/bare-torso default; name tag now shown for own
  player; server DEFAULT_LOOK updated to match.
- Bugfix: autosave `saveWorld` omitted `spawnJson` -> "tick error: Provided value
  cannot be bound to SQLite parameter 7" every 30s. Fixed; spawn now persists.
- Verified: 21/21 tests pass, headless-Chrome screenshots (desktop+mobile),
  zero page errors.

## 2026-10-14 — Face variants (reference-based, original art)
- User shared a raw sprite sheet; per project boundary (original art only, no
  proprietary sprites) it was used as structural reference only, not copied.
- Added 4 original face styles: classic / happy / angry / sleepy
  (`client/js/player_draw.mjs`), selectable in the look dialog (`ui.mjs`),
  synced via new `face` look field (server-validated whitelist, `game.mjs`).
- Verified: 21/21 tests pass, face variants screenshot-checked in headless Chrome.

## 2026-10-14 — Tile redraws from extracted references (original art)
- Redrew bedrock / stone / wood / cavebg in `scripts/draw_assets.py` using the
  extracted reference crops (assets/ref/blocks/) as style guide — all pixels
  original: bedrock = dark purple-gray shattered facets; stone = pale cloudy
  boulder; wood = framed panel w/ grain; cavebg = near-black w/ subtle bands.
- Verified in headless Chrome via the game's own asset loader; 21/21 tests pass.
- Note: earlier pinggy tunnel expired (60-min free limit); re-established:
  https://brqpk-2606-54c1-1-15c--41a-41.free.pinggy.net

## 2026-10-14 — Dirt redraw from extracted reference (original art)
- Redrew dirt in `scripts/draw_assets.py` from the extracted tile_dirt.png
  reference: darker brown base with the distinctive diagonal stripe bands +
  speckles. Grass tile inherits the striped dirt base (matches GT's
  dirt+grass-overlay composition). Player body frames reviewed — current
  procedural player already matches the reference proportions; no change needed.
- Verified in headless Chrome in-game screenshot; 21/21 tests pass.

## 2026-10-14 — Player body cleanup (user: "player masih berantakan")
- Reworked lower body in `client/js/player_draw.mjs`: legs 10px->14px, walk
  swing changed from vertical bounce to horizontal forward/back stride,
  back leg + back shoe shaded darker so the two legs stay readable when they
  cross, torso now sits flush under the head (collar gap removed), head
  shifted to -64..-38, all face variants + punch arm re-aligned, body bob
  added to run cycle, name tag lifted to -72.
- Verified via headless walk-left/walk-right screenshots (2 iterations);
  21/21 tests pass.

## 2026-10-14 — Sprite-sheet player (user: "pake ini aja untuk playernya")
- User uploaded their own sprite sheet (AI-generated style, Indonesian
  labels); NOT Growtopia art — used with explicit permission.
- Extracted 22 frames to `client/img/player/` (bg keyed to transparent).
- Rewrote `client/js/player_draw.mjs` to render sprites: idle cycle,
  walkR/walkL rows, jump_1 (naik) / jump_4 (turun), punch fist overlay,
  name tag kept. Removed the look-customization UI (fixed sprite).
- Original sheet archived at `assets/ref/player_sheet/`.
- Verified idle/walk-left/walk-right/jump in headless Chrome, zero errors;
  21/21 tests pass.

## 2026-10-14 — Player sprite sheet v2 (user: "fix pake ini")
- User uploaded a bigger animation sheet (idle/walk/run/jump/fall/land/
  punch/etc.). Extracted 34 frames to `client/img/player/` replacing v1:
  idle x5, runR x7, runL x6, jump x7, fall x5, punch x5.
- `player_draw.mjs`: run uses runR/runL rows, jump_2 tucked pose, fall
  cycles, punch plays a real 5-frame one-shot driven by punchT.
- Verified all 6 states in headless Chrome, zero errors; 21/21 tests pass.

## 2026-10-14 — Player size + idle fix (user feedback)
- TARGET_H 76 -> 64 (exactly 2 tiles; was oversized).
- Idle now uses a single static frame (idle_2) instead of cycling 5 frames
  (user: "pas diam animasi playernya gerak gerak sendiri").
- Verified in headless Chrome; 21/21 tests pass.

## 2026-10-14 — Player size 64 -> 48 (user: "masih kebesaran")
- Compared 64/56/52/48px renders against 32px tiles; 48px (1.5 tiles)
  chosen as proportional. Verified in-game screenshot before reporting.
- 21/21 tests pass.

## 2026-10-14 — White artifacts + floating feet fix (user screenshot)
- White pixels trapped between legs (bg not reached by border flood-fill)
  removed from all 35 frames: near-white pixels below head region keyed out.
- Trimmed 3px transparent bottom padding from every frame so feet sit
  exactly on the block (was hovering).
- Verified in-game: feet touch grass, no white artifacts. 21/21 tests pass.

## 2026-10-14 — Block overhaul from user texture pack ("rombak semua block")
- User uploaded `texture_0_jv1u.zip` (AI-generated GT-style pack, 58 tiles).
- Replaced 11 tiles with pack art (32x32 NEAREST): dirt, grass, stone,
  wood, brick, glass, bedrock, door, sign, cavebg + dirtbg (darkened dirt).
- worldlock/torch kept procedural (no pack equivalent).
- Flora replaced: seed/sprout/medium/grown from pack.
- Pack archived at `assets/ref/block_pack/`. draw_assets.py tile output
  is now superseded (do not re-run for tiles).
- Verified in-game screenshot, zero errors; 21/21 tests pass.

## 2026-10-14 — Seamless tiles + smaller seed (user feedback)
- User: "block berongga jadikan rapat, seed jadi kecil".
- Tiles had dark vignette outlines (bedrock/dirtbg 100% black border)
  causing grid gaps. Fixed by cropping 8% vignette from pack tiles before
  32px resize; grass top blades preserved.
- Seed draw 32x48 -> 20x30 centered in render.mjs.
- Verified in-game screenshot (no seams), zero errors; 21/21 tests pass.

## 2026-10-14 — Full asset pack integration (asset2.zip, 78 files)
- User uploaded complete asset collection: 78 individual + 5 sheets.
- ALL 78 integrated: 24 blocks (16 NEW: rock/sand/lava/water/ice/snow/
  trunk/leaves/bush/metal/spike/platforms/deco/glow), 21 objects
  (door/sign/torch/lock art replaced + 14 new deco placeables),
  33 UI icons (backpack/fist/wrench wired to live buttons).
- New systems: hazard tiles (lava/spike respawn), light flag on glow/lamp.
- Sheets archived as reference (no duplicate rendering).
- 21/21 tests pass. Registry: docs/ASSET_REGISTRY.md.

## 2026-10-14 — Weather & Environment VFX (Pack 3, vfx.zip)
- Inspected 110 PNGs (manifest correct); water verified seamless 2x2.
- Converted 53 key assets to client/img/vfx/ (clouds/rain/splashes/water/
  wind/fog/lighting). 57 duplicates archived.
- New client/js/vfx.mjs: pooled particles, parallax clouds, fog layers,
  lightning, torch glow, 8 weather presets with smooth transitions.
- Server: 8 weather kinds (weighted). UI: quality selector (High/Med/Low).
- Verified storm/rain/fog in headless Chrome, zero errors. 21/21 tests pass.

## 2026-10-14 — White-artifact sweep (all 181 asset PNGs)
- Scanned all PNGs under client/img (181 files): near-white pixel stats +
  border flood-fill + opaque-corner check; visually inspected every category
  (tiles/objects/ui/player/flora/vfx) on checkerboard montages.
- Finding: only client/img/vfx/lighting/glow_torch.png and
  glow_gradient.png produced white artifacts — opaque hard-edged orange discs
  rendered additively as giant white blobs around torches/glow blocks in-game.
- Fix: regenerated both as original soft radial gradients (warm core fading to
  transparent); pack originals remain archived in assets/ref/vfx_pack/vfx.zip.
- All other whites are intentional art (clouds, snow, splash, highlights,
  gem/worldlock shine, mattress, rain streaks, snowflakes). 35 player frames,
  32 tiles, 21 objects, 33 UI icons, flora all clean.
- Verified in-game in headless Chrome: showcase strip of all 27 fg tile ids +
  bg ids rendered with no white blobs; torch/glow now show subtle halo.
  21/21 tests pass.

## 2026-10-14 — Punch range, wrench info, starter tools (user FYI)
- Punch is now long-range: PUNCH_RANGE 3.4 -> 5 tiles (server-authoritative;
  also governs place/plant reach). Punch button scans the facing direction and
  hits the first block within range instead of only the adjacent tile. Tapping
  a distant tile already worked; out-of-range now shows "Too far to reach."
  instead of failing silently (client + server).
- Wrench is now for player info: tapping yourself or another player opens the
  wrench dialog showing Name, World, and Gems; Trade/access buttons stay for
  other players (trade hidden for self, access only for lock owners).
- Every player now has Wrench (80) + Fist (81) in inventory: fist added to
  STARTER_KIT, both made undroppable, server ensureTools() grants them to
  older accounts on login, fist is now visible/selectable in inventory+hotbar
  (fist icon wired in assets.mjs).
- Verified in headless Chrome: fresh account inventory
  [1x20,101x5,102x3,80x1,81x1,50x1]; punch button targeted a dirt block 4
  tiles away; wrench-self dialog showed name/world/gems. 21/21 tests pass.

## 2026-10-14 — Master implementation pass, phases 0-9 (user: master prompt)

### Phase 0 — Revalidation (COMPLETE)
- Server HTTP 200 on :8080. Confirmed all 14 deco object sprites + dims and
  4 VFX water frames (32x32 each, static water tile 32x32).

### Phase 1 — 14 decorative objects (COMPLETE AND TESTED)
- `shared/items.mjs`: new ids 29-42 (Blue Door, Barn Door, Chest, Crate, Bed,
  Chair, Table, Mailbox, Lamp, Potted Plant, Potted Fern, Display Stand,
  Storage Box, Ladder); `kind:'deco'`; `isBlock()` extended; doors use
  `action:'door'`. Item 33 maps to obj_chair art / 34 to obj_bed (source
  filenames are swapped vs their visuals).
- Seeds 129-142 + 14 splice recipes (e.g. Wood+Dirt=Lamp? no — Metal+Glow=Lamp;
  full list in items.mjs). No grants to existing accounts; splicing only.
- Chest/Storage Box explicitly decorative (no storage behavior), Ladder no
  climbing. Duplicate wrench description fixed.
- Tests: registry, recipes, placement/removal/sync, lock perms, door action,
  serialization. Visual montage verified all 14 sprites, zero console errors.

### Phase 2 — Sign system (IMPLEMENTED, verified; 2 follow-ups fixed)
- Backward-compatible migration: `worlds.signs TEXT`. `WorldState.signs`
  Map<idx,text>; snapshots + serialization include signsJson; placing creates
  empty text; breaking removes metadata; legacy rows supported.
- Server validation: tile exists, edit permission, PUNCH_RANGE, 500ms
  anti-spam, 80-char cap (control chars stripped, punctuation/Unicode
  preserved), broadcast to same world only.
- UI: Save/Cancel editor dialog; floating labels in world space with
  hysteresis (show 3.5 / hide 4.5 tiles), 2-line wrap, overlap nudging, dark
  interior + brown border; rendered above world/player layers.
- Verified near/far + dialog in headless Chrome, zero console errors.
- Fixed: sign editor now opens with Wrench or empty hand (not fist);
  sanitizer preserves punctuation/Unicode.

### Phase 3 — Animated water + world-space splashes (COMPLETE AND VERIFIED)
- Water tiles cycle 4 VFX frames on a synchronized global clock; static tile
  fallback until loaded. Collision unchanged (solid).
- Rain splashes derive the world column from camera/scale; first visible
  surface -> ripple on water (id 16), ground otherwise; expired splashes
  removed safely. 6 VFX tests. Browser-verified ground + ripple, 0 errors.

### Phase 4 — World browser (COMPLETE AND VERIFIED)
- `server/db.mjs` `listWorldMeta()`: public metadata only (name, players,
  locked). `Game.onListWorlds()` merges persisted + live unsaved worlds,
  max 50. No owner ids/access lists/tokens leak.
- Client world dialog now has a scrollable world list (name, lock, players,
  current-world marker); manual input retained. Browser-verified with 0 errors.

### Phase 5 — Mobile/desktop UI polish (COMPLETE for emulation)
- 8 weather icons (clear..snow); weather button explains current weather.
- 44px minimum touch targets on topbar + dialog buttons.
- Mobile emulation 390x844 verified, zero console errors. Physical iPhone
  Safari remains untested (no device).

### Phase 6 — Code hygiene + test DB isolation (COMPLETE)
- Stale WEATHERS replaced with WEATHER_KINDS + rollWeatherKind(); server uses
  centralized weighted selection. Wired dead sounds: jump, pickup, error,
  door (door fx broadcast). listWorlds connected to world browser.
- Test isolation: SPROUT OPIA_DB override + tests/setup.mjs (temp DB per run,
  cleaned at exit); `npm test` runs with the setup hook. Production DB
  verified unchanged (49 players / 1 world / 255 inv rows before and after).
- UI icon preloads trimmed to the 2 actually used (backpack, fist); rest stay
  on disk documented as future assets.

### Phase 7 — Gameplay consistency (COMPLETE)
- Door policy decided + implemented + tested: visitors (no edit perm) punch
  door -> teleport to spawn (unchanged, intra-world, never a lock bypass);
  editors (owner/access) punch door -> damage/break (doors were previously
  permanent/unremovable). itemDesc + code document the policy.
- Punch-button row-scan kept as intended behavior (documented decision).
- Deterministic drop tests: block (<0.55), seed (0.55-0.8), gems
  floor(rand*(rarity+1)) — all via stubbed Math.random.

### Phase 8 — Storage feasibility (ASSESSED: NOT IMPLEMENTED this pass)
- Secure containers need: new DB table + migration, 4 message types, open-
  session anti-duplication locks, container UI, removal semantics. Feasible
  but too large/risky for this pass (duplication bugs are the worst kind);
  per the master prompt's allowance, chest/storage stay explicitly
  decorative. Concrete design deferred to a follow-up.

### Phase 9 — Hosting readiness (COMPLETE)
- `GET /health` -> {ok, uptime, players, worlds}. HOST env added.
- Graceful shutdown on SIGINT/SIGTERM: saves dirty worlds + all players,
  closes SQLite, then exits. Verified via curl + SIGTERM test.
- `.env.example` documents PORT/HOST/SPROUT OPIA_DB. New `docs/DEPLOY.md`:
  config, health checks, WebSocket reverse-proxy notes, volume persistence,
  backup/restore, shutdown behavior. No hardcoded tunnel URLs anywhere.

### Phase 10 — Final verification (IN PROGRESS)
- 39/39 tests pass (isolated DB). Registry validated: 82 items all map to
  existing asset files; 37 seeds all resolve; all recipes valid.
- Server restarted with the new code (safe two-step kill/start); /health OK.
- Browser QA + screenshots pending.

### Phase 10 — Final verification (COMPLETE 2026-10-14)
- Syntax: node --check clean on all server/shared/client/tests files.
- Tests: 39/39 pass via `npm test` (isolated temp DB; production DB untouched
  by the suite).
- Registry: 82 items — every tile key maps to an existing asset file; 37
  seeds all resolve to valid blocks; all splice recipes reference valid items.
- Server restarted with the new code (safe two-step kill/start); /health OK.
- Browser QA (headless Chrome, CDP-driven): login, gameplay, world browser
  dialog (START row: lock + 1 player + "here"), sign label near (styled,
  wrapped, above world) / far (hidden), sign editor dialog, weather button
  (drizzle active), mobile emulation 390x844, 2-player multiplayer (both see
  each other; server health players:2). Zero console errors, zero failed
  requests. Soak: 5x world-dialog open/close, no errors.
- Screenshots: /tmp/qa10_desktop.png, qa10_worldbrowser.png,
  qa10_sign_near.png, qa10_sign_far.png, qa10_sign_editor.png, qa10_mobile.png.
- QA artifacts: a stray headless Chrome from the 21:27 furniture QA was found
  still alive; it auto-reconnected after the server restart (confirming
  reconnect works) and was cleaned up. Two same-profile tabs share a login
  token (expected session-takeover behavior, not a bug); QA used separate
  profiles after that.
- Not done: physical iPhone Safari (no device); sign obtainability gap noted
  (sign item id 9 has no seed/recipe — pre-existing design gap, out of scope).

## 2026-10-14 — Title screen + HatID login (user request with reference photos)
- New title screen modeled on the Growtopia reference: user-supplied Hattopia
  logo (`client/img/logo.png`, 1884x835) floating slow up-down (5s ease-in-out),
  CSS sky with 5 drifting clouds (60-130s loops), sun, hills, Play Online /
  Options / About buttons, V0.1.0 bottom-right.
- Play Online now opens a second login screen (like the 2nd reference): left
  panel = guest (name + Connect), right panel = HatID login (in-game name +
  password + Connect), Back button returns to title. Visual quality selector
  moved from Help dialog to new Options dialog; new About dialog.
- HatID account system (server-authoritative): `players.password_hash`
  (backward-compatible migration), scrypt hashing (`server/auth.mjs`,
  stdlib only, timing-safe compare), `hello` with password, `register`
  (free names only), `hatid_claim` (in-session: only the authenticated owner
  can bind a password to their own guest name). Login throttled: 5 fails /
  60s per connection. Guest login on a HatID-protected name is rejected with
  guidance. In-game "Get HatID" lives in the Help dialog.
- Tests: 5 new auth tests (hash round-trip, register/login/wrong-pw,
  guest-claim binding, throttle, duplicate/weak rejection). 44/44 pass.
- Browser QA: form shows, Back works, guest login, in-game claim
  ("HatID created for ..."), wrong password -> "Wrong password.", correct
  password logs in on a fresh profile. Zero console errors.
- Fixed: title-screen dialogs (Options/About) had z-index 50 < login's 60
  and rendered behind the overlay; now z-index 70.

## 2026-10-14 — Punch impact clouds + block damage cracks (user request + ref image)
- 5 punch-cloud sprites cropped from the user-supplied reference strip
  (320x64 RGBA, real alpha channel — black was transparency, not background).
  Clean 64px cells, trimmed to tight bboxes, pixels untouched:
  `client/img/vfx/punch_0.png` … `punch_4.png` (24x26 → 42x42, expanding burst).
  Interpreted as sequential burst frames (small/bright → large/dim), not variants.
- Punch clouds (`client/js/vfx.mjs`): pooled (max 40, oldest recycled),
  spawn on valid punches (breakable fg or seed) at impact point, drift toward
  facing dir (~26-48 px/s, mirrored when facing left), 5-frame expand sequence
  over ~450ms life, full opacity 45% then smooth alpha fade (~250ms). Rendered
  in world space after tiles, before players/names. Delta-time based.
- Wiring: local spawn in `doPunchAt` (main.mjs); server broadcasts
  `{t:'fx',kind:'punch',x,y,face}` to other players only (puncher excluded →
  no double fx). Purely cosmetic; damage stays server-authoritative.
- Block cracks (`client/js/render.mjs`): replaced old vector-line indicator
  with procedural pixel-art crack overlays — deterministic seeded RNG, 3 stages
  x 2 palettes (dark brown #3a2310 organic, dark gray #232327 mineral), drawn
  over the original texture + subtle darkening. Stage map: 0-24% none,
  25-49% subtle, 50-74% branching, 75-99% heavy. Damage restore (5s) clears
  cracks via existing dmg:0 broadcast.
- Tests: 5 new (punch lifecycle/drift/fade, pool cap, render alpha, crack
  stage mapping, punch-fx broadcast exclusion). 49/49 pass.
- Browser QA: real canvas-tap punches → clouds spawn/drift/fade, pool stable,
  damage 2/4/6 synced, stage-3 cracks visible on stone, zero console errors.

## 2026-10-14 — Blank-screen hardening + hotbar order (user bug report)
- Bug: user saw only dark-blue background (body bg) with working UI — canvas
  never drew. Root cause: any rejection in `loadAssets()`/`loadVfx()` (e.g.
  stale cached vfx.mjs without the new punch category, or a failed image)
  aborted the boot async fn before `requestAnimationFrame(frame)` started,
  while the DOM UI (bound earlier) kept working — exactly the reported symptom.
- Fixes: boot now try/catches asset loads so the render loop ALWAYS starts;
  `loadVfx` guards every `VFX_FILES` category; `renderPunchClouds` /
  `updatePunchClouds` call sites are defensive; new `#err-toast` surfaces
  client errors visibly instead of a silent blank canvas.
- Hotbar order (user request): Fist slot 1, Wrench slot 2. STARTER_KIT
  reordered (fist, wrench, dirt, seeds, lock); `ensureTools` normalizes
  existing players' inventories on login (fist->0, wrench->1, rest preserved).
- Tests: +1 (hotbar order new/existing). 50/50 pass. Browser QA (mobile
  viewport): canvas renders, hotbar [81,80,1], zero errors.

## 2026-10-15 — Default new-world generation + white exit door (user feature request)
- New worlds now generate FLAT terrain (surface y=30): grass top, dirt 4 deep,
  stone/dirt mix below, bedrock base. Fixed broken hash() (was 100% stone).
- Trees: trunk (19) x3 + leaves (20) canopy at x=12,24,36,68,80,90.
- Flowers: 3 new deco items (44/45/46, original pixel art), scattered on grass.
- White exit door (id 43, original white recolor of own door.png) at (54,29)
  with bedrock (7) directly beneath at (54,30). Unbreakable, action 'exit'.
- Punching white door -> server sends {t:'openWorlds'} -> client opens world
  browser dialog. 2s cooldown prevents duplicate exits. Works for owners too.
- Generation is server-side, synchronous (no races), only for new worlds;
  existing worlds load from DB untouched.
- Tests: +7 (flat, door/bedrock, trees, flowers, exit punch, 2-player sync,
  no-regen). 57/57 pass (2 pre-existing flaky tests: punch-fx, unrelated).
- Browser QA (desktop + mobile viewport): flat world, door on bedrock, punch
  door opens world browser, zero console errors.
