const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { prepareDepositReservation } = require('./reservation-deposit');

test('HTTP : dimanche sans tables, ancien Android bloqué, livraison/retrait conservés et aucun paiement réel', { timeout: 20000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-sunday-tables-'));
  const file = path.join(dir, 'data.json'), providerFile = path.join(dir, 'sumup.json');
  const date = '2026-10-11', fixed = '2026-10-11T12:00:00Z';
  const customer = { id: 'fictional-customer', name: 'Client Fictif', phone: '+33600000000', points: 0,
    address: '1 rue fictive', postalCode: '76600', city: 'Le Havre' };
  const paid = { id: 'existing-paid', number: 1, customerId: customer.id, customerName: customer.name,
    phone: customer.phone, guests: 2, serviceDate: date, slot: '20:40', slotDurationMinutes: 20,
    status: 'confirmed', payment: { status: 'PAID' }, deposit: { amount: 20 } };
  const pendingInput = { requestId: 'fictional-old-sunday-deposit', name: customer.name, phone: customer.phone,
    guests: 2, serviceDate: date, slot: '19:20', note: '', depositTermsAccepted: true };
  const pending = prepareDepositReservation({ id: 'existing-unpaid', number: 2, customerId: customer.id,
    customerName: customer.name, phone: customer.phone, guests: 2, serviceDate: date, slot: pendingInput.slot,
    slotDurationMinutes: 20, createdAt: fixed }, pendingInput.requestId, pendingInput);
  pending.payment = { status: 'PENDING', checkoutReference: 'fictional-reference', checkoutId: 'fake-old', merchantCode: 'TEST' };
  await fs.writeFile(file, JSON.stringify({ customers: [customer], orders: [], reservations: [paid, pending],
    nextOrderNumber: 1, nextReservationNumber: 3, serviceSchedule: { dates: {
      [date]: { revision: 1, slotMinutes: 20, services: { reservation: { '19:00': true, '20:40': true } } },
    } } }));
  await fs.writeFile(providerFile, JSON.stringify({ checkouts: { 'fake-old': { id: 'fake-old',
    checkout_reference: 'fictional-reference', amount: 20, currency: 'EUR', merchant_code: 'TEST',
    status: 'PENDING', hosted_checkout_url: 'https://example.invalid/old-checkout' } } }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/sunday-promo-clock.cjs'),
    '--require', path.join(__dirname, 'test-fixtures/sumup-provider.cjs'), path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', LISTEN_HOST: '127.0.0.1', DATA_FILE_PATH: file,
      SESSION_SECRET: 'fictional-test-secret', RESTAURANT_DASHBOARD_PASSWORD: 'fictional-test-password',
      FAKE_SUNDAY_PROMO_CLOCK: 'true', FAKE_SUMUP_FILE: providerFile, GOOGLE_MAPS_API_KEY: 'FAKE',
      SUMUP_API_KEY: 'FAKE', SUMUP_MERCHANT_CODE: 'TEST', SUMUP_RETURN_URL: 'https://example.invalid/return',
      SUMUP_REDIRECT_URL: 'https://example.invalid/app' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    child.stderr.on('data', data => { errors += data; });
    child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) resolve(`http://127.0.0.1:${match[1]}/api`); });
    child.once('error', reject); child.once('exit', code => reject(Error(`${code}: ${errors}`)));
  });
  const token = createCustomerSession(customer.id, 'fictional-test-secret', { now: Date.parse(fixed) });
  const request = async (route, body, auth = token, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  for (const day of [date, '2026-10-18']) for (const grid of [15, 20]) {
    const tables = await request(`/reservation-availability?date=${day}&grid=${grid}`);
    assert.equal(tables.status, 200); assert.deepEqual(tables.data.slots, {});
    for (const method of ['pickup', 'delivery']) {
      const slots = (await request(`/availability?date=${day}&method=${method}&grid=${grid}`)).data.slots;
      assert.equal(Object.keys(slots).length, grid === 20 ? 6 : method === 'pickup' ? 8 : 4);
      assert.equal(Object.values(slots).some(slot => !slot.unavailable), true);
    }
  }
  assert.equal(Object.keys((await request('/reservation-availability?date=2026-10-12&grid=20')).data.slots).length, 15);
  for (const slotGrid of [15, 20]) {
    const rejected = await request('/reservations', { name: customer.name, guests: 2, serviceDate: date, slot: '19:00', slotGrid });
    assert.equal(rejected.status, 400); assert.match(rejected.data.error, /dimanche soir/);
  }
  const newDeposit = await request('/reservations/deposit-checkout', { ...pendingInput, requestId: 'fictional-new-sunday-deposit', slot: '19:00' });
  assert.equal(newDeposit.status, 400); assert.match(newDeposit.data.error, /dimanche soir/);
  const oldDeposit = await request('/reservations/deposit-checkout', pendingInput);
  assert.equal(oldDeposit.status, 409); assert.match(oldDeposit.data.error, /dimanche soir/);
  const order = { customerId: customer.id, method: 'pickup', serviceDate: date, slot: '19:00', slotGrid: 20,
    items: [{ productId: 'drink-coca', quantity: 1, selections: [] }] };
  const tableMeal = await request('/orders', { ...order, tableReservation: { guests: 2, note: '' } });
  assert.equal(tableMeal.status, 400); assert.match(tableMeal.data.error, /dimanche soir/);
  for (const method of ['pickup', 'delivery']) {
    const created = await request('/orders', { ...order, method, requestId: `fictional-sunday-${method}` });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.order.payment, undefined);
  }
  const admin = (await request('/dashboard/auth/login', { password: 'fictional-test-password' })).data.token;
  const state = (await request(`/dashboard/service-schedule?date=${date}`, undefined, admin)).data;
  assert.equal(state.services.reservation.find(row => row.slot === '19:00').open, false);
  const draft = { date, revision: state.revision, services: Object.fromEntries(Object.entries(state.services)
    .map(([method, rows]) => [method, Object.fromEntries(rows.map(row => [row.slot, row.open]))])) };
  draft.services.reservation['19:00'] = true;
  const reopen = await request('/dashboard/service-schedule', draft, admin, 'PATCH');
  assert.equal(reopen.status, 400); assert.match(reopen.data.error, /dimanche soir/);
  let saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.orders.length, 2); assert.equal(saved.reservations.length, 2);
  assert.deepEqual(saved.reservations[0], paid, 'la réservation déjà payée reste intacte');
  assert.equal(saved.serviceSchedule.dates[date].revision, 1);
  const provider = JSON.parse(await fs.readFile(providerFile, 'utf8'));
  assert.equal(Object.keys(provider.checkouts).length, 1, 'aucun nouveau paiement');
  provider.checkouts['fake-old'].status = 'PAID';
  await fs.writeFile(providerFile, JSON.stringify(provider));
  const reconciled = await request('/reservations/deposit-checkout', pendingInput);
  assert.equal(reconciled.status, 200, JSON.stringify(reconciled.data));
  assert.equal(reconciled.data.reservation.payment.status, 'PAID');
  assert.equal(reconciled.data.reservation.status, 'pending');
  saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.reservations.length, 2);
  const calls = (await fs.readFile(path.join(dir, 'calls.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(calls.every(call => call.method === 'GET'), true, 'seule la vérification du paiement existant est autorisée');
});
