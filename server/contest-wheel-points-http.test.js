const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { defaultContest } = require('./referral-contest');
const { createCustomerSession } = require('./customer-session');

test('HTTP bonus roue : compte et classement communs iPhone/Android/web, lecture sans crédit supplémentaire', { timeout: 20000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-wheel-ranking-http-'));
  const file = path.join(directory, 'data.json'), secret = 'fictitious-wheel-ranking-http-secret';
  const paidAt = '2026-11-12T09:00:00Z', awardedAt = '2026-11-12T09:15:00Z';
  const customer = { id: 'fictitious-c1', name: 'Compte FICTIF', points: 120, referralCode: 'BIBOU-FICTIF',
    phone: '+33600000000', verifiedPhone: '+33600000000', phoneVerifiedAt: paidAt, createdAt: '2026-01-01T12:00:00Z' };
  await fs.writeFile(file, JSON.stringify({ customers: [customer], orders: [{ id: 'fictitious-order', customerId: customer.id,
    total: 15, paidTotal: 15, subtotal: 15, discount: 0, wheelEurosPerTurn: 15, status: 'confirmed', payment: { status: 'PAID', provider: 'sumup', paidAt } }],
    wheelSpins: [{ id: 'fictitious-spin', requestId: 'fictitious-request-01', customerId: customer.id, orderId: 'fictitious-order',
      prizeId: 'points-20', pointsAdded: 20, label: '20 points Club Bibou', awardedAt }],
    referralContest: { ...defaultContest(), status: 'published', revision: 2, wheelPointsInRanking: true,
      startDate: '2026-10-15', startTime: '11:00', endDate: '2026-12-31', rules: 'Règlement FICTIF pour ce seul test local.',
      entries: [{ customerId: customer.id, alias: 'Participant FICTIF', joinedAt: paidAt, shareEvents: [] }] } }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/contest-prize-clock.cjs'), path.join(__dirname, 'server.js')], {
    cwd: directory, env: { PATH: process.env.PATH, NODE_ENV: 'test', FAKE_CONTEST_PRIZE_CLOCK: 'true', PORT: '0', DATA_FILE_PATH: file,
      SESSION_SECRET: secret, RESTAURANT_DASHBOARD_PASSWORD: 'fixture-only-not-a-real-password' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(directory, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0] + '/api'); });
    child.stderr.on('data', chunk => { errors += chunk; }); child.on('error', reject); child.on('exit', () => reject(Error(errors || 'Local fixture stopped')));
  });
  const request = (route, platform, token = createCustomerSession(customer.id, secret)) => fetch(base + route, { headers: { Authorization: `Bearer ${token}`, 'X-Bibou-Platform': platform } });
  assert.equal((await request('/customer/contest?contestApi=2', 'ios', '')).status, 401);
  const before = await fs.readFile(file, 'utf8');
  let shared;
  for (const platform of ['ios', 'android', 'web', 'ios']) {
    const response = await request('/customer/contest?contestApi=2', platform);
    assert.equal(response.status, 200); const state = await response.json();
    assert.equal(state.contest.status, 'active'); assert.equal(state.contest.scoring.pointsPerAwardedWheelPoint, 1);
    assert.match(state.contest.rules, /1 point réellement gagné à la roue/);
    assert.equal(state.participation.purchasePoints, 15); assert.equal(state.participation.wheelPoints, 20);
    assert.equal(state.participation.score, 35); assert.equal(state.participation.rank, 1);
    if (shared) assert.deepEqual(state, shared); else shared = state;
    const wheel = await (await request('/customer/wheel', platform)).json();
    assert.equal(wheel.played, 1); assert.equal(wheel.available, 0); assert.equal(wheel.prizes[0].prizeId, 'points-20');
    assert.match(wheel.rules, /chaque point réellement gagné à la roue pendant sa période ajoute aussi un point au classement/);
  }
  assert.equal(await fs.readFile(file, 'utf8'), before, 'Consulting all platforms must not mutate rewards or loyalty');
  const stored = JSON.parse(before); assert.equal(stored.customers[0].points, 120); assert.equal(stored.wheelSpins.length, 1);
});
