const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_WHEEL_DISCOUNT_PERCENT, EUROS_PER_TURN, CHORUS_TEST_TURN_LIMIT, WHEEL_PRIZES, WHEEL_TIERS, defaultWheel, activeWheel, customerWheelState, eligibleOrderTurns, wheelTierForAmount, prizeForNumber, spinWheel, reconcileWheelRewards, wheelDiscountPercentForOrder } = require('./wheel');
const merchant = require('./merchant-promotions');
const { applyPromotion } = require('./promo-codes');

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

test('nouvelles commandes : un tour par 15 € payés ; anciens tours et anciens paliers conservés', () => {
  assert.equal(EUROS_PER_TURN, 15);
  assert.equal(defaultWheel().eurosPerTurn, 15);
  for (const [amount, expected] of [[0, 0], [14.99, 0], [15, 1], [29.99, 1], [30, 2], [33.80, 2], [44.99, 2], [45, 3], [60, 4]]) {
    assert.equal(eligibleOrderTurns(order(amount, { wheelEurosPerTurn: 15 }), wheel), expected, `${amount} €`);
  }
  assert.equal(eligibleOrderTurns(order(33.80, { wheelEurosPerTurn: 15, total: 39.79, deliveryFee: 5.99 }), wheel), 2);
  assert.equal(eligibleOrderTurns(order(33.80, { wheelEurosPerTurn: 15, discount: 4, total: 35.79, deliveryFee: 5.99 }), wheel), 1);
  assert.equal(eligibleOrderTurns(order(33.80), wheel), 3, 'Une ancienne commande garde ses tours déjà acquis.');
  for (const [amount, expected] of [[29.99, 'small'], [30, 'medium'], [59.99, 'medium'], [60, 'large']])
    assert.equal(wheelTierForAmount(amount), expected);
  assert.equal(wheelTierForAmount(30, 10), 'small');
  assert.equal(wheelTierForAmount(55, 10), 'large');
  const db = fixture();
  db.orders[0] = order(33.80, { wheelEurosPerTurn: 15 });
  assert.equal(customerWheelState(db, 'c1', now).orderTurns[0].available, 2);
  assert.equal(customerWheelState(db, 'c1', now).orderTurns[0].tier, 'medium');
});

test('tour seulement après paiement confirmé, sans attendre la remise', () => {
  assert.equal(eligibleOrderTurns(order(20, { status: 'confirmed' }), wheel), 2);
  for (const changes of [
    { status: 'cancelled' },
    { payment: { status: 'PENDING', paidAt: now.toISOString() } },
    { payment: { status: 'PAID', provider: 'promotion', paidAt: now.toISOString() } },
    { payment: { status: 'PAID', provider: 'sumup', paidAt: '2026-10-31T22:59:59Z' } },
    { refund: { status: 'due', amount: 10 } },
  ]) assert.equal(eligibleOrderTurns(order(20, changes), wheel), 0);
});

test('CHORUS donne au plus deux tours de test sur deux commandes distinctes', () => {
  const db = fixture();
  assert.equal(CHORUS_TEST_TURN_LIMIT, 2);
  db.orders = [order(28, { id: 'chorus-1', discount: 28, total: 0, paidTotal: 0,
    promotion: { code: 'CHORUS' }, payment: { status: 'PAID', provider: 'promotion', paidAt: now.toISOString() } }),
    order(50, { id: 'chorus-2', discount: 50, total: 0, paidTotal: 0,
      promotion: { code: 'CHORUS' }, payment: { status: 'PAID', provider: 'promotion', paidAt: now.toISOString() } }),
    order(50, { id: 'chorus-3', discount: 50, total: 0, paidTotal: 0,
      promotion: { code: 'CHORUS' }, payment: { status: 'PAID', provider: 'promotion', paidAt: now.toISOString() } }),
    order(20, { id: 'gifted', promotion: { code: 'GROSLARD' },
      payment: { status: 'PAID', provider: 'promotion', paidAt: now.toISOString() } })];
  assert.equal(eligibleOrderTurns(db.orders[0], wheel), 1);
  assert.equal(eligibleOrderTurns(db.orders[3], wheel), 0);
  assert.equal(customerWheelState(db, 'c1', now).earnedFromOrders, 2);
  assert.deepEqual(customerWheelState(db, 'c1', now).orderTurns.map(item => item.orderId), ['chorus-1', 'chorus-2']);
  assert.throws(() => spinWheel(db, 'c1', { now, orderId: 'gifted', requestId: 'gifted-wheel-01' }), /Aucun tour/);
  const result = spinWheel(db, 'c1', { now, orderId: 'chorus-1', requestId: 'chorus-wheel-01', randomInt: () => 98 });
  assert.equal(result.spin.tier, 'small');
  assert.equal(result.spin.prizeId, 'fries');
  assert.doesNotThrow(() => merchant.assertAvailable(db, db.merchantPromotions[0], 'c1', now.getTime()));
  assert.equal(customerWheelState(db, 'c1', now).available, 2); // second essai et parrainage
  assert.deepEqual(customerWheelState(db, 'c1', now).orderTurns.map(item => item.orderId), ['chorus-2']);
  assert.equal(spinWheel(db, 'c1', { now, orderId: 'chorus-2', requestId: 'chorus-wheel-02', randomInt: () => 0 }).spin.prizeId, 'none');
  assert.equal(customerWheelState(db, 'c1', now).available, 1); // le parrainage reste disponible
  assert.deepEqual(customerWheelState(db, 'c1', now).orderTurns, []);
  assert.throws(() => spinWheel(db, 'c1', { now, orderId: 'chorus-3', requestId: 'chorus-wheel-03' }), /Aucun tour/);
  assert.equal(spinWheel(db, 'c1', { now, orderId: 'chorus-1', requestId: 'chorus-wheel-01' }).replayed, true);
  db.orders[0].status = 'cancelled';
  assert.equal(reconcileWheelRewards(db, now), true);
  assert.equal(db.wheelSpins[0].redemptionStatus, 'revoked');
});

test('remboursement enregistré : réduction des tours, sans création de solde négatif', () => {
  const db = fixture();
  db.orders[0] = order(30, { paidTotal: 30, total: 20, refund: { status: 'recorded', amount: 10 } });
  assert.equal(customerWheelState(db, 'c1', now).available, 3); // 2 pour la commande + 1 parrainage
  db.wheelSpins = Array.from({ length: 4 }, (_, i) => ({ id: String(i), customerId: 'c1', prizeId: 'points-10' }));
  assert.equal(customerWheelState(db, 'c1', now).available, 0);
  assert.equal(customerWheelState(db, 'c1', now).adjustmentDue, 1);
});

test('parrainage vérifié : un seul tour, sans ajout au classement du concours', () => {
  const db = fixture();
  assert.equal(customerWheelState(db, 'c1', now).earnedFromReferrals, 1);
  const result = spinWheel(db, 'c1', { now, requestId: 'referral-wheel-01', randomInt: () => 95 });
  assert.equal(result.spin.referralCustomerId, 'c2');
  assert.equal(result.state.availableFromReferrals, 0);
  assert.doesNotThrow(() => merchant.assertAvailable(db, db.merchantPromotions[0], 'c1', now.getTime()));
  assert.throws(() => spinWheel(db, 'c1', { now, requestId: 'referral-wheel-02', randomInt: () => 95 }), /Aucun tour/);
  db.customers[1].referralRewardRevokedAt = now.toISOString();
  assert.equal(customerWheelState(db, 'c1', now).earnedFromReferrals, 0);
  assert.equal(db.referralContest, undefined);
});

test('une chance sur deux sans gain, paliers progressifs et remises plafonnées', () => {
  for (const tier of Object.values(WHEEL_TIERS)) {
    assert.equal(tier.reduce((sum, [, weight]) => sum + weight, 0), 100);
    assert.deepEqual(tier[0], ['none', 50]);
  }
  assert.equal(prizeForNumber(97, 'small').id, 'drink');
  assert.equal(prizeForNumber(99, 'small').id, 'fries');
  assert.equal(prizeForNumber(99, 'medium').id, 'discount-5');
  assert.equal(prizeForNumber(99, 'large').id, 'discount-5');
  assert.equal(WHEEL_PRIZES.every(prize => !prize.discountPercent || prize.discountPercent <= MAX_WHEEL_DISCOUNT_PERCENT), true);
  for (let number = 0; number < 100; number++) assert.ok(prizeForNumber(number).label);
  assert.throws(() => prizeForNumber(100), RangeError);
  const db = fixture();
  const result = spinWheel(db, 'c1', { now, orderId: 'order-1', requestId: 'spin-request-1', randomInt: () => 50 });
  assert.equal(result.spin.pointsAdded, 20);
  assert.equal(db.customers[0].points, 120);
  assert.equal(result.state.available, 2);
  const retry = spinWheel(db, 'c1', { now, orderId: 'order-1', requestId: 'spin-request-1', randomInt: () => 99 });
  assert.equal(retry.replayed, true);
  assert.equal(retry.spin.id, result.spin.id);
  assert.equal(db.customers[0].points, 120);
  assert.equal(db.wheelSpins.length, 1);
  assert.equal(db.referralContest, undefined);
});

test('un gain crée un code personnel utilisable une seule fois', () => {
  const db = fixture();
  const result = spinWheel(db, 'c1', { now, orderId: 'order-1', requestId: 'spin-request-2', randomInt: () => 98 });
  assert.equal(result.spin.prizeId, 'fries');
  assert.equal(result.spin.redemptionStatus, 'active');
  assert.match(result.spin.code, /^ROUE-[A-F0-9]{10}$/);
  assert.equal(db.merchantPromotions[0].ownerCustomerId, 'c1');
  assert.equal(db.merchantPromotions[0].type, 'free_fries');
  assert.equal(db.merchantPromotions[0].usageLimit, 1);
  assert.doesNotThrow(() => merchant.assertAvailable(db, db.merchantPromotions[0], 'c1', now.getTime()));
  assert.throws(() => merchant.assertAvailable(db, db.merchantPromotions[0], 'c2', now.getTime()), /autre compte/);
  assert.equal(merchant.discountFor(db.merchantPromotions[0], [{ productId: 'frites-maison', quantity: 1, price: 3.9 }], 12).products, 3.9);
  assert.throws(() => merchant.discountFor(db.merchantPromotions[0], [{ productId: 'classique', quantity: 1, price: 9.9 }], 12), /frites/);
  const promo = merchant.publicView(db.merchantPromotions[0]);
  const priced = applyPromotion({ subtotal: 13.8, deliveryFee: 0, discountRate: 0, total: 13.8 }, promo, 'pickup', [
    { productId: 'classique', quantity: 1, price: 9.9 }, { productId: 'frites-maison', quantity: 1, price: 3.9 },
  ]);
  assert.equal(priced.total, 9.9);
  db.orders[0].refund = { status: 'recorded', amount: 20 };
  assert.throws(() => merchant.assertAvailable(db, promo, 'c1', now.getTime()), /plus utilisable/);
  delete db.orders[0].refund;
  db.orders.push({ id: 'redeemed', customerId: 'c1', promotion: promo, status: 'confirmed', payment: { status: 'PAID' } });
  assert.throws(() => merchant.assertAvailable(db, promo, 'c1', now.getTime()), /limite/);
  assert.equal(result.spin.expiresAt, '2026-12-12T12:00:00.000Z');
  assert.equal(db.customers[0].points, 100);
});

test('aucun tour gratuit en rechargeant la page et aucun tour pour une commande tierce', () => {
  const db = fixture();
  assert.throws(() => spinWheel(db, 'c1', { now, orderId: 'other', requestId: 'spin-request-4' }), /Aucun tour/);
  spinWheel(db, 'c1', { now, orderId: 'order-1', requestId: 'spin-request-5', randomInt: () => 0 });
  spinWheel(db, 'c1', { now, orderId: 'order-1', requestId: 'spin-request-6', randomInt: () => 0 });
  assert.throws(() => spinWheel(db, 'c1', { now, orderId: 'order-1', requestId: 'spin-request-7' }), /Aucun tour/);
  assert.equal(db.wheelSpins.length, 2);
});

test('un remboursement reprend les points de tours devenus injustifiés une seule fois', () => {
  const db = fixture();
  db.customers[0].points = 0;
  spinWheel(db, 'c1', { now, orderId: 'order-1', requestId: 'refund-wheel-spin-01', randomInt: () => 50 });
  assert.equal(db.customers[0].points, 20);
  db.orders[0].refund = { status: 'recorded', amount: 20 };
  assert.equal(reconcileWheelRewards(db, now), true);
  assert.equal(db.customers[0].points, 0);
  assert.ok(db.wheelSpins[0].revokedAt);
  assert.equal(reconcileWheelRewards(db, now), false);
});

test('dix tours ne cumulent jamais les remises en pourcentage sur une commande', () => {
  assert.equal(MAX_WHEEL_DISCOUNT_PERCENT, 5);
  assert.equal(wheelDiscountPercentForOrder(['discount-1', 'discount-2']), 2);
  assert.equal(wheelDiscountPercentForOrder(Array(10).fill('discount-5')), 5);
  assert.equal(wheelDiscountPercentForOrder(['discount-5', 'discount-2', 'discount-1']), 5);
  assert.equal(wheelDiscountPercentForOrder(['drink', 'fries', 'dessert']), 0);
});

test('publication limitée aux dates et aux règles validées', () => {
  assert.equal(activeWheel(defaultWheel(), new Date('2026-10-05T12:00:00Z')), true);
  assert.equal(activeWheel(defaultWheel(), new Date('2027-01-01T12:00:00Z')), false);
  assert.equal(activeWheel({}, now), false);
  assert.equal(activeWheel({ ...wheel, status: 'draft' }, now), false);
  assert.equal(activeWheel({ ...wheel, officialRules: '' }, now), false);
  assert.equal(activeWheel(wheel, new Date('2026-12-31T22:59:59Z')), true);
  assert.equal(activeWheel(wheel, new Date('2026-12-31T23:00:00Z')), false);
  const db = fixture(); db.wheel.status = 'draft';
  assert.throws(() => spinWheel(db, 'c1', { now, requestId: 'spin-request-3', randomInt: () => 0 }), /pas ouverte/);
});
