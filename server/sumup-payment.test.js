const test = require('node:test');
const assert = require('node:assert/strict');
const { applyVerifiedCheckout, assertOrderTransition } = require('./sumup-payment');
const { createDatabaseLock } = require('./database-lock');
const { grantLoyaltyForOrder } = require('./loyalty');

const record = () => ({ total: 16.9, payment: { checkoutId: 'checkout-1', checkoutReference: 'reference-1', status: 'PENDING' } });
const checkout = () => ({ id: 'checkout-1', checkout_reference: 'reference-1', amount: 16.9, currency: 'EUR', merchant_code: 'TEST', status: 'PAID', hosted_checkout_url: 'https://checkout.sumup.com/pay/test' });

test('valide le paiement seulement si identifiant, référence, montant, devise et commerçant correspondent', () => {
  for (const mismatch of [{ id: 'other' }, { checkout_reference: 'other' }, { amount: 0.01 }, { amount: '16.9' }, { currency: 'USD' }, { merchant_code: 'OTHER' }, { status: 'unknown' }]) {
    const order = record();
    assert.throws(() => applyVerifiedCheckout(order, { ...checkout(), ...mismatch }, 'TEST'), /correspondent/);
    assert.equal(order.payment.status, 'PENDING');
  }
  const order = record();
  applyVerifiedCheckout(order, checkout(), 'TEST');
  assert.equal(order.payment.status, 'PAID');
});

test('une observation tardive ne rétrograde pas un paiement et conserve sa date initiale', () => {
  const order = record();
  applyVerifiedCheckout(order, checkout(), 'TEST', new Date('2026-09-18T12:00Z'));
  applyVerifiedCheckout(order, { ...checkout(), status: 'PENDING' }, 'TEST', new Date('2026-09-18T12:01Z'));
  assert.equal(order.payment.status, 'PAID');
  assert.equal(order.payment.paidAt, '2026-09-18T12:00:00.000Z');
});

test('récupère une intention sans identifiant mais refuse une URL de paiement étrangère', () => {
  const order = record(); delete order.payment.checkoutId;
  applyVerifiedCheckout(order, { ...checkout(), hosted_checkout_url: 'https://example.com/pay' }, 'TEST');
  assert.equal(order.payment.checkoutId, 'checkout-1');
  assert.equal(order.payment.checkoutUrl, undefined);
});

test('une commande annulée ne peut pas être réactivée ni gagner des points', () => {
  const order = { status: 'cancelled', loyaltyBasePoints: 10 };
  assert.throws(() => assertOrderTransition(order, 'preparing'), /réactivée/);
  assert.doesNotThrow(() => assertOrderTransition(order, 'cancelled'));
  const customer = { points: 25 };
  assert.equal(grantLoyaltyForOrder(customer, order).pointsAdded, 0);
  assert.equal(customer.points, 25);
});

test('une seconde confirmation n’annonce pas de nouveaux points', () => {
  const customer = { points: 0 };
  const order = { loyaltyBasePoints: 10 };
  assert.equal(grantLoyaltyForOrder(customer, order).pointsAdded, 10);
  assert.equal(grantLoyaltyForOrder(customer, order).pointsAdded, 0);
  assert.equal(customer.points, 10);
});

test('le verrou sérialise les lectures/écritures et se libère aussi après erreur', async () => {
  const acquire = createDatabaseLock();
  let count = 0;
  await Promise.all(Array.from({ length: 25 }, async (_, index) => {
    const release = await acquire();
    try {
      const before = count;
      await Promise.resolve();
      if (index === 10) throw new Error('failure');
      count = before + 1;
    } catch {} finally { release(); }
  }));
  assert.equal(count, 24);
});
