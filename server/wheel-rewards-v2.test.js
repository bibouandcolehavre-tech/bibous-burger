const test = require('node:test');
const assert = require('node:assert/strict');
const wheel = require('./wheel');
const policy = require('./wheel-rewards-policy');
const merchant = require('./merchant-promotions');
const { settlePromotionalOrder } = require('./promo-codes');
const { anonymizeCustomerAccount } = require('./account-deletion');
const { previewPromotion } = require('../promo-client');
const { fullWheelRules } = require('../wheel-rules-client');
const now = new Date('2026-10-15T18:00:00Z');
function fixture() {
  const customers = ['a', 'b'].map(id => ({ id, name: 'Fictif', points: 0 }));
  return { customers, wheel: wheel.defaultWheel(), wheelSpins: [], orders: customers.map(customer => ({
    id: 'order-' + customer.id, customerId: customer.id, subtotal: 150, total: 150, discount: 0,
    wheelEurosPerTurn: 15, status: 'confirmed', payment: { status: 'PAID', provider: 'sumup', paidAt: now.toISOString() },
  })) };
}
const activate = db => policy.activate(db, { rewardsVersion: 2, monthlyClassicEnabled: true, confirmation: 'ACTIVER LA ROUE 80' }, now);
const spin = (db, who, number, id = '01', time = now) => wheel.spinWheel(db, who, { now: time, orderId: 'order-' + who, requestId: 'isolated-spin-' + who + '-' + id, randomInt: () => number });

test('new reward policy is explicitly activated without changing published dates, earned turns or history', () => {
  const db = fixture(); assert.equal(wheel.customerWheelState(db, 'a', now).rewardsVersion, 1);
  const before = { turns: wheel.customerWheelState(db, 'a', now).available, start: db.wheel.startDate, end: db.wheel.endDate };
  assert.throws(() => policy.activate(db, { rewardsVersion: 2, monthlyClassicEnabled: true }), /Confirmez/);
  activate(db); assert.equal(activate(db), false);
  assert.equal(wheel.customerWheelState(db, 'a', now).available, before.turns);
  assert.equal(db.wheel.startDate, before.start); assert.equal(db.wheel.endDate, before.end);
  assert.equal(db.wheelSpins.length, 0); assert.match(db.wheel.officialRules, /80 %/);
});

test('every V2 tier has exactly 80 winning and 20 losing outcomes, even while rare prizes are available', () => {
  for (const classic of [false, true]) for (const stb of [false, true]) {
    const sets = policy.segments({ classic, stb });
    for (const [tier, entries] of Object.entries(sets)) {
      assert.equal(entries.reduce((sum, [, value]) => sum + value, 0), 100);
      const result = Array.from({ length: 100 }, (_, number) => wheel.prizeForNumber(number, tier, entries));
      assert.equal(result.filter(prize => prize.id === 'none').length, 20);
      assert.equal(result.filter(prize => prize.id !== 'none').length, 80);
      assert.equal(result.filter(prize => prize.id === 'classic').length, Number(classic));
      assert.equal(result.filter(prize => prize.id === 'stb-tickets').length, Number(stb));
    }
  }
});

test('one immediate Classic for the entire restaurant per Paris month; repeats and other customers cannot win a second', () => {
  const db = fixture(); activate(db);
  const first = spin(db, 'a', 99);
  assert.equal(first.spin.prizeId, 'classic'); assert.equal(first.spin.monthlyClassicMonth, '2026-10');
  assert.equal(first.state.monthlyClassic.available, false);
  assert.equal(spin(db, 'a', 99).spin.id, first.spin.id, 'Request replay returns same award');
  assert.notEqual(spin(db, 'b', 99).spin.prizeId, 'classic');
  assert.deepEqual(db.wheelClassicMonths, ['2026-10']);
  assert.equal(db.merchantPromotions.filter(p => p.type === 'free_classic').length, 1);
  const next = spin(db, 'b', 99, 'next-month', new Date('2026-10-31T23:00:00Z'));
  assert.equal(next.spin.prizeId, 'classic'); assert.deepEqual(db.wheelClassicMonths, ['2026-10', '2026-11']);
});

test('no forced monthly winner, catch-up draw or first-order/tenth-order condition', () => {
  for (const oldOrders of [0, 9]) {
    const db = fixture(); activate(db);
    for (let i = 0; i < oldOrders; i++) db.orders.push({ ...db.orders[0], id: 'previous-' + i });
    assert.equal(spin(db, 'a', 0).spin.prizeId, 'none');
    assert.equal(db.wheelClassicMonths, undefined);
    assert.equal(spin(db, 'a', 99, 'winning').spin.prizeId, 'classic');
  }
});

test('refunds and account deletion revoke unused reward but never reopen this month’s global quota', () => {
  const db = fixture(); activate(db); const won = spin(db, 'a', 99);
  db.orders[0].status = 'cancelled'; wheel.reconcileWheelRewards(db, now);
  assert(won.spin.revokedAt); assert.equal(policy.classicAvailable(db, now), false);
  anonymizeCustomerAccount(db, db.customers[0], now);
  assert.deepEqual(db.wheelClassicMonths, ['2026-10']);
  assert(!db.wheelSpins.some(s => s.customerId === 'a'));
  assert.notEqual(spin(db, 'b', 99).spin.prizeId, 'classic');
});

test('test, free and unpaid orders cannot take the real monthly Classic', () => {
  const db = fixture(); activate(db); db.customers[0].reviewMode = true;
  assert.equal(wheel.customerWheelState(db, 'a', now).monthlyClassic.available, false);
  assert.notEqual(spin(db, 'a', 99).spin.prizeId, 'classic');
  assert.equal(policy.classicAvailable(db, now), true);
  db.customers[0].reviewMode = false; db.orders[0].payment.status = 'PENDING';
  assert.throws(() => spin(db, 'a', 99, 'unpaid'), /Aucun tour/);
  assert.equal(policy.classicAvailable(db, now), true);
});

test('desserts are real single-use account-owned rewards; former fries remain supported', () => {
  const db = fixture(); activate(db); const won = spin(db, 'a', 74);
  assert.equal(won.spin.prizeId, 'dessert');
  const offer = db.merchantPromotions[0]; assert.equal(offer.type, 'free_dessert');
  assert.equal(offer.ownerCustomerId, 'a'); assert.equal(offer.usageLimit, 1);
  assert.throws(() => merchant.assertAvailable(db, offer, 'b', now.getTime()), /autre compte/);
  const items = [{ productId: 'dessert-cookie', price: 3.9, quantity: 3 }];
  assert.deepEqual(merchant.discountFor(offer, items, 11.7), { products: 3.9, delivery: 0 });
  assert.deepEqual(merchant.discountFor({ ...offer, type: 'free_fries' }, [{ productId: 'frites-maison', quantity: 1, price: 3.9 }], 15), { products: 3.9, delivery: 0 });
});

test('Classic coupon offers one Classic alone, with free sauce/crudités, not a menu or paid supplements', () => {
  const db = fixture(); activate(db); spin(db, 'a', 99); const offer = db.merchantPromotions[0];
  const classic = { productId: 'classique', price: 9.9, quantity: 1, options: [{ groupId: 'sauces', price: 0 }, { groupId: 'salad', price: 0 }] };
  assert.deepEqual(merchant.discountFor(offer, [classic], 9.9), { products: 9.9, delivery: 0 });
  assert.deepEqual(merchant.discountFor(offer, [{ ...classic, quantity: 2 }], 19.8), { products: 9.9, delivery: 0 });
  assert.throws(() => merchant.discountFor(offer, [{ ...classic, productId: 'classique-menu' }], 14.9), /Classique seul/);
  assert.throws(() => merchant.discountFor(offer, [{ ...classic, price: 10.9, options: [{ price: 1 }] }], 10.9), /supplément/);
  const order = { id: 'redeem-free', customerId: 'a', status: 'awaiting_payment', promotion: merchant.publicView(offer), items: [classic], subtotal: 9.9, discount: 9.9, discountRate: 0, deliveryFee: 0, total: 0 };
  db.orders.push(order); assert.equal(settlePromotionalOrder(order, now, db), true);
  assert.equal(order.payment.provider, 'promotion'); assert.equal(order.payment.amount, 0);
  assert.throws(() => merchant.assertAvailable(db, offer, 'a', now.getTime()), /limite|déjà/);
});

test('new prize previews remain price-compatible with already installed clients, without weakening server checks', () => {
  for (const type of ['free_drink', 'free_fries', 'free_dessert', 'free_classic']) {
    const offer = { id: 'fixture', code: 'FICTIONAL', type, previewProductDiscount: 3.9, previewBaseRate: 0 };
    const old = merchant.compatiblePreview(offer), current = merchant.compatiblePreview(offer, 2);
    assert.equal(old.type, 'percent_order'); assert.equal(old.originalType, type); assert.equal(current.type, type);
    assert.equal(previewPromotion({ deliveryFee: 0 }, 15, old, 'pickup').total, 11.1);
    assert.equal(previewPromotion({ deliveryFee: 0 }, 15, current, 'pickup').total, 11.1);
    assert.equal(offer.type, type);
  }
});

test('rules disclose exact reward odds, monthly global cap and the absence of a guaranteed monthly winner', () => {
  const db = fixture(); activate(db); const state = wheel.customerWheelState(db, 'a', now);
  const rules = fullWheelRules(state.rules, state.segments);
  assert.match(rules, /20 %/); assert.match(rules, /80 %/); assert.match(rules, /1 %/);
  assert.match(rules, /sans frites, boisson ni suppléments/); assert.match(rules, /Aucun tirage mensuel/);
  assert.match(rules, /un mois peut rester sans gagnant/); assert.match(rules, /burger Classique seul du mois/);
});
