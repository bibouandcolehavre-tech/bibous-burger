// Local prototype only. Do not expose this module through public routes until
// the prize-redemption flow, published rules and launch controls are approved.
const crypto = require('node:crypto');
const { parisDateKey } = require('./availability');

const MAX_WHEEL_DISCOUNT_PERCENT = 5;
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
  status: 'draft',
  startDate: null,
  endDate: '2026-12-31',
  officialRules: '',
  eurosPerTurn: 10,
  referralTurn: true,
});

const activeWheel = (wheel, now = new Date()) => Boolean(
  wheel?.status === 'published' && wheel.officialRules?.trim() &&
  /^\d{4}-\d{2}-\d{2}$/.test(wheel.startDate || '') &&
  /^\d{4}-\d{2}-\d{2}$/.test(wheel.endDate || '') &&
  wheel.startDate <= parisDateKey(now) && parisDateKey(now) <= wheel.endDate
);

const cents = value => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value) * 100)) : 0;
const withinWindow = (wheel, value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) &&
    parisDateKey(date) >= wheel.startDate && parisDateKey(date) <= wheel.endDate;
};

function eligibleOrderTurns(order, wheel) {
  if (!wheel?.startDate || !wheel.endDate || !order || order.payment?.status !== 'PAID' ||
      order.payment.provider === 'promotion' || order.status === 'cancelled' ||
      order.refund?.status === 'due' || !withinWindow(wheel, order.payment.paidAt)) return 0;
  // Delivery fees never buy turns. A recorded refund can only reduce earnings.
  const productsPaid = Math.max(0, cents(order.subtotal) - cents(order.discount));
  const originalPaid = cents(order.paidTotal ?? order.total);
  const refunded = order.refund?.status === 'recorded' ? cents(order.refund.amount) : 0;
  const retained = Math.max(0, originalPaid - refunded);
  return Math.floor(Math.min(productsPaid, retained) / (wheel.eurosPerTurn * 100));
}

function eligibleReferrals(database, sponsorId, wheel) {
  if (!wheel?.referralTurn) return [];
  return (database.customers || []).filter(customer =>
    customer.referredByCustomerId === sponsorId && customer.referralRewardGrantedAt &&
    !customer.referralRewardRevokedAt && withinWindow(wheel, customer.referralRewardGrantedAt)
  );
}
function referralTurns(database, sponsorId, wheel) { return eligibleReferrals(database, sponsorId, wheel).length; }

function customerWheelState(database, customerId, now = new Date()) {
  const wheel = database.wheel || defaultWheel();
  const orders = (database.orders || []).filter(order => order.customerId === customerId);
  const earnedFromOrders = orders.reduce((sum, order) => sum + eligibleOrderTurns(order, wheel), 0);
  const earnedFromReferrals = referralTurns(database, customerId, wheel);
  const spins = (database.wheelSpins || []).filter(spin => spin.customerId === customerId);
  const earned = earnedFromOrders + earnedFromReferrals;
  return {
    status: activeWheel(wheel, now) ? 'active' : 'inactive',
    earned,
    earnedFromOrders,
    earnedFromReferrals,
    availableFromReferrals: eligibleReferrals(database, customerId, wheel).filter(referral => !spins.some(spin => spin.referralCustomerId === referral.id)).length,
    played: spins.length,
    available: Math.max(0, earned - spins.length),
    // If a post-spin refund reduces eligibility, future turns first clear this gap.
    adjustmentDue: Math.max(0, spins.length - earned),
    orderTurns: orders.map(order => ({ orderId: order.id,
      available: Math.max(0, eligibleOrderTurns(order, wheel) - spins.filter(spin => spin.orderId === order.id).length),
      tier: wheelTierForAmount(Math.max(0, Number(order.subtotal) - Number(order.discount || 0))),
    })).filter(item => item.available > 0),
    segments: WHEEL_TIERS,
    rules: activeWheel(wheel, now) ? wheel.officialRules : null,
    prizes: spins.filter(spin => !spin.revokedAt).map(spin => ({ id: spin.id, prizeId: spin.prizeId, label: spin.label, code: spin.code || null,
      redemptionStatus: spin.redemptionStatus || null, awardedAt: spin.awardedAt, expiresAt: spin.expiresAt || null })),
  };
}

function wheelTierForAmount(amount) {
  if (amount <= 30) return 'small';
  if (amount <= 50) return 'medium';
  return 'large';
}

function prizeForNumber(number, tier = 'small') {
  if (!Number.isInteger(number) || number < 0 || number >= 100 || !WHEEL_TIERS[tier]) throw new RangeError('Tirage invalide.');
  let boundary = 0;
  const id = WHEEL_TIERS[tier].find(([, weight]) => number < (boundary += weight))[0];
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
  const referral = !orderId && eligibleReferrals(database, customerId, wheel).find(item => !(database.wheelSpins || []).some(spin => spin.customerId === customerId && spin.referralCustomerId === item.id));
  if (!referral && (!earnedForOrder || playedForOrder >= earnedForOrder))
    throw Object.assign(new Error('Aucun tour disponible pour cette commande payée ou ce parrainage.'), { statusCode: 409 });
  const tier = referral ? 'small' : wheelTierForAmount(Math.max(0, Number(sourceOrder.subtotal) - Number(sourceOrder.discount || 0)));
  let prize = prizeForNumber(randomInt(100), tier);
  const prior = (database.wheelSpins || []).filter(spin => spin.customerId === customerId && spin.prizeId && !spin.revokedAt && spin.redemptionStatus !== 'used' && (!spin.expiresAt || Date.parse(spin.expiresAt) > now.getTime()));
  const matchingCount = prior.filter(spin => spin.prizeId === prize.id).length;
  const giftLimit = tier === 'large' ? 2 : 1;
  if ((['drink', 'fries'].includes(prize.id) && matchingCount >= giftLimit) ||
      (prize.discountPercent && prior.some(spin => WHEEL_PRIZES.find(item => item.id === spin.prizeId)?.discountPercent))) {
    prize = WHEEL_PRIZES.find(item => item.id === (tier === 'small' ? 'points-20' : tier === 'medium' ? 'points-30' : 'points-40'));
  }
  const awardedAt = now.toISOString();
  const expiresAt = prize.validDays ? new Date(now.getTime() + prize.validDays * 86400000).toISOString() : null;
  const spin = { id: crypto.randomUUID(), requestId, customerId, orderId: orderId || null, referralCustomerId: referral?.id || null,
    tier, prizeId: prize.id, label: prize.label, awardedAt, expiresAt };
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
    const type = prize.discountPercent ? 'percent_order' : prize.id === 'drink' ? 'free_drink' : 'free_fries';
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
  const wideWindow = { startDate: '1900-01-01', endDate: '2999-12-31', eurosPerTurn: 10 };
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

module.exports = { MAX_WHEEL_DISCOUNT_PERCENT, WHEEL_PRIZES, WHEEL_TIERS, defaultWheel, activeWheel, eligibleOrderTurns, referralTurns, customerWheelState, wheelTierForAmount, prizeForNumber, spinWheel, reconcileWheelRewards, wheelDiscountPercentForOrder };
