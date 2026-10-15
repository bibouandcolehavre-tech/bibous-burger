const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');

test('HTTP : séparation des comptes et des rôles sur web, Android et iPhone', { timeout: 30000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-boundaries-')), file = path.join(dir, 'data.json');
  const owner = { id: 'owner-fictional', name: 'OWNER-PRIVATE-MARKER', phone: '+33600000001', points: 750 };
  const other = { id: 'other-fictional', name: 'Other Fictional', phone: '+33600000002', points: 0 };
  const order = { id: 'order-private', customerId: owner.id, customerName: owner.name, method: 'pickup', status: 'delivered',
    serviceDate: '2026-10-14', slot: '19:00', createdAt: '2026-10-14T17:00:00Z', total: 19.9, subtotal: 19.9,
    comment: 'ORDER-PRIVATE-MARKER', requestId: 'private-order-attempt-001',
    items: [{ productId: 'frites-maison', name: 'Frites maison', quantity: 1, price: 3.9, options: [] }],
    payment: { provider: 'sumup', status: 'PAID', checkoutId: 'fake-private', checkoutReference: 'PRIVATE-BANK-MARKER', paidAt: '2026-10-14T17:00:01Z' } };
  const reservation = { id: 'reservation-private', customerId: owner.id, customerName: owner.name, phone: owner.phone,
    serviceDate: '2027-01-12', slot: '19:00', status: 'pending', deposit: { amount: 40, attendanceStatus: 'unrecorded' },
    note: 'TABLE-PRIVATE-MARKER', requestId: 'private-table-attempt-001', payment: { status: 'PAID', checkoutReference: 'PRIVATE-TABLE-BANK-MARKER' } };
  const purchase = { id: 'purchase-private', customerId: owner.id, requestId: 'private-subscription-001', status: 'active',
    payment: { status: 'PAID', checkoutReference: 'PRIVATE-PLUS-BANK-MARKER' } };
  await fs.writeFile(file, JSON.stringify({ customers: [owner, other], orders: [order], reservations: [reservation], bibouPlusPurchases: [purchase],
    rewardClaims: [{ id: 'claim-private', customerId: owner.id, customerName: owner.name, status: 'active', code: 'PRIVATE-REWARD-MARKER' }], nextOrderNumber: 2 }));
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { cwd: dir, env: {
    PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', LISTEN_HOST: '127.0.0.1', DATA_FILE_PATH: file,
    SESSION_SECRET: 'fictitious-boundary-secret', RESTAURANT_DASHBOARD_PASSWORD: 'fictitious-staff-only'
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { let out = ''; child.stderr.resume(); child.stdout.on('data', d => {
    out += d; const m = out.match(/http:\/\/localhost:(\d+)/); if (m) resolve('http://127.0.0.1:' + m[1] + '/api');
  }); child.once('error', reject); child.once('exit', () => reject(Error('Isolated boundary API stopped'))); });
  const token = createCustomerSession(other.id, 'fictitious-boundary-secret');
  const expired = createCustomerSession(other.id, 'fictitious-boundary-secret', { now: Date.now() - 120000, durationMs: 1 });
  const request = async (route, method = 'GET', body, auth = token, platform = 'web') => {
    const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', 'X-Bibou-Platform': platform,
      ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await r.text(); assert.equal(r.headers.get('cache-control'), 'no-store');
    for (const marker of ['OWNER-PRIVATE-MARKER', 'ORDER-PRIVATE-MARKER', 'TABLE-PRIVATE-MARKER', 'PRIVATE-BANK-MARKER', 'PRIVATE-REWARD-MARKER'])
      assert(!text.includes(marker), 'Private marker leaked on ' + route);
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  for (const platform of ['web', 'android', 'ios']) {
    for (const auth of ['', token, expired, token + 'forged']) for (const [route, method = 'GET', body] of [
      ['/customers/' + owner.id], ['/customers/' + owner.id, 'PATCH', { name: 'Changed' }],
      ['/customer/payment-attempts/private-order-attempt-001'], ['/customer/payment-attempts/private-table-attempt-001'],
      ['/customer/payment-attempts/private-subscription-001'], ['/payments/sumup-checkout/order-private'],
      ['/payments/sumup-checkout', 'POST', { orderId: order.id }], ['/bibou-plus/checkout/purchase-private'],
      ['/reservations/deposit-checkout/reservation-private'], ['/customer/reservations/reservation-private/cancel', 'POST', {}],
      ['/customer/orders/order-private/ratings'], ['/customer/orders/order-private/ratings', 'POST', { ratings: [{ productId: 'frites-maison', stars: 1 }] }],
      ['/customer/orders/order-private/replacement-options'], ['/customer/orders/order-private/replacement-choice', 'POST', {}],
      ['/customer/orders/order-private/amendment', 'POST', { action: 'accept', revision: 1 }],
      ['/orders', 'PATCH', { status: 'cancelled' }], ['/orders/order-private', 'PATCH', { status: 'cancelled' }],
      ['/dashboard/orders'], ['/dashboard/customers'], ['/dashboard/reservations'], ['/dashboard/reward-claims'],
      ['/dashboard/backups'], ['/dashboard/summary'], ['/dashboard/kiosk/terminal/authorization', 'POST', {}],
      ['/dashboard/orders/order-private', 'PATCH', { status: 'cancelled' }],
      ['/dashboard/orders/order-private/refund', 'POST', { amount: 19.9 }],
      ['/dashboard/reservations/reservation-private', 'PATCH', { status: 'cancelled' }]
    ]) {
      const result = await request(route, method, body, auth, platform);
      assert([401, 403, 404, 405].includes(result.status), `${platform} ${method} ${route}: ${result.status}`);
    }
    for (const route of ['/customer/orders', '/customer/reservations', '/customer/rewards']) {
      assert.equal((await request(route, 'GET', undefined, '', platform)).status, 401);
      const result = await request(route, 'GET', undefined, token, platform);
      assert.equal(result.status, 200); assert.equal(Object.values(result.body)[0].length, 0);
    }
  }
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(saved.customers.find(c => c.id === owner.id).points, owner.points);
  assert.equal(saved.customers.find(c => c.id === owner.id).name, owner.name);
  assert.equal(saved.orders[0].status, 'delivered'); assert.equal(saved.orders[0].comment, order.comment);
  assert.equal(saved.reservations[0].status, 'pending'); assert.equal(saved.reservations[0].note, reservation.note);
  assert.equal(saved.bibouPlusPurchases[0].customerId, owner.id); assert.equal(saved.rewardClaims[0].status, 'active');
});
