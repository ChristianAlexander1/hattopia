# 🌱 Hattopia

An original 2D multiplayer sandbox browser game. Punch blocks, plant seeds,
grow trees, splice hybrids, claim worlds with locks, trade and chat — all in
Safari/Chrome on phone or desktop. No install, no app store.

Clean-room implementation: gameplay mechanics were researched from public
sources; **all art, code, and item designs are original**. Not affiliated with
Growtopia.

## Quick start

```bash
npm install
npm start        # http://localhost:8080
```

Open the URL in any modern browser (Safari on iPhone works). Login as guest
or with a HatID, press Play. Two browsers = real multiplayer.

## How to play

- **Move**: ◀ ▶ / A D · **Jump**: ▲ / Space · **Punch**: 👊 / F / tap a tile
- **Zoom**: pinch with two fingers (mobile) or `+` / `-` (desktop), `0` to reset
- **Build**: pick a block or seed in the inventory, then tap a tile
- **Farm**: plant seeds on empty tiles above solid ground; punch grown trees
  to harvest (1–4 fruit, 21% seed back); plant a *different* seed on a growing
  tree to splice a hybrid (dirt+wood=brick, grass+stone=glass, wood+brick=door)
- **Own**: place a World Lock to claim a world; wrench 🔧 players to trade or
  grant access; punch your lock to remove it
- **Social**: 💬 chat (log always visible at top, bubbles above heads),
  `/join WORLDNAME` to travel, 🤝 atomic trading
- **White Door**: walk through it, then press punch while standing on it to
  open the world browser. Respawns next to the door.
- **World browser**: Top Worlds, My Worlds, Recently Visited (with player counts).
  Tap a name to join directly, or type a name + Enter World.
- **Menu** (☰): Exit World, Respawn, Options, Support, Get HatID (guests), Logout
- **Options**: visual quality + skin color picker (8 tones)
- **Social Portal** (😊): Friends, Leaderboard, Guild, etc. (dummy for now)

## Accounts

- **Guest**: pick a name, play instantly
- **HatID**: register with name + password to keep your name and stuff across devices.
  Login is case-insensitive but preserves your registered capitalization.
- **Admin** (`@Admin`, orange name): bypasses world locks, can break bedrock.
  Commands: `/find ITEM`, `/weather TYPE`, `/noclip` (fly), `/clear` (clean world,
  keeps bedrock/door/lock), `/admin` (help)

## Architecture

```
client/          vanilla JS + Canvas (no build step, iPhone Safari friendly)
  js/            net, input, physics, renderer, ui, audio (WebAudio synth)
  img/           original pixel-art (see assets/ASSET_MANIFEST.md)
server/          Node.js + WebSocket (ws), authoritative game logic
  game.mjs       world state, validation, farming, locks, chat, trading, admin
  db.mjs         SQLite persistence via node:sqlite (no native deps)
  world.mjs      procedural 100×60 world generation
shared/          constants + item registry (imported by client & server)
tests/           node:test — 57 tests: mechanics, multiplayer sync, real WS transport
```

Persistence: players, inventories, appearance, gems, worlds (tiles, seeds,
locks, weather) in `data/game.db`. Worlds autosave every 30 s and stay
consistent across restarts.

## Deploy

The server is a single long-lived Node process with WebSockets — it needs a
host that supports persistent connections (VPS, Fly.io, Render, Railway…),
not serverless functions.

```bash
# with Docker (Dockerfile provided)
docker build -t hattopia . && docker run -p 8080:8080 hattopia
```

## Changelog (2026-10-15)

### Texture Atlas System
- All 276 block tiles packed into 2 atlas pages (`tiles_page_1.png`, `tiles_page_2.png` — 512×512, 16×16 grid)
- All 228 seed sprites packed into 1 atlas page (`seeds_page_1.png`)
- `index.json` maps every tile → `{ page, x, y }` coordinates
- **Result**: 300+ HTTP requests → ~10, 7.3 MB → ~1 MB. Loading is dramatically faster on mobile.
- Assets sliced from atlas at load time — render code unchanged.

### Gem System Overhaul
- 5 gem sprites (yellow/red/purple/green/black) extracted from user reference
- Red gem = HUD currency icon (bottom-right above hotbar)
- Denominations: yellow=1, red=10, purple=50, green=80, black=100
- Server-authoritative floating gem drops on block break (24px bobbing entities)
- Gems merge and upgrade denomination (10 yellow → 1 red, 5 red → 1 purple)
- Spawn positions scatter randomly; pickup radius tightened (28px client / 34px server)

### Lock System
- New lock sprites: World Lock (id 50) + Diamond Lock (id 51), with access/no-access variants
- Permission-linked rendering: owners see unlocked sprite, visitors see locked sprite
- Live sprite switching on access grant/revoke (no world reload needed)
- New seed IDs: 143 (World Lock Seed), 144 (Diamond Lock Seed)

### Block/Seed Expansion (+452 items)
- 226 new blocks (IDs 1001–1226) + 226 new seeds (IDs 5001–5226) from user-supplied archive
- Total items: 541, zero ID collisions, all original IDs preserved
- Searchable via `/find`

### Growtopia-Style Login Flow
- Title screen → login form → loading screen (matches GT reference)
- Loading shows: "Getting server address..." → "Located server, connecting..." → "Logging on [name]..." → "Updating items (x/y)..."
- HatID credentials saved per browser (auto-fill on next visit)
- Title screen clouds now use the same PNGs as in-game weather

### World Browser & Exit Fixes
- Header shows "(X Online)" = total players across all worlds (was "X worlds")
- Exit World button and white door now properly leave the world server-side before showing browser

### Weather
- Snow: larger flakes (2.2×), white caps on exposed solid tiles
- Rain splashes anchored to world coordinates (no camera drift)

## Research

Mechanics researched from public sources — see `docs/RESEARCH.md` for the
mechanic registry, sources, confidence levels, and documented deviations.
