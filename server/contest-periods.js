// Restaurant-only, read-only lists for externally conducted promotional draws.
// No random selection, prize grant, point mutation, message or publication here.
const crypto = require('node:crypto');
const { serviceSlotInstant, parisDateKey } = require('./availability');
const { contestWindow, shiftDate } = require('./contest-window');
const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const ACTION_LABELS = Object.freeze({ registration: 'Inscription au concours', share: 'Appui sur Partager', referral: 'Parrainage validé', order: 'Commande payée' });
function periodsFor(contest) {
  const window = contestWindow(contest);
  if (!window) return [];
  const days = Math.round((Date.parse(`${contest.endDate}T12:00:00Z`) - Date.parse(`${contest.startDate}T12:00:00Z`)) / 86400000) + 1;
  if (days > 1500) fail('La période du concours est trop longue pour ce suivi.');
  // No draw for a final incomplete fortnight: owner excludes 29–31 December.
  return Array.from({ length: Math.floor(days / 15) }, (_, index) => {
    const startDate = shiftDate(contest.startDate, index * 15), endDate = shiftDate(startDate, 14);
    return { number: index + 1, startDate, endDate, startsAt: index === 0 ? window.startsAt : serviceSlotInstant(startDate, '00:00').toISOString(),
      endsAt: serviceSlotInstant(shiftDate(endDate, 1), '00:00').toISOString() };
  });
}
function dashboardContestPeriods(database, requestedPeriod, now = new Date()) {
  if (!Number.isFinite(now.getTime())) fail('Date de consultation invalide.');
  const contest = database.referralContest || {}, periods = periodsFor(contest);
  if (requestedPeriod !== undefined && !/^[1-9]\d?$/.test(String(requestedPeriod))) fail('Choisissez une quinzaine valide.');
  if (requestedPeriod !== undefined && !periods.some(p => p.number === Number(requestedPeriod))) fail('Cette quinzaine n’existe pas.');
  const selected = requestedPeriod === undefined ? (periods.find(p => now.getTime() < Date.parse(p.endsAt)) || periods.at(-1)) : periods.find(p => p.number === Number(requestedPeriod));
  const published = contest.status === 'published';
  const phase = period => !published ? 'draft' : now.getTime() < Date.parse(period.startsAt) ? 'scheduled' : now.getTime() < Date.parse(period.endsAt) ? 'active' : 'complete';
  const rows = new Map();
  const customers = new Map((database.customers || []).filter(c => !c.reviewMode).map(c => [c.id, c]));
  const entries = (contest.entries || []).filter(entry => entry.customerId && !entry.withdrawnAt && customers.has(entry.customerId) && Number.isFinite(Date.parse(entry.joinedAt)));
  if (published && selected) {
    for (const entry of entries) rows.set(entry.customerId, { customerId: entry.customerId, alias: String(entry.alias || 'Participant'), customerName: String(customers.get(entry.customerId).name || ''), joinedAt: entry.joinedAt, actions: new Set(), firstActivityAt: null, lastActivityAt: null });
    const record = (id, kind, value) => {
      const row = rows.get(id), at = Date.parse(value);
      if (!row || !Number.isFinite(at) || at < Date.parse(row.joinedAt) || at > now.getTime() || at < Date.parse(selected.startsAt) || at >= Date.parse(selected.endsAt)) return;
      const instant = new Date(at).toISOString();
      row.actions.add(kind);
      if (!row.firstActivityAt || instant < row.firstActivityAt) row.firstActivityAt = instant;
      if (!row.lastActivityAt || instant > row.lastActivityAt) row.lastActivityAt = instant;
    };
    for (const entry of entries) {
      record(entry.customerId, 'registration', entry.joinedAt);
      for (const share of entry.shareEvents || []) {
        const date = new Date(share.at);
        if (Number.isFinite(date.getTime()) && share.date === parisDateKey(date)) record(entry.customerId, 'share', share.at);
      }
      if (entry.newCustomer && entry.sponsorId) record(entry.sponsorId, 'referral', entry.joinedAt);
    }
    for (const order of database.orders || []) {
      if (order.payment?.status !== 'PAID' || order.status === 'cancelled' || order.refund?.status === 'due' || order.reviewMode || order.payment?.provider === 'promotion') continue;
      const total = Number(order.total), original = Number(order.paidTotal ?? order.total), refunded = order.refund?.status === 'recorded' ? Number(order.refund.amount) : 0;
      if (![total, original, refunded].every(Number.isFinite) || Math.min(total, original - refunded) <= 0) continue;
      record(order.customerId, 'order', order.payment.paidAt || order.createdAt);
    }
  }
  const participants = [...rows.values()].filter(row => row.actions.size).map(row => ({ ...row, actions: [...row.actions].sort(), chances: 1 })).sort((a, b) => a.alias.localeCompare(b.alias) || a.customerId.localeCompare(b.customerId));
  const period = selected ? { ...selected, status: phase(selected) } : null;
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([contest.id, contest.revision, selected || null, participants.map(({ customerName, ...row }) => row)])).digest('hex');
  return { contestId: contest.id || null, contestRevision: contest.revision ?? 0, generatedAt: now.toISOString(), readOnly: true, externalDraw: true,
    periods: periods.map(p => ({ ...p, status: phase(p) })), period, participants, total: participants.length, fingerprint, bonusPrize: { menus: 1, validDays: 30 },
    exportReady: Boolean(period?.status === 'complete'), actionLabels: ACTION_LABELS,
    excludedTail: selected && periods.length && periods.at(-1).endDate < contest.endDate ? { startDate: shiftDate(periods.at(-1).endDate, 1), endDate: contest.endDate } : null,
    rules: 'Une chance par compte inscrit ayant une activité enregistrée dans cette quinzaine, avec ou sans achat. Les tours de roue ne donnent ni chance supplémentaire ni activité éligible. Aucun gagnant n’est choisi ici.' };
}
module.exports = { periodsFor, dashboardContestPeriods, ACTION_LABELS };
