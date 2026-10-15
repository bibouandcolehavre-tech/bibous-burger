const crypto = require('node:crypto');
const { previousAccount } = require('./welcome-reward-history');
const { parisDateKey } = require('./availability');
const { normalizeReferralCode } = require('./referrals');
const { CONTEST_PRIZE_RULES } = require('../contest-prize-policy');
const { dateValid, timeValid, contestWindow, withinContest, createContestDateFilter } = require('./contest-window');
const { CONTEST_WHEEL_BONUS_RULES, wheelBonusEnabled, wheelRulesConflict, wheelBonusDeclared, contestWheelEvents } = require('./contest-wheel-points');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
// Approved scoring and dates remain a private draft until the rules are finalized.
const SCORE_PER_REFERRAL = 20;
const defaultContest = () => ({ id: 'bibou-launch', status: 'draft', revision: 0, title: 'Les ambassadeurs Bibou', startDate: '', startTime: '00:00', endDate: '', region: 'France métropolitaine', firstPrize: '2 menus par mois pendant 12 mois (24 menus)', secondPrize: '1 menu par mois pendant 6 mois (6 menus)', thirdPrize: '2 menus en une seule fois', rules: '', wheelPointsInRanking: false, entries: [] });
const scoringFor = contest => ({ pointsPerEuro: 1, pointsPerVerifiedReferral: SCORE_PER_REFERRAL, pointsPerDailyShareAction: 1, ...(wheelBonusEnabled(contest) ? { pointsPerAwardedWheelPoint: 1 } : {}) });
const contestFor = database => database.referralContest || defaultContest();
const withinDates = withinContest;
const readiness = contest => [
  !contest.startDate && 'Choisir la date de début',
  !contest.endDate && 'Choisir la date de fin',
  !timeValid(contest.startTime || '00:00') && 'Choisir une heure de début valide',
  !contest.firstPrize && 'Confirmer le lot de la 1re place',
  !contest.secondPrize && 'Confirmer le lot de la 2e place',
  !contest.thirdPrize && 'Confirmer le lot de la 3e place',
  !contest.rules && 'Finaliser le règlement : éligibilité, calcul des points, départage, remise des lots et données personnelles',
  wheelBonusEnabled(contest) && wheelRulesConflict(contest.rules) && 'Corriger le règlement : le bonus de points de roue est coché mais le texte l’exclut du classement',
  !wheelBonusEnabled(contest) && wheelBonusDeclared(contest.rules) && 'Corriger le règlement ou cocher le bonus roue : le texte l’annonce mais le calcul ne l’inclut pas',
].filter(Boolean);

function saveContestDraft(database, input, now = new Date()) {
  const previous = contestFor(database);
  if (previous.status !== 'draft') throw fail('Un concours publié ne peut plus être modifié ici.', 409);
  if (!input || Array.isArray(input) || input.revision !== previous.revision) throw fail('Ce brouillon a changé. Actualisez avant de réessayer.', 409);
  const fields = { title: 120, startDate: 10, startTime: 5, endDate: 10, region: 160, firstPrize: 400, secondPrize: 400, thirdPrize: 400, rules: 12000, wheelPointsInRanking: true };
  if (Object.keys(input).some(key => key !== 'revision' && !Object.hasOwn(fields, key))) throw fail('Seuls les champs du brouillon peuvent être enregistrés. Aucune activation possible ici.');
  const next = { ...previous };
  for (const [key, max] of Object.entries(fields)) if (Object.hasOwn(input, key)) {
    if (key === 'wheelPointsInRanking') {
      if (typeof input[key] !== 'boolean') throw fail('Le choix du bonus roue doit être oui ou non.');
      next[key] = input[key]; continue;
    }
    if (typeof input[key] !== 'string' || input[key].length > max) throw fail(`Champ invalide : ${key}.`);
    next[key] = input[key].trim();
  }
  if (!next.title || !next.region) throw fail('Le titre et la zone du concours sont requis.');
  if ((next.startDate && !dateValid(next.startDate)) || (next.endDate && !dateValid(next.endDate))) throw fail('Indiquez des dates valides.');
  if ((Object.hasOwn(input, 'startTime') && !timeValid(next.startTime)) || !timeValid(next.startTime || '00:00')) throw fail('Indiquez une heure de début valide, au format HH:MM.');
  if (next.startDate && next.endDate && next.endDate < next.startDate) throw fail('La fin doit être postérieure ou égale au début.');
  next.revision += 1;
  next.updatedAt = now.toISOString();
  database.referralContest = next;
  return next;
}

function publishContest(database, input, now = new Date()) {
  const previous = contestFor(database);
  if (previous.status !== 'draft') throw fail('Ce concours a déjà été publié.', 409);
  if (!input || Array.isArray(input) || input.revision !== previous.revision || input.confirmation !== 'PUBLIER LE CONCOURS' || Object.keys(input).some(key => !['revision', 'confirmation'].includes(key))) throw fail('Confirmation du brouillon requise.', 400);
  const missing = readiness(previous);
  if (missing.length) throw fail(`Le règlement et les lots doivent être finalisés : ${missing.join(' ; ')}.`, 409);
  if (!dateValid(previous.startDate) || !dateValid(previous.endDate) || previous.endDate < previous.startDate) throw fail('Dates du concours invalides.', 409);
  if (parisDateKey(now) > previous.endDate) throw fail('La date de clôture est déjà passée.', 409);
  const published = { ...previous, status: 'published', revision: previous.revision + 1, publishedAt: now.toISOString() };
  database.referralContest = published;
  return published;
}

function contestStatus(contest, now = new Date()) {
  if (contest.status !== 'published' || readiness(contest).length) return 'inactive';
  const window = contestWindow(contest);
  if (!window || !Number.isFinite(now.getTime())) return 'inactive';
  if (now.getTime() < Date.parse(window.startsAt)) return 'scheduled';
  if (now.getTime() >= Date.parse(window.endsAt)) return 'closed';
  return 'active';
}

function publicContest(database, now = new Date()) {
  const contest = contestFor(database);
  const status = contestStatus(contest, now);
  if (status === 'inactive') return { status };
  const { id, revision, title, startDate, endDate, region, firstPrize, secondPrize, thirdPrize, rules } = contest;
  const { clarifyContestRules, RULES_CLARIFICATION_VERSION } = require('./contest-rules-clarifications');
  return { id, revision, title, startDate, startTime: contest.startTime || '00:00', endDate, region, firstPrize, secondPrize, thirdPrize, rules: `${clarifyContestRules(rules)}${wheelBonusEnabled(contest) ? '\n\n' + CONTEST_WHEEL_BONUS_RULES : ''}\n\nConditions d’utilisation des lots du classement uniquement\n${CONTEST_PRIZE_RULES}`, rulesClarificationVersion: RULES_CLARIFICATION_VERSION, status, scoring: scoringFor(contest) };
}

const verifiedPhone = customer => /^\+33[67]\d{8}$/.test(customer?.phone || '') && customer.verifiedPhone === customer.phone && Number.isFinite(Date.parse(customer.phoneVerifiedAt));
const activeEntries = (database, contest) => {
  const ids = new Set(database.customers.map(customer => customer.id));
  return contest.entries.filter(entry => entry.customerId && !entry.withdrawnAt && ids.has(entry.customerId));
};
function referralCount(database, contest, sponsorId) {
  return activeEntries(database, contest).filter(entry => entry.sponsorId === sponsorId && entry.newCustomer).length;
}

function contestRanking(database, contest, now = new Date()) {
  const inContest = createContestDateFilter(contest);
  const participants = activeEntries(database, contest);
  const customersById = new Map(database.customers.map(customer => [customer.id, customer]));
  const scoreEvents = new Map(participants.map(entry => [entry.customerId, []]));
  for (const entry of participants) if (entry.sponsorId && entry.newCustomer && scoreEvents.has(entry.sponsorId)) {
    scoreEvents.get(entry.sponsorId).push({ at: entry.joinedAt, kind: 'referral', amount: SCORE_PER_REFERRAL });
  }
  for (const entry of participants) for (const share of entry.shareEvents || []) {
    if (dateValid(share.date) && share.date >= contest.startDate && share.date <= contest.endDate && Number.isFinite(Date.parse(share.at))) {
      scoreEvents.get(entry.customerId).push({ at: share.at, kind: 'share', amount: 1 });
    }
  }
  for (const order of database.orders || []) {
    if (!scoreEvents.has(order.customerId) || order.payment?.status !== 'PAID' || order.status === 'cancelled' || !inContest(order.payment.paidAt || order.createdAt)) continue;
    const total = Number(order.total);
    if (!Number.isFinite(total) || total <= 0) continue;
    const original = Number(order.paidTotal);
    const refunded = order.refund?.status === 'recorded' ? Number(order.refund.amount) : 0;
    const retained = Number.isFinite(original) && Number.isFinite(refunded) ? Math.min(total, Math.max(0, original - refunded)) : total;
    if (retained > 0) scoreEvents.get(order.customerId).push({ at: order.payment.paidAt || order.createdAt, kind: 'order', amount: Math.round(retained * 100) });
  }
  for (const event of contestWheelEvents(database, contest, now)) {
    if (scoreEvents.has(event.customerId)) scoreEvents.get(event.customerId).push(event);
  }
  const ranking = participants.map(entry => {
    let referrals = 0, shares = 0, cents = 0, wheelPoints = 0, score = 0, reachedAt = entry.joinedAt;
    const events = scoreEvents.get(entry.customerId).map(event => ({ ...event, at: event.at < entry.joinedAt ? entry.joinedAt : event.at }));
    events.sort((a, b) => a.at.localeCompare(b.at));
    for (const event of events) {
      if (event.kind === 'referral') referrals += 1;
      else if (event.kind === 'share') shares += 1;
      else if (event.kind === 'wheel') wheelPoints += event.amount;
      else cents += event.amount;
      const nextScore = referrals * SCORE_PER_REFERRAL + shares + Math.floor(cents / 100) + wheelPoints;
      if (nextScore > score) reachedAt = event.at;
      score = nextScore;
    }
    const accountDate = Date.parse(customersById.get(entry.customerId)?.createdAt);
    return { alias: entry.alias, customerId: entry.customerId, referrals, sharePoints: shares, purchasePoints: Math.floor(cents / 100), ...(wheelBonusEnabled(contest) ? { wheelPoints } : {}), score, joinedAt: entry.joinedAt, reachedAt,
      accountCreatedAt: Number.isFinite(accountDate) ? new Date(accountDate).toISOString() : null };
  }).sort((a, b) => b.score - a.score || a.reachedAt.localeCompare(b.reachedAt) || a.joinedAt.localeCompare(b.joinedAt) ||
    (a.accountCreatedAt || '9999').localeCompare(b.accountCreatedAt || '9999') || a.customerId.localeCompare(b.customerId));
  const primaryKey = row => `${row.score}:${row.reachedAt}:${row.joinedAt}`;
  // Missing legacy creation dates are not fabricated or used to award a prize.
  const unknownAgeGroups = new Set(ranking.filter(row => !row.accountCreatedAt).map(primaryKey));
  const tieKey = row => `${primaryKey(row)}:${unknownAgeGroups.has(primaryKey(row)) ? 'unknown-age' : row.accountCreatedAt}`;
  const counts = new Map(), ranks = new Map();
  ranking.forEach((entry, index) => {
    const key = tieKey(entry);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!ranks.has(key)) ranks.set(key, index + 1);
  });
  return ranking.map(entry => ({ ...entry, rank: ranks.get(tieKey(entry)), tied: counts.get(tieKey(entry)) > 1 }));
}

function customerContest(database, customer, now = new Date()) {
  const publicData = publicContest(database, now);
  if (publicData.status === 'inactive') return { contest: publicData, participation: null };
  const contest = contestFor(database);
  const entry = activeEntries(database, contest).find(item => item.customerId === customer.id);
  const ranking = contestRanking(database, contest, now);
  const ownRank = ranking.find(item => item.customerId === customer.id);
  return {
    contest: publicData,
    needsPhoneVerification: !verifiedPhone(customer),
    leaderboard: ranking.slice(0, 10).map(({ alias, score, rank, tied }) => ({ alias, score, rank, tied })),
    participation: entry ? { code: customer.referralCode, alias: entry.alias, joinedAt: entry.joinedAt, referrals: ownRank?.referrals || 0, sharePoints: ownRank?.sharePoints || 0, sharedToday: (entry.shareEvents || []).some(share => share.date === parisDateKey(now)), purchasePoints: ownRank?.purchasePoints || 0, ...(wheelBonusEnabled(contest) ? { wheelPoints: ownRank?.wheelPoints || 0 } : {}), score: ownRank?.score || 0, rank: ownRank?.rank, tied: ownRank?.tied || false, shareUrl: `https://bibous-burger-app.onrender.com/?contest=${encodeURIComponent(contest.id)}&ref=${encodeURIComponent(customer.referralCode)}` } : null,
  };
}

function joinContest(database, customer, input, secret, now = new Date()) {
  if (!input || typeof input !== 'object') throw fail('Participation incomplète.');
  const contest = contestFor(database);
  if (contestStatus(contest, now) !== 'active') throw fail('Le concours n’est pas ouvert aux participations.', 409);
  if (!verifiedPhone(customer)) throw fail('Vérifie à nouveau ton numéro par SMS avant de participer.', 403);
  if (input.contestId !== contest.id || input.revision !== contest.revision) throw fail('Le règlement a changé. Relis-le avant de participer.', 409);
  if (input.acceptRules !== true || input.confirmAdult !== true || input.confirmRegion !== true) throw fail('Confirme le règlement, ta majorité et ta résidence dans la zone du concours.');
  const existing = contest.entries.find(entry => entry.customerId === customer.id);
  if (existing?.withdrawnAt) throw fail('Cette participation a été retirée.', 409);
  if (existing) return { changed: false, ...customerContest(database, customer, now) };
  if (!secret) throw fail('Le concours est temporairement indisponible.', 503);
  const phoneHash = crypto.createHmac('sha256', secret).update(`${contest.id}:${customer.phone}`).digest('hex');
  if (contest.entries.some(entry => entry.phoneHash === phoneHash)) throw fail('Ce numéro a déjà participé à ce concours.', 409);
  const code = normalizeReferralCode(input.sponsorCode);
  let sponsorId = null;
  if (code) {
    const sponsor = database.customers.find(item => normalizeReferralCode(item.referralCode) === code);
    if (!sponsor || !activeEntries(database, contest).some(entry => entry.customerId === sponsor.id)) throw fail('Ce code ne correspond pas à un participant au concours.');
    if (sponsor.id === customer.id || sponsor.phone === customer.phone) throw fail('Tu ne peux pas te parrainer toi-même.');
    sponsorId = sponsor.id;
  }
  const previous = previousAccount(database, customer, secret, now);
  const newCustomer = withinDates(contest, previous ? previous.firstSeenAt : customer.createdAt) &&
    withinDates(contest, previous ? previous.firstVerifiedAt : customer.firstPhoneVerifiedAt);
  contest.entries.push({ customerId: customer.id, phoneHash, alias: `Participant ${crypto.randomBytes(4).toString('hex').toUpperCase()}`, sponsorId, newCustomer, joinedAt: now.toISOString(), rulesRevision: contest.revision, shareEvents: [], prizeAlerts: input.acceptPrizeAlerts === true, prizeAlertsUpdatedAt: now.toISOString() });
  return { changed: true, ...customerContest(database, customer, now) };
}

function recordShareAction(database, customer, input, now = new Date()) {
  const contest = contestFor(database);
  if (contestStatus(contest, now) !== 'active') throw fail('Le concours n’est pas ouvert.', 409);
  if (!input || input.contestId !== contest.id || input.revision !== contest.revision) throw fail('Actualise le concours avant de partager.', 409);
  const entry = activeEntries(database, contest).find(item => item.customerId === customer.id);
  if (!entry) throw fail('Inscris-toi au concours avant de partager.', 403);
  const day = parisDateKey(now);
  entry.shareEvents ||= [];
  if (entry.shareEvents.some(share => share.date === day)) return { changed: false, ...customerContest(database, customer, now) };
  entry.shareEvents.push({ date: day, at: now.toISOString() });
  return { changed: true, ...customerContest(database, customer, now) };
}

function withdrawContest(database, customer, now = new Date()) {
  const contest = database.referralContest;
  if (!contest) return false;
  const entry = contest.entries.find(item => item.customerId === customer.id && !item.withdrawnAt);
  if (!entry) return false;
  entry.withdrawnAt = now.toISOString();
  entry.customerId = null;
  entry.sponsorId = null;
  // A campaign-scoped keyed fingerprint prevents delete/recreate participation.
  // It is not exposed by either API and is purged after the retention period.
  for (const other of contest.entries) if (other.sponsorId === customer.id) other.sponsorId = null;
  return true;
}

function purgeExpiredContestEntries(database, now = new Date()) {
  const contest = database.referralContest;
  if (!contest?.endDate || !dateValid(contest.endDate) || !contest.entries.length) return false;
  const cutoff = new Date(`${contest.endDate}T23:59:59Z`).getTime() + 90 * 86400000;
  if (now.getTime() <= cutoff) return false;
  contest.entries = [];
  contest.purgedAt = now.toISOString();
  return true;
}

function dashboardContest(database, now = new Date()) {
  const contest = contestFor(database);
  const inContest = createContestDateFilter(contest);
  const { entries, ...draft } = contest;
  const participants = activeEntries(database, contest);
  const ranking = contestRanking(database, contest, now);
  const participantIds = new Set(participants.map(entry => entry.customerId));
  const eligibleOrders = (database.orders || []).filter(order => participantIds.has(order.customerId) && order.payment?.status === 'PAID' && order.status !== 'cancelled' && inContest(order.payment.paidAt || order.createdAt));
  const paid = new Set(eligibleOrders.map(order => order.customerId));
  const paidRevenueCents = eligibleOrders.reduce((sum, order) => {
    const total = Number(order.total), original = Number(order.paidTotal);
    const refunded = order.refund?.status === 'recorded' ? Number(order.refund.amount) : 0;
    if (!Number.isFinite(total) || total <= 0) return sum;
    const retained = Number.isFinite(original) && Number.isFinite(refunded) ? Math.min(total, Math.max(0, original - refunded)) : total;
    return sum + Math.round(retained * 100);
  }, 0);
  if (contest.status === 'published') draft.rules = require('./contest-rules-clarifications').clarifyContestRules(draft.rules);
  return { draft, status: contestStatus(contest, now), missing: readiness(contest), launchLocked: contest.status === 'draft', scoring: scoringFor(contest), statistics: { participants: participants.length, newReferrals: participants.filter(entry => entry.sponsorId && entry.newCustomer).length, paidCustomers: paid.size, paidOrders: eligibleOrders.length, paidRevenue: paidRevenueCents / 100 }, ranking: ranking.slice(0, 100), rankingTotal: ranking.length };
}

module.exports = { defaultContest, saveContestDraft, publishContest, publicContest, customerContest, joinContest, recordShareAction, withdrawContest, purgeExpiredContestEntries, dashboardContest, contestStatus, contestRanking };
