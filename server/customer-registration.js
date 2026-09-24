const crypto = require('node:crypto');

// Short-lived proof of SMS verification. No customer is created before the names
// are supplied. Tokens are private, bounded, and cannot authenticate real API calls.
function createRegistrationStore({ ttlMs = 15 * 60000, maxEntries = 1000 } = {}) {
  const entries = new Map();
  const digest = token => crypto.createHash('sha256').update(token).digest('hex');
  const prune = now => { for (const [key, entry] of entries) if (entry.expiresAt <= now) entries.delete(key); };
  return {
    issue(phone, now = Date.now()) {
      prune(now);
      if (entries.size >= maxEntries) throw Object.assign(new Error('Trop d’inscriptions en cours. Réessaie dans quelques minutes.'), { statusCode: 429 });
      const token = `signup.${crypto.randomBytes(32).toString('base64url')}`;
      entries.set(digest(token), { phone, expiresAt: now + ttlMs });
      return token;
    },
    read(token, now = Date.now()) {
      prune(now);
      if (typeof token !== 'string' || !/^signup\.[\w-]{43}$/.test(token)) return null;
      return entries.get(digest(token)) || null;
    },
    complete(token, customerId) {
      const entry = this.read(token);
      if (entry) entry.customerId = customerId; // Retry returns the same account, never a duplicate.
    },
  };
}
module.exports = { createRegistrationStore };
