const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
test('statistics HTTP: restaurant-only read-only real aggregates, no provider calls or customer data in responses', { timeout: 15000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-statistics-http-'));
  const file = path.join(directory, 'data.json');
  const original = JSON.stringify({ customers: [{ id: 'fixture-customer', name: 'PRIVATE-NAME', phone: '+33600000001', address: 'PRIVATE-ADDRESS', points: 500 }], orders: [{ id: 'fixture-order', customerId: 'fixture-customer', total: 19.4, status: 'delivered', payment: { status: 'PAID', paidAt: '2026-10-13T10:00:00Z' }, createdAt: '2026-10-13T09:30:00Z' }], reservations: [{ id: 'fixture-table' }], nextOrderNumber: 1 });
  await fs.writeFile(file, original);
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { cwd: directory, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file, RESTAURANT_DASHBOARD_PASSWORD: 'statistics-test-only', SESSION_SECRET: 'statistics-secret-test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { let output = '', errors = ''; child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0] + '/api'); }); child.stderr.on('data', chunk => { errors += chunk; }); child.on('error', reject); child.on('exit', () => reject(Error(errors || 'Test server stopped'))); });
  const request = (route, token = '', method = 'GET', body) => fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const customerToken = createCustomerSession('fixture-customer', 'statistics-secret-test');
  for (const token of ['', customerToken, 'review.invalid']) assert.equal((await request('/dashboard/statistics', token)).status, 401);
  const token = (await (await request('/dashboard/auth/login', '', 'POST', { password: 'statistics-test-only' })).json()).token;
  for (const granularity of ['hour', 'day', 'week', 'month']) {
    const response = await request('/dashboard/statistics?date=2026-10-13&granularity=' + granularity, token);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json(); assert.equal(result.totals.netCents, 1940); assert.equal(result.fictitious, false);
    for (const secret of ['PRIVATE-NAME', 'PRIVATE-ADDRESS', '+33600000001', 'fixture-customer', 'fixture-order']) assert(!JSON.stringify(result).includes(secret));
  }
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await request('/dashboard/statistics', token, method, { total: 999999 })).status, 405);
  assert.equal((await request('/dashboard/statistics?date=2026-02-30', token)).status, 400);
  assert.equal((await request('/dashboard/statistics?demo=true', token)).status, 400);
  assert.equal(await fs.readFile(file, 'utf8'), original, 'Customer points, orders and bookings remain byte-for-byte unchanged');
});
