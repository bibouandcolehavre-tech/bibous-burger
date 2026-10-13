const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const node = () => ({ innerHTML: '', textContent: '', value: '', handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, querySelectorAll() { return []; } });
  const root = node(), elements = new Map(), calls = [], menus = [{ checked: true, dataset: { prizeMenu: 'classique-menu' } }];
  root.querySelector = key => { if (!elements.has(key)) elements.set(key, node()); return elements.get(key); };
  root.querySelectorAll = key => key === '[data-prize-menu]' ? menus : [];
  const data = { grants: [], rules: 'Données fictives', smsEnabled: false, preview: { minimumStartMonth: '2026-11', rankingFingerprint: 'fictional-snapshot', tied: false, eligibleMenus: [{ id: 'classique-menu', name: '<script>fictional</script>' }], winners: [{ rank: 1, customerName: '<img src=x onerror=alert(1)>', score: 10 }] } };
  let session = 'fictional-token', pending;
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' }, window: {}, fetch: async (url, options) => {
    calls.push({ url, ...options });
    if (pending) return new Promise(resolve => { pending.resolve = resolve; });
    return { status: 200, ok: true, json: async () => data };
  } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/contest-prizes.js'), 'utf8'), context);
  const panel = context.window.BibouContestPrizes({ root, api: 'https://fixture.invalid/api', token: () => session, onUnauthorized() {} });
  const click = id => root.handlers.click({ target: { id } });
  return { root, panel, calls, menus, click, setSession: value => { session = value; }, defer: () => { pending = {}; return pending; } };
}
test('lots UI : consultation seule, données échappées, préparation sans attribution, confirmation textuelle requise', async () => {
  const h = harness(); await h.panel.load(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].method, 'GET');
  assert(!h.root.querySelector('#prize-prepare').innerHTML.includes('<img')); assert(!h.root.querySelector('#prize-prepare').innerHTML.includes('<script>'));
  h.root.querySelector('#prize-first-month').value = '2026-11'; h.click('prize-prepare-button');
  assert.equal(h.calls.length, 1); assert.match(h.root.querySelector('#prize-confirmation').innerHTML, /Confirmer les lots/);
  h.click('prize-confirm-button'); await tick(); assert.equal(h.calls.length, 1);
  h.root.querySelector('#prize-confirm-text').value = 'VALIDER LES LOTS DU CONCOURS'; h.click('prize-confirm-button'); await tick();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].method, 'POST'); assert(h.calls[1].url.endsWith('/prizes/finalize'));
  assert.equal(JSON.parse(h.calls[1].body).confirmation, 'VALIDER LES LOTS DU CONCOURS');
  assert(!h.calls.some(c => /publish|sms.*send/.test(c.url)));
});
test('lots UI : annuler ou modifier les conditions invalide une confirmation préparée', async () => {
  const h = harness(); await h.panel.load(); h.root.querySelector('#prize-first-month').value = '2026-11'; h.click('prize-prepare-button'); h.click('prize-cancel-button');
  h.root.querySelector('#prize-confirm-text').value = 'VALIDER LES LOTS DU CONCOURS'; h.click('prize-confirm-button'); await tick(); assert.equal(h.calls.length, 1);
  h.click('prize-prepare-button'); h.root.handlers.input({ target: { id: 'prize-first-month', dataset: {} } }); h.click('prize-confirm-button'); await tick(); assert.equal(h.calls.length, 1);
});
test('lots UI : déconnexion efface les résultats privés et écarte les réponses tardives', async () => {
  const h = harness(), waiting = h.defer(), loading = h.panel.load(); await tick(); h.setSession(''); h.panel.clear();
  waiting.resolve({ status: 200, ok: true, json: async () => ({ grants: [], preview: null, rules: '', smsEnabled: false }) }); await loading;
  assert.equal(h.root.querySelector('#prize-summary').innerHTML, ''); assert.equal(h.root.querySelector('#prize-feedback').textContent, '');
});
