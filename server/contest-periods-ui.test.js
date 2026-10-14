const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const node = () => ({ innerHTML: '', textContent: '', value: '', disabled: false });
  const root = node(), elements = new Map(), calls = [], downloads = [], blobs = [];
  root.querySelector = key => { if (!elements.has(key)) elements.set(key, node()); return elements.get(key); };
  const data = { periods: [{ number: 1, startDate: '2026-10-15', endDate: '2026-10-29', startsAt: '2026-10-15T10:00:00Z', endsAt: '2026-10-29T23:00:00Z', status: 'complete' }], period: { number: 1, startsAt: '2026-10-15T10:00:00Z', endsAt: '2026-10-29T23:00:00Z', startDate: '2026-10-15', endDate: '2026-10-29', status: 'complete' }, total: 1, exportReady: true, fingerprint: 'fictitious-fingerprint', generatedAt: '2026-10-30T12:00:00Z', actionLabels: { registration: 'Inscription' }, participants: [{ alias: '=FORMULA<script>', customerId: 'fixture-account', customerName: '<img src=x onerror=alert(1)>', actions: ['registration'], chances: 1, firstActivityAt: '2026-10-15T10:00:00Z', lastActivityAt: '2026-10-15T10:00:00Z' }] };
  let session = 'fixture-token', deferred = null, unauthorized = 0;
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, Blob, URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:fixture'; }, revokeObjectURL() {} },
    document: { createElement() { const link = { remove() {}, click() { downloads.push({ name: this.download, href: this.href }); } }; return link; }, body: { appendChild() {} } }, window: {},
    fetch: async (url, options) => { calls.push({ url, ...options }); if (deferred) return new Promise(resolve => { deferred.resolve = resolve; }); return { status: 200, ok: true, json: async () => data }; } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/contest-periods.js'), 'utf8'), context);
  const panel = context.window.BibouContestPeriods({ root, api: 'https://fixture.invalid/api', token: () => session, onUnauthorized() { unauthorized++; } });
  return { root, panel, calls, downloads, blobs, data, get unauthorized() { return unauthorized; }, setSession(value) { session = value; }, defer() { deferred = {}; return deferred; } };
}
test('Listes UI : lecture seule, HTML échappé, export revérifié et CSV protégé, aucune annonce', async () => {
  const h = harness(); await h.panel.load();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].method, 'GET');
  assert(!h.root.querySelector('#period-participants').innerHTML.includes('<img')); assert(!h.root.querySelector('#period-participants').innerHTML.includes('<script>'));
  h.root.querySelector('#period-export').onclick(); await tick();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[1].method, 'GET'); assert(h.calls[1].url.endsWith('?period=1'));
  assert.equal(h.downloads.length, 1); assert.match(h.downloads[0].name, /quinzaine-1-2026-10-15-2026-10-29\.csv$/);
  const csv = await h.blobs[0].text(); assert(csv.includes("'=FORMULA<script>")); assert(!csv.includes('onerror')); assert(csv.includes('fictitious-fingerprint'));
  assert(!h.calls.some(call => /publish|finalize|news|sms/.test(call.url)));
});
test('Quinzaine provisoire : aucun fichier ; liste modifiée lors de la vérification : relecture requise', async () => {
  const h = harness(); h.data.exportReady = false; h.data.period.status = 'active'; await h.panel.load();
  assert.equal(h.root.querySelector('#period-export').disabled, true); h.root.querySelector('#period-export').onclick(); await tick(); assert.equal(h.calls.length, 1);
  h.data.exportReady = true; h.data.period.status = 'complete'; await h.panel.load();
  const wait = h.defer(); h.root.querySelector('#period-export').onclick(); await tick();
  wait.resolve({ status: 200, ok: true, json: async () => ({ ...h.data, fingerprint: 'different-fingerprint' }) }); await tick();
  assert.equal(h.downloads.length, 0); assert.match(h.root.querySelector('#period-feedback').textContent, /changé/);
});
test('Déconnexion : effacement et réponse tardive écartée ; aucun export sur session changée', async () => {
  const h = harness(), waiting = h.defer(), loading = h.panel.load(); await tick(); h.setSession(''); h.panel.clear();
  waiting.resolve({ status: 200, ok: true, json: async () => h.data }); await loading;
  assert.equal(h.root.querySelector('#period-participants').innerHTML, ''); assert.equal(h.root.querySelector('#period-export').disabled, true);
  assert.equal(h.downloads.length, 0);
});
test('Intégration des deux interfaces : liste commune et heure de début, aucun bouton de tirage automatique', () => {
  for (const file of ['index.html','ancienne-interface.html']) assert(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard', file), 'utf8').includes('./contest-periods.js?v=crossplay-quinzaines-30j-20261014'));
  const marketing = fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/marketing.js'), 'utf8');
  assert(marketing.includes("['startTime','Heure de début (heure de Paris)',5]")); assert(marketing.includes('periodPanel?.clear()'));
  assert(!fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/contest-periods.js'), 'utf8').includes('Math.random'));
});
