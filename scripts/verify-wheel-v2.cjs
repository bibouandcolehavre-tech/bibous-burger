// Actual exported application, isolated local fake accounts and server policy.
// Every external request is intercepted: no real spin, payment, SMS or customer.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium, webkit } = require('/Users/nowar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const wheel = require('../server/wheel'), policy = require('../server/wheel-rewards-policy');
const root = path.resolve(__dirname, '../dist');
const out = path.resolve(__dirname, '../work/wheel-browser-20261015', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(out, { recursive: true });
const now = new Date('2026-10-15T18:00:00Z');
const report = { at: new Date().toISOString(), scope: 'Actual exported app; local fake accounts; all external traffic mocked', checks: [], unexpectedWrites: [] };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) return res.writeHead(403).end();
  if (!path.extname(file)) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
async function setup(browser, origin, viewport, options = {}) {
  const customer = { id: 'fictional-wheel', name: 'Client Fictif', firstName: 'Client', lastName: 'Fictif', points: 0, weeklyOrders: 0 };
  const db = { customers: [customer], orders: [{ id: 'fictional-paid-order', customerId: customer.id, subtotal: 45, discount: 0, total: 45,
    wheelEurosPerTurn: 15, status: 'confirmed', payment: { status: 'PAID', provider: 'sumup', paidAt: now.toISOString() } }], wheel: wheel.defaultWheel(), wheelSpins: [] };
  policy.activate(db, { rewardsVersion: 2, monthlyClassicEnabled: true, confirmation: 'ACTIVER LA ROUE 80' }, now);
  const context = await browser.newContext({ viewport });
  const observed = { db, requests: [], errors: [], reads: [] };
  let aborted = false, failedLoad = false;
  await context.addInitScript(() => localStorage.setItem('bibousCustomerSession', 'fictional-local-session'));
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method(), endpoint = url.pathname.replace(/^\/api/, '');
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    observed.reads.push(endpoint);
    let status = 200, body = { configured: false, status: 'inactive', products: [], options: {}, orders: [], reservations: [], claims: [], offers: [], prizes: [], gains: [], grants: [], vouchers: [] };
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      if (endpoint !== '/customer/wheel/spin') { report.unexpectedWrites.push(endpoint); return route.abort(); }
      const input = req.postDataJSON(); observed.requests.push(input);
      body = wheel.spinWheel(db, customer.id, { ...input, now, randomInt: () => options.classic ? 99 : 60 });
      if (options.ambiguousFailure && !aborted) { aborted = true; return route.abort('failed'); }
      await new Promise(resolve => setTimeout(resolve, 100));
    } else if (endpoint === '/auth/me') body = { customer };
    else if (endpoint === '/customer/crm') body = { preferences: { birthday: '', personalizedOffers: false }, offers: [] };
    else if (endpoint === '/customer/marketing-sms') body = { preferences: { accepted: false }, mobileSupported: true };
    else if (endpoint === '/customer/wheel') {
      if (options.failedLoad && !failedLoad) { failedLoad = true; status = 503; body = { error: 'Fictional unavailable state' }; }
      else body = wheel.customerWheelState(db, customer.id, now);
    } else if (endpoint === '/news') body = { items: [] };
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => observed.errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Continuer dans Bibou →', exact: true }).click();
  await page.getByRole('button', { name: 'Entrer dans l’application', exact: true }).click();
  if (options.club) await page.getByRole('button', { name: /Club Bibou.*Points, roue et gains/ }).click();
  else {
    await page.getByRole('button', { name: 'Mon compte', exact: true }).click();
    await page.getByText('Mes offres', { exact: true }).click();
  }
  if (options.failedLoad) {
    await page.getByRole('button', { name: 'Réessayer d’afficher la roue', exact: true }).click();
  }
  try { await page.getByTestId('wheel-remaining-counter').getByText('3 tours restants', { exact: true }).waitFor({ timeout: 12000 }); }
  catch (error) {
    report.lastPage = { body: await page.locator('body').innerText(), errors: observed.errors, reads: observed.reads };
    await page.screenshot({ path: path.join(out, 'setup-failure.png'), fullPage: true }); throw error;
  }
  return { context, page, observed };
}
async function checkLayout(page, viewport) {
  const frame = page.getByTestId('wheel-large-display');
  await frame.scrollIntoViewIfNeeded();
  const box = await frame.boundingBox(), svg = await frame.locator('svg').boundingBox();
  assert(box.x >= 0 && box.x + box.width <= viewport.width + 1, 'Wheel fits the screen');
  assert(svg.width >= Math.min(viewport.width - 120, 220), 'Wheel is not undersized');
  if (viewport.width >= 390) assert(svg.width > 270, 'Larger wheel on modern phones');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  return { width: svg.width, viewport };
}
async function play(page, remaining) {
  const button = page.getByRole('button', { name: 'Tourner la roue maintenant', exact: true });
  await button.scrollIntoViewIfNeeded();
  // Two taps in the same event turn: the synchronous lock must admit just one.
  await button.evaluate(element => { element.click(); element.click(); });
  const expected = `${remaining} tour${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''}`;
  await page.getByTestId('wheel-remaining-counter').getByText(expected, { exact: true }).waitFor();
}
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const [engine, launcher, launch] of [['chrome', chromium, { channel: 'chrome' }], ['webkit', webkit, {}]]) {
    const browser = await launcher.launch({ headless: true, ...launch });
    try {
      for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 900 }]) {
        const { page, context, observed } = await setup(browser, origin, viewport, { club: viewport.width === 390 });
        const layout = await checkLayout(page, viewport);
        await page.screenshot({ path: path.join(out, engine + '-' + viewport.width + '-three.png') });
        for (const remaining of [2, 1, 0]) {
          await play(page, remaining);
          assert.equal(observed.db.wheelSpins.length, 3 - remaining);
          assert.equal(observed.requests.length, 3 - remaining);
        }
        await page.getByText('Tous tes tours ont été joués.', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Tourner la roue maintenant', exact: true }).count(), 0);
        assert.equal(await page.getByTestId('wheel-large-display').count(), 1, 'Last wheel and result stay visible');
        assert.deepEqual(observed.errors, []);
        await page.getByRole('button', { name: 'Voir les règles de la roue ›', exact: true }).click();
        await page.getByRole('button', { name: 'Fermer les règles', exact: true }).waitFor();
        assert.match(await page.locator('body').innerText(), /80 % de chances/);
        await page.getByRole('button', { name: 'Fermer les règles', exact: true }).click();
        await page.screenshot({ path: path.join(out, engine + '-' + viewport.width + '-zero.png') });
        report.checks.push({ engine, scenario: 'Actual shared wheel fits; 3→2→1→0; double taps; final result; rules', ...layout, result: 'pass' });
        await context.close();
      }
      const retry = await setup(browser, origin, { width: 390, height: 844 }, { ambiguousFailure: true, failedLoad: true });
      await retry.page.getByRole('button', { name: 'Tourner la roue maintenant', exact: true }).click();
      await retry.page.getByText('Failed to fetch', { exact: true }).or(retry.page.getByText(/Load failed|Une erreur|réessai|Réessaie/i)).first().waitFor();
      assert.equal(retry.observed.db.wheelSpins.length, 1);
      await play(retry.page, 2);
      assert.equal(retry.observed.requests.length, 2);
      assert.deepEqual(retry.observed.requests[0], retry.observed.requests[1], 'Retry retains both request ID and source');
      assert.equal(retry.observed.db.wheelSpins.length, 1, 'Lost response does not spend another spin');
      report.checks.push({ engine, scenario: 'Initial outage retries; response lost after award returns the same result without double spending', result: 'pass' });
      await retry.context.close();
      const classic = await setup(browser, origin, { width: 390, height: 844 }, { classic: true });
      await play(classic.page, 2);
      await classic.page.getByText('Le Classique du mois offert !', { exact: true }).first().waitFor();
      assert.equal(classic.observed.db.merchantPromotions.filter(item => item.type === 'free_classic').length, 1);
      assert.match(await classic.page.locator('body').innerText(), /sans minimum supplémentaire/);
      await classic.page.screenshot({ path: path.join(out, engine + '-classic.png') });
      report.checks.push({ engine, scenario: 'Immediate monthly Classic appears in real offers with personal code and correct redemption conditions', result: 'pass' });
      await classic.context.close();
    } finally { await browser.close(); }
  }
  assert.deepEqual(report.unexpectedWrites, []); report.result = 'passed';
}
run().catch(error => { report.result = 'failed'; report.error = error.stack; process.exitCode = 1; }).finally(() => {
  server.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, evidence: out }, null, 2));
});
