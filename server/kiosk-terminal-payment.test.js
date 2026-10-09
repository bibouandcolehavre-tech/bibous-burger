const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareTerminalIntent, applyVerifiedTerminalTransaction } = require('./kiosk-terminal-payment');
function fixture() {
  const order = { status: 'awaiting_payment', total: 9.90 };
  const payment = prepareTerminalIntent(order, 'TEST_MERCHANT');
  const tx = { id: 'fictional-id', foreign_transaction_id: payment.foreignTransactionId,
    merchant_code: 'TEST_MERCHANT', amount: 9.90, currency: 'EUR', payment_type: 'POS', status: 'SUCCESSFUL' };
  return { order, tx };
}
test('interruption reuses the same intent; hosted payment cannot be mixed', () => {
  const { order } = fixture();
  assert.equal(prepareTerminalIntent(order, 'TEST_MERCHANT'), order.payment);
  assert.throws(() => prepareTerminalIntent(order, 'OTHER_MERCHANT'));
  assert.throws(() => prepareTerminalIntent({ ...order, total: 20 }, 'TEST_MERCHANT'));
  assert.throws(() => prepareTerminalIntent({ status: 'awaiting_payment', total: 0.50 }, 'TEST_MERCHANT'));
  assert.throws(() => prepareTerminalIntent({ status: 'awaiting_payment', total: 10, payment: { checkoutId: 'hosted' } }, 'TEST_MERCHANT'));
});
test('only matching merchant POS transaction can confirm payment', () => {
  for (const change of [{ amount: 10 }, { currency: 'USD' }, { merchant_code: 'OTHER' },
    { foreign_transaction_id: 'OTHER' }, { payment_type: 'CASH' }, { status: 'UNKNOWN' }, { id: '' }]) {
    const { order, tx } = fixture();
    assert.throws(() => applyVerifiedTerminalTransaction(order, { ...tx, ...change }, 'TEST_MERCHANT'));
    assert.equal(order.payment.status, 'PENDING');
  }
  const { order, tx } = fixture();
  assert.equal(applyVerifiedTerminalTransaction(order, tx, 'TEST_MERCHANT').status, 'PAID');
});
test('replay is idempotent, another transaction is rejected, refund stays reversed', () => {
  const { order, tx } = fixture();
  applyVerifiedTerminalTransaction(order, tx, 'TEST_MERCHANT');
  const paidAt = order.payment.paidAt;
  applyVerifiedTerminalTransaction(order, tx, 'TEST_MERCHANT');
  assert.equal(order.payment.paidAt, paidAt);
  assert.throws(() => applyVerifiedTerminalTransaction(order, { ...tx, id: 'another' }, 'TEST_MERCHANT'));
  applyVerifiedTerminalTransaction(order, { ...tx, status: 'REFUNDED' }, 'TEST_MERCHANT');
  applyVerifiedTerminalTransaction(order, tx, 'TEST_MERCHANT');
  assert.equal(order.payment.status, 'REFUNDED');
});
test('chargeback and refund events never confirm a fresh order', () => {
  for (const change of [{ simple_status: 'CHARGEBACK' }, { events: [{ type: 'REFUND', status: 'REFUNDED' }] }]) {
    const { order, tx } = fixture();
    assert.equal(applyVerifiedTerminalTransaction(order, { ...tx, ...change }, 'TEST_MERCHANT').status, 'REFUNDED');
  }
});
