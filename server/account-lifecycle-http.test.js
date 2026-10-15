const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { ensureAllReferralCodes, applyReferralCode, grantReferralReward } = require('./referrals');
const contest = require('./referral-contest'), preset = require('../restaurant-dashboard/contest-launch-20261015.json');

test('cycle compte HTTP : Android/iPhone/web, suppression, parrainage, anniversaire et annulation sans fournisseur réel', { timeout: 30000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-lifecycle-http-')), file = path.join(dir, 'data.json'), bank = path.join(dir, 'bank.json');
  const secret = 'fictitious-lifecycle-http', stamp = '2026-11-12T10:00:00Z', now = new Date(stamp);
  const customer = (id, digit) => ({ id, firstName: 'Client', lastName: 'Fictif', name: 'Client Fictif', phone: '+3360000000' + digit,
    verifiedPhone: '+3360000000' + digit, createdAt: '2025-01-01T12:00:00Z', firstPhoneVerifiedAt: '2025-01-01T12:00:00Z', phoneVerifiedAt: stamp, points: 0, welcomeReward: { status: 'used', usedOrderId: 'old-paid-' + id } });
  const sponsor = customer('sponsor', 9), friends = [0, 1, 2].map(i => customer('friend-' + i, i)), birthday = customer('birthday', 4);
  const db = { customers: [sponsor, ...friends, birthday], orders: [], nextCustomerId: 20, nextOrderNumber: 100,
    referralContest: { ...contest.defaultContest(), ...preset, status: 'published', revision: 3 },
    crm: { offers: [{ id: 'birthday-used', customerId: birthday.id, ruleId: 'birthday', eventKey: 'birthday:2026' }] } };
  ensureAllReferralCodes(db);
  for (const friend of friends) {
    applyReferralCode(db, friend, sponsor.referralCode, now);
    const order = { id: 'old-paid-' + friend.id, number: db.nextOrderNumber++, customerId: friend.id, status: 'confirmed', createdAt: stamp,
      total: 20, subtotal: 20, welcomeRewardApplied: true, payment: { status: 'PAID', provider: 'sumup', paidAt: stamp } };
    db.orders.push(order); grantReferralReward(order, db, now);
  }
  db.orders.push({ id: 'old-paid-birthday', number: 99, customerId: birthday.id, status: 'confirmed', createdAt: '2026-11-01T10:00:00Z',
    crmOfferId: 'birthday-used', crmRuleId: 'birthday', total: 17, subtotal: 20, payment: { status: 'PAID', provider: 'sumup', paidAt: '2026-11-01T10:00:00Z' } });
  await fs.writeFile(file, JSON.stringify(db)); await fs.writeFile(bank, JSON.stringify({ checkouts: {} }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/contest-prize-clock.cjs'), '--require', path.join(__dirname, 'test-fixtures/lifecycle-providers.cjs'), path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', FAKE_CONTEST_PRIZE_CLOCK: 'true', LISTEN_HOST: '127.0.0.1', PORT: '0',
      DATA_FILE_PATH: file, FAKE_SUMUP_FILE: bank, SESSION_SECRET: secret, RESTAURANT_DASHBOARD_PASSWORD: 'fixture-only',
      TWILIO_ACCOUNT_SID: 'FAKE', TWILIO_AUTH_TOKEN: 'FAKE', TWILIO_VERIFY_SERVICE_SID: 'FAKE', SUMUP_API_KEY: 'FAKE', SUMUP_MERCHANT_CODE: 'FAKE', SUMUP_REDIRECT_URL: 'https://example.invalid' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { let output = '', errors = ''; child.stderr.on('data', d => errors += d);
    child.stdout.on('data', d => { output += d; const m = output.match(/http:\/\/localhost:(\d+)/); if (m) resolve('http://127.0.0.1:' + m[1] + '/api'); }); child.once('error', reject); child.once('exit', () => reject(Error(errors))); });
  const req = async (route, method = 'GET', body, token, platform) => { const r = await fetch(base + route, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(platform ? { 'X-Bibou-Platform': platform } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, body: await r.json() }; };
  const session = id => createCustomerSession(id, secret, { now: +now });
  const admin = (await req('/dashboard/auth/login', 'POST', { password: 'fixture-only' })).body.token;
  const register = async phone => { const check = await req('/auth/sms/check', 'POST', { phone, code: '123456', registrationVersion: 2 });
    assert.equal(check.status, 200); const registered = await req('/auth/sms/register', 'POST', { registrationToken: check.body.registrationToken, firstName: 'Client', lastName: 'Fictif', referralBenefitsBlocked: false, birthdayBenefitUsedYears: [], welcomeReward: { status: 'available' } });
    assert.equal(registered.status, 200, JSON.stringify(registered.body)); return registered.body; };
  const join = { contestId: 'bibou-launch', revision: 3, acceptRules: true, confirmAdult: true, confirmRegion: true };
  assert.equal((await req('/customer/contest/join?contestApi=2', 'POST', join, session(sponsor.id))).status, 201);
  for (const [i, platform] of ['ios', 'android', 'web'].entries()) {
    const friend = friends[i]; assert.equal((await req('/customer/account', 'DELETE', undefined, session(friend.id))).status, 200);
    const recreated = await register(friend.phone);
    assert.equal(recreated.customer.referralBenefitsBlocked, true, platform);
    assert.equal(recreated.customer.welcomeReward.status, 'used', platform);
    assert.equal((await req('/customers/' + recreated.customer.id, 'PATCH', { sponsorCode: sponsor.referralCode }, recreated.token, platform)).status, 400);
    assert.equal((await req('/customer/contest/join?contestApi=2', 'POST', { ...join, sponsorCode: sponsor.referralCode }, recreated.token, platform)).status, 201);
    const priced = await req('/orders', 'POST', { customerId: recreated.customer.id, requestId: 'lifecycle-fictitious-' + platform,
      method: 'pickup', serviceDate: '2026-11-13', slot: '19:00', items: [{ productId: 'frites-maison', quantity: 1, selections: [] }], discountRate: 0.1 }, recreated.token, platform);
    assert.equal(priced.status, 201, JSON.stringify(priced.body)); assert.equal(priced.body.order.welcomeRewardApplied, false);
    assert.equal(priced.body.order.discountRate, 0);
    const cancelled = await req('/dashboard/orders/old-paid-' + friend.id, 'PATCH', { status: 'cancelled' }, admin);
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  }
  const ranking = await req('/customer/contest?contestApi=2', 'GET', undefined, session(sponsor.id));
  assert.equal(ranking.body.participation.referrals, 0); assert.equal(ranking.body.participation.score, 0);
  assert.equal((await req('/auth/me', 'GET', undefined, session(sponsor.id))).body.customer.points, 0);
  assert.equal((await req('/customer/account', 'DELETE', undefined, session(birthday.id))).status, 200);
  const recreatedBirthday = await register(birthday.phone);
  assert.deepEqual(recreatedBirthday.customer.birthdayBenefitUsedYears, ['2026']);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const result of [ranking, await req('/contest?contestApi=2'), await req('/auth/me', 'GET', undefined, recreatedBirthday.token)]) {
    assert(!JSON.stringify(result.body).includes(saved.welcomeRewardHistory[0].phoneHash));
  }
  assert.equal(saved.customers.find(c => c.id === sponsor.id).points, 0);
  assert.equal(Object.keys(JSON.parse(await fs.readFile(bank, 'utf8')).checkouts).length, 0, 'No bank checkout was necessary for these abuse tests');
});
