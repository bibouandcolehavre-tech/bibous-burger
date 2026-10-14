const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { dashboardContest, saveContestDraft, publishContest, publicContest } = require('./referral-contest');
const { dashboardNews, saveNews } = require('./news');
const tick = () => new Promise(resolve => setImmediate(resolve));
const preset = JSON.parse(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/contest-launch-20261015.json'), 'utf8'));
function harness() {
  const element = () => ({ innerHTML: '', textContent: '', value: '', disabled: false, handlers: {}, addEventListener(kind, fn) { this.handlers[kind] = fn; }, closest() { return null; } });
  const root = element(), elements = new Map(), calls = [], db = { customers: [], orders: [] }, now = new Date('2026-10-14T21:00:00Z');
  root.querySelector = selector => { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); };
  root.querySelectorAll = () => [];
  root.querySelector('#contest-form').reset = () => { for (const [selector, node] of elements) if (selector.includes('[name=')) node.value = ''; };
  let session = 'fictitious-owner-session', approved = false, pending;
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, Intl, window: { confirm: () => approved }, fetch: async (url, options = {}) => {
    calls.push({ url, ...options, method: options.method || 'GET' });
    if (url.startsWith('./')) {
      if (pending) return new Promise(resolve => { pending.resolve = resolve; });
      return { ok: true, status: 200, json: async () => structuredClone(preset) };
    }
    let result;
    try {
      const body = options.body ? JSON.parse(options.body) : null;
      if (url.endsWith('/contest/publish')) { assert.equal(options.method, 'POST'); publishContest(db, body, now); result = dashboardContest(db, now); }
      else if (url.endsWith('/contest')) { if (body) saveContestDraft(db, body, now); result = dashboardContest(db, now); }
      else if (url.endsWith('/news')) { if (body) saveNews(db, body, now); result = dashboardNews(db); }
      else throw Error('Unknown fictitious endpoint');
      return { ok: true, status: 200, json: async () => structuredClone(result) };
    } catch (error) { return { ok: false, status: error.statusCode || 400, json: async () => ({ error: error.message }) }; }
  } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/marketing.js'), 'utf8'), context);
  const panel = context.window.BibouMarketing({ root, api: 'https://fixture.invalid/api', token: () => session, onUnauthorized() {} });
  const q = selector => root.querySelector(selector);
  return { panel, db, calls, q, now, approve: value => { approved = value; }, session: value => { session = value; }, defer: () => { pending = {}; return pending; } };
}
test('Préparation propriétaire : 11 h, fin décembre, règles inchangées et aucun lancement par chargement ou préparation', async () => {
  const h = harness(); await h.panel.load(); assert(h.calls.every(c => c.method === 'GET')); assert.equal(h.db.referralContest, undefined);
  await h.q('#contest-prepare').onclick();
  assert.equal(h.q('#contest-form [name="startTime"]').value, '11:00');
  assert.equal(h.q('#contest-form [name="endDate"]').value, '2026-12-31');
  assert.match(h.q('#news-cards').innerHTML, /31 décembre/); assert.equal(h.q('#contest-publish').disabled, true);
  assert(h.calls.every(c => c.method === 'GET')); assert.equal(h.db.referralContest, undefined);
  assert(preset.rules.length < 12000); assert.match(preset.rules, /Les points fidélité,|points fidélité, les points gagnés à la roue/);
  assert.match(preset.rules, /1 point par euro/); assert.match(preset.rules, /30 jours à partir de la date du tirage/);
});
test('Programmation UI : annonce et brouillon sauvegardés, confirmation indispensable, une publication et zéro notification', async () => {
  const h = harness(); await h.panel.load(); await h.q('#contest-prepare').onclick();
  h.q('#news-save').onclick(); await tick(); h.q('#contest-form').onsubmit({ preventDefault() {} }); await tick();
  assert.equal(h.db.referralContest.status, 'draft'); assert.equal(h.q('#contest-publish').disabled, false);
  await h.q('#contest-publish').onclick(); assert(!h.calls.some(c => c.method === 'POST'));
  h.approve(true); await h.q('#contest-publish').onclick();
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(h.db.referralContest.status, 'published'); assert.equal(publicContest(h.db, h.now).status, 'scheduled');
  assert.equal(publicContest(h.db, h.now).startTime, '11:00'); assert.equal(h.q('#contest-publish').disabled, true);
  await h.q('#contest-publish').onclick(); assert.equal(h.calls.filter(c => c.method === 'POST').length, 1);
  assert(!h.calls.some(c => /finalize|spin|sms|push|payment|orders/.test(c.url))); assert.equal(h.db.orders.length, 0);
});
test('Aucun lancement si préparation non sauvegardée ou annonce encore non sauvegardée', async () => {
  const h = harness(); h.approve(true); await h.panel.load(); await h.q('#contest-prepare').onclick();
  await h.q('#contest-publish').onclick(); assert(!h.calls.some(c => c.method === 'POST'));
  h.q('#contest-form').onsubmit({ preventDefault() {} }); await tick();
  await h.q('#contest-publish').onclick(); assert(!h.calls.some(c => c.method === 'POST')); assert.equal(h.db.referralContest.status, 'draft');
});
test('Déconnexion pendant la lecture de la préparation : aucun retour tardif ni programmation', async () => {
  const h = harness(); await h.panel.load(); const pending = h.defer(), reading = h.q('#contest-prepare').onclick(); await tick();
  h.session(''); h.panel.clear(); pending.resolve({ status: 200, ok: true, json: async () => structuredClone(preset) }); await reading;
  assert.equal(h.q('#contest-form [name="startTime"]').value, ''); assert.equal(h.q('#marketing-feedback').textContent, '');
  assert(!h.calls.some(c => c.method === 'POST')); assert.equal(h.db.referralContest, undefined);
});
