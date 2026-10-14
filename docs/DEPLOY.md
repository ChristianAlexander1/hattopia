# Sproutopia — deployment notes

Single Node.js process: static file server + WebSocket game server + SQLite database.

## Configuration

Environment variables (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP/WebSocket port |
| `HOST` | `0.0.0.0` | Bind interface |
| `SPROUT OPIA_DB` | `<repo>/data/game.db` | SQLite path override |

No secrets are required. Never commit a `.env` file.

## Health check

`GET /health` → `200 {"ok":true,"uptime":<seconds>,"players":<n>,"worlds":<n>}`

Use it for load-balancer / container health checks.

## WebSocket

Clients connect to `ws(s)://<host>[:port]/` — the same port as HTTP.
Behind a reverse proxy, forward both HTTP and WebSocket upgrade traffic
to the same upstream (example nginx: `proxy_http_version 1.1;`
`proxy_set_header Upgrade $http_upgrade;`
`proxy_set_header Connection "upgrade";`).

## Persistence

All state lives in one SQLite file (`data/game.db`): players, inventories,
worlds, seeds, signs. The Dockerfile declares `VOLUME ["/app/data"]` —
mount a persistent volume there or the world resets when the container is
replaced.

## Backup / restore

The database is a single file. Back up while the server is stopped, or copy
it (SQLite tolerates a file copy for restore purposes at this scale):

```sh
cp data/game.db "backups/game-$(date +%F).db"   # backup
cp backups/game-YYYY-MM-DD.db data/game.db     # restore (server stopped)
```

## Graceful shutdown

`SIGINT`/`SIGTERM` triggers a clean shutdown: dirty worlds and all online
players are saved, the database is closed, then the process exits.
Docker/Kubernetes stop signals therefore do not lose progress. Avoid
`kill -9` — it skips the save.

## Notes

- No build step; the client is vanilla JS served statically.
- The server is single-process and single-threaded — scale vertically.
- No hardcoded tunnel or callback URLs exist in the codebase; the public
  play URL (if any) is provided by the tunnel/proxy layer outside the app.
