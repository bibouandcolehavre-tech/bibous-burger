const test = require('node:test');
const assert = require('node:assert/strict');
const { WHEEL_PRIZES, activeWheel, customerWheelState, eligibleOrderTurns, prizeForNumber, spinWheel } = require('./wheel');

const now = new Date('2026-11-12T12:00:00Z');
const wheel = { status: 'published', startDate: '2026-11-01', endDate: '2026-12-31', officialRules: 'Règlement fictif réservé aux tests.', eurosPerTurn: 10, referralTurn: true };
const order = (subtotal, overrides = {}) => ({ id: 'order-1', customerId: 'c1', subtotal, discount: 0, total: subtotal, status: 'delivered', payment: { status: 'PAID', provider: 'sumup', paidAt: '2026-11-12T10:00:00Z' }, ...overrides });
const fixture = () => ({ wheel: { ...wheel }, customers: [{ id: 'c1', points: 100 }, { id: 'c2', points: 0, referredByCustomerId: 'c1', referralRewardGrantedAt: now.toISOString() }], orders: [order(20)], wheelSpins: [] });

test('un tour par tranche complète de 10 € de produits payés, par commande', () => {
  for (const [amount, expected] of [[0, 0], [9.99, 0], [10, 1], [19.99, 1], [20, 2], [30, 3]])
    assert.equal(eligibleOrderTurns(order(amount), wheel), expected);
  assert.equal(eligibleOrderTurns(order(9.99, { total: 15.98, deliveryFee: 5.99 }), wheel), 0);
  assert.equal(eligibleOrderTurns(order(22, { discount: 3, total: 25.99, deliveryFee: 5.99 }), wheel), 1);
});

test('aucun tour sur commande impayée, offerte, annulée, non remise ou antérieure', () => {
  for (const changes of [
    { status: 'confirmed' }, { status: 'cancelled' },
    { payment: { status: 'PENDING', paidAt: now.toISOString() } },
    { payment: { status: 'PAID', provider: 'promotion', paidAt: now.toISOString() } },
    { payment: { status: 'PAID', provider: 'sumup', paidAt: '2026-10-31T22:59:59Z' } },
    { refund: { status: 'due', amount: 10 } },
  ]) assert.equal(eligibleOrderTurns(order(20, changes), wheel), 0);
});

test('remboursement enregistré : réduction des tours, sans création de solde négatif', () => {
  const db = fixture();
  db.orders[0] = order(30, { paidTotal: 30, total: 20, refund: { status: 'recorded', amount: 10 } });
  assert.equal(customerWheelState(db, 'c1', now).available, 3); // 2 pour la commande + 1 parrainage
  db.wheelSpins = Array.from({ length: 4 }, (_, i) => ({ id: String(i), customerId: 'c1', prizeId: 'points-5' }));
  assert.equal(customerWheelState(db, 'c1', now).available, 0);
  assert.equal(customerWheelState(db, 'c1', now).adjustmentDue, 1);
});

test('parrainage vérifié : un seul tour, sans ajout au classement du concours', () => {
  const db = fixture();
  assert.equal(customerWheelState(db, 'c1', now).earnedFromReferrals, 1);
  db.customers[1].referralRewardRevokedAt = now.toISOString();
  assert.equal(customerWheelState(db, 'c1', now).earnedFromReferrals, 0);
  assert.equal(db.referralContest, undefined);
});

test('100 % des cases gagnent, 5 % de bons, gain fixé côté serveur', () => {
  assert.equal(WHEEL_PRIZES.reduce((sum, prize) => sum + prize.weight, 0), 100);
  assert.equal(WHEEL_PRIZES.filter(prize => prize.type === 'voucher').reduce((sum, prize) => sum + prize.weight, 0), 5);
  for (let number = 0; number < 100; number++) assert.ok(prizeForNumber(number).label);
  assert.throws(() => prizeForNumber(100), RangeError);
  const db = fixture();
  const result = spinWheel(db, 'c1', { now, requestId: 'spin-request-1', randomInt: () => 0 });
  assert.equal(result.spin.pointsAdded, 5);
  assert.equal(db.customers[0].points, 105);
  assert.equal(result.state.available, 2);
  const retry = spinWheel(db, 'c1', { now, requestId: 'spin-request-1', randomInt: () => 99 });
  assert.equal(retry.replayed, true);
  assert.equal(retry.spin.id, result.spin.id);
  assert.equal(db.customers[0].points, 105);
  assert.equal(db.wheelSpins.length, 1);
  assert.equal(db.referralContest, undefined);
});

test('les bons sont enregistrés sans prétendre être utilisables avant intégration', () => {
  const db = fixture();
  const result = spinWheel(db, 'c1', { now, requestId: 'spin-request-2', randomInt: () => 99 });
  assert.equal(result.spin.prizeId, 'drink');
  assert.equal(result.spin.redemptionStatus, 'pending-integration');
  assert.equal(result.spin.expiresAt, '2026-12-12T12:00:00.000Z');
  assert.equal(db.customers[0].points, 100);
});

test('inactive par défaut ; ouverture seulement avec dates et règlement approuvés', () => {
  assert.equal(activeWheel({}, now), false);
  assert.equal(activeWheel({ ...wheel, status: 'draft' }, now), false);
  assert.equal(activeWheel({ ...wheel, officialRules: '' }, now), false);
  assert.equal(activeWheel(wheel, new Date('2026-12-31T22:59:59Z')), true);
  assert.equal(activeWheel(wheel, new Date('2026-12-31T23:00:00Z')), false);
  const db = fixture(); db.wheel.status = 'draft';
  assert.throws(() => spinWheel(db, 'c1', { now, requestId: 'spin-request-3', randomInt: () => 0 }), /pas ouverte/);
});
