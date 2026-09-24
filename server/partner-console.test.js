const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../partner-console/model');
const { createServer } = require('../partner-console/server.cjs');

function uiHarness(saved = null) {
  const vm = require('node:vm'), elements = new Map();
  let raw = saved, writes = 0, failWrite = false;
  const element = key => {
    if (!elements.has(key)) elements.set(key, { innerHTML: '', textContent: '', value: '', disabled: false, handlers: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, focus() {}, showModal() {}, close() {}, addEventListener(event, fn) { this.handlers[event] = fn; }, querySelector() { return element('nested'); } });
    return elements.get(key);
  };
  const context = { window: { PartnerModel: M, addEventListener() {} }, document: { getElementById: element, querySelectorAll: () => [], querySelector: element },
    URLSearchParams, location: { search: '' }, Intl, Date, setTimeout: () => 1, clearTimeout() {},
    navigator: { locks: { request: async (_, fn) => fn() } },
    localStorage: { getItem: () => raw, setItem: (_, value) => { if (failWrite) throw Error('Stockage indisponible'); raw = value; writes++; } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../partner-console/app.js'), 'utf8'), context);
  return { el: element, saved: () => raw, writes: () => writes, failWrite: () => { failWrite = true; }, external: value => { raw = JSON.stringify(value); }, toggle: id => element('editor-panel').handlers.click({ target: { closest: () => ({ dataset: { module: id } }) } }), save: async () => { element('review-changes').onclick(); await element('confirm-save').onclick(); } };
}

test('partner prototype: fixtures are independent and contain no live records', () => {
  const a = M.initial(), b = M.initial();
  assert.equal(a.restaurants.length, 2);
  assert.equal(M.MODULES.length, 9);
  assert.deepEqual(M.restore(a), a);
  a.restaurants[0].name = 'Changed';
  assert.equal(b.restaurants[0].name, 'Maison Alba');
  assert.ok(b.restaurants.every(r => r.id.startsWith('demo-')));
  assert.throws(() => M.validate({ ...b.restaurants[0], id: 'live-bibou' }), /invalide/);
});

test('partner prototype: dependent modules enable together and disable safely', () => {
  const original = M.initial().restaurants[1];
  const member = M.toggle(original, 'membership', true);
  assert.equal(original.modules.membership, false);
  assert.ok(member.modules.membership && member.modules.loyalty && member.modules.delivery && member.modules.orders);
  const referred = M.toggle(member, 'referrals', true);
  const withoutLoyalty = M.toggle(referred, 'loyalty', false);
  assert.equal(withoutLoyalty.modules.referrals, false);
  assert.equal(withoutLoyalty.modules.membership, false);
  assert.equal(withoutLoyalty.modules.delivery, true);
  assert.throws(() => M.toggle(original, 'orders', false), /socle/);
  assert.throws(() => M.toggle(original, 'unknown', true), /inconnu/);
});

test('partner prototype: save updates only its restaurant and rejects stale drafts', () => {
  const state = M.initial(), draft = M.toggle(state.restaurants[1], 'delivery', true);
  const saved = M.save(state, draft, '2026-09-24T13:00:00.000Z');
  assert.equal(saved.restaurants[1].revision, 1);
  assert.deepEqual(saved.restaurants[0], state.restaurants[0]);
  assert.equal(saved.history.length, 1);
  assert.deepEqual(saved.history[0].changes, [{ label: 'Livraison', before: 'Désactivé', after: 'Activé' }]);
  assert.throws(() => M.save(saved, draft), /autre onglet/);
  assert.equal(M.save(saved, saved.restaurants[1]).history.length, 1);
  const invalid = M.clone(draft); invalid.name = ' ';
  assert.throws(() => M.save(state, invalid), /Complète/);
});

test('partner prototype: local profiles, bounded history and restored input validation', () => {
  const state = M.add(M.initial(), { name: ' Essai ', city: 'Rouen', kind: 'Bistrot', accent: M.COLORS[0] }, 'demo-third');
  assert.equal(state.restaurants[2].name, 'Essai');
  assert.equal(Object.values(state.restaurants[2].modules).filter(Boolean).length, 1);
  assert.throws(() => M.add(state, { name: 'Essai', city: 'X', kind: 'X', accent: M.COLORS[0] }, 'demo-third'), /existe/);
  const injected = M.clone(state); injected.restaurants[0].accent = 'url(https://example.com)';
  assert.throws(() => M.restore(injected), /couleurs/);
  const dupe = M.clone(state); dupe.restaurants.push(dupe.restaurants[0]);
  assert.throws(() => M.restore(dupe), /invalide/);
  const unknown = M.clone(state); unknown.secret = 'should disappear'; unknown.restaurants[0].liveApi = 'should disappear';
  const clean = M.restore(unknown); assert.equal(clean.secret, undefined); assert.equal(clean.restaurants[0].liveApi, undefined);
  const overflow = M.clone(state); overflow.history = Array(120).fill(overflow.history[0]);
  assert.equal(M.restore(overflow).history.length, 100);
  for (const field of ['revision', 'modules']) {
    const broken = M.clone(state); broken.restaurants[0][field] = null;
    assert.throws(() => M.restore(broken));
  }
});

test('partner prototype: local server allowlist, no API, no framing, no external connections', async t => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const file of ['/', '/app.js', '/model.js', '/style.css', '/?session=verification']) {
    const res = await fetch(url + file); assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /connect-src 'none'/);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.ok((await res.text()).length > 0);
  }
  for (const file of ['/server.cjs', '/server/data.json', '/api/customers', '/%2e%2e/.env', '/.git/config']) assert.equal((await fetch(url + file)).status, 404);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  assert.equal((await fetch(url, { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(url, { method: 'HEAD' })).headers.get('content-type'), 'text/html; charset=utf-8');
  const http = require('node:http');
  const forbidden = await new Promise(resolve => http.get(url, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }));
  assert.equal(forbidden, 403);
});

test('partner prototype: is excluded from mobile/server bundles and stays unconnected', () => {
  const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert.match(read('.easignore'), /partner-console\//);
  assert.match(read('.dockerignore'), /partner-console/);
  assert.doesNotMatch(read('partner-console/app.js'), /\bfetch\(|XMLHttpRequest|WebSocket|\.onrender\.com/);
  assert.match(read('partner-console/app.js'), /navigator\.locks\.request/);
});

test('partner prototype UI: drafts do not save until confirmation and persist on reopening', async () => {
  const h = uiHarness(); h.toggle('membership');
  assert.equal(h.writes(), 0);
  h.el('review-changes').onclick(); assert.equal(h.writes(), 0);
  assert.match(h.el('change-list').innerHTML, /Abonnement client/);
  await h.save(); assert.equal(h.writes(), 1);
  const saved = JSON.parse(h.saved());
  assert.equal(saved.restaurants[0].modules.membership, true);
  assert.equal(saved.restaurants[1].modules.membership, false);
  const reopened = uiHarness(h.saved());
  assert.match(reopened.el('editor-panel').innerHTML, /data-module="membership"[^>]+aria-checked="true"/);
  assert.match(reopened.el('history-list').innerHTML, /Abonnement client/);
  assert.equal(reopened.writes(), 0);
});

test('partner prototype UI: failed storage and concurrent change never overwrite saved configuration', async () => {
  const h = uiHarness(); h.toggle('membership'); h.failWrite(); await h.save();
  assert.equal(h.writes(), 0); assert.equal(h.saved(), null);
  assert.match(h.el('save-error').textContent, /Stockage indisponible/);
  assert.match(h.el('draft-status').textContent, /modification/);
  const conflict = uiHarness(); conflict.toggle('membership');
  const initial = M.initial(); conflict.external(M.save(initial, { ...initial.restaurants[0], name: 'Autre onglet' }));
  await conflict.save();
  assert.equal(conflict.writes(), 0);
  assert.equal(JSON.parse(conflict.saved()).restaurants[0].name, 'Autre onglet');
  assert.match(conflict.el('save-error').textContent, /autre onglet/);
});

test('partner prototype UI: imported text is escaped and corrupt storage is preserved', async () => {
  const state = M.initial(); state.restaurants[0].name = '<img src=x onerror=bad()>';
  const h = uiHarness(JSON.stringify(state));
  assert.match(h.el('editor-heading').innerHTML, /&lt;img/);
  assert.doesNotMatch(h.el('editor-heading').innerHTML, /<img/);
  const corrupt = uiHarness('{bad'); corrupt.toggle('membership'); await corrupt.save();
  assert.equal(corrupt.saved(), '{bad'); assert.equal(corrupt.writes(), 0);
  assert.match(corrupt.el('save-error').textContent, /inaccessible ou invalide/);
});
