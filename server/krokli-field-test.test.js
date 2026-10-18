'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createFieldTest, USERNAME, DRIVER_PREFIX, CUSTOMER_PREFIX, SESSION_MS, STOPS } = require('./krokli-field-test');
const code = 'essai-' + 'x'.repeat(32);
const start = Date.parse('2026-10-18T18:00:00Z');
function make(t, options = {}) {
  let now = start;
  const s = createFieldTest({ enabled: true, accessHash: crypto.createHash('sha256').update(code).digest('hex'), expiresAt: new Date(start + 48 * 3600000).toISOString(), clock: () => now, ...options });
  t.after(s.close);
  const driver = () => s.loginDriver({ username: USERNAME, password: code });
  const customer = () => s.loginCustomer({ accessCode: code });
  const d = (token, route = 'state', input) => s.handleDriver(token, '/api/krokly-driver/' + route, input === undefined ? 'GET' : 'POST', input);
  const c = (token, route = '/customer/orders', input) => s.handleCustomer(token, route, input === undefined ? 'GET' : 'POST', async () => input);
  return { s, driver, customer, d, c, tick: ms => { now += ms; }, now: () => now };
}
const rejects = (fn, status) => assert.rejects(fn, e => e.statusCode === status);

test('field access disabled by default; unknown, expired, role-crossed tokens fail closed', async t => {
  for (const options of [{ enabled: false }, { accessHash: '' }, { expiresAt: 'invalid' }, { expiresAt: new Date(start - 1).toISOString() }]) {
    const h = make(t, options); assert.throws(h.driver, { statusCode: 401 });
  }
  const h = make(t), d = h.driver(), c = h.customer();
  assert.match(d.token, /^krokli-field\./); assert.match(c.token, /^review\.field\./);
  await rejects(() => h.d(c.token), 401); await rejects(() => h.c(d.token), 401);
  await rejects(() => h.d(DRIVER_PREFIX + 'forged'), 401);
  await rejects(() => h.c(CUSTOMER_PREFIX + 'forged'), 401);
  h.tick(SESSION_MS + 1); await rejects(() => h.d(d.token), 401); await rejects(() => h.c(c.token), 401);
});

test('two apps share exactly three fake orders; reconnect never resets an active exercise', async t => {
  const h = make(t), d = h.driver(), c = h.customer();
  const before = await h.c(c.token); assert.equal(before.orders.length, 3);
  assert.deepEqual(before.orders.map(o => o.fieldLabel), ['A', 'B', 'C']);
  for (const o of before.orders) {
    assert.equal(o.reviewMode, true); assert.equal(o.testMode, true); assert.equal(o.total, 0);
    assert.equal(o.customerPhone, ''); assert.equal(o.payment.provider, 'isolated-field-simulation');
    assert.equal(o.kroklyDriver.completedFinancials, undefined);
  }
  const first = (await h.d(d.token)).orders[0]; assert.equal(first.id, before.orders[0].id);
  assert.equal(first.courierPay, 0); assert.equal(first.deliveryAddress, undefined);
  await rejects(() => h.d(d.token, `orders/${before.orders[1].id}/accept`, {}), 409);
  await h.d(d.token, `orders/${first.id}/accept`, {});
  const d2 = h.driver(), c2 = h.customer();
  assert.equal((await h.d(d2.token)).orders[0].status, 'accepted');
  assert.equal((await h.c(c2.token)).orders[0].kroklyDriver.status, 'accepted');
  assert.equal((await h.c(c2.token)).orders[0].deliveryAddress.address, STOPS[0].address);
});

test('tracking uses exact fresh consented phone GPS only for the current picked-up course', async t => {
  const h = make(t), d = h.driver(), c = h.customer(), orders = (await h.c(c.token)).orders;
  const tracking = order => h.c(c.token, `/customer/orders/${order.id}/delivery-tracking`);
  assert.equal((await tracking(orders[0])).position, null);
  const gps = await h.d(d.token, 'gps/start', { consentVersion: 'bibou-native-gps-customer-v3', customerTracking: true });
  const pos = { latitude: 49.491, longitude: .119, accuracy: 8, timestamp: h.now() };
  await h.d(d.token, 'gps/position', { sessionId: gps.sessionId, position: pos });
  assert.equal((await tracking(orders[0])).position, null, 'no GPS before pickup');
  for (const action of ['accept', 'pickup']) await h.d(d.token, `orders/${orders[0].id}/${action}`, {});
  const received = await tracking(orders[0]);
  assert.equal(received.position.latitude, pos.latitude); assert.equal(received.position.longitude, pos.longitude);
  assert.equal(received.position.validForMs, 30000); assert.equal(received.reviewMode, undefined, 'never label real GPS as illustrated movement');
  assert.equal((await tracking(orders[1])).position, null);
  h.tick(30000); assert.equal((await tracking(orders[0])).position, null);
  await h.d(d.token, 'gps/position', { sessionId: gps.sessionId, position: { ...pos, longitude: .120, timestamp: h.now() } });
  assert.equal((await tracking(orders[0])).position.longitude, .120);
  await h.d(d.token, `orders/${orders[0].id}/deliver`, {});
  assert.equal((await tracking(orders[0])).position, null, 'delivery ends this customer’s GPS');
  assert.equal((await h.d(d.token)).orders[0].id, orders[1].id);
});

test('legacy GPS never shares with customer, rejected fixes and offline clear sharing', async t => {
  const h = make(t), d = h.driver(), c = h.customer(), order = (await h.c(c.token)).orders[0];
  for (const action of ['accept', 'pickup']) await h.d(d.token, `orders/${order.id}/${action}`, {});
  const gps = await h.d(d.token, 'gps/start', { consentVersion: 'bibou-native-gps-until-stop-v2' });
  const pos = { latitude: 49.49, longitude: .12, accuracy: 10, timestamp: h.now() };
  await h.d(d.token, 'gps/position', { sessionId: gps.sessionId, position: pos });
  const route = `/customer/orders/${order.id}/delivery-tracking`;
  assert.equal((await h.c(c.token, route)).position, null);
  const current = await h.d(d.token, 'gps/start', { consentVersion: 'bibou-native-gps-customer-v3', customerTracking: true });
  await rejects(() => h.d(d.token, 'gps/position', { sessionId: current.sessionId, position: { ...pos, mocked: true } }), 400);
  await h.d(d.token, 'gps/position', { sessionId: current.sessionId, position: pos });
  await h.d(d.token, 'gps/stop', { sessionId: gps.sessionId });
  assert.ok((await h.c(c.token, route)).position, 'old stop cannot close newer GPS');
  const revision = (await h.d(d.token)).availability.revision;
  await h.d(d.token, 'availability', { available: true, revision });
  await h.d(d.token, 'availability', { available: false });
  assert.equal((await h.c(c.token, route)).position, null);
});

test('rating and tips are simulated, idempotent, unavailable before completion; no financial routes', async t => {
  const h = make(t), d = h.driver(), c = h.customer(), order = (await h.c(c.token)).orders[0];
  const route = `/customer/orders/${order.id}`, tip = { amountCents: 200, requestId: crypto.randomUUID() };
  await rejects(() => h.c(c.token, route + '/tip', tip), 409);
  for (const action of ['accept', 'pickup', 'deliver']) await h.d(d.token, `orders/${order.id}/${action}`, {});
  const rating = await h.c(c.token, route + '/delivery-feedback', { stars: 5, comment: 'TEST uniquement' });
  assert.equal(rating.eligible, true); assert.equal(rating.feedback.stars, 5);
  const paid = await h.c(c.token, route + '/tip', tip), replay = await h.c(c.token, route + '/tip', tip);
  assert.equal(paid.id, replay.id); assert.equal(paid.status, 'PAID'); assert.equal(paid.simulated, true); assert.equal(paid.checkoutUrl, null);
  await rejects(() => h.c(c.token, '/payments/sumup-checkout', { orderId: order.id }), 403);
  await rejects(() => h.d(d.token, 'payment-requests', { confirm: true }), 403);
  await rejects(() => h.d(d.token, 'bank', { iban: 'anything' }), 403);
  await rejects(() => h.d(d.token, 'native-push/register', {}), 403);
  await rejects(() => h.c(c.token, '/customer/orders/real-order/tip', tip), 404);
  await rejects(() => h.d(d.token, 'orders/real-order/accept', {}), 409);
});

test('explicit stop revokes both roles and GPS; fixed invitation expiry is enforced', async t => {
  const h = make(t), d = h.driver(), c = h.customer();
  assert.equal((await h.c(c.token, '/field/stop', {})).stopped, true);
  await rejects(() => h.d(d.token), 401); await rejects(() => h.c(c.token), 401);
  h.tick(48 * 3600000 + 1); assert.throws(h.driver, { statusCode: 401 });
});
