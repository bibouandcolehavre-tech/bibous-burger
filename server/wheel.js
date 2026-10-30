// The wheel is separate from the referral contest and is enabled only during
// its published window. All outcomes and eligibility are enforced server-side.
const crypto = require('node:crypto');
const { parisDateKey } = require('./availability');
const stb = require('./stb-tickets');
const rewardPolicy = require('./wheel-rewards-policy');

const MAX_WHEEL_DISCOUNT_PERCENT = 5;
const LEGACY_EUROS_PER_TURN = 10;
const EUROS_PER_TURN = 15;
const CHORUS_TEST_TURN_LIMIT = 2;
const WHEEL_PRIZES = Object.freeze([
  { id: 'none', label: 'Pas de gain cette fois', type: 'none' },
  { id: 'points-20', label: '20 points Club Bibou', type: 'points', points: 20 },
  { id: 'points-30', label: '30 points Club Bibou', type: 'points', points: 30 },
  { id: 'points-40', label: '40 points Club Bibou', type: 'points', points: 40 },
  { id: 'points-60', label: '60 points Club Bibou', type: 'points', points: 60 },
  { id: 'discount-1', label: '−1 % sur une prochaine commande', type: 'voucher', discountPercent: 1, minimumProductsEuros: 10, validDays: 30 },
  { id: 'discount-2', label: '−2 % sur une prochaine commande', type: 'voucher', discountPercent: 2, minimumProductsEuros: 10, validDays: 30 },
  { id: 'discount-5', label: '−5 % sur une prochaine commande', type: 'voucher', discountPercent: 5, minimumProductsEuros: 10, validDays: 30 },
  { id: 'drink', label: 'Une boisson offerte sur une prochaine commande', type: 'voucher', maxDrinkEuros: 1.8, minimumProductsEuros: 10, validDays: 30 },
  { id: 'fries', label: 'Une portion de frites maison offerte sur une prochaine commande', type: 'voucher', minimumProductsEuros: 10, validDays: 30 },
  { id: 'dessert', label: 'Un dessert offert sur une prochaine commande', type: 'voucher', minimumProductsEuros: 10, validDays: 30 },
  { id: 'classic', label: 'Le Classique du mois offert !', type: 'voucher', minimumProductsEuros: 0, validDays: 30 },
  { id: 'stb-tickets', label: 'Deux places STB', type: 'tickets' },
]);
const WHEEL_TIERS = Object.freeze({
  small: Object.freeze([['none', 50], ['points-20', 25], ['points-40', 17], ['points-60', 3], ['drink', 3], ['fries', 2]]),
  medium: Object.freeze([['none', 50], ['points-30', 25], ['drink', 10], ['fries', 7], ['discount-1', 4], ['discount-2', 3], ['discount-5', 1]]),
  large: Object.freeze([['none', 50], ['points-40', 10], ['drink', 17], ['fries', 13], ['discount-1', 5], ['discount-2', 3], ['discount-5', 2]]),
});
if (Object.values(WHEEL_TIERS).some(tier => tier.reduce((sum, [, weight]) => sum + weight, 0) !== 100))
  throw new Error('Chaque palier de la roue doit totaliser 100 %.');
if (WHEEL_PRIZES.some(prize => prize.discountPercent > MAX_WHEEL_DISCOUNT_PERCENT))
  throw new Error('Une remise de la roue dépasse le plafond autorisé.');

// A future checkout must choose one wheel percentage voucher, never add them.
// This preview policy is not a coupon-redemption endpoint.
function wheelDiscountPercentForOrder(prizeIds = []) {
  const percentages = WHEEL_PRIZES.filter(prize => prize.discountPercent && prizeIds.includes(prize.id))
    .map(prize => prize.discountPercent);
  return Math.min(MAX_WHEEL_DISCOUNT_PERCENT, Math.max(0, ...percentages));
}

const defaultWheel = () => ({
  status: 'published',
  startDate: '2026-10-05',
  endDate: '2026-12-31',
  officialRules: "Roue Bibou, du 5 octobre au 31 décembre 2026 (heure de Paris). Réservée aux clients possédant un compte Bibou. Pour les nouvelles commandes, après paiement confirmé, 1 tour par tranche complète de 15 € de produits effectivement payés, hors frais de livraison ; les tours acquis sous l’ancien barème restent conservés. Un tour supplémentaire est accordé par parrainage validé. Les commandes offertes ne donnent pas de tour. Une commande annulée ou remboursée ne donne pas droit aux tours correspondants. Chaque tour a 50 % de chances de ne rien gagner. Les autres gains possibles varient selon le montant de la commande : points Club Bibou, boisson ou frites maison offertes, ou remise de 1 %, 2 % ou 5 % sur une prochaine commande. Pour les nouvelles commandes de 15 € à moins de 30 € de produits payés, les chances de boisson et frites sont respectivement de 3 % et 2 % ; de 30 € à moins de 60 € : 10 % et 7 % ; à partir de 60 € : 17 % et 13 %. Les remises n’excèdent jamais 5 % et ne se cumulent pas entre elles. Un seul code promotionnel peut être utilisé par commande. Les codes de gains sont personnels, utilisables une seule fois dans les 30 jours sur une prochaine commande d’au moins 10 € de produits. Les boissons et frites gagnées doivent figurer dans cette prochaine commande. Les gains non utilisés expirent ; les gains encore inutilisés liés à une commande annulée ou remboursée sont retirés. Le concours de classement est distinct et reste fermé.",
  eurosPerTurn: EUROS_PER_TURN,
  referralTurn: true,
});

const activeWheel = (wheel, now = new Date()) => Boolean(
  wheel?.status === 'published' && wheel.officialRules?.trim() &&
  /^\d{4}-\d{2}-\d{2}$/.test(wheel.startDate || '') &&
  /^\d{4}-\d{2}-\d{2}$/.test(wheel.endDate || '') &&
  wheel.startDate <= parisDateKey(now) && parisDateKey(now) <= wheel.endDate
);

const cents = value => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value) * 100)) : 0;
// The rate belongs to the order, not the current settings: changing the game
// must never remove turns that a customer earned under the previous rules.
const orderEurosPerTurn = order => Number(order?.wheelEurosPerTurn) === EUROS_PER_TURN ? EUROS_PER_TURN : LEGACY_EUROS_PER_TURN;
const withinWindow = (wheel, value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) &&
    parisDateKey(date) >= wheel.startDate && parisDateKey(date) <= wheel.endDate;
};

function eligibleOrderTurns(order, wheel) {
  if (!wheel?.startDate || !wheel.endDate || !order || order.payment?.status !== 'PAID' ||
      order.status === 'cancelled' || order.payment.provider === 'cash' ||
      order.refund?.status === 'due' || !withinWindow(wheel, order.payment.paidAt)) return 0;
  // CHORUS is an owner test exception, not a paid purchase. Limit it to two
  // spins per account below; all other gifted orders stay ineligible.
  if (order.payment.provider === 'promotion') return order.promotion?.code === 'CHORUS' ? 1 : 0;
  // Delivery fees never buy turns. A recorded refund can only reduce earnings.
  const productsPaid = Math.max(0, cents(order.subtotal) - cents(order.discount));
  const originalPaid = cents(order.paidTotal ?? order.total);
  const refunded = order.refund?.status === 'recorded' ? cents(order.refund.amount) : 0;
  const retained = Math.max(0, originalPaid - refunded);
  return Math.floor(Math.min(productsPaid, retained) / (orderEurosPerTurn(order) * 100));
}

function eligibleReferrals(database, sponsorId, wheel) {
  if (!wheel?.referralTurn) return [];
  return (database.customers || []).filter(customer =>
    customer.referredByCustomerId === sponsorId && customer.referralRewardGrantedAt &&
    !customer.referralRewardRevokedAt && withinWindow(wheel, customer.referralRewardGrantedAt)
  );
}
function referralTurns(database, sponsorId, wheel) { return eligibleReferrals(database, sponsorId, wheel).length; }

// Older saved rules may still contain the retired private test exception.
// Filter its sentence for display without rewriting odds, history or paid rights.
const publicWheelRules = rules => typeof rules === 'string'
  ? rules.split(/(?<=[.!?\n])/u).filter(sentence => !/\bCHORUS\b/i.test(sentence)).join('')
    .replace('Les autres commandes offertes', 'Les commandes offertes').trim() : '';

function customerWheelState(database, customerId, now = new Date()) {
  const wheel = database.wheel || defaultWheel();
  const customer = (database.customers || []).find(item => item.id === customerId);
  const policyV2 = rewardPolicy.enabled(wheel);
  const monthlyClassic = rewardPolicy.monthlyState(database, now, !customer?.reviewMode && !customer?.isKioskGuest);
  const newSegments = policyV2 ? rewardPolicy.segments({ allSpinsWin: rewardPolicy.guaranteed(wheel), classic: monthlyClassic?.available, stb: Boolean(stb.availableMatch(database, now)) }) : null;
  const rankingBonus = database.referralContest?.status === 'published' && database.referralContest.wheelPointsInRanking === true;
  // The owner opts into the ranking bonus by publishing that contest's rules.
  // Do not change the wheel's odds, credit, turns or historical stored rules.
  const baseRules = publicWheelRules(wheel.officialRules);
  const officialRules = rankingBonus ? baseRules.replace('Le concours de classement est distinct et reste fermé.', 'Le concours de classement reste un jeu distinct.') +
    ' Si tu participes au concours de classement Bibou, chaque point réellement gagné à la roue pendant sa période ajoute aussi un point au classement, sans retirer le gain de fidélité. Seuls les tours valides sont retenus, une fois ; cadeaux, remises et tours fictifs sont exclus du bonus. Consulte les dates, les conditions et le règlement complet dans le concours.' : baseRules;
  const orders = (database.orders || []).filter(order => order.customerId === customerId);
  const earnedFromReferrals = referralTurns(database, customerId, wheel);
  const spins = (database.wheelSpins || []).filter(spin => spin.customerId === customerId);
  const chorusOrders = orders.filter(order => order.payment?.provider === 'promotion' && order.promotion?.code === 'CHORUS' && eligibleOrderTurns(order, wheel));
  const playedChorusIds = new Set(spins.filter(spin => chorusOrders.some(order => order.id === spin.orderId)).map(spin => spin.orderId));
  // Preserve the already-played order, then give the next available test turn
  // to the most recent distinct CHORUS order.
  const eligibleChorusOrders = [
    ...chorusOrders.filter(order => playedChorusIds.has(order.id)),
    ...chorusOrders.filter(order => !playedChorusIds.has(order.id)),
  ].slice(0, CHORUS_TEST_TURN_LIMIT);
  const eligibleChorusIds = new Set(eligibleChorusOrders.map(order => order.id));
  const earnedFromOrders = orders.reduce((sum, order) => sum + (order.payment?.provider === 'promotion' ? 0 : eligibleOrderTurns(order, wheel)), 0) + eligibleChorusOrders.length;
  const earned = earnedFromOrders + earnedFromReferrals;
  return {
    status: activeWheel(wheel, now) ? 'active' : 'inactive',
    rewardsVersion: policyV2 ? 2 : 1,
    allSpinsWin: rewardPolicy.guaranteed(wheel),
    winRatePercent: rewardPolicy.guaranteed(wheel) ? 100 : policyV2 ? 80 : 50,
    monthlyClassic,
    earned,
    earnedFromOrders,
    earnedFromReferrals,
    availableFromReferrals: eligibleReferrals(database, customerId, wheel).filter(referral => !spins.some(spin => spin.referralCustomerId === referral.id)).length,
    played: spins.length,
    available: Math.max(0, earned - spins.length),
    // If a post-spin refund reduces eligibility, future turns first clear this gap.
    adjustmentDue: Math.max(0, spins.length - earned),
    orderTurns: orders.map(order => ({ orderId: order.id,
      available: Math.max(0, (order.payment?.provider === 'promotion' ? Number(eligibleChorusIds.has(order.id)) : eligibleOrderTurns(order, wheel)) - spins.filter(spin => spin.orderId === order.id).length),
      stbEligible: order.payment?.provider !== 'promotion',
      tier: order.payment?.provider === 'promotion' ? 'small' : wheelTierForAmount(Math.max(0, Number(order.subtotal) - Number(order.discount || 0)), orderEurosPerTurn(order)),
    })).filter(item => item.available > 0),
    stbTickets: stb.customerState(database, customerId, now),
    baseSegments: policyV2 ? rewardPolicy.segments({ allSpinsWin: rewardPolicy.guaranteed(wheel) }) : WHEEL_TIERS,
    segments: newSegments || (stb.availableMatch(database, now) ? Object.fromEntries(Object.entries(WHEEL_TIERS).map(([tier, segments]) => [tier, [...segments.map(([id, weight]) => [id, id === 'none' ? weight - 1 : weight]), ['stb-tickets', 1]]])) : WHEEL_TIERS),
    rules: activeWheel(wheel, now) ? officialRules + (stb.availableMatch(database, now) ? (policyV2 ? ' Pendant la disponibilité du lot STB, 1 % des tours remplace un gain de points par le lot unique de deux places : ' + (rewardPolicy.guaranteed(wheel) ? 'les tours restent tous gagnants. ' : 'les 20 % sans gain ne changent pas. ') : ' Pendant la disponibilité du lot STB, 1 % des tours remplace un résultat sans gain par un lot unique de deux places : la probabilité sans gain passe alors de 50 % à 49 %. ') + 'Le lot est attribué au plus tard cinq jours avant le match ; si nécessaire, un tirage de rattrapage est effectué parmi les participants éligibles, une chance par client. ' + stb.config(database).rules : '') : null,
    prizes: spins.filter(spin => !spin.revokedAt).map(spin => ({ id: spin.id, prizeId: spin.prizeId, label: spin.label, code: spin.code || null,
      redemptionStatus: spin.redemptionStatus || null, awardedAt: spin.awardedAt, expiresAt: spin.expiresAt || null })),
  };
}

function wheelTierForAmount(amount, eurosPerTurn = EUROS_PER_TURN) {
  if (eurosPerTurn === LEGACY_EUROS_PER_TURN) {
    if (amount <= 30) return 'small';
    if (amount <= 50) return 'medium';
    return 'large';
  }
  if (amount < 30) return 'small';
  if (amount < 60) return 'medium';
  return 'large';
}

function prizeForNumber(number, tier = 'small', segments = WHEEL_TIERS[tier]) {
  if (!Number.isInteger(number) || number < 0 || number >= 100 || !WHEEL_TIERS[tier]) throw new RangeError('Tirage invalide.');
  let boundary = 0;
  const id = segments.find(([, weight]) => number < (boundary += weight))[0];
  return WHEEL_PRIZES.find(prize => prize.id === id);
}

function spinWheel(database, customerId, { now = new Date(), requestId, orderId, randomInt = crypto.randomInt } = {}) {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{12,64}$/.test(requestId))
    throw Object.assign(new Error('Référence de tour invalide.'), { statusCode: 400 });
  const previous = (database.wheelSpins || []).find(spin => spin.customerId === customerId && spin.requestId === requestId);
  if (previous) return { spin: previous, state: customerWheelState(database, customerId, now), replayed: true };
  const wheel = database.wheel || defaultWheel();
  if (!activeWheel(wheel, now)) throw Object.assign(new Error('La roue n’est pas ouverte.'), { statusCode: 409 });
  const customer = (database.customers || []).find(item => item.id === customerId);
  if (!customer) throw Object.assign(new Error('Compte introuvable.'), { statusCode: 404 });
  const sourceOrder = orderId && (database.orders || []).find(order => order.id === orderId && order.customerId === customerId);
  const earnedForOrder = eligibleOrderTurns(sourceOrder, wheel);
  const playedForOrder = (database.wheelSpins || []).filter(spin => spin.customerId === customerId && spin.orderId === orderId).length;
  const chorusLimitReached = sourceOrder?.payment?.provider === 'promotion' && sourceOrder?.promotion?.code === 'CHORUS' &&
    (database.wheelSpins || []).filter(spin => spin.customerId === customerId && (database.orders || []).some(order => order.id === spin.orderId && order.payment?.provider === 'promotion' && order.promotion?.code === 'CHORUS')).length >= CHORUS_TEST_TURN_LIMIT;
  const referral = !orderId && eligibleReferrals(database, customerId, wheel).find(item => !(database.wheelSpins || []).some(spin => spin.customerId === customerId && spin.referralCustomerId === item.id));
  if (!referral && (!earnedForOrder || playedForOrder >= earnedForOrder || chorusLimitReached))
    throw Object.assign(new Error('Aucun tour disponible pour cette commande payée ou ce parrainage.'), { statusCode: 409 });
  const tier = referral || sourceOrder.payment?.provider === 'promotion' ? 'small' : wheelTierForAmount(Math.max(0, Number(sourceOrder.subtotal) - Number(sourceOrder.discount || 0)), orderEurosPerTurn(sourceOrder));
  const policyV2 = rewardPolicy.enabled(wheel);
  const realTurn = !customer.reviewMode && !customer.isKioskGuest && (Boolean(referral) || sourceOrder?.payment?.provider !== 'promotion');
  const eligibleForStb = referral || sourceOrder?.payment?.provider !== 'promotion';
  const match = eligibleForStb ? stb.availableMatch(database, now) : null;
  const spinSegments = policyV2 ? rewardPolicy.segments({ allSpinsWin: rewardPolicy.guaranteed(wheel), classic: realTurn && rewardPolicy.classicAvailable(database, now), stb: Boolean(match) })[tier] : WHEEL_TIERS[tier];
  const number = randomInt(100);
  let prize = prizeForNumber(number, tier, spinSegments);
  const prior = (database.wheelSpins || []).filter(spin => spin.customerId === customerId && spin.prizeId && !spin.revokedAt && spin.redemptionStatus !== 'used' && (!spin.expiresAt || Date.parse(spin.expiresAt) > now.getTime()));
  const matchingCount = prior.filter(spin => spin.prizeId === prize.id).length;
  const giftLimit = tier === 'large' ? 2 : 1;
  if ((['drink', 'fries', 'dessert'].includes(prize.id) && matchingCount >= giftLimit) ||
      (prize.discountPercent && prior.some(spin => WHEEL_PRIZES.find(item => item.id === spin.prizeId)?.discountPercent))) {
    prize = WHEEL_PRIZES.find(item => item.id === (tier === 'small' ? 'points-20' : tier === 'medium' ? 'points-30' : 'points-40'));
  }
  const awardedAt = now.toISOString();
  const expiresAt = prize.validDays ? new Date(now.getTime() + prize.validDays * 86400000).toISOString() : null;
  const spin = { id: crypto.randomUUID(), requestId, customerId, orderId: orderId || null, referralCustomerId: referral?.id || null,
    tier, prizeId: prize.id, label: prize.label, awardedAt, expiresAt };
  if (match) {
    stb.participate(database, customerId, spin, now);
    if ((!policyV2 && number === 0) || (policyV2 && prize.id === 'stb-tickets')) {
      const won = stb.spinAward(database, match, customerId, spin.id, now);
      if (won) { prize = { id: 'stb-tickets', type: 'tickets' }; spin.prizeId = prize.id; spin.label = `Deux places STB · ${won.opponent}`; spin.stbAwardId = won.id; }
    }
  }
  if (prize.id === 'classic') {
    // The request runs under the single authoritative database lock. Keep a
    // non-identifying month tombstone even after a refund or account deletion.
    const month = rewardPolicy.monthKey(now);
    if (!realTurn || !rewardPolicy.classicAvailable(database, now)) throw new Error('Lot mensuel indisponible.');
    database.wheelClassicMonths ||= [];
    database.wheelClassicMonths.push(month);
    spin.monthlyClassicMonth = month;
  }
  if (policyV2) spin.rewardSegments = spinSegments;
  database.wheelSpins ||= [];
  database.wheelSpins.push(spin);
  if (prize.type === 'points') {
    customer.points = Math.max(0, Number(customer.points) || 0) + prize.points;
    spin.pointsAdded = prize.points;
  } else if (prize.type === 'voucher') {
    database.merchantPromotions ||= [];
    let code;
    do { code = `ROUE-${crypto.randomBytes(5).toString('hex').toUpperCase()}`; }
    while (database.merchantPromotions.some(item => item.code === code));
    const type = prize.discountPercent ? 'percent_order' : prize.id === 'drink' ? 'free_drink' : prize.id === 'dessert' ? 'free_dessert' : prize.id === 'classic' ? 'free_classic' : 'free_fries';
    database.merchantPromotions.push({ id: crypto.randomUUID(), code, type, percent: prize.discountPercent || 0,
      productId: null, minimum: prize.minimumProductsEuros, startsAt: awardedAt, endsAt: expiresAt,
      usageLimit: 1, oncePerCustomer: true, enabled: true, ownerCustomerId: customerId,
      sourceWheelSpinId: spin.id, message: prize.label });
    spin.code = code;
    spin.redemptionStatus = 'active';
  }
  return { spin, state: customerWheelState(database, customerId, now) };
}

function reconcileWheelRewards(database, now = new Date()) {
  let changed = false;
  const wideWindow = { startDate: '1900-01-01', endDate: '2999-12-31' };
  const spins = database.wheelSpins || [];
  const revoke = spin => {
    if (spin.revokedAt) return;
    spin.revokedAt = now.toISOString();
    if (spin.redemptionStatus === 'active') spin.redemptionStatus = 'revoked';
    const customer = (database.customers || []).find(item => item.id === spin.customerId);
    if (customer && spin.pointsAdded) {
      const balance = Math.max(0, Number(customer.points) || 0);
      customer.points = Math.max(0, balance - spin.pointsAdded);
      customer.wheelPointsDebt = Math.max(0, Number(customer.wheelPointsDebt) || 0) + Math.max(0, spin.pointsAdded - balance);
    }
    changed = true;
  };
  for (const order of database.orders || []) {
    const owned = spins.filter(spin => spin.orderId === order.id);
    const allowed = eligibleOrderTurns(order, wideWindow);
    owned.slice(allowed).forEach(revoke);
  }
  for (const spin of spins.filter(item => item.referralCustomerId)) {
    const referral = (database.customers || []).find(item => item.id === spin.referralCustomerId);
    if (!referral || referral.referredByCustomerId !== spin.customerId || !referral.referralRewardGrantedAt || referral.referralRewardRevokedAt)
      revoke(spin);
  }
  for (const customer of database.customers || []) {
    const debt = Math.max(0, Number(customer.wheelPointsDebt) || 0);
    const balance = Math.max(0, Number(customer.points) || 0);
    if (debt && balance) {
      const deducted = Math.min(debt, balance);
      customer.points = balance - deducted;
      customer.wheelPointsDebt = debt - deducted;
      changed = true;
    }
  }
  return changed;
}

function reconcileStbTickets(database, now = new Date(), randomInt = crypto.randomInt) {
  const wheel = database.wheel || defaultWheel();
  return stb.reconcile(database, (spinId, customerId) => {
    const spin = (database.wheelSpins || []).find(s => s.id === spinId && s.customerId === customerId && !s.revokedAt);
    if (!spin || !database.customers.some(c => c.id === customerId)) return false;
    if (spin.referralCustomerId) return eligibleReferrals(database, customerId, wheel).some(c => c.id === spin.referralCustomerId);
    const order = database.orders.find(o => o.id === spin.orderId && o.customerId === customerId);
    return order?.payment?.provider !== 'promotion' && eligibleOrderTurns(order, wheel) > 0;
  }, now, randomInt);
}
module.exports = { MAX_WHEEL_DISCOUNT_PERCENT, EUROS_PER_TURN, CHORUS_TEST_TURN_LIMIT, WHEEL_PRIZES, WHEEL_TIERS, defaultWheel, activeWheel, eligibleOrderTurns, referralTurns, customerWheelState, wheelTierForAmount, prizeForNumber, spinWheel, reconcileWheelRewards, reconcileStbTickets, wheelDiscountPercentForOrder };
