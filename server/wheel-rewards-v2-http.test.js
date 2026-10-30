const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');
test('HTTP new wheel: owner-only activation, concurrent monthly cap, authentic coupons and free Classic checkout', { timeout: 20000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-wheel-v2-http-'));
  const file = path.join(dir, 'data.json'), roll = path.join(dir, 'roll.txt'), now = new Date();
  const customers = ['a','b'].map(id => ({ id, firstName: 'Client', lastName: 'Fictif', name: 'Client Fictif', phone: '+3360000000' + (id === 'a' ? '1' : '2'), points: 0 }));
  const orders = customers.map(c => ({ id: 'paid-' + c.id, customerId: c.id, subtotal: 45, total: 45, discount: 0, wheelEurosPerTurn: 15,
    status: 'confirmed', payment: { status: 'PAID', provider: 'sumup', paidAt: now.toISOString() } }));
  await fs.writeFile(file, JSON.stringify({ customers, orders, nextOrderNumber: 3, wheel: { ...require('./wheel').defaultWheel(),
    startDate: parisDateKey(new Date(+now - 86400000)), endDate: parisDateKey(new Date(+now + 86400000 * 60)) } }));
  await fs.writeFile(roll, '99');
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/wheel-rewards-roll.cjs'), path.join(__dirname, 'server.js')], {
    cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', LISTEN_HOST: '127.0.0.1', DATA_FILE_PATH: file,
      SESSION_SECRET: 'fictional-wheel-http-only', RESTAURANT_DASHBOARD_PASSWORD: 'fictional-owner-only', FICTITIOUS_WHEEL_ROLL_FILE: roll }, stdio: ['ignore','pipe','pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { let log = ''; child.stdout.on('data', d => { log += d; const match = log.match(/http:\/\/localhost:(\d+)/); if (match) resolve('http://127.0.0.1:' + match[1] + '/api'); }); let errors = ''; child.stderr.on('data', d => { errors += d; }); child.once('error', reject); child.once('exit', () => reject(Error('Fixture exited: ' + errors))); });
  const tokens = Object.fromEntries(customers.map(c => [c.id, createCustomerSession(c.id, 'fictional-wheel-http-only')]));
  const request = async (route, token = tokens.a, body, method = body ? 'POST' : 'GET') => {
    const r = await fetch(base + route, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  };
  const activation = { rewardsVersion: 2, monthlyClassicEnabled: true, allSpinsWin: true };
  assert.equal((await request('/dashboard/wheel-rewards', tokens.a, activation, 'PATCH')).status, 401);
  const admin = (await request('/dashboard/auth/login', '', { password: 'fictional-owner-only' })).body.token;
  assert.equal((await request('/dashboard/wheel-rewards', admin)).body.rewardsVersion, 1);
  const activated = await request('/dashboard/wheel-rewards', admin, activation, 'PATCH');
  assert.equal(activated.status, 200); assert.equal(activated.body.rewardsVersion, 2); assert.equal(activated.body.winRatePercent, 100);
  const state = (await request('/customer/wheel')).body; assert.equal(state.allSpinsWin, true);
  for (const rows of Object.values(state.segments)) assert(!rows.some(([id]) => id === 'none'));
  assert.equal((await request('/dashboard/wheel-rewards', admin, { rewardsVersion: 2, monthlyClassicEnabled: true, confirmation: 'ACTIVER LA ROUE 80' }, 'PATCH')).status, 400);
  assert.equal((await request('/dashboard/wheel-rewards', admin)).body.winRatePercent, 100);
  const attempts = await Promise.all(['a','b'].map(who => request('/customer/wheel/spin', tokens[who], { orderId: 'paid-' + who, requestId: 'fictitious-race-' + who })));
  assert(attempts.every(r => r.status === 200)); assert.equal(attempts.filter(r => r.body.spin.prizeId === 'classic').length, 1);
  const who = attempts[0].body.spin.prizeId === 'classic' ? 'a' : 'b', other = who === 'a' ? 'b' : 'a';
  const winning = attempts.find(r => r.body.spin.prizeId === 'classic').body.spin;
  assert.equal((await request('/customer/wheel', tokens[other])).body.monthlyClassic.available, false);
  const cart = { method: 'pickup', items: [{ productId: 'classique', quantity: 1, selections: [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'sans-crudites' }, { groupId: 'sauces', id: 'sans-sauce' }] }] };
  const code = { ...cart, code: winning.code };
  assert.equal((await request('/promotions/validate?promoApi=2', tokens[other], code)).status, 403);
  const preview = await request('/promotions/validate?promoApi=2', tokens[who], code);
  assert.equal(preview.status, 200, JSON.stringify(preview.body)); assert.equal(preview.body.promotion.type, 'free_classic'); assert.equal(preview.body.promotion.previewProductDiscount, 9.9);
  const legacy = await request('/promotions/validate', tokens[who], code);
  assert.equal(legacy.body.promotion.type, 'percent_order'); assert.equal(legacy.body.promotion.previewProductDiscount, 9.9);
  const redemption = await request('/orders', tokens[who], { ...cart, customerId: who, promoCode: winning.code,
    serviceDate: parisDateKey(new Date(+now + 86400000)), slot: '19:00', requestId: 'fictitious-classic-checkout' });
  assert.equal(redemption.status, 201, JSON.stringify(redemption.body));
  assert.equal(redemption.body.order.total, 0); assert.equal(redemption.body.order.payment.status, 'PAID'); assert.equal(redemption.body.order.payment.provider, 'promotion');
  assert.equal((await request('/promotions/validate?promoApi=2', tokens[who], code)).status, 409);
  const stored = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(stored.wheelClassicMonths.length, 1); assert.equal(stored.customers.find(c => c.id === who).points, 0);
  assert.equal(stored.orders.find(o => o.id === redemption.body.order.id).loyaltyPointsAdded, undefined);
});
