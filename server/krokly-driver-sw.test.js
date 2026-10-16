const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../driver-app/sw.js'), 'utf8');
function harness() {
  const handlers = {}, deleted = [], cached = [], notifications = [], reads = [];
  let networkFails = false;
  vm.runInNewContext(source, {
    URL, Promise, fetch: async () => { if (networkFails) throw Error('Réseau fictif coupé'); return { ok: true }; },
    caches: { keys: async () => ['bibou-client-shell', 'other-restaurant-cache', 'krokly-driver-shell-v5', 'krokly-driver-shell-v6'], delete: async name => { deleted.push(name); }, open: async name => ({ addAll: async paths => cached.push(...paths), match: async request => { reads.push({ name, url: request.url }); return { ok: true }; } }) },
    self: { location: { origin: 'https://example.test' }, addEventListener: (event, fn) => { handlers[event] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} }, registration: { showNotification: async (title, options) => notifications.push({ title, options }) } }
  });
  return { handlers, deleted, cached, notifications, reads, offline: () => { networkFails = true; } };
}
test('le cache livreur ne supprime pas les caches des autres applications', async () => {
  const h = harness(); let ready;
  h.handlers.activate({ waitUntil: promise => { ready = promise; } }); await ready;
  assert.deepEqual(h.deleted, ['krokly-driver-shell-v5', 'krokly-driver-shell-v6']);
});
test('aucune API authentifiée ni donnée client ne passe par le cache livreur', async () => {
  const h = harness(); let install;
  h.handlers.install({ waitUntil: promise => { install = promise; } }); await install;
  assert.ok(h.cached.every(url => url.startsWith('/driver/')));
  for (const [method, pathname, authorization] of [['GET', '/api/krokly-driver/state'], ['POST', '/api/krokly-driver/login'], ['GET', '/restaurant/'], ['POST', '/driver/'], ['GET', '/driver/private-course'], ['GET', '/driver/?token=fake-private'], ['GET', '/driver/', true], ['GET', '/driver/app.js', true]]) {
    let handled = false;
    h.handlers.fetch({ request: { method, url: 'https://example.test' + pathname, headers: { has: () => Boolean(authorization) } }, respondWith: () => { handled = true; } });
    assert.equal(handled, false, pathname);
  }
});
test('une alerte verrouillée ne contient ni nom ni adresse ni téléphone de client', async () => {
  const h = harness(); let sent;
  h.handlers.push({ data: { json: () => ({ customerName: 'Privé', customerPhone: '0600000000', address: 'Privée' }) }, waitUntil: promise => { sent = promise; } }); await sent;
  const payload = JSON.stringify(h.notifications);
  assert.match(payload, /Krokli Driver/); assert.doesNotMatch(payload, /Privé|0600000000|customerName|address/);
});
test('hors ligne, le shell public est lu uniquement dans le cache Krokli actif', async () => {
  const h = harness(); h.offline(); let response;
  h.handlers.fetch({ request: { method: 'GET', url: 'https://example.test/driver/', headers: { has: () => false } }, respondWith: promise => { response = promise; } });
  assert.equal((await response).ok, true);
  assert.deepEqual(h.reads, [{ name: 'krokly-driver-shell-v10', url: 'https://example.test/driver/' }]);
  const installed=harness();let ready;installed.handlers.install({waitUntil:p=>{ready=p;}});await ready;
  assert.ok(installed.cached.every(url=>!/(leaflet|navigation-core|\/navigation\.js)/.test(url)));
});
