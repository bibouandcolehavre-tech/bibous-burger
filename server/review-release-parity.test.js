const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process'), { once } = require('node:events');
const { createReviewSandbox } = require('./review-sandbox');
const { validateAndPriceOrderItems } = require('./catalog');
const privateCode = 'isolated-release-parity-test-code';
const accessHash = crypto.createHash('sha256').update(privateCode).digest('hex');
const NOW = Date.parse('2026-10-13T10:00:00Z');
const make = options => createReviewSandbox({ accessHash, now: () => NOW, ...options });
const request = (sandbox, route, token, body, method = body === undefined ? 'GET' : 'POST') => sandbox.handle({ route, token, method, readBody: async () => body });
const login = sandbox => request(sandbox, '/session', '', { accessCode: privateCode });
const burger = (id = 'classique', quantity = 1) => ({ productId: id, quantity, selections: [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'sans-crudites' }, { groupId: 'sauces', id: 'sans-sauce' }, ...(id.endsWith('-menu') ? [{ groupId: 'drink', id: 'coca' }] : [])] });
const orderInput = customerId => ({ customerId, requestId: 'isolated-parity-order-0001', items: [burger('classique', 2)], method: 'pickup', serviceDate: '2026-10-14', slot: '12:00' });

test('review release: contest join, rules, leaderboard and daily share are isolated and replay-safe', async () => {
  const sandbox = make(), { token } = await login(sandbox);
  const initial = await request(sandbox, '/customer/contest', token);
  assert.equal(initial.contest.status, 'active'); assert.equal(initial.needsPhoneVerification, false); assert.equal(initial.participation, null);
  const input = { contestId: initial.contest.id, revision: initial.contest.revision, acceptRules: true, confirmAdult: true, confirmRegion: true, acceptPrizeAlerts: true };
  await assert.rejects(request(sandbox, '/customer/contest/join', token, { ...input, confirmAdult: false }));
  const joined = await request(sandbox, '/customer/contest/join', token, input);
  assert.equal(joined.participation.purchasePoints, 13); // Missing drink + two delivery examples, not real sales.
  assert.equal(joined.participation.score, 13); assert.equal(joined.leaderboard.length, 1); assert.match(joined.contest.rules, /fictifs/);
  assert.equal(new URL(joined.participation.shareUrl).hostname, 'example.invalid');
  for (let i = 0; i < 2; i++) assert.equal((await request(sandbox, '/customer/contest/share', token, input)).participation.score, 14);
  assert.equal((await request(sandbox, '/auth/me', token)).customer.points, 1500);
  assert.equal(require('./referral-contest').publicContest({}, new Date(NOW)).status, 'inactive');
});

test('review release: different personal menu codes, real recipe pricing, quotas, no loyalty on gifted meals', async () => {
  const sandbox = make(), a = await login(sandbox), b = await login(sandbox);
  const gift = (await request(sandbox, '/customer/contest/prizes', a.token)).vouchers[0];
  const other = (await request(sandbox, '/customer/contest/prizes', b.token)).vouchers[0];
  assert.notEqual(gift.code, other.code); assert.equal(gift.remaining, 2); assert.match(gift.code, /^AMB-/);
  const input = { ...orderInput(a.customer.id), items: [burger('classique-menu')], promoCode: gift.code };
  const preview = await request(sandbox, '/promotions/validate', a.token, { code: gift.code, method: 'pickup', items: input.items });
  assert.equal(preview.promotion.sourceContestPrize, true);
  await assert.rejects(request(sandbox, '/promotions/validate', b.token, { code: gift.code, method: 'pickup', items: input.items }));
  const { order } = await request(sandbox, '/orders', a.token, input);
  assert.equal(order.subtotal, 14.9); assert.equal(order.total, 0);
  await request(sandbox, '/payments/sumup-checkout', a.token, { orderId: order.id });
  await request(sandbox, '/orders', a.token, input);
  const remaining = (await request(sandbox, '/customer/contest/prizes', a.token)).vouchers[0];
  assert.equal(remaining.remaining, 1);
  const customer = (await request(sandbox, '/auth/me', a.token)).customer;
  assert.equal(customer.points, 1500); assert.equal(customer.welcomeReward.status, 'available');
  await request(sandbox, '/customer/contest/prizes/alerts', a.token, { enabled: true }, 'PATCH');
  assert.equal((await request(sandbox, '/customer/contest/prizes', a.token)).grants[0].alertsEnabled, true);
  await assert.rejects(request(sandbox, '/orders', a.token, { ...input, requestId: 'isolated-too-many-menus', items: [burger('classique-menu', 2)] }));
});

test('review release: original naan prices and lunch-only choices can be previewed without publishing them', async () => {
  const sandbox = make(), { token, customer } = await login(sandbox), prior = process.env.CHEESE_NAANS_PUBLISHED;
  assert.notEqual(prior, 'true', 'Test uses the closed public preparation state');
  const rows = (await request(sandbox, '/catalog', token)).products.filter(p => p.category === 'naans');
  assert.equal(rows.length, 3); assert(rows.every(p => p.visible && p.published === false));
  const selections = [{ groupId: 'naan-format', id: 'menu' }, { groupId: 'naan-side', id: 'dessert' }, { groupId: 'naan-dessert', id: 'cookie' }, { groupId: 'drink', id: 'coca' }];
  const input = { ...orderInput(customer.id), items: [{ productId: 'naan-poulet', quantity: 1, selections }] };
  const { order } = await request(sandbox, '/orders', token, input);
  assert.equal(order.subtotal, 10.9); assert.equal(order.loyaltyBasePoints, 15);
  await assert.rejects(request(sandbox, '/orders', token, { ...input, requestId: 'isolated-naan-evening', slot: '19:00' }));
  assert.throws(() => validateAndPriceOrderItems(input.items, {}, { ...input, reviewMode: true, isolatedReview: true }, new Date(NOW)), /pas encore publiés/);
  assert.equal(process.env.CHEESE_NAANS_PUBLISHED, prior);
});

test('review release: ratings and wheel completion remain fictitious, repeat requests do not add votes or spins', async () => {
  const sandbox = make(), { token, customer } = await login(sandbox), { order } = await request(sandbox, '/orders', token, orderInput(customer.id));
  const ratingRoute = `/customer/orders/${order.id}/ratings`;
  await assert.rejects(request(sandbox, ratingRoute, token, { ratings: [{ productId: 'classique', stars: 5 }] }));
  const paid = await request(sandbox, '/payments/sumup-checkout', token, { orderId: order.id });
  assert.equal(paid.order.reviewMode, true); assert.equal(paid.order.status, 'delivered'); assert.equal(paid.checkoutUrl, undefined);
  assert.equal((await request(sandbox, ratingRoute, token)).eligible, true);
  for (let i = 0; i < 2; i++) await request(sandbox, ratingRoute, token, { ratings: [{ productId: 'classique', stars: 5 }] });
  const product = (await request(sandbox, '/catalog', token)).products.find(p => p.id === 'classique');
  assert.deepEqual(product.satisfaction, { count: 1, percent: 100, averageStars: 5 });
  assert.equal((await request(sandbox, '/customer/wheel', token)).available, 1);
  const spinInput = { orderId: order.id, requestId: 'isolated-parity-spin-0001' };
  const first = await request(sandbox, '/customer/wheel/spin', token, spinInput);
  const second = await request(sandbox, '/customer/wheel/spin', token, spinInput);
  assert.equal(first.spin.id, second.spin.id); assert.equal(second.state.available, 0);
  assert.deepEqual(second.state.stbTickets.awards, []);
  await assert.rejects(request(sandbox, '/customer/wheel/spin', token, { ...spinInput, randomInt: 0 }));
});

test('review release: unavailable-drink choices, identity editing and deletion never expose another session', async () => {
  const sandbox = make(), a = await login(sandbox), b = await login(sandbox), id = 'review-replacement-example';
  const options = await request(sandbox, `/customer/orders/${id}/replacement-options`, a.token);
  assert(options.choices[0].alternatives.every(p => p.id.startsWith('drink-') && p.id !== 'drink-coca'));
  const choice = { revision: 1, choices: [{ target: '0:product', productId: 'drink-perrier' }] };
  const changed = await request(sandbox, `/customer/orders/${id}/replacement-choice`, a.token, choice);
  assert.equal(changed.order.amendment.phase, 'submitted'); assert.equal(changed.order.items[0].productId, 'drink-coca');
  assert.equal((await request(sandbox, `/customer/orders/${id}/replacement-options`, b.token)).phase, 'choosing');
  await request(sandbox, `/customer/orders/${id}/amendment`, a.token, { revision: 1, decision: 'refuse' });
  assert.equal((await request(sandbox, '/customer/orders', a.token)).orders[0].status, 'cancelled');
  const saved = await request(sandbox, `/customers/${a.customer.id}`, a.token, { firstName: 'Camille', lastName: 'Test', address: 'Adresse fictive', postalCode: '76600', city: 'Le Havre', points: 0 }, 'PATCH');
  assert.equal(saved.customer.firstName, 'Camille'); assert.equal(saved.customer.points, 1500);
  await request(sandbox, '/customer/account', a.token, undefined, 'DELETE');
  await assert.rejects(request(sandbox, '/customer/contest/prizes', a.token));
  assert.equal((await request(sandbox, '/auth/me', b.token)).customer.name, 'Équipe de validation');
});

test('review release HTTP: complete valid reviewer journey keeps production database bytes identical', { timeout: 15000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-review-parity-http-')), file = path.join(dir, 'data.json');
  const original = JSON.stringify({ customers: [{ id: 'unrelated-fixture' }], orders: [], reservations: [], nextCustomerId: 2, nextOrderNumber: 1 });
  await fs.writeFile(file, original);
  const reviewModule = path.join(__dirname, 'review-sandbox.js'), serverModule = path.join(__dirname, 'server.js');
  // Override the constructor only inside this disposable child; committed private access remains unchanged.
  const bootstrap = `const m=require(${JSON.stringify(reviewModule)});const original=m.createReviewSandbox;m.createReviewSandbox=options=>original({...options,accessHash:${JSON.stringify(accessHash)}});require(${JSON.stringify(serverModule)});`;
  const child = spawn(process.execPath, ['-e', bootstrap], { cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', DATA_FILE_PATH: file, SESSION_SECRET: 'isolated-http-only' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit'); await fs.rm(dir, { recursive: true, force: true }); });
  const base = await new Promise((resolve, reject) => { child.stdout.on('data', value => { const match = String(value).match(/http:\/\/localhost:\d+/); if (match) resolve(match[0] + '/api'); }); child.on('error', reject); child.on('exit', code => reject(Error('Server exited ' + code))); });
  const http = async (route, token, body, method = body === undefined ? 'GET' : 'POST') => { const response = await fetch(base + '/review' + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); assert.equal(response.status, 200, route); assert.match(response.headers.get('cache-control'), /no-store/); return response.json(); };
  const session = await http('/session', '', { accessCode: privateCode });
  const catalog = await http('/catalog', session.token); assert(catalog.reviewMode);
  const gift = await http('/customer/contest/prizes', session.token); assert.equal(gift.vouchers.length, 1);
  const game = await http('/customer/contest', session.token); assert.equal(game.contest.status, 'active');
  await http('/customer/contest/join', session.token, { contestId: game.contest.id, revision: game.contest.revision, acceptRules: true, confirmAdult: true, confirmRegion: true });
  await http('/customer/contest/share', session.token, { contestId: game.contest.id, revision: game.contest.revision });
  assert.equal((await fetch(base + '/review/auth/sms/start', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token }, body: '{}' })).status, 404);
  const requested = orderInput(session.customer.id); requested.serviceDate = require('./availability').parisDateKey(new Date(Date.now() + 86400000)); requested.slot = '19:00';
  const created = await http('/orders', session.token, requested);
  await http('/payments/sumup-checkout', session.token, { orderId: created.order.id });
  await http(`/customer/orders/${created.order.id}/ratings`, session.token, { ratings: [{ productId: 'classique', stars: 4 }] });
  await http('/customer/account', session.token, undefined, 'DELETE');
  assert.equal(await fs.readFile(file, 'utf8'), original);
});
