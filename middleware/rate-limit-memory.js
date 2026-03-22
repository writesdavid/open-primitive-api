// In-memory request counter for analytics only — no limits enforced

const store = new Map();

function getWindowKey() {
  return Math.floor(Date.now() / 86400000); // daily window
}

function countRequest(key) {
  const windowKey = getWindowKey();
  const storeKey = `${key}:${windowKey}`;
  const entry = store.get(storeKey) || { count: 0 };
  entry.count += 1;
  store.set(storeKey, entry);

  // Lazy cleanup: drop old window keys
  for (const [k] of store) {
    if (k.startsWith(key + ':') && k !== storeKey) {
      store.delete(k);
    }
  }
}

async function rateLimitMiddleware(req, res, next) {
  const key = req.ip || 'unknown';
  countRequest(key);
  next();
}

module.exports = { rateLimitMiddleware };
