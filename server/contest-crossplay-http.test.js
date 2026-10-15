const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { defaultContest } = require('./referral-contest');
test('Concours crossplay : iOS, Android et web utilisent une participation par compte, un classement et une liste communs', { timeout: 15000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-crossplay-http-')), file = path.join(directory, 'data.json');
  const platforms = ['ios','android','web'];
  const customers = platforms.map((id, index) => ({ id, name: 'Compte fictif ' + id, phone: '+3360000000' + (index + 1), verifiedPhone: '+3360000000' + (index + 1), phoneVerifiedAt: '2026-10-01T12:00:00Z', firstPhoneVerifiedAt: '2026-10-01T12:00:00Z', createdAt: '2026-10-01T12:00:00Z', points: 200, referralCode: 'BIBOU-' + id.toUpperCase() }));
  await fs.writeFile(file, JSON.stringify({ customers, orders: [], nextCustomerId: 10, nextOrderNumber: 1, referralContest: { ...defaultContest(), status: 'published', revision: 1, startDate: '2026-10-15', startTime: '12:00', endDate: '2026-12-31', rules: 'Règlement fictif réservé à ce test' } }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/contest-prize-clock.cjs'), path.join(__dirname, 'server.js')], { cwd: directory, env: { PATH: process.env.PATH, NODE_ENV: 'test', FAKE_CONTEST_PRIZE_CLOCK: 'true', PORT: '0', DATA_FILE_PATH: file, RESTAURANT_DASHBOARD_PASSWORD: 'crossplay-test-only', SESSION_SECRET: 'crossplay-secret-test' }, stdio: ['ignore','pipe','pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { let output = '', errors = ''; child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0] + '/api'); }); child.stderr.on('data', chunk => { errors += chunk; }); child.on('error', reject); child.on('exit', () => reject(Error(errors || 'Fixture stopped'))); });
  const request = (route, token = '', platform = '', method = 'GET', body) => fetch(base + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Bibou-Platform': platform }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const join = { contestId: 'bibou-launch', revision: 1, acceptRules: true, confirmAdult: true, confirmRegion: true };
  for (const platform of platforms) {
    const token = createCustomerSession(platform, 'crossplay-secret-test');
    assert.equal((await request('/customer/contest/join?contestApi=2', token, platform, 'POST', join)).status, 201);
    assert.equal((await request('/customer/contest/share?contestApi=2', token, platform, 'POST', { contestId: 'bibou-launch', revision: 1 })).status, 200);
  }
  const token = createCustomerSession('ios', 'crossplay-secret-test');
  const before = await fs.readFile(file, 'utf8');
  const previous = (await (await request('/customer/contest?contestApi=2', token, 'ios')).json()).participation;
  const reused = await (await request('/customer/contest/join?contestApi=2', token, 'web', 'POST', join)).json();
  assert.equal(reused.changed, false); assert.equal(reused.participation.alias, previous.alias); assert.equal(reused.participation.score, 1);
  for (const platform of platforms) {
    const state = await (await request('/customer/contest?contestApi=2', createCustomerSession(platform, 'crossplay-secret-test'), platform)).json();
    assert.equal(state.leaderboard.length, 3); assert.equal(state.participation.score, 1);
    assert.deepEqual(state.contest.scoring, { pointsPerEuro: 1, pointsPerVerifiedReferral: 20, pointsPerDailyShareAction: 1 });
  }
  const admin = (await (await request('/dashboard/auth/login', '', '', 'POST', { password: 'crossplay-test-only' })).json()).token;
  const report = await (await request('/dashboard/contest/periods?period=2', admin)).json();
  assert.deepEqual(report.participants.map(row => row.customerId).sort(), platforms.slice().sort());
  assert(report.participants.every(row => row.chances === 1 && row.actions.includes('registration') && row.actions.includes('share')));
  const stored = JSON.parse(await fs.readFile(file, 'utf8')); assert(stored.customers.every(customer => customer.points === 200));
  assert.equal(stored.referralContest.entries.length, 3); assert.equal(stored.orders.length, 0);
  assert.equal(await fs.readFile(file, 'utf8'), before, 'Reusing an account and consulting the list never creates another participation or points');
});
