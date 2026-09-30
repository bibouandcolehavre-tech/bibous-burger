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
  let sessions;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(saved.sessions)) throw new Error('Invalid dashboard sessions file');
    sessions = new Map(saved.sessions.filter(([digest, session]) =>
      /^[a-f0-9]{64}$/.test(digest) &&
      Number.isSafeInteger(session?.expiresAt) && session.expiresAt > now() &&
      Number.isSafeInteger(session?.renewedAt)
    ));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    sessions = new Map();
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ sessions: [...sessions] }), { mode: 0o600 });
      fs.renameSync(temporary, file);
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  function prune() {
    for (const [digest, session] of sessions) if (session.expiresAt <= now()) sessions.delete(digest);
  }

  function issue() {
    prune();
    if (sessions.size >= MAX_SESSIONS) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    const digest = tokenDigest(token);
    sessions.set(digest, { renewedAt: now(), expiresAt: now() + SESSION_LIFETIME_MS });
    try { save(); } catch (error) { sessions.delete(digest); throw error; }
    return token;
  }

  function valid(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const digest = tokenDigest(token);
    const session = sessions.get(digest);
    if (!session || session.expiresAt <= now()) return false;
    if (now() - session.renewedAt >= RENEW_AFTER_MS) {
      const previous = { ...session };
      session.renewedAt = now();
      session.expiresAt = now() + SESSION_LIFETIME_MS;
      try { save(); } catch (error) { Object.assign(session, previous); }
    }
    return true;
  }

  function revoke(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    const digest = tokenDigest(token);
    const session = sessions.get(digest);
    if (!session) return;
    sessions.delete(digest);
    try { save(); } catch (error) { sessions.set(digest, session); throw error; }
  }

  return { issue, valid, revoke };
}

module.exports = { createDashboardSessionStore, SESSION_LIFETIME_MS };
