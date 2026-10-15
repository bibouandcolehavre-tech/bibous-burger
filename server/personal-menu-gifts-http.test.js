const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');
const { previewPromotion } = require('../promo-client');

test('personal menu gift HTTP: three published client contracts, real-account isolation, extras refused, atomic one-use and no bank payment', { timeout: 20000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-personal-menu-')), file = path.join(dir, 'data.json'), providerFile = path.join(dir, 'sumup.json');
  const customer = { id: 'fictional-gift-owner', firstName: 'Camille', lastName: 'Fictif', name: 'Camille Fictif', phone: '+33600000000', points: 0, welcomeReward: { status: 'available' } };
  await fs.writeFile(file, JSON.stringify({ customers: [customer, { ...customer, id: 'other-fictitious', phone: '+33600000001' }], orders: [], nextOrderNumber: 1 }));
  await fs.writeFile(providerFile, JSON.stringify({ checkouts: {} }));
  const config = JSON.stringify(['web', 'ios', 'android'].map(platform => ({ code: 'GIFT-' + platform.toUpperCase(), customerId: customer.id })));
  let child;
  const launch = async () => {
    child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/sumup-provider.cjs'), path.join(__dirname, 'server.js')], {
      cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file, FAKE_SUMUP_FILE: providerFile, RESTAURANT_DASHBOARD_PASSWORD: 'fictional-admin', SESSION_SECRET: 'fictional-secret', GOOGLE_MAPS_API_KEY: 'FAKE', SUMUP_API_KEY: 'FAKE', SUMUP_MERCHANT_CODE: 'TEST', SUMUP_RETURN_URL: 'https://example.invalid/return', SUMUP_REDIRECT_URL: 'https://example.invalid/app', BIBOU_PERSONAL_MENU_GIFTS_V1: config }, stdio: ['ignore', 'pipe', 'pipe']
    });
    return new Promise((resolve, reject) => {
      let output = '', errors = '';
      child.stderr.on('data', chunk => { errors += chunk; });
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0] + '/api'); });
      child.on('error', reject); child.on('exit', () => reject(new Error(errors)));
    });
  };
  t.after(async () => { if (child?.exitCode === null) { child.kill(); await once(child, 'exit'); } await fs.rm(dir, { recursive: true, force: true }); });
  let base = await launch();
  const ownerToken = createCustomerSession(customer.id, 'fictional-secret'), otherToken = createCustomerSession('other-fictitious', 'fictional-secret');
  const request = async (route, body, token = ownerToken, platform = 'web') => {
    const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '', 'X-Bibou-Platform': platform }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
  const menu = { productId: 'classique-menu', quantity: 1, selections: [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'roquette' }, { groupId: 'sauces', id: 'mayo' }, { groupId: 'drink', id: 'coca' }] };
  for (const platform of ['web', 'ios', 'android']) {
    const code = 'GIFT-' + platform.toUpperCase(), preview = { code, method: 'pickup', items: [menu] };
    assert.equal((await request('/promotions/validate', preview, '', platform)).status, 401);
    const refused = await request('/promotions/validate', preview, otherToken, platform);
    assert.equal(refused.status, 403); assert.equal(refused.data.promotion, undefined);
    const valid = await request('/promotions/validate', preview, ownerToken, platform);
    assert.equal(valid.status, 200, JSON.stringify(valid.data));
    assert.equal(valid.data.promotion.requiredMenuCount, 1);
    assert.equal(previewPromotion({ deliveryFee: 0 }, 13.9, valid.data.promotion, 'pickup').total, 0);
    assert.equal((await request('/promotions/validate', { ...preview, method: 'delivery' }, ownerToken, platform)).status, 400);
    assert.equal((await request('/promotions/validate', { ...preview, items: [{ ...menu, quantity: 2 }] }, ownerToken, platform)).status, 400);
    assert.equal((await request('/promotions/validate', { ...preview, items: [...preview.items, { productId: 'drink-coca', quantity: 1, selections: [] }] }, ownerToken, platform)).status, 400);
    const extra = { ...menu, selections: [...menu.selections, { groupId: 'extras', id: 'cheddar' }] };
    assert.equal((await request('/promotions/validate', { ...preview, items: [extra] }, ownerToken, platform)).status, 400);
    const body = { customerId: customer.id, method: 'pickup', serviceDate: parisDateKey(new Date(Date.now() + 86400000)), slot: '19:00', items: [menu], promoCode: code, requestId: 'personal-gift-' + platform + '-attempt-one' };
    assert.equal((await request('/orders', { ...body, items: [extra] }, ownerToken, platform)).status, 400);
    const alternate = { ...body, requestId: 'personal-gift-' + platform + '-attempt-two' };
    const results = await Promise.all([request('/orders', body, ownerToken, platform), request('/orders', alternate, ownerToken, platform)]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409], JSON.stringify(results));
    const winner = results.findIndex(result => result.status === 201), order = results[winner].data.order;
    assert.equal(order.total, 0); assert.equal(order.payment.amount, 0); assert.equal(order.payment.provider, 'promotion'); assert.equal(order.status, 'confirmed');
    assert.equal((await request('/orders', winner === 0 ? body : alternate, ownerToken, platform)).data.order.id, order.id, 'A lost response recovers the same order, never a second gift');
    assert.equal((await request('/promotions/validate', preview, ownerToken, platform)).status, 409);
  }
  const database = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(database.orders.length, 3);
  assert.equal(database.customers[0].points, 0);
  assert.equal(database.customers[0].welcomeReward.status, 'available');
  assert.deepEqual(JSON.parse(await fs.readFile(providerFile, 'utf8')).checkouts, {});
  child.kill(); await once(child, 'exit'); base = await launch();
  assert.equal((await request('/promotions/validate', { code: 'GIFT-IOS', method: 'pickup', items: [menu] })).status, 409, 'Usage limit survives server restart');
});
