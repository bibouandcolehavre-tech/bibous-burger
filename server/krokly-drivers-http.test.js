const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { parisDateKey } = require('./availability');

test('Krokly Driver HTTP: accounts, isolation, attribution and order status', { timeout: 30000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'krokly-driver-http-'));
  const file = path.join(dir, 'data.json');
  const date = parisDateKey(new Date());
  const order = (number, status = 'ready') => ({
    id: `order-${number}`, number, customerId: 'c1', customerName: 'Client fictif',
    customerPhone: '0600000000', deliveryAddress: { address: '1 rue fictive', postalCode: '76600', city: 'Le Havre' },
    method: 'delivery', serviceDate: date, slot: '19:00', items: [{ name: 'Burger', price: 10, quantity: 1 }],
    subtotal: 10, total: 13.99, deliveryFee: 3.99, status, payment: { status: 'PAID' }, createdAt: new Date().toISOString()
  });
  await fs.writeFile(file, JSON.stringify({ customers: [{ id: 'c1', name: 'Client fictif', points: 0 }], orders: [order(1), order(2)], reservations: [], nextOrderNumber: 3, nextCustomerId: 2 }));
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: dir,
    env: { PATH: process.env.PATH, PORT: '0', NODE_ENV: 'test', DATA_FILE_PATH: file, SESSION_SECRET: 's'.repeat(64), RESTAURANT_DASHBOARD_PASSWORD: 'owner-test-password' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
    await fs.rm(dir, { recursive: true, force: true });
  });
  let output = '', errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0]); });
    child.on('error', reject);
    child.on('exit', code => reject(Error(`${code}: ${errors}`)));
  });
  async function request(route, bearer = '', method = 'GET', input) {
    const response = await fetch(`${base}${route}`, {
      method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      ...(input ? { body: JSON.stringify(input) } : {})
    });
    return { status: response.status, data: await response.json() };
  }
  assert.equal((await fetch(`${base}/driver/`)).status, 200);
  assert.equal((await request('/api/dashboard/krokly-drivers')).status, 401);
  const owner = (await request('/api/dashboard/auth/login', '', 'POST', { password: 'owner-test-password' })).data.token;
  const lina = await request('/api/dashboard/krokly-drivers', owner, 'POST', { username: 'lina', name: 'Lina' });
  const malik = await request('/api/dashboard/krokly-drivers', owner, 'POST', { username: 'malik', name: 'Malik' });
  assert.equal(lina.status, 201);
  assert.equal(malik.status, 201);
  const copiedLogin = await request('/api/krokly-driver/login', '', 'POST', { username: ' LINA ', password: `\n${lina.data.password}\u00a0` });
  assert.equal(copiedLogin.status, 200);
  const linaToken = copiedLogin.data.token;
  const malikToken = (await request('/api/krokly-driver/login', '', 'POST', { username: 'malik', password: malik.data.password })).data.token;
  const firstState = (await request('/api/krokly-driver/state', linaToken)).data;
  assert.equal(firstState.orders.length, 0);
  assert.equal(firstState.push.enabled, true);
  assert.equal(typeof firstState.push.publicKey, 'string');
  assert.equal((await request('/api/krokly-driver/push/subscribe', linaToken, 'POST', { endpoint: 'https://127.0.0.1/private' })).status, 400);
  assert.equal((await request('/api/dashboard/krokly-drivers/orders/order-1/assign', owner, 'POST', { driverId: lina.data.driver.id })).status, 200);
  assert.equal((await request('/api/dashboard/krokly-drivers/orders/order-1/assign', owner, 'POST', { driverId: malik.data.driver.id })).status, 409);
  assert.equal((await request('/api/krokly-driver/state', malikToken)).data.orders.length, 0);
  assert.equal((await request('/api/krokly-driver/orders/order-1/accept', malikToken, 'POST')).status, 404);
  assert.equal((await request('/api/krokly-driver/state', linaToken)).data.orders[0].deliveryAddress, undefined);
  assert.equal((await request('/api/krokly-driver/orders/order-1/accept', linaToken, 'POST')).status, 200);
  assert.equal((await request('/api/krokly-driver/state', linaToken)).data.orders[0].deliveryAddress.address, '1 rue fictive');
  assert.equal((await request('/api/dashboard/orders/order-1', owner, 'PATCH', { status: 'delivered' })).status, 409);
  assert.equal((await request('/api/krokly-driver/orders/order-1/pickup', linaToken, 'POST')).status, 200);
  assert.equal((await request('/api/krokly-driver/orders/order-1/deliver', linaToken, 'POST')).status, 200);
  const persisted = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(persisted.orders[0].status, 'delivered');
  assert.equal((await request('/api/dashboard/krokly-drivers/' + lina.data.driver.id + '/active', owner, 'PATCH', { active: false })).status, 200);
  assert.equal((await request('/api/krokly-driver/state', linaToken)).status, 401);
});
