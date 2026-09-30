const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SESSION_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 1000;

function createDashboardSessionStore(file, { now = Date.now, secret } = {}) {
  if (typeof secret !== 'string' || !secret) throw new Error('Dashboard session secret is required');
  // A password change invalidates every previously issued device session.
  const tokenDigest = token => crypto.createHmac('sha256', secret).update(token).digest('hex');
  function load() {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(saved.sessions)) throw new Error('Invalid dashboard sessions file');
      return new Map(saved.sessions.filter(([digest, session]) =>
        /^[a-f0-9]{64}$/.test(digest) &&
        Number.isSafeInteger(session?.expiresAt) && session.expiresAt > now() &&
        Number.isSafeInteger(session?.renewedAt)
      ));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return new Map();
    }
  }
  // Validate at startup, but do not keep a stale snapshot across overlapping deployments.
  load();

  function save(sessions) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ sessions: [...sessions] }), { mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  function issue() {
    const sessions = load();
    if (sessions.size >= MAX_SESSIONS) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    const digest = tokenDigest(token);
    sessions.set(digest, { renewedAt: now(), expiresAt: now() + SESSION_LIFETIME_MS });
    save(sessions);
    return token;
  }

  function valid(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const sessions = load();
    const digest = tokenDigest(token);
    const session = sessions.get(digest);
    if (!session || session.expiresAt <= now()) return false;
    if (now() - session.renewedAt >= RENEW_AFTER_MS) {
      session.renewedAt = now();
      session.expiresAt = now() + SESSION_LIFETIME_MS;
      try { save(sessions); } catch (error) { /* The existing session remains valid on disk. */ }
    }
    return true;
  }

  function revoke(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    const sessions = load();
    const digest = tokenDigest(token);
    if (!sessions.has(digest)) return;
    sessions.delete(digest);
    save(sessions);
  }

  return { issue, valid, revoke };
}

module.exports = { createDashboardSessionStore, SESSION_LIFETIME_MS };
