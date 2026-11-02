const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { once } = require('node:events');

test('Wallet HTTP reuses SMS registration, isolates its cookie, authenticates QR access and preserves orders and points', { timeout: 20000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-wallet-http-')), file = path.join(dir, 'data.json');
  const original = { id: 'customer-1', firstName: 'Alice', lastName: 'Test', name: 'Alice Test', phone: '+33600000001', points: 345, weeklyOrders: 2 };
  await fs.writeFile(file, JSON.stringify({ customers: [original], orders: [{ id: 'preserved-order', customerId: original.id, status: 'delivered' }], nextCustomerId: 2, nextOrderNumber: 1 }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/sms-provider.cjs'), path.join(__dirname, 'server.js')], { cwd: dir,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file, SESSION_SECRET: 'wallet-test-only', WALLET_ENABLED: 'true', WALLET_PUBLIC_ORIGIN: 'https://bibou.example',
      WALLET_PREVIEW_ONLY: 'true', WALLET_PREVIEW_PHONE_HASHES: require('node:crypto').createHash('sha256').update('33600000001').digest('hex'),
      TWILIO_ACCOUNT_SID: 'FAKE', TWILIO_AUTH_TOKEN: 'FAKE', TWILIO_VERIFY_SERVICE_SID: 'FAKE', RESTAURANT_DASHBOARD_PASSWORD: 'synthetic-dashboard-only' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  let errors = ''; child.stderr.on('data', d => { errors += d; });
  const base = await new Promise((resolve, reject) => { child.stdout.on('data', d => { const m = String(d).match(/http:\/\/localhost:\d+/); if (m) resolve(m[0]); }); child.on('error', reject); child.on('exit', code => reject(Error(code + errors))); });
  const req = (route, { method = 'GET', body, token, cookie, origin = 'https://bibou.example' } = {}) => fetch(base + route, { method, headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const page = await req('/club'); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await req('/api/wallet/member')).status, 401); assert.equal((await req('/api/wallet/qr.png')).status, 401);
  assert.equal((await req('/api/wallet/google', { method: 'POST', origin: 'https://evil.example' })).status, 403, 'Missing/wrong origin is rejected before sensitive issuance');
  const login = await (await req('/api/auth/sms/check', { method: 'POST', body: { phone: '0600000001', code: '123456', registrationVersion: 2 } })).json();
  assert.equal(login.customer.id, 'customer-1'); assert.equal(login.customer.points, 345);
  assert.equal((await req('/api/wallet/session', { method: 'POST', token: login.token, origin: 'https://evil.example' })).status, 403);
  const session = await req('/api/wallet/session', { method: 'POST', token: login.token }); assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie').split(';')[0]; assert.match(session.headers.get('set-cookie'), /HttpOnly; SameSite=Strict.*Secure/);
  assert.equal(session.headers.get('access-control-allow-origin'), null);
  const member = await (await req('/api/wallet/member', { cookie })).json(); assert.equal(member.member.points, 345); assert.equal(member.member.firstName, 'Alice');
  assert.equal(member.member.phone, undefined); assert.equal(member.member.orders, undefined);
  const again = await (await req('/api/wallet/member', { cookie })).json(); assert.equal(again.member.memberId, member.member.memberId);
  assert.equal((await req('/api/auth/me', { cookie })).status, 401, 'Wallet cookie cannot read private customer data');
  assert.equal((await req('/api/auth/me', { token: member.member.barcode })).status, 401, 'Barcode cannot log in');
  assert.equal((await req('/api/wallet/member', { token: 'kiosk.forbidden' })).status, 403);
  const qr = await req('/api/wallet/qr.png', { cookie }); assert.equal(qr.status, 200); assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await qr.arrayBuffer()).slice(0, 4)], [137, 80, 78, 71]);
  assert.equal((await req('/api/wallet/apple.pkpass', { cookie })).status, 503, 'No unsigned Apple pass can be issued');
  assert.equal((await req('/api/wallet/google', { method: 'POST', cookie })).status, 503);
  assert.equal((await req('/api/dashboard/wallet/identify', { method: 'POST', body: { barcode: member.member.barcode } })).status, 401);
  const staff = await (await req('/api/dashboard/auth/login', { method: 'POST', body: { password: 'synthetic-dashboard-only' } })).json();
  assert.ok(staff.token);
  const beforeScan = JSON.parse(await fs.readFile(file, 'utf8'));
  const scan = await req('/api/dashboard/wallet/identify', { method: 'POST', token: staff.token, origin: 'https://restaurant.example', body: { barcode: member.member.barcode } });
  assert.equal(scan.status, 200); assert.equal(scan.headers.get('access-control-allow-origin'), '*');
  const identified = await scan.json(); assert.equal(identified.member.customerId, original.id); assert.equal(identified.member.points, 345);
  assert.equal(identified.permission, 'identify-only'); assert.equal(member.member.customerId, undefined);
  const afterScan = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(afterScan, beforeScan, 'Staff scanning does not mutate points, orders, memberships or rewards');
  for (const [barcode, token, expected] of [[member.member.barcode, login.token, 401], ['https://evil.example/', staff.token, 404], ['BIBOU:1:' + '0'.repeat(32), staff.token, 404]]) {
    const response = await req('/api/dashboard/wallet/identify', { method: 'POST', token, body: { barcode } });
    assert.equal(response.status, expected); assert.equal(response.headers.get('access-control-allow-origin'), '*');
  }
  const proof = await (await req('/api/auth/sms/check', { method: 'POST', body: { phone: '0600000002', code: '123456', registrationVersion: 2 } })).json();
  const signup = await (await req('/api/auth/sms/register', { method: 'POST', body: { registrationToken: proof.registrationToken, firstName: 'Camille', lastName: 'Test' } })).json();
  assert.equal((await req('/api/wallet/session', { method: 'POST', token: signup.token })).status, 403, 'Preview issuance rejects verified accounts outside the allowlist');
  assert.equal((await req('/api/wallet/member', { token: signup.token })).status, 403, 'Full customer token cannot bypass preview restriction');
  const db = JSON.parse(await fs.readFile(file, 'utf8')); assert.equal(db.customers.length, 2); assert.equal(db.customers[0].points, 345); assert.equal(db.orders[0].id, 'preserved-order');
  const logout = await req('/api/wallet/session', { method: 'DELETE', cookie }); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  const deleted = await req('/api/customer/account', { method: 'DELETE', token: login.token }); assert.equal(deleted.status, 200);
  assert.equal((await req('/api/wallet/member', { cookie })).status, 401, 'Deleted member cannot use a lingering cookie');
});
