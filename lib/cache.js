const store = new Map();

function get(key) {
  const item = store.get(key);
  if (!item) {
    return undefined;
  }

  if (item.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }

  return item.value;
}

function set(key, value, ttlMs = 5 * 60 * 1000) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

module.exports = { get, set };
