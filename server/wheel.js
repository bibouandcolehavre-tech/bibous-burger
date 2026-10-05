// Local prototype only. Do not expose this module through public routes until
// the prize-redemption flow, published rules and launch controls are approved.
const crypto = require('node:crypto');
const { parisDateKey } = require('./availability');

const WHEEL_PRIZES = Object.freeze([
  { id: 'points-5', label: '5 points Club Bibou', weight: 50, type: 'points', points: 5 },
  { id: 'points-10', label: '10 points Club Bibou', weight: 30, type: 'points', points: 10 },
  { id: 'points-20', label: '20 points Club Bibou', weight: 15, type: 'points', points: 20 },
  { id: 'discount-5', label: '−5 % sur une prochaine commande', weight: 4, type: 'voucher', discountPercent: 5, maxDiscountEuros: 3, minimumProductsEuros: 10, validDays: 30 },
  { id: 'drink', label: 'Une boisson offerte sur une prochaine commande', weight: 1, type: 'voucher', maxDrinkEuros: 1.8, minimumProductsEuros: 10, validDays: 30 },
]);
const TOTAL_WEIGHT = WHEEL_PRIZES.reduce((sum, prize) => sum + prize.weight, 0);
if (TOTAL_WEIGHT !== 100) throw new Error('La roue doit totaliser 100 %.');

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
      order.payment.provider === 'promotion' || order.status !== 'delivered' ||
      order.refund?.status === 'due' || !withinWindow(wheel, order.payment.paidAt)) return 0;
  // Delivery fees never buy turns. A recorded refund can only reduce earnings.
  const productsPaid = Math.max(0, cents(order.subtotal) - cents(order.discount));
  const originalPaid = cents(order.paidTotal ?? order.total);
  const refunded = order.refund?.status === 'recorded' ? cents(order.refund.amount) : 0;
  const retained = Math.max(0, originalPaid - refunded);
  return Math.floor(Math.min(productsPaid, retained) / (wheel.eurosPerTurn * 100));
}

function referralTurns(database, sponsorId, wheel) {
  if (!wheel?.referralTurn) return 0;
  return (database.customers || []).filter(customer =>
    customer.referredByCustomerId === sponsorId && customer.referralRewardGrantedAt &&
    !customer.referralRewardRevokedAt && withinWindow(wheel, customer.referralRewardGrantedAt)
  ).length;
}

function customerWheelState(database, customerId, now = new Date()) {
  const wheel = database.wheel || defaultWheel();
  const earnedFromOrders = (database.orders || []).filter(order => order.customerId === customerId)
    .reduce((sum, order) => sum + eligibleOrderTurns(order, wheel), 0);
  const earnedFromReferrals = referralTurns(database, customerId, wheel);
  const spins = (database.wheelSpins || []).filter(spin => spin.customerId === customerId);
  const earned = earnedFromOrders + earnedFromReferrals;
  return {
    status: activeWheel(wheel, now) ? 'active' : 'inactive',
    earned,
    earnedFromOrders,
    earnedFromReferrals,
    played: spins.length,
    available: Math.max(0, earned - spins.length),
    // If a post-spin refund reduces eligibility, future turns first clear this gap.
    adjustmentDue: Math.max(0, spins.length - earned),
    prizes: spins.map(spin => ({ id: spin.id, prizeId: spin.prizeId, label: spin.label, awardedAt: spin.awardedAt, expiresAt: spin.expiresAt || null })),
  };
}

function prizeForNumber(number) {
  if (!Number.isInteger(number) || number < 0 || number >= TOTAL_WEIGHT) throw new RangeError('Tirage invalide.');
  let boundary = 0;
  return WHEEL_PRIZES.find(prize => number < (boundary += prize.weight));
}

function spinWheel(database, customerId, { now = new Date(), requestId, randomInt = crypto.randomInt } = {}) {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{12,64}$/.test(requestId))
    throw Object.assign(new Error('Référence de tour invalide.'), { statusCode: 400 });
  const previous = (database.wheelSpins || []).find(spin => spin.customerId === customerId && spin.requestId === requestId);
  if (previous) return { spin: previous, state: customerWheelState(database, customerId, now), replayed: true };
  const wheel = database.wheel || defaultWheel();
  if (!activeWheel(wheel, now)) throw Object.assign(new Error('La roue n’est pas ouverte.'), { statusCode: 409 });
  const customer = (database.customers || []).find(item => item.id === customerId);
  if (!customer) throw Object.assign(new Error('Compte introuvable.'), { statusCode: 404 });
  if (!customerWheelState(database, customerId, now).available) throw Object.assign(new Error('Aucun tour disponible.'), { statusCode: 409 });
  const prize = prizeForNumber(randomInt(TOTAL_WEIGHT));
  const awardedAt = now.toISOString();
  const expiresAt = prize.validDays ? new Date(now.getTime() + prize.validDays * 86400000).toISOString() : null;
  const spin = { id: crypto.randomUUID(), requestId, customerId, prizeId: prize.id, label: prize.label, awardedAt, expiresAt };
  database.wheelSpins ||= [];
  database.wheelSpins.push(spin);
  if (prize.type === 'points') {
    customer.points = Math.max(0, Number(customer.points) || 0) + prize.points;
    spin.pointsAdded = prize.points;
  } else {
    // This is a recorded entitlement, NOT an active coupon. Redemption must be
    // implemented and verified before the wheel can be launched.
    spin.redemptionStatus = 'pending-integration';
  }
  return { spin, state: customerWheelState(database, customerId, now) };
}

module.exports = { WHEEL_PRIZES, defaultWheel, activeWheel, eligibleOrderTurns, referralTurns, customerWheelState, prizeForNumber, spinWheel };
