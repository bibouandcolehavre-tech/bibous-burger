// Read-only history: never award, redeem or reconcile a reward while opening a profile.
const { WHEEL_PRIZES, customerWheelState } = require('./wheel');
const { REWARD_DEFINITIONS } = require('./rewards');

const amount = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) ? Number(value) : null;
const points = value => { const number = amount(value); return number === null || number < 0 ? null : number; };
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const latestFirst = (a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0);

function customerGains(database, customer, now = new Date()) {
  const ownedOrders = (database.orders || []).filter(order => order.customerId === customer.id);
  const ordersById = new Map(ownedOrders.map(order => [order.id, order]));
  const spins = (database.wheelSpins || []).filter(spin => spin.customerId === customer.id);
  const state = customerWheelState(database, customer.id, now);
  const credits = [];
  let missingRecords = 0;
  let hasRevocations = false;

  for (const order of ownedOrders) {
    if (!order.loyaltyGrantedAt && order.payment?.status !== 'PAID') continue;
    // Fully gifted orders intentionally receive no purchase points.
    if (!order.loyaltyGrantedAt && (order.payment?.provider === 'promotion' || order.promotion?.sourceContestPrize)) continue;
    const value = points(order.loyaltyPointsAdded);
    const revoked = Boolean(order.loyaltyRevokedAt || order.status === 'cancelled');
    if (value === null && !revoked) missingRecords++;
    if (revoked && (order.loyaltyGrantedAt || value > 0)) hasRevocations = true;
    credits.push({ source: 'orders', label: 'Points de commande', at: date(order.loyaltyGrantedAt) || date(order.payment?.paidAt) || date(order.createdAt),
      orderNumber: order.number ?? null, points: value, status: revoked ? 'revoked' : value === null ? 'unknown' : 'credited' });
  }

  const wheelHistory = spins.map(spin => {
    const prize = WHEEL_PRIZES.find(item => item.id === spin.prizeId);
    const sourceOrder = ordersById.get(spin.orderId);
    const usedOrder = ordersById.get(spin.usedOnOrderId);
    const value = points(spin.pointsAdded);
    const isPoints = prize?.type === 'points' || value > 0;
    const revoked = Boolean(spin.revokedAt || spin.redemptionStatus === 'revoked');
    if (isPoints) {
      if (value === null && !revoked) missingRecords++;
      if (revoked) hasRevocations = true;
      credits.push({ source: 'wheel', label: 'Points gagnés à la roue', at: date(spin.awardedAt), orderNumber: sourceOrder?.number ?? null,
        points: value, status: revoked ? 'revoked' : value === null ? 'unknown' : 'credited' });
    }
    const status = revoked ? 'revoked' : spin.prizeId === 'none' ? 'no_gain' : isPoints ? (value === null ? 'unknown' : 'credited')
      : spin.redemptionStatus === 'used' ? 'used' : spin.prizeId === 'stb-tickets' ? 'tickets'
      : date(spin.expiresAt) && Date.parse(spin.expiresAt) <= now.getTime() ? 'expired'
      : spin.redemptionStatus === 'active' ? 'available' : 'unknown';
    return { id: spin.id, at: date(spin.awardedAt), prizeId: spin.prizeId, label: String(spin.label || prize?.label || 'Gain non détaillé'),
      points: isPoints ? value : 0, status, orderNumber: sourceOrder?.number ?? null,
      source: sourceOrder ? 'order' : spin.referralCustomerId ? 'referral' : 'unknown',
      expiresAt: date(spin.expiresAt), usedAt: date(spin.usedAt), usedOnOrderNumber: usedOrder?.number ?? null, revokedAt: date(spin.revokedAt) };
  }).sort(latestFirst);

  for (const order of database.orders || []) {
    if (order.referralSponsorCustomerId !== customer.id || !order.referralRewardGrantedAt) continue;
    const value = points(order.referralRewardPoints);
    const revoked = Boolean(order.referralRewardRevokedAt || order.status === 'cancelled');
    if (value === null && !revoked) missingRecords++;
    if (revoked) hasRevocations = true;
    credits.push({ source: 'referrals', label: 'Bonus de parrainage', at: date(order.referralRewardGrantedAt), points: value, status: revoked ? 'revoked' : value === null ? 'unknown' : 'credited' });
  }
  for (const adjustment of database.loyaltyAdjustments || []) {
    if (adjustment.customerId !== customer.id) continue;
    const value = amount(adjustment.amount);
    if (value === null) missingRecords++;
    credits.push({ source: 'adjustments', label: String(adjustment.reason || 'Ajustement enregistré'), at: date(adjustment.createdAt),
      points: value, status: value === null ? 'unknown' : 'credited' });
  }
  credits.sort(latestFirst);
  const totals = { orders: 0, wheel: 0, referrals: 0, adjustments: 0 };
  for (const credit of credits) if (credit.status === 'credited') totals[credit.source] += credit.points;
  const recordedTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const currentBalance = Math.max(0, amount(customer.points) || 0);
  const difference = currentBalance - recordedTotal;
  const reconciled = difference === 0 && missingRecords === 0 && !hasRevocations && !(points(customer.wheelPointsDebt) > 0);

  const gifts = wheelHistory.filter(spin => !['none', 'points-20', 'points-30', 'points-40', 'points-60', 'stb-tickets'].includes(spin.prizeId)).map(spin => ({ ...spin, source: 'wheel' }));
  for (const claim of database.rewardClaims || []) {
    if (claim.customerId !== customer.id) continue;
    gifts.push({ id: claim.id, source: 'tier', label: String(claim.rewardTitle || REWARD_DEFINITIONS.find(reward => reward.id === claim.rewardId)?.title || 'Récompense de palier'),
      at: date(claim.createdAt), usedAt: date(claim.usedAt), status: { active: 'available', used: 'used', cancelled: 'revoked' }[claim.status] || 'unknown' });
  }
  for (const award of database.stbTickets?.awards || []) {
    if (award.customerId !== customer.id) continue;
    gifts.push({ id: award.id, source: award.source === 'wheel' ? 'wheel' : 'draw', label: `Deux places STB · ${String(award.opponent || 'Match')}`,
      at: date(award.awardedAt), usedAt: date(award.deliveredAt), status: { awaiting_delivery: 'available', delivered: 'used', revoked: 'revoked' }[award.fulfillment] || 'unknown' });
  }

  return { points: { currentBalance, ...totals, recordedTotal, difference, reconciled, missingRecords, hasRevocations }, credits,
    wheel: { played: spins.length, available: state.available, active: state.status === 'active', adjustmentDue: state.adjustmentDue,
      history: wheelHistory, orders: ownedOrders.filter(order => order.payment?.status === 'PAID').map(order => ({
        number: order.number ?? null, played: spins.filter(spin => spin.orderId === order.id).length,
        available: state.orderTurns.find(turn => turn.orderId === order.id)?.available || 0 })) },
    gifts: gifts.sort(latestFirst) };
}

module.exports = { customerGains };
