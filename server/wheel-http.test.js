const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');

test('roue web : uniquement après paiement, deux tours maximum et demande rejouable sans nouveau gain', { timeout: 20000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-wheel-http-'));
  const file = path.join(dir, 'data.json');
  const now = new Date();
  const owner = { id: 'customer-1', name: 'Camille Test', firstName: 'Camille', lastName: 'Test', phone: '+33600000000', points: 0 };
  const paid = { id: 'paid-1', customerId: owner.id, subtotal: 20, discount: 0, total: 20, status: 'confirmed',
    payment: { status: 'PAID', provider: 'sumup', paidAt: now.toISOString() } };
  const unpaid = { ...paid, id: 'unpaid-1', payment: { status: 'PENDING', provider: 'sumup' } };
  await fs.writeFile(file, JSON.stringify({ customers: [owner], orders: [paid, unpaid], nextOrderNumber: 2,
    wheel: { status: 'published', startDate: parisDateKey(new Date(now.getTime() - 86400000)),
      endDate: parisDateKey(new Date(now.getTime() + 86400000)), officialRules: 'Règlement de test local.', eurosPerTurn: 10 } }));
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file, SESSION_SECRET: 'wheel-test-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0] + '/api'); });
    child.on('error', reject); child.on('exit', () => reject(new Error(errors)));
  });
  const token = createCustomerSession(owner.id, 'wheel-test-secret');
  const request = async (route, method = 'GET', body, authorization = token) => {
    const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request('/customer/wheel', 'GET', undefined, '')).status, 401);
  assert.equal((await request('/customer/wheel')).data.orderTurns[0].available, 2);
  assert.equal((await request('/customer/wheel/spin', 'POST', { orderId: 'unpaid-1', requestId: 'wheel-http-attempt-01' })).status, 409);
  const first = await request('/customer/wheel/spin', 'POST', { orderId: 'paid-1', requestId: 'wheel-http-attempt-01' });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const replay = await request('/customer/wheel/spin', 'POST', { orderId: 'paid-1', requestId: 'wheel-http-attempt-01' });
  assert.equal(replay.data.spin.id, first.data.spin.id);
  assert.equal(replay.data.replayed, true);
  assert.equal((await request('/customer/wheel/spin', 'POST', { orderId: 'paid-1', requestId: 'wheel-http-attempt-02' })).status, 200);
  assert.equal((await request('/customer/wheel/spin', 'POST', { orderId: 'paid-1', requestId: 'wheel-http-attempt-03' })).status, 409);
  assert.equal((JSON.parse(await fs.readFile(file, 'utf8'))).wheelSpins.length, 2);
});
