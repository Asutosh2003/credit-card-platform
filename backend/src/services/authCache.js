/**
 * Short-lived auth identity cache so connector bulk traffic does not pay a
 * Supabase round-trip on every request for the same bearer / API key.
 */
const TTL_MS = Math.max(
  5_000,
  Number(process.env.AUTH_CACHE_TTL_MS || 60_000) || 60_000
);

const store = new Map();

function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value) {
  store.set(key, { at: Date.now(), value });
  return value;
}

function invalidateAuthCache() {
  store.clear();
}

module.exports = {
  cacheGet,
  cacheSet,
  invalidateAuthCache,
  AUTH_CACHE_TTL_MS: TTL_MS,
};
