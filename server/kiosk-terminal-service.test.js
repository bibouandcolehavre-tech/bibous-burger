const test = require('node:test');
const assert = require('node:assert/strict');
const { terminalDeviceSecret, authorizeTerminal, claimTerminalLaunch, verifyTerminalOrder } = require('./kiosk-terminal-service');
test('device credential is stable and separate from customer credentials, with explicit rotation', () => {
  const env = { SESSION_SECRET: 'fictional-customer-session-secret-with-enough-entropy' };
  const credential = terminalDeviceSecret(env);
  assert.equal(credential.length, 43);
  assert.equal(terminalDeviceSecret(env), credential);
  assert.notEqual(credential, env.SESSION_SECRET);
  assert.notEqual(terminalDeviceSecret({ SESSION_SECRET: env.SESSION_SECRET + '-rotated' }), credential);
  assert.equal(terminalDeviceSecret({}), null);
  assert.equal(terminalDeviceSecret({ SESSION_SECRET: 'short' }), null);
  assert.equal(terminalDeviceSecret({ ...env, KIOSK_TERMINAL_DEVICE_SECRET: '' }), null);
  const override = 'fictional-explicit-device-secret-with-enough-entropy';
  assert.equal(terminalDeviceSecret({ ...env, KIOSK_TERMINAL_DEVICE_SECRET: override }), override);
});
test('terminal access disabled by default and requires its own credential', () => {
  const deviceSecret = 'fictional-device-secret-32-characters';
  const request = { headers: { 'x-bibou-kiosk-token': deviceSecret } };
  assert.equal(authorizeTerminal(request, { deviceSecret }), false);
  assert.equal(authorizeTerminal({ headers: {} }, { enabled: true, deviceSecret }), false);
  assert.equal(authorizeTerminal(request, { enabled: true, deviceSecret }), true);
});
test('one launch is durably claimed; subsequent preparation only reconciles', async () => {
  const order = { status: 'awaiting_payment', total: 10 };
  let snapshots = [];
  const options = { merchantCode: 'FAKE', persist: async () => snapshots.push(JSON.parse(JSON.stringify(order))) };
  const first = await claimTerminalLaunch(order, options);
  assert.equal(first.canLaunch, true);
  assert.ok(snapshots[0].payment.launchClaimedAt);
  assert.equal((await claimTerminalLaunch(order, options)).canLaunch, false);
  const restored = snapshots[0];
  assert.equal((await claimTerminalLaunch(restored, options)).canLaunch, false);
});
test('only authoritative success triggers order finalization once', async () => {
  const order = { status: 'awaiting_payment', total: 10 };
  await claimTerminalLaunch(order, { merchantCode: 'FAKE', persist: async () => {} });
  let finalizations = 0;
  const options = { apiKey: 'fake', merchantCode: 'FAKE', persist: async () => {},
    finalize: async () => { finalizations++; order.status = 'pending'; },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: 'fictional',
      merchant_code: 'FAKE', foreign_transaction_id: order.payment.foreignTransactionId,
      amount: 10, currency: 'EUR', payment_type: 'POS', status: 'SUCCESSFUL' }) }) };
  await verifyTerminalOrder(order, options);
  await verifyTerminalOrder(order, options);
  assert.equal(finalizations, 1);
});
test('only a verified refusal permits a new reference; an uncertain payment never does', async () => {
  const order = { status: 'awaiting_payment', createdAt: new Date().toISOString(), total: 10 };
  const persist = async () => {}, merchantCode = 'FAKE';
  const first = await claimTerminalLaunch(order, { merchantCode, persist });
  await verifyTerminalOrder(order, { merchantCode, persist, apiKey: 'fake', finalize: () => assert.fail(), fetchImpl: async () => ({ status: 404 }) });
  assert.equal((await claimTerminalLaunch(order, { merchantCode, persist })).canLaunch, false);
  await verifyTerminalOrder(order, { merchantCode, persist, apiKey: 'fake', finalize: () => assert.fail(), fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ id: 'fictional-refused', merchant_code: merchantCode, foreign_transaction_id: first.foreignTransactionId, amount: 10, currency: 'EUR', payment_type: 'POS', status: 'FAILED' }) }) });
  const retry = await claimTerminalLaunch(order, { merchantCode, persist });
  assert.equal(retry.canLaunch, true); assert.notEqual(retry.foreignTransactionId, first.foreignTransactionId);
  assert.equal(order.terminalPaymentHistory.length, 1);
});
test('a verified payment enters the normal ticket queue exactly once', async () => {
  const autoPrint = require('./auto-print'), now = new Date();
  const order = { id: 'fictional-ticket', status: 'awaiting_payment', total: 10, createdAt: now.toISOString(), items: [{ name: 'Burger fictif', quantity: 1 }] }, database = { orders: [order] };
  await claimTerminalLaunch(order, { merchantCode: 'FAKE', persist: async () => {} });
  const options = { merchantCode: 'FAKE', persist: async () => {}, apiKey: 'fake', finalize: () => { order.status = 'confirmed'; }, fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ id: 'fictional-paid', merchant_code: 'FAKE', foreign_transaction_id: order.payment.foreignTransactionId, amount: 10, currency: 'EUR', payment_type: 'POS', status: 'SUCCESSFUL' }) }) };
  await verifyTerminalOrder(order, options); await verifyTerminalOrder(order, options);
  const job = autoPrint.claim(database, now.toISOString()); assert.equal(job.order.id, order.id);
  assert.equal(autoPrint.claim(database, now.toISOString()), null);
});
