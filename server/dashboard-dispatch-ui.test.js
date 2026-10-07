const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/dispatch.js'), 'utf8');
const result = (data, status = 200) => ({ status, ok: status === 200, json: async () => data });
const flush = () => new Promise(resolve => setImmediate(resolve));
const fixture = () => ({ drivers: [{ id: 'd1', name: '<img src=x>Mathieu', username: 'mathieu', active: true, pushDevices: 0 }, { id: 'd2', name: 'Lina', active: false }], orders: [{ id: 'o1', number: 41, status: 'ready', eligible: true, serviceDate: '2026-10-07', slot: '19:30' }] });

function harness() {
  const elements = new Map();
  const handlers = {};
  const element = selector => { if (!elements.has(selector)) elements.set(selector, { innerHTML: '', textContent: '', value: '' }); return elements.get(selector); };
  let session = 'owner-session', unauthorized = 0, refreshed = 0;
  const root = { innerHTML: '', querySelector: element, addEventListener: (kind, fn) => { handlers[kind] = fn; } };
  const context = vm.createContext({ window: {}, CSS: { escape: String }, AbortSignal, fetch: async () => result(fixture()) });
  vm.runInContext(source, context);
  const module = context.window.BibouDispatch;
  const panel = module.create({ root, api: '/api', token: () => session, onUnauthorized: () => { unauthorized++; session = ''; panel.clear(); }, onOrdersChanged: () => { refreshed++; }, getOrder: () => ({ customer: '<script>Client</script>' }) });
  return { context, module, panel, root, element, handlers, setSession: value => { session = value; }, unauthorized: () => unauthorized, refreshed: () => refreshed, click: () => handlers.click({ target: { closest: () => ({ disabled: false, dataset: { dispatchAssign: 'o1' } }) } }) };
}

test('dispatch uses the dashboard session, escapes content, and does not ask for another login', async () => {
  const h = harness();
  const requests = [];
  h.context.fetch = async (url, options) => { requests.push({ url, options }); return result(fixture()); };
  await h.panel.load();
  assert.equal(requests[0].url, '/api/dashboard/krokly-drivers');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer owner-session');
  assert.match(h.element('[data-dispatch-ready]').innerHTML, /&lt;script&gt;Client/);
  assert.match(h.element('[data-dispatch-ready]').innerHTML, /&lt;img src=x&gt;Mathieu/);
  assert.doesNotMatch(h.element('[data-dispatch-ready]').innerHTML, /<script>|<img/);
  assert.doesNotMatch(h.element('[data-dispatch-ready]').innerHTML, /value="d2"/);
  assert.doesNotMatch(h.root.innerHTML, /type="password"|iframe|target="_blank"/);
});

test('dispatch requires choosing an active courier, prevents duplicate assignment, and refreshes', async () => {
  const h = harness();
  await h.panel.load();
  const select = h.element('[data-dispatch-select="o1"]');
  h.click();
  await flush();
  assert.match(h.element('[data-dispatch-feedback]').textContent, /Choisissez un livreur actif/);
  select.value = 'd1';
  let resolve, posts = 0;
  h.context.fetch = async (url, options) => {
    if (options.method === 'POST') { posts++; assert.equal(JSON.parse(options.body).driverId, 'd1'); return new Promise(done => { resolve = done; }); }
    const data = fixture(); data.orders[0].eligible = false; data.orders[0].assignment = { driverId: 'd1', status: 'offered' };
    return result(data);
  };
  h.click(); h.click();
  assert.equal(posts, 1);
  resolve(result({ assignment: { status: 'offered' } }));
  await flush();
  assert.match(h.element('[data-dispatch-assigned]').innerHTML, /Attend la réponse/);
  assert.match(h.element('[data-dispatch-feedback]').textContent, /Attendez son acceptation/);
  assert.equal(h.refreshed(), 1);
});

test('dispatch preserves courier choice across polling, clears private data and ignores late responses', async () => {
  const h = harness();
  await h.panel.load();
  h.handlers.change({ target: { dataset: { dispatchSelect: 'o1' }, value: 'd1' } });
  const updated = fixture(); updated.orders.push({ ...updated.orders[0], id: 'o2', number: 42 });
  h.context.fetch = async () => result(updated);
  await h.panel.load();
  assert.match(h.element('[data-dispatch-ready]').innerHTML, /value="d1" selected/);
  let resolve;
  h.context.fetch = () => new Promise(done => { resolve = done; });
  const pending = h.panel.load();
  h.setSession('another-session'); h.panel.clear();
  resolve(result(updated)); await pending;
  assert.equal(h.element('[data-dispatch-drivers]').innerHTML, '');
  assert.equal(h.element('[data-dispatch-ready]').innerHTML, '');
  assert.equal(h.element('[data-dispatch-feedback]').textContent, '');
  assert.equal(h.unauthorized(), 0);
});

test('lost assignment response prevents blind retries and 401 returns to existing login', async () => {
  const h = harness();
  await h.panel.load();
  h.element('[data-dispatch-select="o1"]').value = 'd1';
  let posts = 0;
  h.context.fetch = async () => { posts++; throw Error('Réseau interrompu'); };
  h.click(); await flush(); h.click(); await flush();
  assert.equal(posts, 1);
  assert.match(h.element('[data-dispatch-feedback]').textContent, /vérifier la course/);
  assert.match(h.element('[data-dispatch-ready]').innerHTML, /disabled/);
  h.context.fetch = async () => result({}, 401);
  await h.panel.load();
  assert.equal(h.unauthorized(), 1);
  assert.equal(h.element('[data-dispatch-ready]').innerHTML, '');
});

test('Krokly order controls stay in the back office and never invite a duplicate Uber dispatch', () => {
  const h = harness();
  assert.match(h.module.markup({ method: 'delivery', status: 'ready' }), /data-open-dispatch/);
  assert.match(h.module.markup({ method: 'delivery', status: 'ready', kroklyDriver: { status: 'offered' } }), /Attend la réponse/);
  assert.equal(h.module.markup({ method: 'pickup', status: 'ready' }), '');
  assert.equal(h.module.markup({ method: 'delivery', status: 'ready', uberDirect: { phase: 'sending' } }), '');
  const uber = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/uber-direct.js'), 'utf8'), uber);
  assert.equal(uber.window.BibouUber.markup({ method: 'delivery', status: 'ready', kroklyDriver: { status: 'accepted' } }), '');
  const html = fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/index.html'), 'utf8');
  assert.equal((html.match(/data-view="dispatch"/g) || []).length, 2);
  assert.match(html, /id="dispatch-view"/);
  assert.match(html, /dispatch\.js\?v=1/);
});
