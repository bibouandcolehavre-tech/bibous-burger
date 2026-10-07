const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../driver-app/sw.js'), 'utf8');
function harness() {
  const handlers = {}, deleted = [], cached = [], notifications = [];
  vm.runInNewContext(source, {
    URL, Promise, fetch: async () => ({ ok: true }),
    caches: { keys: async () => ['bibou-client-shell', 'other-restaurant-cache', 'krokly-driver-shell-v3', 'krokly-driver-shell-v4'], delete: async name => { deleted.push(name); }, open: async () => ({ addAll: async paths => cached.push(...paths) }), match: async () => ({ ok: true }) },
    self: { location: { origin: 'https://example.test' }, addEventListener: (event, fn) => { handlers[event] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} }, registration: { showNotification: async (title, options) => notifications.push({ title, options }) } }
  });
  return { handlers, deleted, cached, notifications };
}
test('le cache livreur ne supprime pas les caches des autres applications', async () => {
  const h = harness(); let ready;
  h.handlers.activate({ waitUntil: promise => { ready = promise; } }); await ready;
  assert.deepEqual(h.deleted, ['krokly-driver-shell-v3']);
});
test('aucune API authentifiée ni donnée client ne passe par le cache livreur', async () => {
  const h = harness(); let install;
  h.handlers.install({ waitUntil: promise => { install = promise; } }); await install;
  assert.ok(h.cached.every(url => url.startsWith('/driver/')));
  for (const [method, pathname] of [['GET', '/api/krokly-driver/state'], ['POST', '/api/krokly-driver/login'], ['GET', '/restaurant/'], ['POST', '/driver/']]) {
    let handled = false;
    h.handlers.fetch({ request: { method, url: 'https://example.test' + pathname }, respondWith: () => { handled = true; } });
    assert.equal(handled, false, pathname);
  }
});
test('une alerte verrouillée ne contient ni nom ni adresse ni téléphone de client', async () => {
  const h = harness(); let sent;
  h.handlers.push({ data: { json: () => ({ customerName: 'Privé', customerPhone: '0600000000', address: 'Privée' }) }, waitUntil: promise => { sent = promise; } }); await sent;
  const payload = JSON.stringify(h.notifications);
  assert.match(payload, /Krokly/); assert.doesNotMatch(payload, /Privé|0600000000|customerName|address/);
});
