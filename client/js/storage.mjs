// Safe storage: localStorage can throw (private mode, blocked cookies, etc).
// Fall back to in-memory so the game never dies from a storage error.
const mem = new Map();
function ls() {
  try {
    localStorage.getItem('__t');
    return localStorage;
  } catch { return null; }
}
const backend = ls();
export const storage = {
  get(k) {
    try { return backend ? backend.getItem(k) : (mem.has(k) ? mem.get(k) : null); }
    catch { return mem.has(k) ? mem.get(k) : null; }
  },
  set(k, v) {
    try { if (backend) backend.setItem(k, v); else mem.set(k, v); }
    catch { mem.set(k, v); }
  },
};
