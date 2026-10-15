const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');

test('10 % HTTP : suppression, nouvelles preuves SMS, reprise serveur et prix autoritaires des trois canaux', { timeout: 30000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-welcome-deletion-')), file = path.join(dir, 'data.json');
  const secret = 'fictitious-welcome-deletion-secret', stamp = new Date().toISOString();
  const customers = [0, 1, 2].map(i => ({ id: 'old-' + i, name: 'Client Fictif', firstName: 'Client', lastName: 'Fictif',
    phone: '+3360000000' + i, verifiedPhone: '+3360000000' + i, phoneVerifiedAt: stamp, points: 0,
    welcomeReward: { type: 'first_order_discount', status: i === 1 ? 'available' : 'used', usedOrderId: 'paid-' + i } }));
  await fs.writeFile(file, JSON.stringify({ customers, orders: [0, 2].map(i => ({ id: 'paid-' + i, number: 900 + i,
    customerId: 'old-' + i, customerPhone: customers[i].phone, customerName: 'Client Fictif', welcomeRewardApplied: true,
    total: 9, subtotal: 10, status: i === 2 ? 'cancelled' : 'delivered', createdAt: stamp, payment: { status: 'PAID', paidAt: stamp } })), nextCustomerId: 10, nextOrderNumber: 1000 }));
  let child, base;
  const stop = async () => { if (child) { child.kill(); if (child.exitCode === null) await once(child, 'exit'); child = null; } };
  const start = async () => {
    child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/sms-provider.cjs'), path.join(__dirname, 'server.js')], {
      cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', LISTEN_HOST: '127.0.0.1', PORT: '0', DATA_FILE_PATH: file,
        SESSION_SECRET: secret, TWILIO_ACCOUNT_SID: 'FAKE', TWILIO_AUTH_TOKEN: 'FAKE', TWILIO_VERIFY_SERVICE_SID: 'FAKE' }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => { let output = '', errors = ''; child.stderr.on('data', d => errors += d);
      child.stdout.on('data', d => { output += d; const m = output.match(/http:\/\/localhost:(\d+)/); if (m) resolve('http://127.0.0.1:' + m[1] + '/api'); });
      child.once('error', reject); child.once('exit', code => reject(Error(code + ': ' + errors))); });
  };
  t.after(async () => { await stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const req = async (route, method = 'GET', body, token, platform) => {
    const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(platform ? { 'X-Bibou-Platform': platform } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  };
  const register = async (phone, legacy = false) => {
    const proof = await req('/auth/sms/check', 'POST', { phone, code: '123456', ...(legacy ? {} : { registrationVersion: 2 }) });
    assert.equal(proof.status, 200, JSON.stringify(proof.body));
    if (legacy) return proof.body;
    const r = await req('/auth/sms/register', 'POST', { registrationToken: proof.body.registrationToken, firstName: 'Client', lastName: 'Fictif',
      welcomeReward: { status: 'available' }, discountRate: 0.1, antiAbuseBlocked: false });
    assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body;
  };
  const order = (customerId, requestId) => ({ customerId, requestId, method: 'pickup', serviceDate: parisDateKey(new Date(Date.now() + 86400000)),
    slot: '19:00', slotGrid: 20, items: [{ productId: 'frites-maison', quantity: 1, selections: [] }], discountRate: 0.1, welcomeRewardApplied: true });
  await start();
  assert.equal((await req('/customer/account', 'DELETE', undefined, createCustomerSession('old-0', secret))).status, 200);
  const recreated = await register('06 00 00 00 00');
  assert.equal(recreated.customer.welcomeReward.status, 'used');
  const data = JSON.parse(await fs.readFile(file, 'utf8')), privateHash = data.welcomeRewardHistory[0].phoneHash;
  assert.equal(data.orders[0].customerId, null); assert.equal(data.orders[0].customerPhone, undefined);
  assert(!JSON.stringify(recreated).includes(privateHash));
  assert(!JSON.stringify(data.welcomeRewardHistory).includes('+33600000000'));
  for (const platform of ['ios', 'android', 'web']) {
    const priced = await req('/orders', 'POST', order(recreated.customer.id, 'welcome-blocked-' + platform + '-00001'), recreated.token, platform);
    assert.equal(priced.status, 201, JSON.stringify(priced.body));
    assert.equal(priced.body.order.welcomeRewardApplied, false, platform);
    assert.equal(priced.body.order.discountRate, 0, platform); assert.equal(priced.body.order.total, priced.body.order.subtotal, platform);
  }
  const expiry = data.welcomeRewardHistory[0].expiresAt;
  await req('/customer/account', 'DELETE', undefined, recreated.token);
  await stop(); await start();
  const legacy = await register('+33600000000', true);
  assert.equal(legacy.customer.welcomeReward.status, 'used', 'Fresh legacy SMS proof cannot reset benefit after restart');
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).welcomeRewardHistory[0].expiresAt, expiry);
  for (const i of [1, 2]) {
    assert.equal((await req('/customer/account', 'DELETE', undefined, createCustomerSession('old-' + i, secret))).status, 200);
    assert.equal((await register('060000000' + i)).customer.welcomeReward.status, 'available', 'Unused/cancelled benefit remains available');
  }
  const fresh = await register('0700000009');
  assert.equal(fresh.customer.welcomeReward.status, 'available');
  const priced = await req('/orders', 'POST', order(fresh.customer.id, 'welcome-genuine-first-order-0001'), fresh.token, 'ios');
  assert.equal(priced.status, 201, JSON.stringify(priced.body));
  assert.equal(priced.body.order.welcomeRewardApplied, true);
  assert.equal(priced.body.order.discountRate, 0.1);
  for (const route of ['/contest?contestApi=2', '/news', '/auth/me']) {
    const result = await req(route, 'GET', undefined, fresh.token);
    assert(!JSON.stringify(result.body).includes(privateHash), 'Private ledger must not leak into customer/public responses');
  }
});
