const test = require('node:test');
const assert = require('node:assert/strict');
const { customerGains } = require('./customer-gains');
const { dashboardCustomerDetail } = require('./dashboard-customers');
const { defaultWheel } = require('./wheel');
const { grantLoyaltyForOrder, revokeLoyaltyForOrder } = require('./loyalty');
const now = new Date('2026-10-14T18:00:00Z');
const at = now.toISOString();
const order = (id = 'o1', overrides = {}) => ({ id, number: 301, customerId: 'a', status: 'delivered', method: 'pickup', subtotal: 20, discount: 0, total: 20,
  createdAt: at, payment: { status: 'PAID', paidAt: at }, wheelEurosPerTurn: 15, loyaltyPointsAdded: 60, loyaltyGrantedAt: at, ...overrides });
const spin = (id = 's1', overrides = {}) => ({ id, customerId: 'a', orderId: 'o1', prizeId: 'points-20', label: '20 points Club Bibou', pointsAdded: 20, awardedAt: at, ...overrides });
const fixture = () => ({ customers: [{ id: 'a', name: 'Client exemple', points: 80 }], orders: [order()], wheel: defaultWheel(), wheelSpins: [spin()] });

test('gains : distingue les 60 points de commandes et les 20 points de roue, sans écriture', () => {
  const db = fixture(), before = JSON.stringify(db);
  const gains = dashboardCustomerDetail(db, 'a', now).gains;
  assert.deepEqual(gains.points, { currentBalance: 80, orders: 60, wheel: 20, referrals: 0, adjustments: 0, recordedTotal: 80, difference: 0, reconciled: true, missingRecords: 0, hasRevocations: false });
  assert.equal(gains.wheel.played, 1);
  assert.equal(gains.wheel.available, 0);
  assert.equal(gains.wheel.history[0].orderNumber, 301);
  assert.equal(gains.credits.find(credit => credit.source === 'orders').points, 60);
  assert.equal(JSON.stringify(db), before);
});

test('gains : 80 points de commandes ne prouvent pas un gain de roue, même si le tour reste disponible', () => {
  const db = fixture(); db.orders[0].loyaltyPointsAdded = 80; db.wheelSpins = [];
  const gains = customerGains(db, db.customers[0], now);
  assert.equal(gains.points.orders, 80);
  assert.equal(gains.points.wheel, 0);
  assert.equal(gains.wheel.played, 0);
  assert.equal(gains.wheel.available, 1);
  assert.deepEqual(gains.wheel.orders, [{ number: 301, played: 0, available: 1 }]);
  db.wheelSpins.push(spin('none', { prizeId: 'none', label: 'Pas de gain cette fois', pointsAdded: undefined }));
  const played = customerGains(db, db.customers[0], now);
  assert.equal(played.wheel.history[0].status, 'no_gain');
  assert.equal(played.wheel.played, 1);
  assert.equal(played.wheel.available, 0);
  assert.equal(played.points.wheel, 0);
});

test('gains : respecte les multiplicateurs déjà crédités et ne recalcule pas les points avec les euros', () => {
  const db = { customers: [{ id: 'a', points: 0 }], orders: [], wheelSpins: [] };
  for (const id of ['o1', 'o2']) {
    const paid = order(id, { loyaltyBasePoints: 15, loyaltyGrantedAt: undefined, loyaltyPointsAdded: undefined });
    grantLoyaltyForOrder(db.customers[0], paid, now);
    db.orders.push(paid);
  }
  const gains = customerGains(db, db.customers[0], now);
  assert.equal(gains.points.orders, 60);
  assert.deepEqual(gains.credits.map(credit => credit.points).sort((a, b) => a - b), [15, 45]);
  assert.equal(gains.points.reconciled, true);
  revokeLoyaltyForOrder(db.customers[0], db.orders[0], now); db.orders[0].status = 'cancelled';
  const after = customerGains(db, db.customers[0], now);
  assert.equal(after.points.currentBalance, 15);
  assert.equal(after.points.reconciled, false, 'La réduction rétroactive ne doit pas être confondue avec des points de roue.');
  assert.equal(after.points.hasRevocations, true);
  assert.ok(after.credits.some(credit => credit.status === 'revoked'));
});

test('gains : cadeaux disponibles, utilisés, expirés, retirés et paliers anciens conservés', () => {
  const db = fixture(); db.wheelSpins = [
    spin('active', { prizeId: 'fries', pointsAdded: undefined, label: 'Frites offertes', redemptionStatus: 'active', expiresAt: '2026-11-01T18:00:00Z' }),
    spin('used', { prizeId: 'drink', pointsAdded: undefined, label: 'Boisson offerte', redemptionStatus: 'used', expiresAt: '2026-10-01T18:00:00Z', usedAt: at, usedOnOrderId: 'o1' }),
    spin('expired', { prizeId: 'discount-1', pointsAdded: undefined, redemptionStatus: 'active', expiresAt: '2026-10-14T18:00:00Z' }),
    spin('revoked', { prizeId: 'fries', pointsAdded: undefined, redemptionStatus: 'revoked', revokedAt: at }),
  ];
  db.rewardClaims = [{ id: 'tier-used', customerId: 'a', rewardId: 'drink', status: 'used', createdAt: at, usedAt: at }, { id: 'tier-active', customerId: 'a', rewardId: 'fries', status: 'active', createdAt: at }];
  const gains = customerGains(db, db.customers[0], now);
  for (const [id, status] of [['active', 'available'], ['used', 'used'], ['expired', 'expired'], ['revoked', 'revoked'], ['tier-used', 'used'], ['tier-active', 'available']])
    assert.equal(gains.gifts.find(gift => gift.id === id).status, status);
  assert.equal(gains.gifts.find(gift => gift.id === 'used').usedOnOrderNumber, 301);
  assert.equal(gains.wheel.played, 4, 'Les anciens gains retirés restent dans l’historique des tours.');
});

test('gains : parrainages et gestes commerciaux restent des sources séparées', () => {
  const db = fixture(); db.customers[0].points = 195;
  db.orders.push(order('referral', { customerId: 'b', referralSponsorCustomerId: 'a', referralRewardGrantedAt: at, referralRewardPoints: 100 }));
  db.loyaltyAdjustments = [{ id: 'support', customerId: 'a', amount: 15, reason: 'Geste commercial', createdAt: at }];
  const gains = customerGains(db, db.customers[0], now);
  assert.equal(gains.points.orders, 60);
  assert.equal(gains.points.referrals, 100);
  assert.equal(gains.points.adjustments, 15);
  assert.equal(gains.points.reconciled, true);
  db.orders[1].referralRewardRevokedAt = at;
  assert.equal(customerGains(db, db.customers[0], now).points.referrals, 0);
});

test('gains : ancien solde sans traces et points de roue non enregistrés ne sont jamais inventés', () => {
  const db = fixture(); db.wheelSpins = []; delete db.orders[0].loyaltyPointsAdded;
  let gains = customerGains(db, db.customers[0], now);
  assert.equal(gains.points.reconciled, false);
  assert.equal(gains.points.orders, 0);
  assert.equal(gains.points.difference, 80);
  assert.equal(gains.credits[0].points, null);
  db.wheelSpins.push(spin('legacy', { pointsAdded: undefined }));
  gains = customerGains(db, db.customers[0], now);
  assert.equal(gains.points.wheel, 0, 'Le libellé 20 points n’est pas une preuve d’un crédit enregistré.');
  assert.equal(gains.wheel.history[0].points, null);
  assert.equal(gains.points.missingRecords, 2);
});

test('gains : points annulés exclus des sources actives, tours et dettes conservés sans réconciliation', () => {
  const db = fixture(); db.customers[0].points = 60; db.customers[0].wheelPointsDebt = 10;
  db.wheelSpins[0].revokedAt = at;
  const before = JSON.stringify(db), gains = customerGains(db, db.customers[0], now);
  assert.equal(gains.points.wheel, 0);
  assert.equal(gains.wheel.played, 1);
  assert.equal(gains.wheel.history[0].status, 'revoked');
  assert.equal(gains.points.reconciled, false);
  assert.equal(JSON.stringify(db), before);
});

test('gains : pas de données privées d’un autre client, pas de codes ni de tokens', () => {
  const db = fixture();
  db.wheelSpins.push(spin('other', { customerId: 'b', code: 'SECRET-OTHER' }));
  Object.assign(db.wheelSpins[0], { requestId: 'SECRET-REQUEST', code: 'SECRET-CODE', usedOnOrderId: 'other-order' });
  db.orders.push(order('other-order', { number: 'SECRET-NUMBER', customerId: 'b', comment: 'SECRET-REMARK' }));
  db.rewardClaims = [{ id: 'other', customerId: 'b', rewardId: 'drink', rewardTitle: 'SECRET-TITLE', code: 'SECRET-CLAIM' }];
  const gains = customerGains(db, db.customers[0], now);
  assert.equal(gains.wheel.history.length, 1);
  assert.equal(gains.wheel.history[0].usedOnOrderNumber, null);
  assert.equal(JSON.stringify(gains).includes('SECRET'), false);
});

test('gains : lots STB remis et tirage de rattrapage visibles sans activer les lots', () => {
  const db = fixture(); db.stbTickets = { enabled: false, matches: [], entries: [], awards: [
    { id: 'ticket', customerId: 'a', opponent: 'Adversaire', source: 'catch_up_draw', fulfillment: 'delivered', awardedAt: at, deliveredAt: at },
    { id: 'private', customerId: 'b', opponent: 'SECRET', fulfillment: 'awaiting_delivery' },
  ] };
  const before = JSON.stringify(db), gains = customerGains(db, db.customers[0], now);
  assert.equal(gains.gifts[0].source, 'draw');
  assert.equal(gains.gifts[0].status, 'used');
  assert.equal(gains.wheel.played, 1);
  assert.equal(JSON.stringify(db), before);
});
