const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareTerminalIntent } = require('./kiosk-terminal-payment');
const { reconcileTerminalPayment } = require('./kiosk-terminal-api');
test('reconciliation only queries the merchant API and verifies its response', async () => {
  const order = { status: 'awaiting_payment', total: 9.9 };
  prepareTerminalIntent(order, 'FAKE_MERCHANT');
  const options = { apiKey: 'fictitious-test-key', merchantCode: 'FAKE_MERCHANT', fetchImpl: async (url, init) => {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(new URL(url).origin, 'https://api.sumup.com');
    assert.equal(new URL(url).searchParams.get('foreign_transaction_id'), order.payment.foreignTransactionId);
    return { ok: true, status: 200, json: async () => ({ id: 'fake', merchant_code: 'FAKE_MERCHANT',
      foreign_transaction_id: order.payment.foreignTransactionId, amount: 9.9, currency: 'EUR', payment_type: 'POS', status: 'SUCCESSFUL' }) };
  } };
  assert.equal((await reconcileTerminalPayment(order, options)).status, 'PAID');
});
test('missing transaction, forbidden scope and network failure never authorize a retry', async () => {
  for (const fetchImpl of [async () => ({ status: 404 }), async () => ({ status: 403, ok: false }), async () => { throw new Error('network'); }]) {
    const order = { status: 'awaiting_payment', total: 10 };
    prepareTerminalIntent(order, 'FAKE_MERCHANT');
    try { await reconcileTerminalPayment(order, { apiKey: 'fake', merchantCode: 'FAKE_MERCHANT', fetchImpl }); } catch {}
    assert.equal(order.payment.status, 'PENDING');
    assert.equal(order.payment.canLaunch, undefined);
  }
});
