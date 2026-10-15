const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { defaultContest } = require('./referral-contest');
test('Quinzaines HTTP : accès restaurant, lecture sans migration, zéro tirage ni donnée de contact exportée', { timeout: 15000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-periods-http-'));
  const file = path.join(directory, 'data.json');
  const original = JSON.stringify({ customers: [{ id: 'fixture-account', name: 'Client fictif', phone: 'DO-NOT-EXPORT-PHONE', address: 'DO-NOT-EXPORT-ADDRESS', points: 400 }],
    orders: [], wheelSpins: [{ id: 'wheel-fixture', customerId: 'fixture-account', pointsAdded: 60 }], nextOrderNumber: 1,
    referralContest: { ...defaultContest(), status: 'published', revision: 1, startDate: '2026-10-15', startTime: '12:00', endDate: '2026-12-31', rules: 'Fixture only', entries: [{ customerId: 'fixture-account', alias: 'Participant A', phoneHash: 'DO-NOT-EXPORT-HASH', joinedAt: '2026-10-15T10:00:00Z', shareEvents: [] }] } });
  await fs.writeFile(file, original);
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/contest-prize-clock.cjs'), path.join(__dirname, 'server.js')], { cwd: directory, env: { PATH: process.env.PATH, NODE_ENV: 'test', FAKE_CONTEST_PRIZE_CLOCK: 'true', PORT: '0', DATA_FILE_PATH: file, RESTAURANT_DASHBOARD_PASSWORD: 'periods-test-only', SESSION_SECRET: 'periods-secret-test' }, stdio: ['ignore','pipe','pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { let output = '', errors = ''; child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0] + '/api'); }); child.stderr.on('data', chunk => { errors += chunk; }); child.on('error', reject); child.on('exit', () => reject(Error(errors || 'Fixture stopped'))); });
  const request = (route, token = '', method = 'GET', body) => fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const token of ['', createCustomerSession('fixture-account', 'periods-secret-test'), 'review.invalid']) assert.equal((await request('/dashboard/contest/periods', token)).status, 401);
  const token = (await (await request('/dashboard/auth/login', '', 'POST', { password: 'periods-test-only' })).json()).token;
  const response = await request('/dashboard/contest/periods?period=1', token);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json(); assert.equal(result.total, 1); assert.equal(result.participants[0].chances, 1); assert.equal(result.exportReady, true);
  for (const privateValue of ['DO-NOT-EXPORT-PHONE','DO-NOT-EXPORT-ADDRESS','DO-NOT-EXPORT-HASH']) assert(!JSON.stringify(result).includes(privateValue));
  for (const filter of ['period=6','period=0','period=x','period=1&chooseWinner=true','period=1&period=2']) assert.equal((await request('/dashboard/contest/periods?' + filter, token)).status, 400);
  for (const method of ['POST','PATCH','DELETE']) assert.equal((await request('/dashboard/contest/periods', token, method, {})).status, 405);
  assert.equal(await fs.readFile(file, 'utf8'), original, 'No migration, points, winner, customer, order or wheel mutation on reporting');
});
