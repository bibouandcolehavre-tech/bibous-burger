const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { statistics } = require('./dashboard-statistics');
function harness() {
  const node = () => ({ innerHTML: '', textContent: '', value: '', disabled: false, open: false, handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; }, close() { this.open = false; }, showModal() { this.open = true; } });
  const root = node(), elements = new Map(), calls = [];
  root.querySelector = key => { if (!elements.has(key)) elements.set(key, node()); return elements.get(key); };
  root.querySelector('#statistics-granularity').value = 'hour'; root.querySelector('#statistics-date').value = '2026-10-13';
  let session = 'fixture-session', delayed = null, sourceFictitious = false;
  const data = statistics({ customers: [], orders: [] }, { date: '2026-10-13' }, new Date('2026-10-13T12:00:00Z'));
  const context = vm.createContext({ window: {}, Date, Intl, URLSearchParams, AbortController, setTimeout, clearTimeout, fetch: async (url, options) => { calls.push({ url, options }); if (delayed) return new Promise(resolve => { delayed.resolve = resolve; }); return { status: 200, ok: true, json: async () => ({ ...data, fictitious: sourceFictitious }) }; } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/statistics.js'), 'utf8'), context);
  const panel = context.window.BibouStatistics({ root, api: 'https://fixture.invalid/api', token: () => session, onUnauthorized() {} });
  return { root, panel, calls, setSession: value => { session = value; }, setFictitious: () => { sourceFictitious = true; }, delay: () => { delayed = {}; return delayed; } };
}
test('statistics UI: owner GET requests only, zero stays zero, presentation uses the same real aggregate', async () => {
  const h = harness(); await h.panel.load();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].options.method, undefined); assert.equal(h.calls[0].options.cache, 'no-store');
  assert(h.calls[0].url.includes('/dashboard/statistics?')); assert.equal(h.root.querySelector('#statistics-present').disabled, false);
  const actual = h.root.querySelector('#statistics-content').innerHTML; assert(actual.includes('0,00')); assert(actual.includes('Chiffre d’affaires')); assert(!/bénéfice|commissions|coûts produits|charges et impôts/i.test(actual));
  h.root.querySelector('#statistics-present').handlers.click(); assert.equal(h.root.querySelector('#statistics-presentation').innerHTML, actual); assert.equal(h.root.querySelector('#statistics-dialog').open, true);
  h.panel.clear(); assert.equal(h.root.querySelector('#statistics-presentation').innerHTML, ''); assert.equal(h.root.querySelector('#statistics-dialog').open, false);
});
test('statistics UI: fictitious source refused, disconnected sessions and late responses cannot reveal prior statistics', async () => {
  const h = harness(); h.setFictitious(); await h.panel.load(); assert.equal(h.root.querySelector('#statistics-content').innerHTML, ''); assert.equal(h.root.querySelector('#statistics-present').disabled, true);
  const other = harness(), waiting = other.delay(), loading = other.panel.load(); other.setSession(''); other.panel.clear();
  waiting.resolve({ status: 200, ok: true, json: async () => ({ secret: 'MUST-NOT-APPEAR' }) }); await loading;
  assert.equal(other.root.querySelector('#statistics-content').innerHTML, ''); assert.equal(other.root.querySelector('#statistics-present').disabled, true);
});
test('statistics PWA: the new real-statistics section is accessible and cleared on logout', () => {
  const root = path.join(__dirname, '../restaurant-dashboard');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), app = fs.readFileSync(path.join(root, 'app.js'), 'utf8'), pwa = fs.readFileSync(path.join(root, 'pwa.js'), 'utf8');
  assert(html.includes('data-jump="statistics"')); assert(html.includes('id="statistics-view"')); assert(html.includes('./statistics.js'));
  assert(app.includes('statisticsPanel?.clear()')); assert(app.includes("view === 'statistics'")); assert(pwa.includes("statistics:'Statistiques'"));
});
