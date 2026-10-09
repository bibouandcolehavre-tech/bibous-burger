// Short-lived proofs only. The HTTP service persists snapshots atomically,
// authenticates both devices and customers, and issues a scoped kiosk session.
const crypto = require('node:crypto');
const { parseKioskQr } = require('../kiosk-qr-client');
const TTL = 3 * 60 * 1000;
function createKioskPairingStore({ now = Date.now, capacity = 1000, saved = [] } = {}) {
  const entries = new Map(saved.filter(([id, entry]) => /^[a-f0-9]{32}$/.test(id) && Number.isSafeInteger(entry?.expiresAt) && entry.expiresAt > now() && /^[a-f0-9]{64}$/.test(entry.codeDigest) && /^[a-f0-9]{64}$/.test(entry.readerDigest)));
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  const equal = (value, expected) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) && crypto.timingSafeEqual(Buffer.from(digest(value)), Buffer.from(expected));
  const reject = () => { throw new Error('Code expiré, invalide ou déjà utilisé.'); };
  function active(session) { const entry = entries.get(session); if (!entry || entry.expiresAt <= now()) { entries.delete(session); return reject(); } return entry; }
  function proof(pairing) { const validated = parseKioskQr(`bibousburgers://borne/connexion?session=${encodeURIComponent(pairing?.session)}&code=${encodeURIComponent(pairing?.code)}`); const entry = active(validated.session); if (!equal(validated.code, entry.codeDigest) || entry.status !== 'pending') return reject(); return entry; }
  function create(terminalName) {
    if (typeof terminalName !== 'string' || !terminalName.trim() || terminalName.length > 100) throw new Error('Borne identifiée requise.');
    for (const [id, entry] of entries) if (entry.expiresAt <= now()) entries.delete(id);
    if (entries.size >= capacity) throw new Error('Trop de connexions en attente.');
    const session = crypto.randomBytes(16).toString('hex'), code = crypto.randomBytes(32).toString('base64url'), readerSecret = crypto.randomBytes(32).toString('base64url');
    const expiresAt = now() + TTL;
    entries.set(session, { terminalName, expiresAt, codeDigest: digest(code), readerDigest: digest(readerSecret), status: 'pending' });
    return { session, readerSecret, expiresAt, qr: `bibousburgers://borne/connexion?session=${session}&code=${code}` };
  }
  function inspect(pairing) { const entry = proof(pairing); return { status: 'pending', terminalName: entry.terminalName, expiresAt: entry.expiresAt }; }
  function approve(pairing, authenticatedCustomerId) {
    if (typeof authenticatedCustomerId !== 'string' || !authenticatedCustomerId || authenticatedCustomerId.length > 100) throw new Error('Client authentifié requis.');
    const entry = proof(pairing); entry.status = 'approved'; entry.customerId = authenticatedCustomerId; return { status: 'approved' };
  }
  function redeem(session, readerSecret) {
    const entry = active(session); if (!equal(readerSecret, entry.readerDigest)) return reject();
    if (entry.status !== 'approved') return reject();
    entries.delete(session); return { customerId: entry.customerId, terminalName: entry.terminalName };
  }
  function poll(session, readerSecret) { const entry = active(session); if (!equal(readerSecret, entry.readerDigest)) return reject(); return { status: entry.status, expiresAt: entry.expiresAt }; }
  function cancel(session, readerSecret) { const entry = active(session); if (!equal(readerSecret, entry.readerDigest)) return reject(); entries.delete(session); }
  return { create, inspect, approve, redeem, poll, cancel, snapshot: () => [...entries] };
}
module.exports = { createKioskPairingStore, TTL };
