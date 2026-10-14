# Login System Archive

**Archived on:** 2026-10-15
**Reason:** User requested direct-to-game entry for now; login screens hidden but preserved.

## What was archived

The full login/title-screen flow:
- **Title screen** (`#login` in `client/index.html`): Hattopia logo, Play Online / Options / About buttons, V0.1.0.
- **Login form** (`#login-form`): Guest login (name input + Connect) and HatID login/registration (name + password).
- **JS handlers** in `client/js/ui.mjs` (`_bind()`): btn-play, btn-back, btn-guest, btn-hatid, btn-reg, lf-showreg, lf-showlogin.
- **Auth callbacks** in `client/js/main.mjs`: `onPlay(name)`, `onHatIdLogin(name, password)`.
- **Server auth** in `server/game.mjs` + `server/db.mjs`: HatID scrypt passwords, guest tokens, login throttling — all still active server-side.

## How it was bypassed (not deleted)

- `client/index.html`: login divs kept intact, hidden at boot by `AUTO_PLAY`.
- `client/js/main.mjs`: added `AUTO_PLAY` block at end of boot that hides `#login`/`#login-form` and auto-connects as guest.
- All login code, HTML, and CSS remain in place and functional.

## How to restore

1. In `client/js/main.mjs`, set `const AUTO_PLAY = false;` (or remove the auto-play block).
2. The title screen and login form will show again on page load.
3. Server-side auth (HatID, guest tokens) was never disabled.

## Auto-play behavior (current)

- Uses saved name from `storage.get('sproutopia_name')` if present.
- Otherwise generates `Guest####` (random 4 digits).
- Connects via the existing `net.connect(name)` guest flow — no server changes needed.
- Name must match `/^[A-Za-z0-9_]{3,16}$/` (generated names always do).
