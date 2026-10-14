// Read-only projection of authoritative wheel awards, never a loyalty credit.
const { WHEEL_PRIZES, eligibleOrderTurns } = require('./wheel');
const { withinContest } = require('./contest-window');

const CONTEST_WHEEL_BONUS_RULES = 'Bonus roue du classement : 1 point réellement gagné à la roue pendant la période du concours donne aussi 1 point au classement, sans retirer son crédit au Club Bibou. Le solde de fidélité et les points habituels de commandes ne sont pas transférés au classement. Seuls les tours valides issus d’un achat réellement payé ou d’un parrainage validé sont retenus, une seule fois. Les tours fictifs ou offerts de test, cadeaux, remises et gains annulés ou devenus injustifiés ne donnent pas ce bonus. Le total et le rang des applications existantes incluent le bonus ; leur détail achats/partages/parrainages n’affiche pas encore une ligne roue. Le détail des points de roue figure dans le back-office.';
const wheelBonusEnabled = contest => contest?.wheelPointsInRanking === true;
const wheelRulesConflict = rules => /points[^.\n]{0,160}roue[^.\n]{0,160}(?:ne[^.\n]{0,100}pas[^.\n]{0,100}classement|hors\s+classement)/i.test(rules || '');
const wheelBonusDeclared = rules => !wheelRulesConflict(rules) && /points[^.\n]{0,200}roue[^.\n]{0,200}(?:rapportent|ajout[eé]s|comptabilis[eé]s)[^.\n]{0,200}classement/i.test(rules || '');
const pointPrizes = new Map(WHEEL_PRIZES.filter(prize => prize.type === 'points').map(prize => [prize.id, prize.points]));
const wideWindow = { startDate: '1900-01-01', endDate: '2999-12-31' };

function contestWheelEvents(database, contest, now = new Date()) {
  if (!wheelBonusEnabled(contest) || contest.status !== 'published' || !Number.isFinite(new Date(now).getTime())) return [];
  const orders = new Map((database.orders || []).map(order => [order.id, order]));
  const customers = new Map((database.customers || []).map(customer => [customer.id, customer]));
  const seenIds = new Set(), seenRequests = new Set(), spins = [];
  for (const spin of database.wheelSpins || []) {
    if (!spin || typeof spin.id !== 'string' || !spin.id || !customers.has(spin.customerId)) continue;
    const request = spin.requestId ? JSON.stringify([spin.customerId, spin.requestId]) : null;
    if (seenIds.has(spin.id) || (request && seenRequests.has(request))) continue;
    seenIds.add(spin.id); if (request) seenRequests.add(request);
    spins.push(spin);
  }
  const consumedByOrder = new Map(), consumedReferrals = new Set(), events = [];
  for (const spin of spins) {
    // Every outcome consumes a turn, including a non-winning/voucher outcome.
    const ordinal = spin.orderId ? consumedByOrder.get(spin.orderId) || 0 : 0;
    if (spin.orderId) consumedByOrder.set(spin.orderId, ordinal + 1);
    const referralKey = spin.referralCustomerId ? JSON.stringify([spin.customerId, spin.referralCustomerId]) : null;
    const referralAlreadyUsed = referralKey && consumedReferrals.has(referralKey);
    if (referralKey) consumedReferrals.add(referralKey);
    const at = Date.parse(spin.awardedAt), points = pointPrizes.get(spin.prizeId);
    if (!points || spin.pointsAdded !== points || spin.revokedAt || spin.reviewMode ||
        !Number.isFinite(at) || at > new Date(now).getTime() || !withinContest(contest, spin.awardedAt)) continue;
    if (Boolean(spin.orderId) === Boolean(spin.referralCustomerId)) continue;
    if (spin.orderId) {
      const order = orders.get(spin.orderId), paidAt = Date.parse(order?.payment?.paidAt);
      if (!order || order.customerId !== spin.customerId || order.reviewMode ||
          ['promotion', 'cash'].includes(order.payment?.provider) ||
          !Number.isFinite(paidAt) || paidAt > at || ordinal >= eligibleOrderTurns(order, wideWindow)) continue;
    } else {
      const referral = customers.get(spin.referralCustomerId), grantedAt = Date.parse(referral?.referralRewardGrantedAt);
      if (referralAlreadyUsed || !referral || referral.referredByCustomerId !== spin.customerId ||
          referral.referralRewardRevokedAt || !Number.isFinite(grantedAt) || grantedAt > at) continue;
    }
    events.push({ customerId: spin.customerId, spinId: spin.id, kind: 'wheel', amount: points, at: new Date(at).toISOString() });
  }
  return events;
}

module.exports = { CONTEST_WHEEL_BONUS_RULES, wheelBonusEnabled, wheelRulesConflict, wheelBonusDeclared, contestWheelEvents };
