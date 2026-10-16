'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createReviewSandbox, USERNAME, PREFIX, SESSION_MS } = require('./krokli-review-sandbox');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const password = 'private-test-fixture-only';
function setup(t, options = {}) {
  const sandbox = createReviewSandbox({ passwordHash: hash(password), ...options });
  t.after(() => sandbox.close());
  const auth = sandbox.login({ username: USERNAME, password });
  const call = (path, method = 'GET', input, token = auth.token, query) => sandbox.handle(token, `/api/krokly-driver/${path}`, method, input, query);
  return { sandbox, auth, call };
}

test('review account is disabled without a verifier; reserved identity never falls through', t => {
  const s = createReviewSandbox(); t.after(() => s.close());
  assert.equal(s.isLogin({ username: ` ${USERNAME.toUpperCase()} ` }), true);
  assert.equal(s.isToken(`${PREFIX}forged`), true);
  assert.throws(() => s.login({ username: USERNAME, password }), { statusCode: 401 });
  assert.throws(() => s.login({ username: 'real-driver', password }), { statusCode: 401 });
});

test('review login, contacts, steps and independent sessions', async t => {
  const { sandbox, auth, call } = setup(t);
  const other = sandbox.login({ username: USERNAME, password });
  assert.notEqual(auth.token, other.token); assert.notEqual(auth.driver.id, other.driver.id);
  assert.equal(auth.driver.reviewMode, true);
  assert.throws(() => sandbox.login({ username: USERNAME, password: 'wrong' }), { statusCode: 401 });
  const state = (await call('state')).data, order = state.orders[0];
  assert.equal(state.reviewMode, true); assert.equal(order.customerPhone, undefined); assert.equal(order.deliveryAddress, undefined);
  await assert.rejects(call(`orders/${order.id}/accept`, 'POST', {}, other.token), { statusCode: 404 });
  const accepted = (await call(`orders/${order.id}/accept`, 'POST')).data.orders[0];
  assert.match(accepted.deliveryAddress.address, /Gare du Havre/); assert.equal(accepted.customerPhone, undefined);
  await assert.rejects(call(`orders/${order.id}/deliver`, 'POST'), { statusCode: 409 });
  await call(`orders/${order.id}/pickup`, 'POST');
  await call(`orders/${order.id}/deliver`, 'POST');
  assert.equal((await call('state')).data.orders.length, 0);
  assert.equal((await call('state', 'GET', {}, other.token)).data.orders.length, 1);
  await assert.rejects(call('state', 'GET', {}, `${PREFIX}forged`), { statusCode: 401 });
  await assert.rejects(call('unknown', 'POST'), { statusCode: 403 });
});

test('review statement, ratings, example RIB and requests remain sample-only', async t => {
  const { call } = setup(t);
  const info = (await call('account')).data;
  assert.equal(info.summary.completedCount, 2); assert.equal(info.summary.knownDriverPayCents, 798);
  assert.equal(info.summary.tipCents, 200); assert.equal(info.ratings.averageStars, 5);
  assert.equal(info.history.some(r => r.deliveryFeeCents === 0 && r.driverPayCents === 399), true);
  for (const key of ['customerPhone', 'deliveryAddress', 'orderTotal', 'total', 'customerName']) assert.equal(info.history.some(r => key in r), false);
  const pdf = await call('statement'); assert.equal(pdf.pdf.subarray(0, 5).toString(), '%PDF-'); assert.match(pdf.filename, /exemple/);
  await assert.rejects(call('bank', 'POST', { holder: 'Real person', iban: 'FR1420041010050500013M02606' }), { statusCode: 400 });
  const bank = (await call('bank', 'POST', { holder: 'Compte exemple', iban: 'FR1420041010050500013M02606', bic: '' })).data;
  assert.equal(bank.registered, true); assert.equal(bank.iban, undefined);
  const request = (await call('payment-requests', 'POST', { confirm: true })).data;
  assert.equal(request.amountCents, 998); assert.equal(request.status, 'pending');
  assert.equal((await call('settlements')).data.automaticTransfer, false);
  await assert.rejects(call('payment-requests', 'POST', { confirm: true }), { statusCode: 409 });
  await assert.rejects(call('account', 'GET', {}, undefined, new URLSearchParams('driverId=real')), { statusCode: 400 });
});

test('review GPS needs consent, availability revision and expires with login', async t => {
  let now = Date.now();
  const { call } = setup(t, { clock: () => now });
  await assert.rejects(call('gps/start', 'POST', {}), { statusCode: 400 });
  const gps = (await call('gps/start', 'POST', { consentVersion: 'bibou-native-gps-until-stop-v2' })).data;
  await call('gps/position', 'POST', { sessionId: gps.sessionId, position: { latitude: 49.49, longitude: .12, accuracy: 10, timestamp: now } });
  const avail = (await call('availability', 'POST', { available: true, revision: 0 })).data.availability;
  assert.equal(avail.available, true);
  await assert.rejects(call('availability', 'POST', { available: true, revision: 0 }), { statusCode: 409 });
  now += SESSION_MS + 1;
  await assert.rejects(call('state'), { statusCode: 401 });
});

test('review push registration is RAM-only and tokenless cleanup remains isolated after expiry', async t => {
  let now = Date.now();
  const { sandbox, call } = setup(t, { clock: () => now });
  const input = { installationId: crypto.randomUUID(), installationSecret: crypto.randomUUID(), projectId: require('./krokli-native-push').PROJECT_ID,
    platform: 'ios', informed: true, token: 'ExpoPushToken[review_fixture_only]' };
  const r = await call('native-push/register', 'POST', input); assert.equal(r.data.registered, true);
  assert.equal(sandbox.ownsCleanup(input), true);
  assert.throws(() => sandbox.cleanup({ ...input, installationSecret: crypto.randomUUID() }), { statusCode: 403 });
  now += SESSION_MS + 1;
  assert.equal(sandbox.ownsCleanup(input), true); assert.equal(sandbox.cleanup(input).removed, true); assert.equal(sandbox.cleanup(input).removed, true);
});
