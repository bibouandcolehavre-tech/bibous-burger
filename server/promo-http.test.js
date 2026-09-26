const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');

test('CHORUS HTTP : commande gratuite sûre, stocks/créneaux, répétitions et circuit restaurant', { timeout: 20000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-promo-test-')), file = path.join(dir, 'data.json'), providerFile = path.join(dir, 'sumup.json');
  const customer = { id: 'promo-test', firstName: 'Camille', lastName: 'Test', name: 'Camille Test', phone: '+33600000000', address: '1 rue fictive', postalCode: '76600', city: 'Le Havre', points: 0, welcomeReward: { status: 'available' } };
  await fs.writeFile(file, JSON.stringify({ customers: [customer, { ...customer, id: 'other-test', phone: '+33600000001' }], orders: [], nextOrderNumber: 1 }));
  await fs.writeFile(providerFile, JSON.stringify({ checkouts: {} }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/sumup-provider.cjs'), path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file, FAKE_SUMUP_FILE: providerFile, RESTAURANT_DASHBOARD_PASSWORD: 'test-only', SESSION_SECRET: 'test-secret', GOOGLE_MAPS_API_KEY: 'FAKE', SUMUP_API_KEY: 'FAKE', SUMUP_MERCHANT_CODE: 'TEST', SUMUP_RETURN_URL: 'https://example.invalid/return', SUMUP_REDIRECT_URL: 'https://example.invalid/app' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    child.stderr.on('data', d => { errors += d; });
    child.stdout.on('data', d => { output += d; const m = output.match(/http:\/\/localhost:\d+/); if (m) resolve(m[0] + '/api'); });
    child.on('error', reject); child.on('exit', () => reject(new Error(errors)));
  });
  const token = createCustomerSession(customer.id, 'test-secret');
  const request = async (route, body, auth = token, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
  const admin = (await request('/dashboard/auth/login', { password: 'test-only' })).data.token;
  const body = { customerId: customer.id, method: 'pickup', serviceDate: parisDateKey(new Date(Date.now() + 86400000)), slot: '19:00', items: [{ productId: 'classique', quantity: 2, selections: [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'roquette' }, { groupId: 'sauces', id: 'mayo' }] }], promoCode: ' chorus ', requestId: 'attempt-free-promo-000001' };
  const db = async () => JSON.parse(await fs.readFile(file, 'utf8'));
  const calls = async () => { try { return await fs.readFile(path.join(dir, 'calls.jsonl'), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; } };

  assert.equal((await request('/promotions/validate', { code: 'CHORUS' }, '')).status, 401);
  assert.equal((await request('/promotions/validate', { code: 'invalide' })).status, 400);
  assert.equal((await request('/promotions/validate', { code: ' chorus ' })).data.promotion.code, 'CHORUS');
  assert.equal((await request('/orders', body, '')).status, 401);
  assert.equal((await request('/orders', { ...body, promoCode: 'unknown' })).status, 400);
  const results = await Promise.all([request('/orders', body), request('/orders', { ...body, promoCode: 'CHORUS' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201], JSON.stringify(results));
  const order = results[0].data.order;
  assert.equal(order.id, results[1].data.order.id); assert.equal(order.total, 0); assert.equal(order.discount, order.subtotal);
  assert.equal(order.status, 'confirmed'); assert.equal(order.payment.provider, 'promotion'); assert.equal(order.payment.amount, 0);
  assert.equal(order.welcomeRewardApplied, false); assert.equal(order.crmOfferId, undefined);
  const saved = await db();
  assert.equal(saved.orders.length, 1); assert.equal(saved.customers[0].welcomeReward.status, 'available');
  const points = saved.customers[0].points;
  assert.equal(points, 0); assert.equal(saved.customers[0].weeklyOrders, 0, 'Free orders never multiply points on paid orders');
  assert.equal((await request('/orders', { ...body, promoCode: '' })).status, 409);
  assert.equal((await request('/payments/sumup-checkout', { orderId: order.id })).data.payment.amount, 0);
  assert.equal((await db()).customers[0].points, points, 'Replay does not award points twice');
  assert.equal((await request('/customer/payment-attempts/' + body.requestId)).data.record.id, order.id);
  assert.equal((await request('/customer/payment-attempts/' + body.requestId, undefined, createCustomerSession('other-test', 'test-secret'))).status, 404);
  const dashboard = (await request('/dashboard/orders', undefined, admin)).data;
  assert.equal(dashboard.orders[0].id, order.id); assert.equal(dashboard.revenue.today, 0);
  assert.equal((await request('/dashboard/orders/' + order.id, { status: 'preparing' }, admin, 'PATCH')).status, 200);
  assert.equal((await request('/dashboard/orders/' + order.id, { status: 'cancelled' }, admin, 'PATCH')).status, 200);
  assert.equal((await request('/payments/sumup-checkout', { orderId: order.id })).status, 409);
  assert.equal(await calls(), '', 'No SumUp call, even on replay or cancellation');

  const delivery = { ...body, method: 'delivery', slot: '19:00 – 19:30', requestId: 'attempt-free-delivery-001' };
  const shipped = await request('/orders', delivery);
  assert.equal(shipped.status, 201, JSON.stringify(shipped.data));
  assert.equal(shipped.data.order.standardDeliveryFee, 3.99); assert.equal(shipped.data.order.deliveryFee, 0); assert.equal(shipped.data.order.total, 0);
  assert.equal((await request('/orders', { ...delivery, requestId: 'attempt-free-delivery-002' })).status, 201);
  assert.equal((await request('/orders', { ...delivery, requestId: 'attempt-free-delivery-003' })).status, 409, 'Gifted orders consume delivery capacity');
  assert.equal((await request('/orders', { ...body, slot: '03:00', requestId: 'attempt-free-bad-slot-001' })).status, 400);
  await request('/dashboard/catalog/classique', { available: false }, admin, 'PATCH');
  assert.equal((await request('/orders', { ...body, requestId: 'attempt-free-stock-00001' })).status, 400);
  await request('/dashboard/catalog/classique', { available: true }, admin, 'PATCH');
  assert.equal(await calls(), '', 'Free delivery never invokes SumUp');
  const forged = await request('/orders', { ...body, promoCode: '', requestId: 'attempt-forged-free-0001', total: 0, discountRate: 1, promotion: { code: 'CHORUS' }, payment: { status: 'PAID' } });
  assert.equal(forged.status, 201); assert.ok(forged.data.order.total > 0); assert.equal(forged.data.order.status, 'awaiting_payment');
  assert.equal(forged.data.order.promotion, undefined);
  const normal = await request('/payments/sumup-checkout', { orderId: forged.data.order.id });
  assert.equal(normal.status, 201); assert.ok(normal.data.checkoutUrl); assert.equal(normal.data.order.payment.status, 'PENDING');
  assert.equal((await request('/dashboard/orders', undefined, admin)).data.orders.some(o => o.id === forged.data.order.id), false);
});
