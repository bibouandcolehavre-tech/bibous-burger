// Private, pure preparation for the external Instagram draw. No winner is
// selected, no code is issued, no database is changed and no message is sent.
// Do not wire an award endpoint until the installed clients can display a
// rolling expiry without their current calendar-month-only prize wording.
const { periodsFor } = require('./contest-periods');
const { eligibleMenuIds } = require('./contest-prizes');
const DAY = 86400000;
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
function thirtyDayWindow(drawnAt) {
  if (typeof drawnAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(drawnAt) || !Number.isFinite(Date.parse(drawnAt))) fail('Date et heure du tirage avec fuseau requises.');
  const date = drawnAt.slice(0, 10), [year, month, day] = date.split('-').map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date) fail('Date de tirage inexistante.');
  const instant = Date.parse(drawnAt);
  return { startsAt: new Date(instant).toISOString(), expiresAt: new Date(instant + 30 * DAY).toISOString(), validDays: 30 };
}
function prepareInstagramPrize(database, input, now = new Date()) {
  const time = +new Date(now), contest = database.referralContest;
  if (!Number.isFinite(time) || !contest || contest.status !== 'published') fail('Un concours publié est requis.', 409);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['periodNumber','customerId','instagramUsername','drawnAt','source','verifiedCompleteList','verifiedIdentity','verifiedAdultAndResidence'].includes(key))) fail('Préparation Instagram invalide.');
  if (input.source !== 'instagram_comments' || input.verifiedCompleteList !== true || input.verifiedIdentity !== true || input.verifiedAdultAndResidence !== true) fail('Vérifier la liste complète des commentaires, les trois mentions, le compte gagnant, sa majorité et sa résidence avant toute remise.');
  const period = periodsFor(contest).find(p => p.number === input.periodNumber);
  if (!period || time < Date.parse(period.endsAt)) fail('Cette quinzaine Instagram n’est pas terminée.', 409);
  const window = thirtyDayWindow(input.drawnAt);
  if (Date.parse(window.startsAt) < Date.parse(period.endsAt) || Date.parse(window.startsAt) > time) fail('Le tirage doit être réalisé après la quinzaine, sans date future.');
  if (time >= Date.parse(window.expiresAt)) fail('Les 30 jours depuis le tirage sont déjà écoulés. Ne pas créer un code expiré ni recommencer sa validité.', 409);
  if (typeof input.instagramUsername !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.]{0,29}$/.test(input.instagramUsername) || input.instagramUsername.endsWith('.')) fail('Identifiant Instagram invalide, sans @, téléphone ou lien.');
  const customer = (database.customers || []).find(c => c.id === input.customerId);
  if (!customer || customer.reviewMode || !/^\+33[67]\d{8}$/.test(customer.phone || '') || customer.verifiedPhone !== customer.phone || !Number.isFinite(Date.parse(customer.phoneVerifiedAt))) fail('Le lot doit être rattaché à un compte Bibou réel avec un mobile vérifié.', 403);
  // No entry, purchase, referral, loyalty balance or ranking is required here.
  return { readOnly: true, source: 'instagram_comments', contestId: contest.id, periodNumber: period.number,
    customerId: customer.id, instagramUsername: input.instagramUsername.toLowerCase(), menus: 1,
    ...window, expiryExclusive: true, expiryBasis: '30 elapsed days from draw instant',
    eligibleMenuIds: eligibleMenuIds(), appOnly: true, paidExtrasAllowed: false, deliveryFeesPayable: true,
    fulfillmentBlocked: true, blockingReason: 'Écran iPhone et Android à adapter aux codes valables 30 jours, puis parcours réel à vérifier avant attribution. Aucun code créé.' };
}
module.exports = { thirtyDayWindow, prepareInstagramPrize };
