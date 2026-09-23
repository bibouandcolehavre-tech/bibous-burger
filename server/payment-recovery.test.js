const test = require('node:test');
const assert = require('node:assert/strict');
const { createAttempt, parseAttempt, paymentState, safeCheckoutUrl, openCheckoutUrl } = require('../payment-recovery');
const { validateRequestId, orderFingerprint } = require('./order-attempt');

test('journal de reprise : compte, format et durée strictement contrôlés', () => {
  const now = Date.now();
  const input = { customerId: 'alice', items: [{ productId: 'classique' }] };
  const attempt = createAttempt('alice', 'order', input, now);
  const encoded = JSON.stringify(attempt);
  assert.deepEqual(parseAttempt(encoded, 'alice', now), attempt);
  assert.equal(parseAttempt(encoded, 'bob', now), null);
  assert.equal(parseAttempt(encoded, 'alice', now + 8 * 86400000), null);
  assert.equal(parseAttempt('{', 'alice'), null);
  assert.equal(parseAttempt(JSON.stringify({ ...attempt, requestId: '../escape' }), 'alice'), null);
  assert.equal(parseAttempt(JSON.stringify({ ...attempt, input: { ...input, customerId: 'bob' } }), 'alice'), null);
  assert.equal(validateRequestId(attempt.requestId), attempt.requestId);
  assert.equal(validateRequestId(undefined), null);
  assert.throws(() => validateRequestId('short'), { statusCode: 400 });
});

test('une modification du commentaire distingue les tentatives de commande', () => {
  const input = { customerId: 'alice', method: 'pickup', serviceDate: '2026-09-23', slot: '19:00', items: [] };
  assert.equal(orderFingerprint(input), orderFingerprint({ ...input, comment: '   ' }));
  assert.equal(orderFingerprint({ ...input, comment: 'Sans oignons' }), orderFingerprint({ ...input, comment: '  Sans oignons  ' }));
  assert.notEqual(orderFingerprint(input), orderFingerprint({ ...input, comment: 'Sans oignons' }));
});

test('une expiration locale ne vaut pas refus bancaire et une annulation reste prioritaire', () => {
  const old = new Date(Date.now() - 3600000).toISOString();
  assert.equal(paymentState({ createdAt: old }, 'order'), 'expired');
  assert.equal(paymentState({ createdAt: old, payment: { checkoutReference: 'ref', status: 'PENDING' } }, 'order'), 'pending');
  assert.equal(paymentState({ status: 'cancelled', payment: { status: 'PAID' } }, 'order'), 'cancelled');
  assert.equal(paymentState({ payment: { status: 'PAID' } }, 'order'), 'paid');
  assert.equal(paymentState({ activatedAt: old }, 'bibou-plus'), 'paid');
  assert.equal(paymentState({ payment: { status: 'EXPIRED' } }, 'order'), 'expired');
  assert.equal(paymentState({ payment: { status: 'FAILED' } }, 'order'), 'failed');
  assert.equal(paymentState(null, 'order'), 'not-created');
});

test('reprise : seuls les liens HTTPS SumUp sont ouverts', () => {
  assert.equal(safeCheckoutUrl('https://checkout.sumup.com/pay/test'), true);
  for (const value of ['http://checkout.sumup.com/pay/test', 'https://sumup.com.evil.test/pay', 'javascript:alert(1)', 'https://user:pass@checkout.sumup.com/pay', null]) assert.equal(safeCheckoutUrl(value), false);
});

test('le paiement utilise la même page sur le web pour éviter le blocage des fenêtres', async () => {
  const assigned = [];
  const opened = [];
  await openCheckoutUrl('https://checkout.sumup.com/pay/web', { location: { assign: value => assigned.push(value) } }, { openURL: async value => opened.push(value) });
  assert.deepEqual(assigned, ['https://checkout.sumup.com/pay/web']);
  assert.deepEqual(opened, []);
  await openCheckoutUrl('https://checkout.sumup.com/pay/native', null, { openURL: async value => opened.push(value) });
  assert.deepEqual(opened, ['https://checkout.sumup.com/pay/native']);
  await assert.rejects(openCheckoutUrl('https://example.com/fake', { location: { assign() {} } }, { openURL() {} }), /lien sécurisé/);
});

test('empreinte de commande stable, sans confiance dans le prix transmis', () => {
  const input = { customerId: 'alice', method: 'pickup', serviceDate: '2026-09-20', slot: '19:00 – 19:30', items: [{ productId: 'classique', quantity: 1, selections: [] }] };
  assert.equal(orderFingerprint(input), orderFingerprint({ total: 0.01, ...input, requestId: 'irrelevant' }));
  assert.notEqual(orderFingerprint(input), orderFingerprint({ ...input, method: 'delivery' }));
  assert.notEqual(orderFingerprint(input), orderFingerprint({ ...input, items: [{ productId: 'classique', quantity: 2, selections: [] }] }));
});
