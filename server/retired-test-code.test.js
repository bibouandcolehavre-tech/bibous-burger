const test = require('node:test'), assert = require('node:assert/strict');
const { promotionForCode, settlePromotionalOrder } = require('./promo-codes');
const { defaultWheel, customerWheelState } = require('./wheel');
const { createReviewSandbox } = require('./review-sandbox');
const crypto = require('node:crypto');

test('CHORUS retiré : refus normalisé, y compris si une ancienne offre porte ce code', () => {
  const db = { merchantPromotions: [{ id: 'stale-test-offer', code: 'CHORUS', enabled: true, type: 'percent_order', percent: 100 }] };
  for (const code of ['CHORUS', 'chorus', '  Chorus  ']) {
    assert.throws(() => promotionForCode(code), { statusCode: 400 });
    assert.throws(() => promotionForCode(code, db), { statusCode: 400 });
  }
  const oldPaid = { id: 'past-fictional-order', status: 'confirmed', promotion: { code: 'CHORUS', discountPercent: 100, freeDelivery: true },
    subtotal: 20, discount: 20, discountRate: 1, deliveryFee: 0, total: 0, payment: { provider: 'promotion', status: 'PAID', amount: 0 } };
  const before = structuredClone(oldPaid);
  assert.equal(settlePromotionalOrder(oldPaid), false); assert.deepEqual(oldPaid, before, 'Never cancel or rewrite a historical settled order');
  const pending = { ...oldPaid, status: 'awaiting_payment', payment: undefined };
  assert.throws(() => settlePromotionalOrder(pending), { statusCode: 400 });
  assert.equal(pending.payment, undefined, 'A stale unsettled order must not become free');
});

test('règles publiques : retrait de la mention de test, même dans un ancien règlement sauvegardé', () => {
  const now = new Date('2026-10-15T08:00:00Z');
  const oldRule = 'Exception pour les commandes intégralement offertes avec le code de test CHORUS : 2 tours de test au maximum par compte, sur deux commandes distinctes, sans achat payé.';
  const allowed = 'Un tour par tranche complète de 15 € de produits payés. Chaque tour a 50 % de chances de ne rien gagner.';
  const db = { customers: [{ id: 'fictitious' }], orders: [], wheel: { ...defaultWheel(), officialRules: allowed + ' ' + oldRule },
    referralContest: { status: 'published', wheelPointsInRanking: true } };
  const before = structuredClone(db), state = customerWheelState(db, 'fictitious', now);
  assert.doesNotMatch(defaultWheel().officialRules, /chorus|code de test/i);
  assert.doesNotMatch(state.rules, /chorus|code de test|deux commandes distinctes/i);
  assert.match(state.rules, /tranche complète de 15/); assert.match(state.rules, /50 %/);
  assert.match(state.rules, /chaque point réellement gagné à la roue/);
  assert.deepEqual(db, before, 'Display filtering must not rewrite historical rules, odds, gains or contest settings');
});

test('démonstration boutiques : paiement fictif toujours possible sans le code retiré', async () => {
  const access = 'fictitious-private-review-for-retirement-tests', now = new Date('2026-10-15T08:00:00Z');
  const sandbox = createReviewSandbox({ accessHash: crypto.createHash('sha256').update(access).digest('hex'), now: () => now.getTime() });
  const request = (route, token, body) => sandbox.handle({ route, method: body === undefined ? 'GET' : 'POST', token, readBody: async () => body });
  const { token, customer } = await request('/session', '', { accessCode: access });
  await assert.rejects(request('/promotions/validate', token, { code: 'CHORUS' }), { statusCode: 400 });
  const { order } = await request('/orders', token, { customerId: customer.id, method: 'pickup', serviceDate: '2026-10-16', slot: '19:00',
    requestId: 'retired-code-fictitious-0001', items: [{ productId: 'frites-maison', quantity: 1, selections: [] }] });
  const result = await request('/payments/sumup-checkout', token, { orderId: order.id });
  assert.equal(result.reviewMode, true); assert.equal(result.order.payment.provider, 'isolated-review-simulation');
  assert.equal(result.order.payment.status, 'PAID'); assert.equal(result.checkoutUrl, undefined);
});
