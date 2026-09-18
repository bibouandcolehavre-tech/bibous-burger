const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

test('API : démarrage sans données embarquées, réponses privées et limitation des connexions', { timeout: 15000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-security-'));
  const databaseFile = path.join(directory, 'data.json');
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { cwd: directory, env: { PATH: process.env.PATH, PORT: '0', DATA_FILE_PATH: databaseFile, RESTAURANT_DASHBOARD_PASSWORD: 'test-only', SESSION_SECRET: 'test-secret' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', value => { const match = String(value).match(/http:\/\/localhost:\d+/); if (match) resolve(match[0] + '/api'); });
    child.on('error', reject); child.on('exit', code => reject(new Error('API exited ' + code)));
  });
  const anonymous = await fetch(base + '/auth/me');
  assert.equal((await (await fetch(base + '/health')).json()).capabilities.paymentRecovery, 1);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('cache-control'), 'no-store');
  assert.equal(anonymous.headers.get('x-content-type-options'), 'nosniff');
  const saved = JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  assert.deepEqual(saved.customers, []);
  assert.deepEqual(saved.orders, []);
  const login = password => fetch(base + '/dashboard/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': Math.random().toString() }, body: JSON.stringify({ password }) });
  assert.equal((await login('test-only')).status, 200);
  for (let index = 0; index < 10; index++) assert.equal((await login('wrong')).status, 401);
  const limited = await login('wrong');
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.ok(Number(limited.headers.get('retry-after')) <= 300);
});
