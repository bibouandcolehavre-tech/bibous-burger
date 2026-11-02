const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), { once } = require('node:events');
const core = require('./wallet/core'), { createWalletHttp } = require('./wallet/http');

test('Apple installation/update protocol is pass-scoped and updates the same card after points change and account deletion', async t => {
  const db = { customers: [{ id: 'test-a', firstName: 'Alice', phoneVerifiedAt: '2026-01-01', points: 10 }, { id: 'test-b', firstName: 'Bob', phoneVerifiedAt: '2026-01-01', points: 20 }] };
  db.customers.forEach(c => core.ensureMembership(db, c)); const [a, b] = db.customers;
  const config = { enabled: true, origin: 'https://bibou.example', apple: { enabled: true, passType: 'pass.com.bibousburgers.club' }, google: { enabled: false } };
  const handle = createWalletHttp({ config, secret: 'test-secret', transact: async (fn, save) => { const result = await fn(db); if (save) core.reconcile(db); return result; },
    readBody: async req => { let body = ''; for await (const part of req) body += part; return body ? JSON.parse(body) : {}; },
    authenticatedCustomer: req => req.headers.authorization === 'Bearer session-a' ? a : null, authenticatedDashboard: req => req.headers.authorization === 'Bearer restaurant-test',
    renderApple: pass => Buffer.from(JSON.stringify({ serial: pass.memberId, points: pass.points, voided: pass.voided })) });
  const server = http.createServer((req, res) => void handle(req, res, new URL(req.url, 'https://bibou.example'))); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close()); const base = `http://127.0.0.1:${server.address().port}`;
  const get = (route, { method = 'GET', auth, body } = {}) => fetch(base + route, { method, headers: { ...(auth ? { Authorization: auth } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const prefix = '/api/wallet/apple/v1', device = 'device-synthetic-123456789', type = config.apple.passType;
  const auth = 'ApplePass ' + core.passAuth(a.clubWallet.serial, 'test-secret'); const serial = a.clubWallet.serial;
  const registration = `${prefix}/devices/${device}/registrations/${type}/${serial}`, passRoute = `${prefix}/passes/${type}/${serial}`;
  assert.equal((await get(passRoute)).status, 401); assert.equal((await get(passRoute, { auth: 'Bearer session-a' })).status, 401);
  assert.equal((await get(`${prefix}/passes/${type}/${b.clubWallet.serial}`, { auth })).status, 401);
  assert.equal((await get(registration, { method: 'POST', auth, body: { pushToken: 'invalid' } })).status, 400);
  assert.equal((await get(registration, { method: 'POST', auth, body: { pushToken: 'a'.repeat(64) } })).status, 201);
  assert.equal((await get(registration, { method: 'POST', auth, body: { pushToken: 'a'.repeat(64) } })).status, 200);
  assert.equal(a.clubWallet.devices.length, 1); assert.equal(b.clubWallet.devices.length, 0);
  const first = await (await get(`${prefix}/devices/${device}/registrations/${type}`)).json(); assert.deepEqual(first.serialNumbers, [serial]);
  assert.equal((await get(`${prefix}/devices/${device}/registrations/${type}?passesUpdatedSince=${first.lastUpdated}`)).status, 204);
  a.points = 110; core.reconcile(db);
  const changed = await (await get(`${prefix}/devices/${device}/registrations/${type}?passesUpdatedSince=${first.lastUpdated}`)).json(); assert.deepEqual(changed.serialNumbers, [serial]);
  const latest = await (await get(passRoute, { auth })).json(); assert.equal(latest.points, 110); assert.equal(latest.serial, serial);
  const barcode = core.memberView(a).barcode;
  assert.equal((await get('/api/dashboard/wallet/identify', { method: 'POST', body: { barcode } })).status, 401);
  const identified = await (await get('/api/dashboard/wallet/identify', { method: 'POST', auth: 'Bearer restaurant-test', body: { barcode } })).json();
  assert.equal(identified.permission, 'identify-only'); assert.equal(identified.member.points, 110); assert.equal(identified.customer, undefined);
  core.removeCustomer(db, a); db.customers = [b];
  const revoked = await (await get(passRoute, { auth })).json(); assert.equal(revoked.voided, true); assert.equal(revoked.points, 0);
  assert.equal((await get('/api/dashboard/wallet/identify', { method: 'POST', auth: 'Bearer restaurant-test', body: { barcode } })).status, 404);
  assert.equal((await get(registration, { method: 'DELETE', auth })).status, 200);
  assert.equal((await get(`${prefix}/devices/${device}/registrations/${type}`)).status, 204);
});
