const crypto = require('node:crypto');
const { parisDateKey } = require('./availability');
const { normalizeReferralCode } = require('./referrals');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const defaultContest = () => ({ id: 'bibou-launch', status: 'draft', revision: 0, title: 'Les ambassadeurs Bibou', startDate: '', endDate: '', region: 'Le Havre et ses environs', leaderPrize: '', drawPrize: '', rules: '', entries: [] });
const contestFor = database => database.referralContest || defaultContest();
const dateValid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const withinDates = (contest, value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && parisDateKey(date) >= contest.startDate && parisDateKey(date) <= contest.endDate;
};
const readiness = contest => [
  !contest.startDate && 'Choisir la date de début',
  !contest.endDate && 'Choisir la date de fin',
  !contest.leaderPrize && 'Confirmer le lot du meilleur parrain',
  !contest.drawPrize && 'Confirmer le lot du tirage au sort',
  !contest.rules && 'Finaliser le règlement : éligibilité, lots, départage, tirage, remise des lots et données personnelles',
].filter(Boolean);

function saveContestDraft(database, input, now = new Date()) {
  const previous = contestFor(database);
  if (previous.status !== 'draft') throw fail('Un concours publié ne peut plus être modifié ici.', 409);
  if (!input || Array.isArray(input) || input.revision !== previous.revision) throw fail('Ce brouillon a changé. Actualisez avant de réessayer.', 409);
  const fields = { title: 120, startDate: 10, endDate: 10, region: 160, leaderPrize: 400, drawPrize: 400, rules: 12000 };
  if (Object.keys(input).some(key => key !== 'revision' && !Object.hasOwn(fields, key))) throw fail('Seuls les champs du brouillon peuvent être enregistrés. Aucune activation possible ici.');
  const next = { ...previous };
  for (const [key, max] of Object.entries(fields)) if (Object.hasOwn(input, key)) {
    if (typeof input[key] !== 'string' || input[key].length > max) throw fail(`Champ invalide : ${key}.`);
    next[key] = input[key].trim();
  }
  if (!next.title || !next.region) throw fail('Le titre et la zone du concours sont requis.');
  if ((next.startDate && !dateValid(next.startDate)) || (next.endDate && !dateValid(next.endDate))) throw fail('Indiquez des dates valides.');
  if (next.startDate && next.endDate && next.endDate < next.startDate) throw fail('La fin doit être postérieure ou égale au début.');
  next.revision += 1;
  next.updatedAt = now.toISOString();
  database.referralContest = next;
  return next;
}

function contestStatus(contest, now = new Date()) {
  if (contest.status !== 'published' || readiness(contest).length) return 'inactive';
  const day = parisDateKey(now);
  if (day < contest.startDate) return 'scheduled';
  if (day > contest.endDate) return 'closed';
  return 'active';
}

function publicContest(database, now = new Date()) {
  const contest = contestFor(database);
  const status = contestStatus(contest, now);
  if (status === 'inactive') return { status };
  const { id, revision, title, startDate, endDate, region, leaderPrize, drawPrize, rules } = contest;
  return { id, revision, title, startDate, endDate, region, leaderPrize, drawPrize, rules, status };
}

const verifiedPhone = customer => /^\+33[67]\d{8}$/.test(customer?.phone || '') && customer.verifiedPhone === customer.phone && Number.isFinite(Date.parse(customer.phoneVerifiedAt));
const activeEntries = (database, contest) => {
  const ids = new Set(database.customers.map(customer => customer.id));
  return contest.entries.filter(entry => entry.customerId && !entry.withdrawnAt && ids.has(entry.customerId));
};
function referralCount(database, contest, sponsorId) {
  return activeEntries(database, contest).filter(entry => entry.sponsorId === sponsorId && entry.newCustomer).length;
}

function customerContest(database, customer, now = new Date()) {
  const publicData = publicContest(database, now);
  if (publicData.status === 'inactive') return { contest: publicData, participation: null };
  const contest = contestFor(database);
  const entry = activeEntries(database, contest).find(item => item.customerId === customer.id);
  return {
    contest: publicData,
    needsPhoneVerification: !verifiedPhone(customer),
    participation: entry ? { code: customer.referralCode, alias: entry.alias, joinedAt: entry.joinedAt, referrals: referralCount(database, contest, customer.id), shareUrl: `https://bibous-burger-app.onrender.com/?contest=${encodeURIComponent(contest.id)}&ref=${encodeURIComponent(customer.referralCode)}` } : null,
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
  const newCustomer = withinDates(contest, customer.createdAt) && withinDates(contest, customer.firstPhoneVerifiedAt);
  contest.entries.push({ customerId: customer.id, phoneHash, alias: `Participant ${crypto.randomBytes(4).toString('hex').toUpperCase()}`, sponsorId, newCustomer, joinedAt: now.toISOString(), rulesRevision: contest.revision });
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
  const { entries, ...draft } = contest;
  const participants = activeEntries(database, contest);
  const referrals = new Map();
  for (const entry of participants) if (entry.sponsorId && entry.newCustomer) referrals.set(entry.sponsorId, (referrals.get(entry.sponsorId) || 0) + 1);
  const ranking = participants.map(entry => ({ alias: entry.alias, customerId: entry.customerId, referrals: referrals.get(entry.customerId) || 0, joinedAt: entry.joinedAt })).sort((a,b) => b.referrals - a.referrals || a.joinedAt.localeCompare(b.joinedAt));
  const counts = new Map(), ranks = new Map();
  ranking.forEach((entry, i) => { counts.set(entry.referrals, (counts.get(entry.referrals) || 0) + 1); if (!ranks.has(entry.referrals)) ranks.set(entry.referrals, i + 1); });
  const paid = new Set(database.orders.filter(order => order.payment?.status === 'PAID' && order.status !== 'cancelled' && withinDates(contest, order.payment.paidAt || order.createdAt)).map(order => order.customerId));
  return { draft, status: contestStatus(contest, now), missing: readiness(contest), launchLocked: true, statistics: { participants: participants.length, newReferrals: participants.filter(entry => entry.sponsorId && entry.newCustomer).length, paidCustomers: participants.filter(entry => paid.has(entry.customerId)).length }, ranking: ranking.slice(0, 100).map(entry => ({ ...entry, rank: ranks.get(entry.referrals), tied: counts.get(entry.referrals) > 1 })), rankingTotal: ranking.length };
}

module.exports = { defaultContest, saveContestDraft, publicContest, customerContest, joinContest, withdrawContest, purgeExpiredContestEntries, dashboardContest, contestStatus };
