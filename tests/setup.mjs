// Test bootstrap: isolate the test suite from the production database.
// Loaded via `node --test --import ./tests/setup.mjs` BEFORE any test file,
// so process.env.SPROUTOPIA_DB is set before server/db.mjs is imported.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sproutopia-test-')), 'game.db');
process.env.SPROUTOPIA_DB = tmpDb;

// Best-effort cleanup of the temp database when the test process exits.
process.on('exit', () => {
  try { fs.rmSync(path.dirname(tmpDb), { recursive: true, force: true }); } catch { /* ignore */ }
});
