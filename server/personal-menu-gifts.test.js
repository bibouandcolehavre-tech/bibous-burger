const test = require('node:test'), assert = require('node:assert/strict');
process.env.BIBOU_PERSONAL_MENU_GIFTS_V1 = JSON.stringify([{ code: 'TEST-MENU', customerId: 'fictional-recipient' }]);
const gifts = require('./personal-menu-gifts');
const promos = require('./promo-codes');
const { previewPromotion } = require('../promo-client');
const db = () => ({ customers: [{ id: 'fictional-recipient' }, { id: 'another' }], orders: [] });
test('personal menu gift: strict server-only configuration, retired and duplicate codes rejected', () => {
  assert.deepEqual(gifts.parseConfig(undefined), []);
  assert.deepEqual(gifts.parseConfig('[]'), []);
  assert.deepEqual(gifts.parseConfig('[{"code":" test-gift ","customerId":"fake"}]'), [{ code: 'TEST-GIFT', customerId: 'fake' }]);
  for (const raw of ['{}', 'null', 'broken', '[{}]', '[{"code":"CHORUS","customerId":"fake"}]', '[{"code":"GROSLARD","customerId":"fake"}]', '[{"code":"TEST","customerId":"fake","percent":100}]', '[{"code":"TEST","customerId":"fake"},{"code":"test","customerId":"other"}]']) assert.throws(() => gifts.parseConfig(raw), { statusCode: 503 });
});
test('personal menu gift: belongs to one existing real account, survives deletion by refusing a new account', () => {
  const database = db(), promo = promos.promotionForCode(' test-menu ', database);
  assert.equal(promo.pickupOnly, true); assert.equal(promo.requiredMenuCount, 1);
  promos.assertPromotionAvailable(database, promo, 'fictional-recipient');
  assert.throws(() => promos.assertPromotionAvailable(database, promo, 'another'), { statusCode: 403 });
  database.customers.shift();
  assert.throws(() => promos.assertPromotionAvailable(database, promo, 'fictional-recipient'), { statusCode: 403 });
  assert.deepEqual(gifts.readiness(database), { configured: 1, available: 0 });
});
test('personal menu gift: no takeover of an existing merchant promotion or contest voucher', () => {
  for (const collision of [{ merchantPromotions: [{ code: 'TEST-MENU' }] }, { contestPrizes: { vouchers: [{ code: 'TEST-MENU' }] } }]) {
    assert.throws(() => promos.promotionForCode('TEST-MENU', { ...db(), ...collision }), { statusCode: 409 });
    assert.equal(gifts.readiness({ ...db(), ...collision }).available, 0);
  }
});
test('personal menu gift: exactly one menu without paid extras, no other item or delivery', () => {
  const promo = promos.promotionForCode('TEST-MENU', db()), items = [{ productId: 'classique-menu', quantity: 1, options: [{ price: 0 }] }];
  promos.assertPromotionCart(promo, items);
  promos.assertPromotionCart(promo, [{ productId: 'menu-solo-tenders', quantity: 1, options: [] }]);
  const naan = { productId: 'naan-poulet', quantity: 1, options: [{ groupId: 'naan-format', id: 'menu', price: 3 }] };
  promos.assertPromotionCart(promo, [naan]);
  assert.throws(() => promos.assertPromotionCart(promo, [{ ...naan, options: [{ groupId: 'naan-format', id: 'solo', price: 0 }] }]), { statusCode: 400 });
  assert.throws(() => promos.assertPromotionCart(promo, [{ ...naan, options: [...naan.options, { groupId: 'extras', id: 'cheddar', price: 1 }] }]), { statusCode: 400 });
  promos.assertPromotionMethod(promo, 'pickup');
  assert.throws(() => promos.assertPromotionMethod(promo, 'delivery'), { statusCode: 400 });
  for (const wrong of [[], [{ productId: 'classique', quantity: 1 }], [{ ...items[0], quantity: 2 }], [...items, { productId: 'drink-coca', quantity: 1 }], [{ ...items[0], options: [{ price: 1 }] }]]) assert.throws(() => promos.assertPromotionCart(promo, wrong), { statusCode: 400 });
});
test('personal menu gift: existing published client preview works without native changes', () => {
  const promo = promos.promotionForCode('TEST-MENU', db()), items = [{ productId: 'classique-menu', quantity: 1 }];
  const base = { subtotal: 16.9, discount: 1.69, discountRate: .1, deliveryFee: 0, total: 15.21 };
  assert.equal(previewPromotion(base, base.subtotal, promo, 'pickup').total, 0);
  assert.equal(promos.applyPromotion(base, promo, 'pickup', items).total, 0);
});
test('personal menu gift: zero-value settlement, persistent one-use enforcement even after cancellation', () => {
  const database = db(), promo = promos.promotionForCode('TEST-MENU', database);
  const order = { customerId: 'fictional-recipient', promotion: promo, method: 'pickup', items: [{ productId: 'classique-menu', quantity: 1 }], subtotal: 16.9, discount: 16.9, discountRate: 1, deliveryFee: 0, total: 0, status: 'awaiting_payment' };
  database.orders.push(order);
  assert.equal(promos.settlePromotionalOrder(order, new Date(), database), true);
  assert.equal(order.payment.provider, 'promotion'); assert.equal(order.payment.amount, 0);
  assert.equal(promos.settlePromotionalOrder(order, new Date(), database), false);
  assert.throws(() => promos.assertPromotionAvailable(database, promo, order.customerId), { statusCode: 409 });
  order.status = 'cancelled';
  assert.throws(() => promos.assertPromotionAvailable(database, promo, order.customerId), { statusCode: 409 });
  assert.equal(gifts.readiness(database).available, 0);
});
