const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-shapes-')), file = path.join(dir, 'data.json'), routeFile = path.join(dir, 'route.json');
  const customer = { id: 'fictitious-only', name: 'Client Fictif', phone: '+33600000000', points: 0, address: '1 rue fictive', postalCode: '76600', city: 'Le Havre' };
  await fs.writeFile(file, JSON.stringify({ customers: [customer], orders: [], nextOrderNumber: 1 })); await fs.writeFile(routeFile, '{}');
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/delivery-shape-provider.cjs'), path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', LISTEN_HOST: '127.0.0.1', DATA_FILE_PATH: file, FAKE_ROUTE_FILE: routeFile,
      SESSION_SECRET: 'fictitious-shape-test', RESTAURANT_DASHBOARD_PASSWORD: 'fictitious-only', GOOGLE_MAPS_API_KEY: 'FAKE' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { let output = ''; child.stdout.on('data', d => { output += d; const m = output.match(/http:\/\/localhost:(\d+)/); if (m) resolve('http://127.0.0.1:' + m[1] + '/api'); }); child.stderr.resume(); child.once('error', reject); child.once('exit', () => reject(Error('Isolated shape fixture stopped'))); });
  const token = createCustomerSession(customer.id, 'fictitious-shape-test');
  const request = async (route, body, method = 'POST') => { const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() }; };
  return { request, file, routeFile, customer };
}
test('HTTP : requêtes JSON nulles, tableaux et primitives ne provoquent ni panne ni mutation', { timeout: 20000 }, async t => {
  const fx = await fixture(t); await fx.request('/auth/me', undefined, 'GET'); const before = await fs.readFile(fx.file, 'utf8'), failures = [];
  for (const body of [null, [], 7, 'wrong', true, false]) for (const [route, method] of [
    ['/auth/sms/start', 'POST'], ['/auth/sms/check', 'POST'], ['/auth/sms/register', 'POST'], ['/dashboard/auth/login', 'POST'],
    ['/customers/' + fx.customer.id, 'PATCH'], ['/customer/crm', 'PATCH'], ['/customer/wheel/spin', 'POST'], ['/customer/contest/join', 'POST'],
    ['/orders', 'POST'], ['/delivery-quote', 'POST'], ['/reservations/deposit-checkout', 'POST'], ['/promotions/validate', 'POST']
  ]) { const result = await fx.request(route, body, method); if (result.status < 400 || result.status >= 500) failures.push({ route, input: body, status: result.status }); }
  assert.deepEqual(failures, []);
  assert.equal(await fs.readFile(fx.file, 'utf8'), before, 'Malformed inputs must never alter orders, customers or their benefits');
});
test('HTTP livraison : pas de distance inventée lorsque Google ne trouve aucun trajet ; seuils inchangés', { timeout: 20000 }, async t => {
  const fx = await fixture(t), address = { address: '1 rue fictive', postalCode: '76600', city: 'Le Havre' };
  for (const response of [{}, { routes: [] }, { routes: [{}] }, { routes: [{ distanceMeters: null }] }, { routes: [{ distanceMeters: -1 }] }, { routes: [{ distanceMeters: '1500' }] }]) {
    await fs.writeFile(fx.routeFile, JSON.stringify(response));
    assert.equal((await fx.request('/delivery-quote', address)).status, 422, JSON.stringify(response));
    const order = await fx.request('/orders', { customerId: fx.customer.id, requestId: 'unroutable-fictitious-order', method: 'delivery', serviceDate: parisDateKey(new Date(Date.now() + 86400000)), slot: '19:00', slotGrid: 20, items: [{ productId: 'frites-maison', quantity: 1, selections: [] }] });
    assert.equal(order.status, 422, JSON.stringify(order.body));
  }
  assert.deepEqual(JSON.parse(await fs.readFile(fx.file, 'utf8')).orders, []);
  for (const [distanceMeters, fee] of [[0, 3.99], [1500, 3.99], [1501, 4.99], [3000, 4.99], [3001, 5.99], [5000, 5.99], [5001, null]]) {
    await fs.writeFile(fx.routeFile, JSON.stringify({ routes: [{ distanceMeters }] })); const result = await fx.request('/delivery-quote', address);
    assert.equal(result.status, 200); assert.equal(result.body.deliveryFee, fee); assert.equal(result.body.withinZone, fee !== null);
  }
});
