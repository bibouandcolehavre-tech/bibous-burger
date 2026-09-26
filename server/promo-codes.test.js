const test = require('node:test'), assert = require('node:assert/strict');
const { promotionForCode, applyPromotion, settlePromotionalOrder } = require('./promo-codes');
const { previewPromotion, differentPendingPromo } = require('../promo-client');
const { orderFingerprint } = require('./order-attempt');
const amendments = require('./order-amendments');
const { validateAndPriceOrderItems } = require('./catalog');

test('CHORUS : normalisation, panier entier et livraison offerts, codes inconnus refusés', () => {
  const promo = promotionForCode('  chorus  ');
  assert.equal(promo.code, 'CHORUS');
  for (const value of ['CHORUSS', 'NOPE', 100, {}, ['CHORUS'], 'x'.repeat(41)]) assert.throws(() => promotionForCode(value), { statusCode: 400 });
  assert.equal(promotionForCode(''), null);
  for (const fee of [0, 3.99, 4.99, 5.99]) {
    const base = { subtotal: 26.8, discount: 2.68, discountRate: .1, deliveryFee: fee, standardDeliveryFee: fee, total: 24.12 + fee };
    const pricing = applyPromotion(base, promo);
    assert.deepEqual(pricing, { ...base, discount: 26.8, discountRate: 1, deliveryFee: 0, total: 0 });
    assert.equal(previewPromotion(base, base.subtotal, promo).total, pricing.total);
    assert.equal(applyPromotion(base, null), base);
  }
});
test('promotion : règlement gratuit distinct de SumUp, cohérence et idempotence', () => {
  const order = { ...applyPromotion({ subtotal: 20, standardDeliveryFee: 5.99 }, promotionForCode('CHORUS')), promotion: promotionForCode('CHORUS'), status: 'awaiting_payment' };
  assert.equal(settlePromotionalOrder(order), true);
  assert.equal(order.payment.provider, 'promotion'); assert.equal(order.payment.amount, 0);
  assert.equal(settlePromotionalOrder(order), false);
  assert.equal(settlePromotionalOrder({ status: 'awaiting_payment', total: 0 }), false);
  assert.throws(() => settlePromotionalOrder({ ...order, payment: undefined, total: 1 }));
});
test('empreinte de tentative : code normalisé, anciens paniers inchangés, substitution refusée', () => {
  const cart = { customerId: 'c', items: [] };
  assert.equal(orderFingerprint(cart), orderFingerprint({ ...cart, promoCode: '' }));
  assert.equal(orderFingerprint({ ...cart, promoCode: ' chorus ' }), orderFingerprint({ ...cart, promoCode: 'CHORUS' }));
  assert.notEqual(orderFingerprint(cart), orderFingerprint({ ...cart, promoCode: 'CHORUS' }));
});
test('reprise client : ne jamais ouvrir un ancien paiement bancaire après confirmation gratuite', () => {
  const pending = { kind: 'order', input: {} };
  assert.equal(differentPendingPromo(pending, 'order', { promoCode: 'CHORUS' }), true);
  assert.equal(differentPendingPromo({ ...pending, input: { promoCode: 'CHORUS' } }, 'order', {}), true);
  assert.equal(differentPendingPromo({ ...pending, input: { promoCode: ' chorus ' } }, 'order', { promoCode: 'CHORUS' }), false);
  assert.equal(differentPendingPromo(pending, 'order', {}), false);
  assert.equal(differentPendingPromo(null, 'order', { promoCode: 'CHORUS' }), false);
  assert.equal(differentPendingPromo({ kind: 'bibouPlus', input: {} }, 'order', { promoCode: 'CHORUS' }), true);
});
test('modification et annulation d’une livraison offerte : aucun prix ni remboursement inventé', () => {
  const now = Date.parse('2026-09-26T10:00:00Z'), promo = promotionForCode('CHORUS');
  const cart = validateAndPriceOrderItems([{ productId: 'drink-coca', quantity: 2, selections: [] }]);
  const order = { ...applyPromotion({ subtotal: cart.subtotal, standardDeliveryFee: 5.99 }, promo), items: cart.items, promotion: promo, customerId: 'c', status: 'confirmed', payment: { status: 'PAID', provider: 'promotion', amount: 0 }, method: 'delivery', serviceDate: '2026-09-26', slot: '19:00 – 19:30' };
  const input = { revision: 0, reason: 'Remplacement', items: [{ productId: 'drink-perrier', quantity: 1, selections: [] }] };
  const result = amendments.preview(order, input, {}, now);
  assert.equal(result.proposal.total, 0); assert.equal(result.proposal.refundAmount, 0);
  amendments.propose(order, { ...input, previewFingerprint: result.fingerprint }, {}, now);
  amendments.decide(order, { revision: 1, decision: 'accept' }, {}, now);
  amendments.cancel(order, 'cancelled', now); assert.equal(order.refund, undefined); assert.equal(order.total, 0);
});
