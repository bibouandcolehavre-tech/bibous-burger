const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { encodeBackup, decodeBackup } = require('./backups');

test('quantity HTTP: same dashboard rubrique, last unit protection, cash collection once, manual overrides and preservation', { timeout: 30000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-quantity-http-')), file = path.join(dir, 'data.json');
  const customer = { id: 'quantity-fictional', name: 'Client fictif', phone: '+33600000000', points: 620 };
  const reservation = { id: 'preserved-table', customerId: customer.id, status: 'confirmed', serviceDate: '2027-01-12', slot: '19:00' };
  await fs.writeFile(file, JSON.stringify({ customers: [customer], orders: [], reservations: [reservation], nextOrderNumber: 1 }));
  const device = 'quantity-fictional-device-secret-at-least-32-characters', signing = 'quantity-fictional-session';
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file, SESSION_SECRET: signing, KIOSK_TERMINAL_ENABLED: 'true', KIOSK_TERMINAL_DEVICE_SECRET: device, RESTAURANT_DASHBOARD_PASSWORD: 'quantity-fictional-password' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let out = '', err = '';
    child.stderr.on('data', c => { err += c; });
    child.stdout.on('data', c => { out += c; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve(`http://127.0.0.1:${m[1]}/api`); });
    child.once('error', reject); child.once('exit', () => reject(Error(err)));
  });
  const userToken = createCustomerSession(customer.id, signing);
  const call = async (route, body, token = userToken, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-bibou-kiosk-token': device }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const staff = (await call('/dashboard/auth/login', { password: 'quantity-fictional-password' }, '')).data.token;
  const quantity = (id, n, revision) => call(`/dashboard/catalog/${id}/quantity`, { quantity: n, revision }, staff, 'PATCH');
  const product = result => result.data.products.find(p => p.id === 'drink-coca');
  const naan = (await quantity('naan-boeuf', 3, 0)).data.products.find(p => p.id === 'naan-boeuf');
  assert.equal(naan.quantityStock.availableQuantity, 3);
  assert.equal(naan.available, false); assert.equal(naan.visible, false);
  assert.equal((await call('/catalog')).data.products.some(p => p.id === 'naan-boeuf'), false);
  await call('/dashboard/catalog/naan-boeuf', { available: false }, staff, 'PATCH');
  await call('/dashboard/catalog/naan-boeuf', { available: true }, staff, 'PATCH');
  assert.equal((await call('/catalog')).data.products.some(p => p.id === 'naan-boeuf'), false);
  assert.equal((await call('/dashboard/catalog/drink-coca/quantity', { quantity: 2, revision: 0 }, userToken, 'PATCH')).status, 401);
  assert.equal((await quantity('drink-coca', -1, 0)).status, 409);
  assert.equal((await quantity('drink-coca', 1.5, 0)).status, 409);
  assert.equal((await quantity('unknown', 2, 0)).status, 409);
  assert.equal(product(await quantity('drink-coca', 2, 0)).quantityStock.availableQuantity, 2);
  const input = requestId => ({ customerId: customer.id, method: 'pickup', kioskService: { mode: 'take' }, paymentMethod: 'cash', requestId, items: [{ productId: 'drink-coca', quantity: 1, selections: [] }] });
  const first = await call('/orders', input('quantity-fictional-order-0001'));
  assert.equal(first.status, 201, JSON.stringify(first));
  assert.equal(product(await call('/dashboard/catalog', null, staff)).quantityStock.reserved, 1);
  assert.equal((await quantity('drink-coca', 0, 1)).status, 409);
  const collect = order => call(`/dashboard/orders/${order.id}/cash`, { action: 'confirm', amount: order.total }, staff);
  assert.equal((await collect(first.data.order)).status, 200);
  assert.equal((await collect(first.data.order)).status, 200);
  let info = product(await call('/dashboard/catalog', null, staff));
  assert.equal(info.quantityStock.quantity, 1); assert.equal(info.quantityStock.reserved, 0);
  const parallel = await Promise.all([call('/orders', input('quantity-fictional-order-0002')), call('/orders', input('quantity-fictional-order-0003'))]);
  assert.equal(parallel.filter(r => r.status === 201).length, 1, JSON.stringify(parallel));
  const second = parallel.find(r => r.status === 201).data.order;
  const unavailable = product(await call('/catalog'));
  assert.equal(unavailable.available, false); assert.equal(unavailable.quantityStock, undefined);
  const options = (await call('/catalog')).data.options; assert.equal(options['drink:coca'], false);
  assert.equal((await call(`/dashboard/orders/${second.id}/cash`, { action: 'cancel' }, staff)).status, 200);
  assert.equal(product(await call('/catalog')).available, true);
  const third = await call('/orders', input('quantity-fictional-order-0004'));
  assert.equal(third.status, 201); assert.equal((await collect(third.data.order)).status, 200);
  info = product(await call('/dashboard/catalog', null, staff));
  assert.equal(info.quantityStock.quantity, 0); assert.equal(info.enabled, true); assert.equal(info.available, false);
  assert.equal((await call(`/dashboard/orders/${third.data.order.id}`, { status: 'cancelled' }, staff, 'PATCH')).status, 200);
  assert.equal(product(await call('/dashboard/catalog', null, staff)).quantityStock.quantity, 0);
  assert.equal((await quantity('drink-coca', 5, 1)).status, 409); // stale before the two sales
  assert.equal((await quantity('drink-coca', 5, 3)).status, 200);
  await call('/dashboard/catalog/drink-coca', { available: false }, staff, 'PATCH');
  info = product(await quantity('drink-coca', null, 4));
  assert.equal(info.enabled, false); assert.equal(info.available, false); assert.equal(info.quantityStock.tracked, false);
  const db = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(db.orders.length, 3); assert.deepEqual(db.reservations[0], reservation);
  assert.equal(db.customers[0].name, customer.name); assert.equal(db.customers[0].points, 620);
  const stock = JSON.parse(await fs.readFile(path.join(dir, 'product-stock.json'), 'utf8'));
  const snapshot = { database: db, stock };
  assert.deepEqual((await decodeBackup(await encodeBackup(snapshot))).data, snapshot);
});

test('quantity HTTP: a delayed bank confirmation is saved once after expiry even when the last article was sold', { timeout: 30000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-quantity-late-'));
  const file = path.join(dir, 'data.json'), providerFile = path.join(dir, 'sumup.json');
  const customer = { id: 'quantity-late-fictional', name: 'Client fictif', phone: '+33600000000', points: 650 };
  const reservation = { id: 'table-preserved', status: 'confirmed', serviceDate: '2027-01-12', slot: '19:00' };
  const late = { id: 'late-order', number: 900, customerId: customer.id, customerName: customer.name,
    items: [{ productId: 'drink-coca', name: 'Coca', quantity: 1, options: [], unitPrice: 1.8, total: 1.8 }],
    subtotal: 1.8, discount: 0, total: 1.8, loyaltyBasePoints: 0, method: 'pickup', status: 'awaiting_payment', createdAt: new Date(Date.now() - 3600000).toISOString(),
    payment: { provider: 'sumup', status: 'EXPIRED', checkoutId: 'fixture-checkout', checkoutReference: 'fixture-reference', merchantCode: 'TEST' } };
  const quantityStock = { version: 1, quantities: { 'drink-coca': { quantity: 0, revision: 2 } }, orders: {
    [late.id]: { status: 'released', units: { 'drink-coca': 1 }, releasedAt: new Date().toISOString() }
  } };
  await fs.writeFile(file, JSON.stringify({ customers: [customer], orders: [late], reservations: [reservation], nextOrderNumber: 901, quantityStock }));
  await fs.writeFile(providerFile, JSON.stringify({ checkouts: { 'fixture-checkout': { id: 'fixture-checkout', checkout_reference: 'fixture-reference', amount: 1.8, currency: 'EUR', merchant_code: 'TEST', status: 'PAID' } } }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/sumup-provider.cjs'), path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file, FAKE_SUMUP_FILE: providerFile, SESSION_SECRET: 'quantity-late-test', RESTAURANT_DASHBOARD_PASSWORD: 'quantity-late-test', SUMUP_API_KEY: 'FAKE', SUMUP_MERCHANT_CODE: 'TEST', SUMUP_RETURN_URL: 'https://example.invalid/return', SUMUP_REDIRECT_URL: 'https://example.invalid/app' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let out = '', err = '';
    child.stderr.on('data', c => { err += c; });
    child.stdout.on('data', c => { out += c; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve(`http://127.0.0.1:${m[1]}/api`); });
    child.once('error', reject); child.once('exit', () => reject(Error(err)));
  });
  const token = createCustomerSession(customer.id, 'quantity-late-test');
  const call = async (route, body, auth = token, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  };
  const verified = await call(`/payments/sumup-checkout/${late.id}`);
  assert.equal(verified.status, 200, JSON.stringify(verified));
  assert.equal(verified.data.payment.status, 'PAID');
  const callbacks = await Promise.all([call('/payments/sumup-return', { id: 'fixture-checkout' }, ''), call('/payments/sumup-return', { id: 'fixture-checkout' }, '')]);
  assert.deepEqual(callbacks.map(r => r.status), [204, 204]);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.orders[0].payment.status, 'PAID'); assert.equal(saved.orders[0].status, 'confirmed');
  assert.equal(saved.quantityStock.quantities['drink-coca'].quantity, 0);
  assert.equal(saved.quantityStock.quantities['drink-coca'].revision, 3);
  assert.equal(saved.quantityStock.orders[late.id].shortages['drink-coca'].quantity, 1);
  assert.equal(saved.customers[0].points, 650); assert.equal(saved.customers[0].name, customer.name);
  assert.deepEqual(saved.reservations[0], reservation);
  const staff = (await call('/dashboard/auth/login', { password: 'quantity-late-test' }, '')).data.token;
  const dashboard = await call('/dashboard/catalog', null, staff);
  assert.equal(dashboard.data.products.find(p => p.id === 'drink-coca').quantityStock.shortage, 1);
  const visible = (await call('/catalog')).data.products.find(p => p.id === 'drink-coca');
  assert.equal(visible.available, false); assert.equal(visible.quantityStock, undefined);
  const calls = (await fs.readFile(path.join(dir, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
  const backup = (await call('/dashboard/backups', {}, staff)).data.copies[0];
  const response = await fetch(`${base}/dashboard/backups/${backup.id}`, { headers: { Authorization: `Bearer ${staff}` } });
  const restored = await decodeBackup(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(restored.data.database.quantityStock, saved.quantityStock);
});
