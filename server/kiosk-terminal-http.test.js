const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { prepareTerminalIntent } = require('./kiosk-terminal-payment');
test('terminal HTTP requires device and owner, persists one launch, refuses delivery', { timeout: 20000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-terminal-http-'));
  const file = path.join(dir, 'data.json');
  const customer = { id: 'fictional-owner', name: 'Camille Test', phone: '+33600000000', points: 0 };
  const order = { id: 'fictional-order', customerId: customer.id, number: 1, method: 'pickup', status: 'awaiting_payment', total: 10 };
  prepareTerminalIntent(order, 'FAKE_MERCHANT');
  const delivery = { ...order, id: 'fictional-delivery', method: 'delivery', payment: { ...order.payment } };
  await fs.writeFile(file, JSON.stringify({ customers: [customer], orders: [order, delivery], nextOrderNumber: 3 }));
  const secret = 'fictional-device-secret-long-enough-for-tests';
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file,
      SESSION_SECRET: 'fictional-session', SUMUP_API_KEY: 'fictional-no-network', SUMUP_MERCHANT_CODE: 'FAKE_MERCHANT',
      KIOSK_TERMINAL_ENABLED: 'true', KIOSK_TERMINAL_DEVICE_SECRET: secret,
      RESTAURANT_DASHBOARD_PASSWORD: 'fictional-password', SUMUP_KIOSK_AFFILIATE_KEY: 'sup_afk_fictional' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) resolve(`http://127.0.0.1:${match[1]}`); });
    child.once('exit', code => reject(new Error(`${code}: ${errors}`)));
  });
  const token = createCustomerSession(customer.id, 'fictional-session');
  const deniedConfig = await fetch(`${base}/api/kiosk/terminal/config`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(deniedConfig.status, 401);
  const login = await fetch(`${base}/api/dashboard/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'fictional-password' }) });
  const operatorToken = (await login.json()).token;
  const configResponse = await fetch(`${base}/api/kiosk/terminal/config`, { headers: { Authorization: `Bearer ${operatorToken}` } });
  assert.equal(configResponse.status, 200);
  assert.equal(configResponse.headers.get('cache-control'), 'no-store');
  const config = await configResponse.json();
  assert.equal(config.deviceToken, secret);
  assert.equal(config.apiKey, undefined);
  const request = async (headers, orderId = order.id) => {
    const response = await fetch(`${base}/api/kiosk/terminal/prepare`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ orderId }) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request({ Authorization: `Bearer ${token}` })).status, 403);
  assert.equal((await request({ 'x-bibou-kiosk-token': secret })).status, 401);
  const headers = { Authorization: `Bearer ${token}`, 'x-bibou-kiosk-token': secret };
  const results = await Promise.all([request(headers), request(headers)]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  assert.equal(results.filter(r => r.data.payment.canLaunch).length, 1);
  assert.equal((await request(headers)).data.payment.canLaunch, false);
  assert.equal((await request(headers, delivery.id)).status, 409);
  const stored = JSON.parse(await fs.readFile(file, 'utf8')).orders.find(o => o.id === order.id);
  assert.ok(stored.payment.launchClaimedAt);
  assert.equal(stored.payment.status, 'PENDING');
});
