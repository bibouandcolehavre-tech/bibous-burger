const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('la file d’impression est réservée à un restaurant connecté et ne délivre pas deux fois la même commande', { timeout: 15000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-auto-print-'));
  const file = path.join(directory, 'data.json');
  const paidAt = new Date(Date.now() + 60000).toISOString();
  await fs.writeFile(file, JSON.stringify({ customers: [], reservations: [], orders: [{
    id: 'auto-one', number: 101, createdAt: paidAt, status: 'confirmed', method: 'pickup',
    payment: { status: 'PAID', paidAt }, items: [{ name: 'Menu', quantity: 1, price: 15 }], total: 15
  }] }));
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: directory, env: { PATH: process.env.PATH, PORT: '0', NODE_ENV: 'test', DATA_FILE_PATH: file,
      RESTAURANT_DASHBOARD_PASSWORD: 'dashboard-test-only', SESSION_SECRET: 'dashboard-session-test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { const match = String(chunk).match(/http:\/\/localhost:\d+/); if (match) resolve(`${match[0]}/api`); });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`API exited ${code}`)));
  });
  const post = async (route, token, body = {}) => {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await post('/dashboard/print-jobs/claim')).status, 401);
  const login = await post('/dashboard/auth/login', null, { password: 'dashboard-test-only' });
  assert.equal(login.status, 200);
  const token = login.data.token;
  const first = await post('/dashboard/print-jobs/claim', token);
  assert.equal(first.status, 200);
  assert.equal(first.data.job.order.id, 'auto-one');
  assert.equal((await post('/dashboard/print-jobs/claim', token)).data.job, null);
  assert.equal((await post('/dashboard/print-jobs/auto-one/result', token, { claimId: first.data.job.claimId, status: 'printed' })).status, 200);
  assert.equal((await post('/dashboard/print-jobs/claim', token)).data.job, null);
  const manual = await post('/dashboard/print-jobs/auto-one/manual', token);
  assert.equal(manual.status, 200);
  assert.notEqual(manual.data.job.claimId, first.data.job.claimId);
});
