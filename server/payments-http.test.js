const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');

test('Parcours de paiement HTTP isolé : confirmations, doublons, panne et annulation', { timeout: 20000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-payments-http-'));
  const databaseFile = path.join(directory, 'data.json');
  const providerFile = path.join(directory, 'sumup.json');
  const customer = { id: 'customer-test', name: 'Client fictif', phone: '+33600000000', points: 0, referredByCustomerId: 'sponsor-test', welcomeReward: { status: 'available' } };
  await fs.writeFile(databaseFile, JSON.stringify({ customers: [customer, { id: 'sponsor-test', name: 'Parrain fictif', points: 0 }], orders: [], nextOrderNumber: 1 }));
  await fs.writeFile(providerFile, JSON.stringify({ checkouts: {} }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/sumup-provider.cjs'), path.join(__dirname, 'server.js')], {
    cwd: directory, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: databaseFile, FAKE_SUMUP_FILE: providerFile, RESTAURANT_DASHBOARD_PASSWORD: 'test-only', SESSION_SECRET: 'test-secret', SUMUP_API_KEY: 'FAKE', SUMUP_MERCHANT_CODE: 'TEST', SUMUP_RETURN_URL: 'https://example.invalid/return', SUMUP_REDIRECT_URL: 'https://example.invalid/app' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    child.stderr.on('data', data => { errors += data; });
    child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) resolve(`${match[0]}/api`); });
    child.on('error', reject); child.on('exit', code => reject(new Error(`Test API exit ${code}: ${errors}`)));
  });
  const token = createCustomerSession(customer.id, 'test-secret');
  const request = async (route, { body, method = 'GET', auth = token } = {}) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: response.status === 204 ? {} : await response.json() };
  };
  const admin = (await request('/dashboard/auth/login', { method: 'POST', body: { password: 'test-only' } })).data.token;
  const db = async () => JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  const provider = async mutate => { const state = JSON.parse(await fs.readFile(providerFile, 'utf8')); mutate(state); await fs.writeFile(providerFile, JSON.stringify(state)); };
  const creations = async () => (await fs.readFile(path.join(directory, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse).filter(call => call.method === 'POST').length;
  const createOrder = async () => {
    const result = await request('/orders', { method: 'POST', body: { customerId: customer.id, method: 'pickup', serviceDate: parisDateKey(new Date(Date.now() + 86400000)), slot: '19:00 – 19:30', items: [{ productId: 'classique', quantity: 1, selections: [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'roquette' }, { groupId: 'sauces', id: 'mayo' }] }] } });
    assert.equal(result.status, 201, JSON.stringify(result.data)); return result.data.order;
  };
  const open = order => request('/payments/sumup-checkout', { method: 'POST', body: { orderId: order.id } });
  const verify = order => request(`/payments/sumup-checkout/${order.id}`);
  const callback = id => request('/payments/sumup-return', { method: 'POST', auth: '', body: { id, event_type: 'CHECKOUT_STATUS_CHANGED', status: 'PAID' } });
  const order = await createOrder();
  let checkoutId;

  await t.test('deux demandes simultanées ouvrent un seul paiement, pas de commande impayée en cuisine', async () => {
    const [first, second] = await Promise.all([open(order), open(order)]);
    assert.equal(first.status, 201); assert.equal(second.status, 201);
    checkoutId = first.data.checkoutId;
    assert.equal(checkoutId, second.data.checkoutId);
    assert.equal(await creations(), 1);
    assert.equal((await request('/dashboard/orders', { auth: admin })).data.orders.length, 0);
    assert.equal((await callback(checkoutId)).status, 204); // The body lies; provider says PENDING.
    assert.equal((await db()).customers[0].points, 0);
    assert.equal((await request(`/dashboard/orders/${order.id}`, { method: 'PATCH', auth: admin, body: { status: 'preparing' } })).status, 409);
  });

  await t.test('une panne SumUp n’est pas acquittée comme une confirmation réussie', async () => {
    await provider(state => { state.fail = true; });
    assert.equal((await callback(checkoutId)).status, 502);
    assert.equal((await verify(order)).status, 502);
    assert.equal((await db()).orders[0].status, 'awaiting_payment');
    await provider(state => { delete state.fail; state.checkouts[checkoutId].status = 'PAID'; });
  });

  await t.test('confirmations simultanées : points et parrainage crédités une seule fois', async () => {
    await Promise.all([callback(checkoutId), callback(checkoutId), verify(order)]);
    const saved = await db();
    assert.equal(saved.customers[0].points, 10);
    assert.equal(saved.customers[1].points, 100);
    assert.equal(saved.orders[0].status, 'confirmed');
    assert.equal(saved.customers[0].welcomeReward.status, 'used');
    assert.equal((await verify(order)).data.pointsAdded, 0);
    assert.equal((await request('/dashboard/orders', { auth: admin })).data.orders.length, 1);
  });

  await t.test('annulation et callback simultanés : aucun point ni cadeau ne revient', async () => {
    await provider(state => { state.delayMs = 80; });
    const results = await Promise.all([
      callback(checkoutId),
      request(`/dashboard/orders/${order.id}`, { method: 'PATCH', auth: admin, body: { status: 'cancelled' } }),
      request(`/customers/${customer.id}`, { method: 'PATCH', body: { name: 'Nom conservé' } })
    ]);
    assert.deepEqual(results.map(result => result.status), [204, 200, 200]);
    await provider(state => { delete state.delayMs; });
    await verify(order); await callback(checkoutId);
    const saved = await db();
    assert.equal(saved.customers[0].points, 0);
    assert.equal(saved.customers[1].points, 0);
    assert.equal(saved.customers[0].name, 'Nom conservé');
    assert.equal(saved.customers[0].welcomeReward.status, 'available');
    assert.equal(saved.orders[0].status, 'cancelled');
    assert.equal((await request(`/orders/${order.id}`, { method: 'PATCH', auth: admin, body: { status: 'preparing' } })).status, 409);
    assert.equal((await request('/dashboard/summary', { auth: admin })).data.serviceRevenue, 0);
  });

  await t.test('un montant SumUp différent ne valide jamais la commande', async () => {
    const next = await createOrder();
    const opened = await open(next);
    await provider(state => { state.checkouts[opened.data.checkoutId].amount = 0.01; state.checkouts[opened.data.checkoutId].status = 'PAID'; });
    assert.equal((await verify(next)).status, 502);
    assert.equal((await db()).orders.find(item => item.id === next.id).status, 'awaiting_payment');
  });

  await t.test('réponse de création perdue : récupération par référence sans deuxième paiement', async () => {
    const next = await createOrder();
    const before = await creations();
    await provider(state => { state.loseCreationResponse = true; });
    assert.equal((await open(next)).status, 502);
    await provider(state => { delete state.loseCreationResponse; });
    const recovered = await open(next);
    assert.equal(recovered.status, 201, JSON.stringify(recovered.data));
    assert.equal(await creations(), before + 1);
    assert.equal((await verify(next)).data.payment.status, 'PENDING');
  });

  await t.test('le webhook retrouve aussi une création dont la réponse a été perdue', async () => {
    const next = await createOrder();
    await provider(state => { state.loseCreationResponse = true; });
    await open(next);
    let id;
    await provider(state => { delete state.loseCreationResponse; id = Object.keys(state.checkouts).at(-1); state.checkouts[id].status = 'PAID'; });
    assert.equal((await callback(id)).status, 204);
    assert.equal((await db()).orders.find(item => item.id === next.id).status, 'confirmed');
  });

  await t.test('Bibou + réutilise le paiement en cours et ne prolonge qu’une fois', async () => {
    const first = await request('/bibou-plus/checkout', { method: 'POST' });
    const second = await request('/bibou-plus/checkout', { method: 'POST' });
    assert.equal(first.status, 201); assert.equal(second.status, 201);
    assert.equal(first.data.purchase.id, second.data.purchase.id);
    const id = first.data.purchase.payment.checkoutId;
    await provider(state => { state.checkouts[id].status = 'PAID'; });
    await callback(id);
    const expiry = (await db()).customers[0].bibouPlusExpiresAt;
    await callback(id);
    await request(`/bibou-plus/checkout/${first.data.purchase.id}`);
    assert.equal((await db()).customers[0].bibouPlusExpiresAt, expiry);
  });
});
