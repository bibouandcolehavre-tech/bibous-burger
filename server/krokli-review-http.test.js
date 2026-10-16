'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('review HTTP uses isolated state, rejects real routes, leaves production fixture byte-identical', { timeout: 30000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'krokli-review-http-'));
  const file = path.join(dir, 'data.json'), password = 'http-review-fixture-only';
  await fs.writeFile(file, JSON.stringify({ customers: [{ id: 'real-customer-sentinel', firstName: 'Never exposed' }], orders: [], reservations: [], nextOrderNumber: 1, nextCustomerId: 2 }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/driver-no-external.cjs'), path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, PORT: '0', NODE_ENV: 'test', DATA_FILE_PATH: file,
      SESSION_SECRET: 's'.repeat(64), RESTAURANT_DASHBOARD_PASSWORD: 'owner-fixture-only',
      KROKLI_REVIEW_PASSWORD_HASH: crypto.createHash('sha256').update(password).digest('hex') }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  let output = '', errors = '';
  child.stderr.on('data', c => { errors += c; });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', c => { output += c; const m = output.match(/http:\/\/localhost:\d+/); if (m) resolve(m[0]); });
    child.on('error', reject); child.on('exit', code => reject(Error(`${code}: ${errors}`)));
  });
  async function request(route, token = '', body) {
    const r = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, data: await r.json(), headers: r.headers };
  }
  // Let normal startup initialisation finish before observing any reviewer call.
  await request('/api/krokly-driver/capabilities');
  for (const page of ['privacy','support']) {
    const publicPage = await fetch(`${base}/driver/${page}`);
    assert.equal(publicPage.status, 200); assert.match(publicPage.headers.get('content-type'), /text\/html/);
    assert.match(publicPage.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(await publicPage.text(), /Krokli Driver/);
    assert.equal((await fetch(`${base}/driver/${page}`, { method: 'HEAD' })).status, 200);
    assert.equal((await request(`/driver/${page}`, '', {})).status, 405);
  }
  const baseline = await fs.readFile(file);
  assert.equal((await request('/api/krokly-driver/native-push/unregister', '', { installationId: crypto.randomUUID(), installationSecret: crypto.randomUUID(), reviewMode: true })).status, 200);
  const login = await request('/api/krokly-driver/login', '', { username: 'store-review-krokli', password });
  assert.equal(login.status, 200); assert.equal(login.data.driver.reviewMode, true);
  const token = login.data.token;
  const state = await request('/api/krokly-driver/state', token), order = state.data.orders[0];
  assert.match(state.headers.get('cache-control'), /no-store/);
  assert.equal(JSON.stringify(state).includes('Never exposed'), false);
  for (const route of ['/api/dashboard/krokly-drivers', '/api/customer/orders', '/api/review/state', '/api/push/unregister'])
    assert.equal((await request(route, token, {})).status, 403);
  assert.equal((await request('/api/krokly-driver/login', token, { username: 'real-driver', password })).status, 403);
  assert.equal((await request('/api/krokly-driver/state', 'krokli-review.forged')).status, 401);
  for (const action of ['accept', 'pickup', 'deliver']) assert.equal((await request(`/api/krokly-driver/orders/${order.id}/${action}`, token, {})).status, 200);
  const account = await request('/api/krokly-driver/account', token); assert.equal(account.data.summary.completedCount, 3);
  assert.equal((await request('/api/krokly-driver/bank', token, { holder: 'Compte exemple', iban: 'FR1420041010050500013M02606', bic: '' })).status, 200);
  assert.equal((await request('/api/krokly-driver/payment-requests', token, { confirm: true })).status, 201);
  const proof = { installationId: crypto.randomUUID(), installationSecret: crypto.randomUUID(), projectId: '8f737171-95c6-449a-8c34-4ce9f0ee747c', platform: 'ios', informed: true, token: 'ExpoPushToken[review_http_fixture_only]' };
  assert.equal((await request('/api/krokly-driver/native-push/register', token, proof)).status, 200);
  assert.equal((await request('/api/krokly-driver/native-push/unregister', '', proof)).status, 200);
  const pdf = await fetch(`${base}/api/krokly-driver/statement`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(pdf.status, 200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.deepEqual(await fs.readFile(file), baseline, 'No real DB write from any reviewer operation');
  assert.equal(errors.includes('External requests forbidden'), false);
});
