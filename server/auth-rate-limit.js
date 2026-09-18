function createAuthRateLimiter({ limit = 10, windowMs = 5 * 60000, maxKeys = 2000, now = Date.now } = {}) {
  const entries = new Map();
  function consume(key) {
    const timestamp = now();
    for (const [id, value] of entries) if (value.expiresAt <= timestamp) entries.delete(id);
    const existing = entries.get(key);
    if (existing?.count >= limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.expiresAt - timestamp) / 1000)) };
    // Do not evict active limits when an attacker varies the key.
    if (!existing && entries.size >= maxKeys) return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
    entries.set(key, { count: (existing?.count || 0) + 1, expiresAt: existing?.expiresAt || timestamp + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return { consume, reset: key => entries.delete(key) };
}
module.exports = { createAuthRateLimiter };
