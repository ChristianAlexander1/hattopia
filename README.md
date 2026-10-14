# 🌱 Sproutopia

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

Open the URL in any modern browser (Safari on iPhone works). Pick a name,
press Play. Two browsers = real multiplayer.

## How to play

- **Move**: ◀ ▶ / A D · **Jump**: ▲ / Space · **Punch**: 👊 / F / tap a tile
- **Build**: pick a block or seed in the backpack 🎒, then tap a tile
- **Farm**: plant seeds on empty tiles above solid ground; punch grown trees
  to harvest (1–4 fruit, 21% seed back); plant a *different* seed on a growing
  tree to splice a hybrid (dirt+wood=brick, grass+stone=glass, wood+brick=door)
- **Own**: place a World Lock to claim a world; wrench 🔧 players to trade or
  grant access; punch your lock to remove it
- **Social**: 💬 chat, `/join WORLDNAME` to travel, 🤝 atomic trading
- Punch a **Door** to teleport back to spawn

## Architecture

```
client/          vanilla JS + Canvas (no build step, iPhone Safari friendly)
  js/            net, input, physics, renderer, ui, audio (WebAudio synth)
  img/           original generated pixel-art (see assets/ASSET_MANIFEST.md)
server/          Node.js + WebSocket (ws), authoritative game logic
  game.mjs       world state, validation, farming, locks, chat, trading
  db.mjs         SQLite persistence via node:sqlite (no native deps)
  world.mjs      procedural 100×60 world generation
shared/          constants + item registry (imported by client & server)
tests/           node:test — 21 tests: mechanics, multiplayer sync, real WS transport
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
docker build -t sproutopia . && docker run -p 8080:8080 sproutopia
```

Quick public preview (temporary URL, tunnel lives while the process runs):

```bash
cloudflared tunnel --url http://localhost:8080
```

## Research

Mechanics researched from public sources — see `docs/RESEARCH.md` for the
mechanic registry, sources, confidence levels, and documented deviations.
