const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');

test('table + repas : réservation liée, invisible avant paiement et visible après confirmation', { timeout: 20000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-table-preorder-'));
  const databaseFile = path.join(directory, 'data.json');
  const providerFile = path.join(directory, 'sumup.json');
  const customer = { id: 'customer-table', name: 'Camille Test', phone: '+33600000000', points: 0 };
  await fs.writeFile(databaseFile, JSON.stringify({ customers: [customer], orders: [], reservations: [], nextOrderNumber: 1, nextReservationNumber: 1 }));
  await fs.writeFile(providerFile, JSON.stringify({ checkouts: {} }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/sumup-provider.cjs'), path.join(__dirname, 'server.js')], {
    cwd: directory,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', LISTEN_HOST: '127.0.0.1', DATA_FILE_PATH: databaseFile, FAKE_SUMUP_FILE: providerFile, RESTAURANT_DASHBOARD_PASSWORD: 'test-only', SESSION_SECRET: 'test-secret', GOOGLE_MAPS_API_KEY: 'FAKE', SUMUP_API_KEY: 'FAKE', SUMUP_MERCHANT_CODE: 'TEST', SUMUP_RETURN_URL: 'https://example.invalid/return', SUMUP_REDIRECT_URL: 'https://example.invalid/app' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    child.stderr.on('data', data => { errors += data; });
    child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) resolve(`${match[0]}/api`); });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Test API exit ${code}: ${errors}`)));
  });
  const token = createCustomerSession(customer.id, 'test-secret');
  const request = async (route, { body, method = 'GET', auth = token } = {}) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: response.status === 204 ? {} : await response.json() };
  };
  const admin = (await request('/dashboard/auth/login', { method: 'POST', body: { password: 'test-only' } })).data.token;
  const serviceDate = parisDateKey(new Date(Date.now() + 86400000));
  const body = { requestId: 'table-preorder-test-0001', customerId: customer.id, method: 'pickup', serviceDate, slot: '19:00', slotGrid: 20, tableReservation: { guests: 2, note: 'Chaise bébé' }, items: [{ productId: 'classique', quantity: 1, selections: [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'roquette' }, { groupId: 'sauces', id: 'mayo' }] }] };
  assert.equal((await request('/health')).data.capabilities.tablePreorders, 1);
  const created = await request('/orders', { method: 'POST', body });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const order = created.data.order;
  assert.equal(order.dineIn, true);
  assert.equal(order.tableGuests, 2);
  assert.equal(order.status, 'awaiting_payment');
  assert.equal((await request('/orders', { method: 'POST', body })).data.order.id, order.id);
  assert.equal((await request('/dashboard/orders', { auth: admin })).data.orders.length, 0);
  assert.equal((await request('/dashboard/reservations', { auth: admin })).data.reservations.length, 0);
  assert.equal((await request('/customer/reservations')).data.reservations.length, 0);
  const checkout = await request('/payments/sumup-checkout', { method: 'POST', body: { orderId: order.id } });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.data));
  assert.equal((await request('/dashboard/reservations', { auth: admin })).data.reservations.length, 0);
  const provider = JSON.parse(await fs.readFile(providerFile, 'utf8'));
  provider.checkouts[checkout.data.checkoutId].status = 'PAID';
  await fs.writeFile(providerFile, JSON.stringify(provider));
  const verified = await request(`/payments/sumup-checkout/${order.id}`);
  assert.equal(verified.status, 200);
  assert.equal(verified.data.order.status, 'confirmed');
  assert.equal((await request('/dashboard/orders', { auth: admin })).data.orders[0].dineIn, true);
  const table = (await request('/dashboard/reservations', { auth: admin })).data.reservations[0];
  assert.equal(table.status, 'confirmed');
  assert.equal(table.orderId, order.id);
  assert.equal(table.orderNumber, order.number);
  assert.equal((await request('/customer/reservations')).data.reservations[0].id, table.id);
  assert.equal((await request(`/dashboard/reservations/${table.id}`, { method: 'PATCH', auth: admin, body: { status: 'cancelled' } })).status, 409);
  assert.equal((await request(`/dashboard/orders/${order.id}`, { method: 'PATCH', auth: admin, body: { status: 'cancelled' } })).status, 200);
  assert.equal((await request('/dashboard/reservations', { auth: admin })).data.reservations[0].status, 'cancelled');
  const tableOnly = await request('/reservations', { method: 'POST', body: { name: 'Camille Test', phone: '+33600000000', guests: 2, serviceDate, slot: '19:00', slotGrid: 20, note: '' } });
  assert.equal(tableOnly.status, 201, JSON.stringify(tableOnly.data));
  assert.equal(tableOnly.data.reservation.status, 'pending');
  assert.equal((await request('/dashboard/reservations', { auth: admin })).data.reservations.some(item => item.id === tableOnly.data.reservation.id), true);
});
