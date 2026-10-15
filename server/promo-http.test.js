const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');

test('Code de test retiré : refus sur les trois plateformes ; paiements normaux et cadeaux autorisés conservés', { timeout: 20000 }, async t => {
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
  const request = async (route, body, auth = token, method = body === undefined ? 'GET' : 'POST', platform = 'web') => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}`, 'X-Bibou-Platform': platform }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
  const admin = (await request('/dashboard/auth/login', { password: 'test-only' })).data.token;
  const body = { customerId: customer.id, method: 'pickup', serviceDate: parisDateKey(new Date(Date.now() + 86400000)), slot: '19:00', items: [{ productId: 'classique', quantity: 2, selections: [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'roquette' }, { groupId: 'sauces', id: 'mayo' }] }], promoCode: ' chorus ', requestId: 'attempt-free-promo-000001' };
  const db = async () => JSON.parse(await fs.readFile(file, 'utf8'));
  const calls = async () => { try { return await fs.readFile(path.join(dir, 'calls.jsonl'), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; } };

  assert.equal((await request('/promotions/validate', { code: 'CHORUS' }, '')).status, 401);
  assert.equal((await request('/promotions/validate', { code: 'invalide' })).status, 400);
  for (const platform of ['web', 'android', 'ios']) {
    for (const code of ['CHORUS', ' chorus ', 'ChOrUs']) {
      const rejected = await request('/promotions/validate', { code, allowTestCode: true, reviewMode: true }, token, 'POST', platform);
      assert.equal(rejected.status, 400, JSON.stringify(rejected.data));
      const attempted = await request('/orders', { ...body, promoCode: code, requestId: 'retired-code-' + platform + '-attempt-001' }, token, 'POST', platform);
      assert.equal(attempted.status, 400, JSON.stringify(attempted.data));
      assert.equal((await request('/orders', { ...body, promoCode: code, method: 'delivery', slot: '19:00 – 19:30' }, token, 'POST', platform)).status, 400);
    }
    const wheel = await request('/customer/wheel', undefined, token, 'GET', platform);
    assert.equal(wheel.status, 200);
    assert.doesNotMatch(wheel.data.rules, /CHORUS|code de test/i);
    assert.match(wheel.data.rules, /15 €/);
  }
  assert.deepEqual((await db()).orders, []);
  assert.equal((await db()).customers[0].welcomeReward.status, 'available');
  assert.equal((await db()).customers[0].points, 0);
  assert.equal(await calls(), '', 'Rejected code never contacts the payment provider');
  assert.equal((await request('/orders', body, '')).status, 401);
  const forged = await request('/orders', { ...body, promoCode: '', requestId: 'attempt-forged-free-0001', total: 0, discountRate: 1, promotion: { code: 'CHORUS' }, payment: { status: 'PAID' } });
  assert.equal(forged.status, 201); assert.ok(forged.data.order.total > 0); assert.equal(forged.data.order.status, 'awaiting_payment');
  assert.equal(forged.data.order.promotion, undefined);
  const normal = await request('/payments/sumup-checkout', { orderId: forged.data.order.id });
  assert.equal(normal.status, 201); assert.ok(normal.data.checkoutUrl); assert.equal(normal.data.order.payment.status, 'PENDING');
  assert.equal((await request('/dashboard/orders', undefined, admin)).data.orders.some(o => o.id === forged.data.order.id), false);

  const menu = { productId: 'classique-menu', quantity: 2, selections: [
    { groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'roquette' },
    { groupId: 'sauces', id: 'mayo' }, { groupId: 'drink', id: 'coca' }
  ] };
  const gift = { ...body, items: [menu], promoCode: ' groslard ', requestId: 'attempt-two-menus-gift-001' };
  const promoInput = { code: 'GROSLARD', method: 'pickup', items: gift.items };
  const validatedGift = await request('/promotions/validate', promoInput);
  assert.equal(validatedGift.status, 200);
  assert.match(validatedGift.data.promotion.message, /sur place/);
  assert.equal((await request('/promotions/validate', { ...promoInput, method: 'delivery' })).status, 400);
  assert.equal((await request('/orders', { ...gift, method: 'delivery', slot: '19:00 – 19:30', requestId: 'attempt-gift-delivery-001' })).status, 400);
  assert.equal((await request('/orders', { ...gift, items: [{ ...menu, quantity: 1 }], requestId: 'attempt-one-menu-gift-001' })).status, 400);
  assert.equal((await request('/orders', { ...gift, items: [...gift.items, { productId: 'drink-coca', quantity: 1, selections: [] }], requestId: 'attempt-extra-product-gift-001' })).status, 400);
  const withSupplement = { ...menu, selections: [...menu.selections, { groupId: 'extras', id: 'cheddar' }] };
  assert.equal((await request('/promotions/validate', { ...promoInput, items: [withSupplement] })).status, 400);
  assert.equal((await request('/orders', { ...gift, items: [withSupplement], requestId: 'attempt-extra-cost-gift-001' })).status, 400);
  const uses = await Promise.all([request('/orders', gift), request('/orders', { ...gift, requestId: 'attempt-two-menus-gift-002' })]);
  assert.deepEqual(uses.map(result => result.status).sort(), [201, 409]);
  const gifted = uses.find(result => result.status === 201).data.order;
  assert.equal(gifted.total, 0); assert.equal(gifted.payment.provider, 'promotion');
  assert.equal((await request('/promotions/validate', promoInput)).status, 409);
  assert.equal((await request('/orders', { ...gift, requestId: 'attempt-two-menus-gift-003' })).status, 409);
  assert.equal((await request('/orders', gift)).status, 200, 'Une réponse perdue peut être relue sans deuxième utilisation.');
  assert.equal((await db()).orders.filter(item => item.promotion?.code === 'GROSLARD').length, 1);
});
