const crypto = require('node:crypto');
const MIN_NOTICE_MS = 5 * 86400000;
const DRAW_MARGIN_MS = 5 * 60000;
const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const config = database => database.stbTickets || { enabled: false, rules: '', matches: [], entries: [], awards: [] };
const cutoff = match => Date.parse(match.startAt) - MIN_NOTICE_MS;
const drawAt = match => cutoff(match) - DRAW_MARGIN_MS;
function availableMatch(database, now = new Date()) {
  const c = config(database);
  if (!c.enabled || !c.rules?.trim()) return null;
  return c.matches.filter(m => m.confirmed === true && Date.parse(m.opensAt) <= now.getTime() && now.getTime() < drawAt(m) && !c.awards.some(a => a.matchId === m.id && a.fulfillment !== 'revoked')).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0] || null;
}
function configure(database, input) {
  if (!input || input.enabled !== false && input.enabled !== true || typeof input.rules !== 'string' || input.rules.length > 12000 || !Array.isArray(input.matches) || input.matches.length > 100) fail('Calendrier STB invalide.');
  const seen = new Set();
  for (const m of input.matches) {
    if (!m || typeof m.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(m.id) || seen.has(m.id) || typeof m.opponent !== 'string' || !m.opponent.trim() || m.opponent.length > 120 || !Number.isFinite(Date.parse(m.startAt)) || !Number.isFinite(Date.parse(m.opensAt)) || Date.parse(m.opensAt) >= drawAt(m) || typeof m.confirmed !== 'boolean') fail('Vérifie les dates, adversaires et fenêtres des matchs STB.');
    seen.add(m.id);
  }
  if (input.enabled && (input.confirmation !== 'ACTIVER LES LOTS STB' || !input.rules.trim() || !input.matches.length || input.matches.some(m => !m.confirmed))) fail('Confirme le calendrier et le règlement avant activation.');
  const previous = config(database);
  if (previous.awards.some(a => !input.matches.some(m => m.id === a.matchId && m.startAt === previous.matches.find(old => old.id === m.id)?.startAt))) fail('Un match avec un lot attribué ne peut plus être supprimé ou déplacé.');
  database.stbTickets = { enabled: input.enabled, rules: input.rules.trim(), matches: input.matches.map(m => ({ id: m.id, opponent: m.opponent.trim(), startAt: m.startAt, opensAt: m.opensAt, confirmed: m.confirmed })), entries: previous.entries, awards: previous.awards };
}
function award(database, match, customerId, source, now, spinId = null) {
  const c = config(database);
  if (c.awards.some(a => a.matchId === match.id && a.fulfillment !== 'revoked') || now.getTime() > cutoff(match)) return null;
  const record = { id: crypto.randomUUID(), matchId: match.id, customerId, quantity: 2, opponent: match.opponent, matchAt: match.startAt, awardedAt: now.toISOString(), source, spinId, claimCode: 'STB-' + crypto.randomBytes(6).toString('hex').toUpperCase(), fulfillment: 'awaiting_delivery' };
  c.awards.push(record); return record;
}
function participate(database, customerId, spin, now = new Date()) {
  const match = availableMatch(database, now);
  if (!match) return null;
  const c = config(database);
  if (!c.entries.some(e => e.spinId === spin.id)) c.entries.push({ matchId: match.id, customerId, spinId: spin.id, enrolledAt: now.toISOString() });
  return match;
}
function spinAward(database, match, customerId, spinId, now = new Date()) { return match ? award(database, match, customerId, 'wheel', now, spinId) : null; }
function reconcile(database, eligibleSpin, now = new Date(), randomInt = crypto.randomInt) {
  const c = config(database);
  if (!c.enabled || !c.rules?.trim()) return false;
  let changed = false;
  for (const a of c.awards) {
    const source = a.spinId || c.entries.find(e => e.matchId === a.matchId && e.customerId === a.customerId && eligibleSpin(e.spinId, e.customerId))?.spinId;
    if (!source || !eligibleSpin(source, a.customerId)) {
      if (a.fulfillment === 'awaiting_delivery') { a.fulfillment = 'revoked'; a.revokedAt = now.toISOString(); changed = true; }
      else if (a.fulfillment === 'delivered' && !a.needsReview) { a.needsReview = true; changed = true; }
    }
  }
  for (const match of c.matches) {
    if (!match.confirmed || now.getTime() < drawAt(match) || c.awards.some(a => a.matchId === match.id && a.fulfillment !== 'revoked')) continue;
    if (now.getTime() > cutoff(match)) continue; // Never backdate a winner after the required five-day notice.
    const eligible = [...new Set(c.entries.filter(e => e.matchId === match.id && eligibleSpin(e.spinId, e.customerId)).map(e => e.customerId))];
    if (eligible.length) { award(database, match, eligible[randomInt(eligible.length)], 'catch_up_draw', now); changed = true; }
  }
  return changed;
}
function customerState(database, customerId, now = new Date()) {
  const match = availableMatch(database, now), c = config(database);
  return { active: Boolean(match), nextPrize: match ? { opponent: match.opponent, matchAt: match.startAt, entriesCloseAt: new Date(drawAt(match)).toISOString(), quantity: 2, chancePercent: 1 } : null,
    awards: c.awards.filter(a => a.customerId === customerId && a.fulfillment !== 'revoked').map(a => ({ id: a.id, opponent: a.opponent, matchAt: a.matchAt, quantity: 2, claimCode: a.claimCode, fulfillment: a.fulfillment })), rules: c.enabled ? c.rules : null };
}
function fulfill(database, id, input, now = new Date()) {
  const a = config(database).awards.find(award => award.id === id);
  if (!a || a.fulfillment === 'revoked' || input?.confirmation !== 'DEUX PLACES REMISES') fail('Confirme la remise effective des deux places.');
  a.fulfillment = 'delivered'; a.deliveredAt ||= now.toISOString();
}
function deleteCustomer(database, customerId) {
  const c = database.stbTickets; if (!c) return;
  c.entries = c.entries.filter(e => e.customerId !== customerId);
  for (const a of c.awards.filter(a => a.customerId === customerId)) { a.customerId = null; a.claimCode = null; if (a.fulfillment === 'awaiting_delivery') a.fulfillment = 'revoked'; }
}
module.exports = { MIN_NOTICE_MS, config, cutoff, drawAt, availableMatch, configure, participate, spinAward, reconcile, customerState, fulfill, deleteCustomer };
