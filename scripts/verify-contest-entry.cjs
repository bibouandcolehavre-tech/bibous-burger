// Isolated browser QA of the actual exported app. All external requests are mocked.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium, webkit } = require('/Users/nowar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../dist'), out = path.resolve(__dirname, '../work/contest-entry-release-20261015');
fs.mkdirSync(out, { recursive: true });
const report = { at: new Date().toISOString(), scope: 'Actual exported app; external traffic mocked; no real customer actions or messages', checks: [], unexpectedWrites: [] };
const contest = { id: 'bibou-launch', revision: 3, title: 'Les ambassadeurs Bibou', status: 'active', startDate: '2026-10-15', startTime: '11:00', endDate: '2026-12-31', firstPrize: '2 menus par mois pendant 12 mois (24 menus)', secondPrize: '1 menu par mois pendant 6 mois (6 menus)', thirdPrize: '2 menus en une seule commande', region: 'France métropolitaine', rules: 'Règlement fictif de test. Aucun vrai participant.', scoring: { pointsPerEuro: 1, pointsPerVerifiedReferral: 20, pointsPerDailyShareAction: 1, pointsPerAwardedWheelPoint: 1 } };
const participant = { code: 'FICTIF', alias: 'Client Fictif', rank: 1, score: 60, referrals: 1, sharePoints: 0, purchasePoints: 0, wheelPoints: 40, sharedToday: false, shareUrl: 'https://example.invalid/?contest=1&ref=FICTIF' };
const customer = { id: 'fictional', firstName: 'Client', lastName: 'Fictif', name: 'Client Fictif', points: 40, weeklyOrders: 0 };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) return res.writeHead(403).end();
  if (!path.extname(file)) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
async function makeContext(browser, origin, viewport, options = {}) {
  const context = await browser.newContext({ viewport }), state = { participation: options.joined ? participant : null, writes: [], instagram: [] };
  await context.addInitScript(({ signed }) => {
    if (signed) localStorage.setItem('bibousCustomerSession', 'fictional-local-session');
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
  }, { signed: options.signed });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (url.hostname.endsWith('instagram.com')) {
      state.instagram.push(url.href); return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Instagram simulé</p>' });
    }
    const endpoint = url.pathname.replace(/^\/api/, '');
    let body = { configured: false, status: 'inactive', products: [], options: {}, orders: [], reservations: [], claims: [], offers: [], prizes: [], gains: [], grants: [], vouchers: [] };
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      state.writes.push(endpoint);
      if (endpoint === '/auth/sms/start') body = { ok: true };
      else if (endpoint === '/auth/sms/check') body = { token: 'fictional-local-session', customer, isNewCustomer: true };
      else if (endpoint === '/customer/contest/join') {
        const data = request.postDataJSON();
        assert.equal(data.acceptRules, true); assert.equal(data.confirmAdult, true); assert.equal(data.confirmRegion, true); assert.equal(data.acceptPrizeAlerts, false);
        state.participation = participant; body = { contest, participation: participant, leaderboard: [] };
      } else if (endpoint === '/customer/contest/share') {
        state.participation = { ...participant, sharePoints: 1, score: 61, sharedToday: true }; body = { contest, participation: state.participation, leaderboard: [] };
      } else { report.unexpectedWrites.push(endpoint); return route.abort(); }
    } else if (endpoint === '/contest') body = { ...contest, status: options.status || 'active' };
    else if (endpoint === '/customer/contest') body = { contest: { ...contest, status: options.status || 'active' }, participation: state.participation, leaderboard: [], needsPhoneVerification: false };
    else if (endpoint === '/auth/me') body = { customer };
    else if (endpoint === '/news') body = { items: [] };
    return route.fulfill({ status: options.offline && endpoint.endsWith('/contest') ? 503 : 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  });
  return { context, state };
}
async function visibleTap(page, locator, viewport) {
  await page.getByText('Votre expérience Bibou se prépare…', { exact: true }).waitFor({ state: 'detached' });
  const box = await locator.boundingBox();
  if (!(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1)) await page.screenshot({ path: path.join(out, 'failure-' + Date.now() + '.png') });
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, 'Main CTA must fit in first viewport: ' + JSON.stringify(box));
  assert(await locator.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), 'CTA must not be covered');
}
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const [engine, launcher, launch] of [['chrome', chromium, { channel: 'chrome' }], ['webkit', webkit, {}]]) {
    const browser = await launcher.launch({ headless: true, ...launch });
    try {
      for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1280, height: 900 }]) {
        const { context, state } = await makeContext(browser, origin, viewport), page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin, { waitUntil: 'networkidle' });
        const entry = page.getByRole('button', { name: 'Je participe au concours', exact: true });
        await entry.waitFor(); await visibleTap(page, entry, viewport);
        await page.getByRole('link', { name: 'Participer sur Instagram ↗', exact: true }).waitFor();
        assert.match(await page.locator('body').innerText(), /1re place · 1 an de Bibou/);
        assert.match(await page.locator('body').innerText(), /2e place · 6 mois de Bibou/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: path.join(out, engine + '-' + viewport.width + '-start.png') });
        await entry.click();
        const login = page.getByRole('button', { name: 'Créer mon compte ou me connecter', exact: true });
        await login.waitFor(); await visibleTap(page, login, viewport);
        await login.click(); await page.getByPlaceholder('06 12 34 56 78').waitFor();
        assert.deepEqual(state.writes, []);
        assert.deepEqual(errors, []);
        report.checks.push({ engine, viewport, scenario: 'Immediate CTA, separate Instagram, truthful prizes, direct login, no implicit enrollment', result: 'pass' });
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Continuer dans Bibou →', exact: true }).click();
        await page.getByRole('button', { name: 'Créer mon compte', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Continuer en invité', exact: true }).click();
        await page.getByRole('button', { name: /Commander.*Retrait ou livraison/ }).waitFor();
        assert.equal(await page.getByRole('button', { name: /Nos partenaires.*Les bonnes adresses/ }).count(), 1);
        await page.getByRole('button', { name: /Commander.*Retrait ou livraison/ }).click();
        await page.getByRole('button', { name: /Click & collect.*Ton burger/ }).click();
        await page.getByRole('button', { name: /Nos menus.*Burger/ }).waitFor();
        report.checks.push({ engine, viewport, scenario: 'Original welcome, guest access, home tiles, ordering and categories retained', result: 'pass' });
        await context.close();
      }
      for (const status of ['inactive', 'scheduled', 'closed', 'offline']) {
        const { context, state } = await makeContext(browser, origin, { width: 390, height: 844 }, { status: status === 'offline' ? 'active' : status, offline: status === 'offline' });
        const page = await context.newPage(); await page.goto(origin, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Continuer dans Bibou →', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Je participe au concours', exact: true }).count(), 0);
        assert.equal(await page.getByRole('link', { name: 'Participer sur Instagram ↗', exact: true }).count(), 0);
        assert.deepEqual(state.writes, []); report.checks.push({ engine, scenario: status + ' never advertises active participation', result: 'pass' }); await context.close();
      }
      const { context, state } = await makeContext(browser, origin, { width: 390, height: 844 });
      const page = await context.newPage(); await page.goto(origin + '/?contest=1&ref=FICTIF', { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Créer mon compte ou me connecter', exact: true }).click();
      await page.getByPlaceholder('06 12 34 56 78').fill('0600000000');
      await page.getByText('Recevoir mon code', { exact: true }).click();
      await page.getByPlaceholder('123456').fill('123456'); await page.getByText('Valider le code', { exact: true }).click();
      const validate = page.getByRole('button', { name: 'Valider ma participation', exact: true });
      await validate.waitFor(); assert.equal(await validate.isDisabled(), true);
      const checks = page.getByRole('checkbox'); assert.equal(await checks.count(), 4);
      for (let i = 0; i < 4; i++) assert.equal(await checks.nth(i).getAttribute('aria-checked'), 'false');
      assert.equal(await page.getByRole('textbox', { name: 'Code du parrain' }).inputValue(), 'FICTIF');
      for (let i = 0; i < 3; i++) await checks.nth(i).click();
      assert.equal(await validate.isDisabled(), false); await validate.click();
      await page.getByText('60 points', { exact: true }).waitFor();
      assert.match(await page.locator('body').innerText(), /40 points de roue/);
      await page.getByRole('button', { name: 'Inviter un ami · +20 points', exact: true }).click();
      await page.getByText('61 points', { exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, engine + '-participant.png') });
      await page.getByRole('link', { name: 'Participer sur Instagram ↗', exact: true }).click();
      await page.waitForTimeout(800); assert.equal(state.instagram[0], 'https://www.instagram.com/reel/DeglpQMFPat/');
      assert.deepEqual(state.writes.filter(item => item.includes('/contest/')), ['/customer/contest/join', '/customer/contest/share']);
      report.checks.push({ engine, scenario: 'Fictional new login returns directly, sponsor preserved, four unchecked consents, explicit join, wheel breakdown, referral, Instagram exact Reel', result: 'pass' }); await context.close();
      const signed = await makeContext(browser, origin, { width: 390, height: 844 }, { signed: true, joined: true });
      const signedPage = await signed.context.newPage(); await signedPage.goto(origin, { waitUntil: 'networkidle' });
      await signedPage.getByRole('button', { name: 'Voir mon classement', exact: true }).waitFor();
      assert.equal(await signedPage.getByRole('button', { name: 'Je participe au concours', exact: true }).count(), 0);
      assert.deepEqual(signed.state.writes, []); report.checks.push({ engine, scenario: 'Existing participant goes directly to rank, no new enrollment', result: 'pass' }); await signed.context.close();
    } finally { await browser.close(); }
  }
  assert.deepEqual(report.unexpectedWrites, []); report.result = 'passed';
}
run().catch(error => { report.result = 'failed'; report.error = error.stack; process.exitCode = 1; }).finally(() => { server.close(); fs.writeFileSync(path.join(out, 'browser-' + Date.now() + '.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); });
