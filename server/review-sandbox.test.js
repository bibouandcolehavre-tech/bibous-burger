const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createReviewSandbox } = require('./review-sandbox');
const { readCustomerSession } = require('./customer-session');
const { createCustomerFetch, reviewApiBase } = require('../review-client');
const code = 'fictional-review-access-code-only-for-tests';
const hash = crypto.createHash('sha256').update(code).digest('hex');
const instant = Date.parse('2026-09-28T08:00:00Z');
const make = options => createReviewSandbox({ accessHash: hash, now: () => instant, ...options });
const request = (sandbox, route, token = '', body, method = body === undefined ? 'GET' : 'POST') => sandbox.handle({ route, token, method, readBody: async () => body });
const login = sandbox => request(sandbox, '/session', '', { accessCode: code });
const orderInput = customerId => ({ customerId, requestId: 'test-order-attempt-0001', items: [{ productId: 'classique', quantity: 1, selections: [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'roquette' }, { groupId: 'sauces', id: 'mayo' }] }], method: 'pickup', serviceDate: '2026-09-29', slot: '12:00' });

test('review: private login, separate session stores, expiry and hard limits', async () => {
  const sandbox = make({ maxSessions: 2 });
  await assert.rejects(request(sandbox, '/session', '', { accessCode: '123456' }), { statusCode: 401 });
  const a = await login(sandbox), b = await login(sandbox);
  assert.notEqual(a.customer.id, b.customer.id);
  assert.equal(readCustomerSession(a.token, 'production-secret'), null);
  await assert.rejects(login(sandbox), { statusCode: 429 });
  a.customer.points = 90000;
  assert.equal((await request(sandbox, '/auth/me', a.token)).customer.points, 1500);
  await request(sandbox, `/customers/${a.customer.id}`, a.token, { id: 'real-id', points: 99999, name: 'Review A', phone: '+33799999999' }, 'PATCH');
  const saved = (await request(sandbox, '/auth/me', a.token)).customer;
  assert.equal(saved.points, 1500); assert.equal(saved.phone, '+33600000000'); assert.equal(saved.id, a.customer.id);
  assert.equal((await request(sandbox, '/auth/me', b.token)).customer.name, 'Équipe de validation');
  await assert.rejects(request(sandbox, `/customers/${a.customer.id}`, b.token, {}, 'PATCH'), { statusCode: 404 });
  let clock = instant;
  const expiring = make({ now: () => clock, ttlMs: 100 });
  const s = await login(expiring); clock += 101;
  await assert.rejects(request(expiring, '/auth/me', s.token), { statusCode: 401 });
  await assert.rejects(login(make({ enabled: false })), { statusCode: 404 });
});

test('review: real pricing, simulated checkout, idempotent loyalty and subscriptions', async () => {
  const sandbox = make(), { token, customer } = await login(sandbox);
  const input = orderInput(customer.id);
  const { order } = await request(sandbox, '/orders', token, input);
  assert.equal(order.total, Math.round(order.subtotal * .9 * 100) / 100);
  assert.equal(order.status, 'awaiting_payment');
  await assert.rejects(request(sandbox, '/orders', token, { ...input, customerId: 'real-client' }), { statusCode: 403 });
  await request(sandbox, '/orders', token, input);
  assert.equal((await request(sandbox, '/customer/orders', token)).orders.length, 1);
  const paid = await request(sandbox, '/payments/sumup-checkout', token, { orderId: order.id });
  assert.equal(paid.order.payment.status, 'PAID'); assert.equal(paid.checkoutUrl, undefined);
  const first = (await request(sandbox, '/auth/me', token)).customer;
  assert.equal(first.points, 1520); assert.equal(first.welcomeReward.status, 'used');
  await request(sandbox, '/payments/sumup-checkout', token, { orderId: order.id });
  assert.equal((await request(sandbox, '/auth/me', token)).customer.points, first.points);
  const plus = await request(sandbox, '/bibou-plus/checkout', token, { requestId: 'test-plus-attempt-0001' });
  const again = await request(sandbox, '/bibou-plus/checkout', token, { requestId: 'test-plus-attempt-0001' });
  assert.equal(plus.purchase.expiresAt, again.purchase.expiresAt);
  assert.equal(plus.checkoutUrl, undefined);
  const found = await request(sandbox, '/customer/payment-attempts/test-order-attempt-0001', token);
  assert.equal(found.record.id, order.id);
  await assert.rejects(request(sandbox, '/payments/sumup-checkout', token, { orderId: 'order-real' }), { statusCode: 404 });
});

test('review: reservations, reward codes, preferences and account deletion stay disposable', async () => {
  const sandbox = make(), { token } = await login(sandbox);
  const { reservation } = await request(sandbox, '/reservations', token, { name: 'Test Review', guests: 2, serviceDate: '2026-09-29', slot: '12:00' });
  assert.equal(reservation.status, 'confirmed'); assert.match(reservation.id, /^review-/);
  const { claim } = await request(sandbox, '/customer/rewards/fries/claim', token, {});
  assert.match(claim.code, /^TEST-.*NON-VALABLE$/);
  const crm = await request(sandbox, '/customer/crm', token, { birthday: '05-12', personalizedOffers: true }, 'PATCH');
  assert.equal(crm.preferences.birthday, '05-12');
  const push = await request(sandbox, '/customer/push', token, { marketing: true }, 'PATCH');
  assert.deepEqual(push.devices, []); assert.deepEqual(push.enabledPlatforms, []);
  await assert.rejects(request(sandbox, '/customer/push/devices', token, { token: 'real-device' }), { statusCode: 404 });
  await assert.rejects(request(sandbox, '/auth/sms/start', token, { phone: '+33600000000' }), { statusCode: 404 });
  await assert.rejects(request(sandbox, '/dashboard/orders', token), { statusCode: 404 });
  await request(sandbox, '/customer/account', token, undefined, 'DELETE');
  await assert.rejects(request(sandbox, '/auth/me', token), { statusCode: 401 });
  assert.equal((await login(sandbox)).customer.points, 1500);
});

test('review: login brute-force limit; client cannot forward a review token to another host', async () => {
  const sandbox = make();
  for (let i = 0; i < 30; i++) await assert.rejects(request(sandbox, '/session', '', { accessCode: 'wrong' }), { statusCode: 401 });
  await assert.rejects(login(sandbox), { statusCode: 429 });
  const calls = [], base = 'https://example.test/api';
  const transport = createCustomerFetch(base, (...args) => { calls.push(args); return 'ok'; });
  transport(`${base}/orders`, { headers: { Authorization: 'Bearer review.secret' } });
  assert.equal(calls[0][0], `${base}/review/orders`);
  transport(`${base}/orders`, { headers: { Authorization: 'Bearer v1.real' } });
  assert.equal(calls[1][0], `${base}/orders`);
  assert.equal(reviewApiBase(base, 'review.secret'), `${base}/review`);
  for (const url of ['https://attacker.test/api/orders', `${base}/../orders`, `${base}/%2e%2e/orders`]) assert.throws(() => transport(url, { headers: { Authorization: 'Bearer review.secret' } }));
  assert.equal(calls.length, 2);
});

test('review HTTP: denied before production database or any external provider is accessed', { timeout: 15000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-review-isolation-'));
  const dataFile = path.join(dir, 'data.json');
  const original = JSON.stringify({ customers: [{ id: 'real-customer', phone: '+33600000001' }], orders: [], nextCustomerId: 2, nextOrderNumber: 1 });
  await fs.writeFile(dataFile, original);
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: dataFile, SESSION_SECRET: 'test-secret' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { child.stdout.on('data', value => { const m = String(value).match(/http:\/\/localhost:\d+/); if (m) resolve(m[0] + '/api'); }); child.on('error', reject); child.on('exit', code => reject(Error('Server exited: ' + code))); });
  for (const route of ['/auth/me', '/customer/orders', '/dashboard/orders', '/delivery-quote', '/payments/sumup-checkout', '/reservations', '/auth/sms/start']) {
    const res = await fetch(base + route, { method: 'POST', headers: { Authorization: 'Bearer review.forged', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401, route);
  }
  const invalid = await fetch(base + '/review/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"accessCode":"wrong"}' });
  assert.equal(invalid.status, 401);
  assert.equal((await fetch(base + '/review/dashboard/orders')).status, 401);
  assert.equal(await fs.readFile(dataFile, 'utf8'), original);
});
