const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');

test('service module pilot: authenticated changes block only new requests', { timeout: 25000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-modules-http-'));
  const databaseFile = path.join(directory, 'data.json');
  await fs.writeFile(databaseFile, JSON.stringify({ customers: [{ id: 'c1', name: 'Client fictif', phone: '+33600000001', points: 0 }], orders: [], reservations: [], nextOrderNumber: 1, nextCustomerId: 2 }));
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: directory,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: databaseFile, SESSION_SECRET: 'module-test-secret', RESTAURANT_DASHBOARD_PASSWORD: 'module-test-password' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(directory, { recursive: true, force: true }); });
  let output = '', errors = '';
  child.stderr.on('data', data => { errors += data; });
  const api = await new Promise((resolve, reject) => {
    child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(`${match[0]}/api`); });
    child.on('error', reject);
    child.on('exit', code => reject(Error(`${code}: ${errors}`)));
  });
  const request = async (route, { method = 'GET', token = '', body } = {}) => {
    const response = await fetch(api + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const initial = await request('/service-modules');
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.data.modules, { pickup: true, delivery: true, tables: true });
  assert.equal((await request('/dashboard/service-modules', { method: 'PATCH', body: { revision: 0, modules: { tables: false } } })).status, 401);
  const admin = (await request('/dashboard/auth/login', { method: 'POST', body: { password: 'module-test-password' } })).data.token;
  const changed = await request('/dashboard/service-modules', { method: 'PATCH', token: admin, body: { revision: 0, modules: { pickup: false, delivery: false, tables: false } } });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.revision, 1);
  const date = parisDateKey(new Date(Date.now() + 86400000));
  for (const method of ['pickup', 'delivery']) {
    const available = await request(`/availability?date=${date}&method=${method}`);
    assert.equal(available.status, 200);
    assert.equal(available.data.unavailable, true);
    assert.deepEqual(available.data.slots, []);
  }
  const tables = await request(`/reservation-availability?date=${date}`);
  assert.equal(tables.data.unavailable, true);
  const customer = createCustomerSession('c1', 'module-test-secret');
  const reservation = await request('/reservations', { method: 'POST', token: customer, body: { name: 'Client fictif', phone: '+33600000001', guests: 2, serviceDate: date, slot: '12:00' } });
  assert.equal(reservation.status, 409);
  assert.equal(reservation.data.code, 'MODULE_DISABLED');
  const order = await request('/orders', { method: 'POST', token: customer, body: { customerId: 'c1', method: 'pickup', serviceDate: date, slot: '12:00', items: [{ productId: 'drink-coca', quantity: 1 }] } });
  assert.equal(order.status, 409);
  assert.equal(order.data.code, 'MODULE_DISABLED');
  assert.equal((await request('/dashboard/service-modules', { method: 'PATCH', token: admin, body: { revision: 0, modules: { tables: true } } })).status, 409);
  assert.equal((await request('/dashboard/service-modules', { method: 'PATCH', token: admin, body: { revision: 1, modules: { pickup: true, delivery: true, tables: true } } })).status, 200);
  assert.deepEqual((await request('/service-modules')).data.modules, initial.data.modules);
  assert.deepEqual(JSON.parse(await fs.readFile(databaseFile, 'utf8')).orders, []);
});
