'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises');
const path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const drivers = require('./krokly-drivers');
test('field HTTP shares scoped apps without reading/writing real customers, jobs or money', { timeout: 30000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'krokli-field-http-')), file = path.join(dir, 'data.json');
  const productionFixture = { customers: [{ id: 'real-customer-sentinel', firstName: 'Never exposed' }], orders: [], reservations: [], nextOrderNumber: 1, nextCustomerId: 2 };
  const fakeDriver = drivers.createDriver(productionFixture, { username: 'fixture-driver', name: 'Local test only' });
  await fs.writeFile(file, JSON.stringify(productionFixture));
  const code = 'essai-' + 'z'.repeat(32);
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/field-test-no-external.cjs'), path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, PORT: '0', LISTEN_HOST: '127.0.0.1', NODE_ENV: 'test', DATA_FILE_PATH: file,
      SESSION_SECRET: 'f'.repeat(64), RESTAURANT_DASHBOARD_PASSWORD: 'owner-fixture-only',
      FIELD_FIXTURE_HASH: crypto.createHash('sha256').update(code).digest('hex'), FIELD_FIXTURE_EXPIRY: new Date(Date.now() + 3600000).toISOString() }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  let output = '', errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0]); });
    child.on('error', reject); child.on('exit', status => reject(Error(`${status}: ${errors}`)));
  });
  async function req(route, token = '', body, method) {
    const r = await fetch(base + route, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json(), headers: r.headers };
  }
  await req('/api/krokly-driver/capabilities'); const before = await fs.readFile(file);
  const d = await req('/api/krokly-driver/login', '', { username: 'essai-prive-krokli', password: code });
  const c = await req('/api/review/session', '', { accessCode: code });
  assert.equal(d.status, 200); assert.equal(c.status, 200);
  const ds = d.data.token, cs = c.data.token, orders = await req('/api/review/customer/orders', cs);
  assert.equal(orders.data.orders.length, 3); assert.equal(JSON.stringify(orders).includes('Never exposed'), false);
  const state = await req('/api/krokly-driver/state', ds); assert.match(state.headers.get('cache-control'), /no-store/);
  assert.equal(state.data.orders[0].id, orders.data.orders[0].id);
  for (const token of [ds, cs, 'krokli-field.forged', 'review.field.forged']) {
    for (const route of ['/api/customer/orders', '/api/dashboard/orders', '/api/payments/sumup-checkout', '/api/orders'])
      assert.equal((await req(route, token, {})).status, 403);
  }
  assert.equal((await req('/api/krokly-driver/state', 'krokli-field.forged')).status, 401);
  assert.equal((await req('/api/review/customer/orders', 'review.field.forged')).status, 401);
  assert.equal((await req('/api/krokly-driver/login', ds, { username: 'real-driver', password: 'anything' })).status, 403);
  const order = orders.data.orders[0], prefix = `/api/krokly-driver/orders/${order.id}`;
  for (const action of ['accept', 'pickup', 'deliver']) assert.equal((await req(prefix + '/' + action, ds, {})).status, 200);
  assert.equal((await req('/api/review/customer/orders', cs)).data.orders[0].status, 'delivered');
  const tip = await req(`/api/review/customer/orders/${order.id}/tip`, cs, { amountCents: 200, requestId: crypto.randomUUID() });
  assert.equal(tip.status, 200); assert.equal(tip.data.simulated, true); assert.equal(tip.data.status, 'PAID'); assert.equal(tip.data.checkoutUrl, null);
  assert.equal((await req('/api/krokly-driver/payment-requests', ds, { confirm: true })).status, 403);
  // A failed test notification setup never installs anything in production.
  assert.equal((await req('/api/krokly-driver/native-push/register', ds, {})).status, 403);
  assert.deepEqual(await fs.readFile(file), before, 'real database remains byte-identical');
  const page = await fetch(base + '/driver/password');
  assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await page.text(), /Changer mon mot de passe/);
  const normal = await req('/api/krokly-driver/login', '', { username: fakeDriver.driver.username, password: fakeDriver.password });
  const passwordBody = { currentPassword: fakeDriver.password, newPassword: 'une phrase locale de test', confirmation: 'une phrase locale de test' };
  assert.equal((await req('/api/krokly-driver/change-password', '', passwordBody)).status, 401);
  assert.equal((await req('/api/krokly-driver/change-password', ds, passwordBody)).status, 403);
  assert.equal((await req('/api/krokly-driver/change-password', normal.data.token, { ...passwordBody, currentPassword: 'wrong' })).status, 401);
  assert.deepEqual(await fs.readFile(file), before, 'invalid password change has no write');
  assert.equal((await req('/api/krokly-driver/change-password', normal.data.token, passwordBody)).status, 200);
  assert.equal((await req('/api/krokly-driver/state', normal.data.token)).status, 401);
  assert.equal((await req('/api/krokly-driver/login', '', { username: fakeDriver.driver.username, password: passwordBody.newPassword })).status, 200);
  const afterPassword = JSON.parse(await fs.readFile(file));
  assert.deepEqual(afterPassword.customers, JSON.parse(before).customers); assert.deepEqual(afterPassword.orders, []);
  assert.equal(afterPassword.kroklyDrivers[0].passwordKdf, 'scrypt-v2');
  assert.equal(JSON.stringify(afterPassword).includes(passwordBody.newPassword), false);
  assert.equal(errors.includes('External requests forbidden'), false);
});
