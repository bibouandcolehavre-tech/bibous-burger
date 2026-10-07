const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../driver-app/app.js'), 'utf8');
const result = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const state = (name = 'Livreur fictif', status = 'accepted') => ({ driver: { id: 'd1', name }, push: { enabled: false }, orders: [{ id: 'o1', number: 1, status, restaurant: 'Restaurant fictif', customerName: 'Client fictif', customerPhone: '0600000000', deliveryAddress: { address: 'Adresse privée fictive' } }] });
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(initialToken = 'driver-only-fake', initialMode = 'driver') {
  const elements = new Map(), handlers = {}, calls = [], stored = new Map([['krokly-token', initialToken], ['krokly-mode', initialMode]]);
  const controls = [{ disabled: false }], modeButtons = ['driver', 'owner'].map(mode => ({ dataset: { mode }, classList: { toggle() {} }, addEventListener(event, fn) { this[event] = fn; } }));
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: false, innerHTML: '', textContent: '', type: 'password', checked: false, disabled: false, handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; }, querySelectorAll: () => controls });
    return elements.get(id);
  };
  const hooks = {}, context = vm.createContext({ hooks, console, Date, Error, JSON, Promise, AbortSignal, AbortController, setTimeout, clearTimeout, setInterval() {}, Uint8Array, atob,
    FormData: class { [Symbol.iterator]() { return [['name', 'Fictif'], ['username', 'fictif']][Symbol.iterator](); } },
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    document: { querySelector: el, querySelectorAll: selector => selector === '[data-mode]' ? modeButtons : selector === '[data-expiry]' ? [] : controls, addEventListener: (event, fn) => { handlers[event] = fn; } },
    window: { confirm: () => true, addEventListener() {} }, navigator: {}, fetch: async (url, options) => { calls.push({ url, options }); return result(initialMode === 'owner' ? { orders: [], drivers: [] } : state()); }
  });
  vm.runInContext(source + '\nObject.assign(hooks, {refresh, signOut, api, token: () => token});', context);
  const fetchWith = fn => { context.fetch = async (url, options) => { calls.push({ url, options }); return fn(url, options); }; };
  return { hooks, el, calls, controls, modeButtons, context, fetchWith, stored, login: () => el('#login-form').handlers.submit({ preventDefault() {} }), logout: () => el('#logout').handlers.click(), create: () => handlers.submit({ target: { id: 'create-form' }, preventDefault() {} }), action: (dataset = { action: 'pickup', order: 'o1' }) => handlers.click({ target: { closest: selector => selector.includes('data-action') ? { dataset } : null } }) };
}

test('livreur : déconnexion efface les données privées et ignore une réponse tardive', async () => {
  const h = harness(); await flush();
  let resolve; h.fetchWith(() => new Promise(done => { resolve = done; }));
  const request = h.hooks.refresh(true); h.hooks.signOut();
  resolve(result(state())); await request;
  assert.equal(h.el('#workspace').hidden, true); assert.equal(h.el('#content').innerHTML, '');
  assert.equal(h.el('#welcome').textContent, ''); assert.equal(h.stored.has('krokly-token'), false);
});

test('livreur : une ancienne erreur 401 ne déconnecte pas le nouveau compte', async () => {
  const h = harness(); await flush(); let resolve;
  h.fetchWith(() => new Promise(done => { resolve = done; })); const old = h.hooks.refresh(true);
  h.hooks.signOut();
  h.fetchWith(url => result(url.endsWith('/login') ? { token: 'new-fake-token', driver: { name: 'Lina fictive' } } : state('Lina fictive')));
  await h.login(); resolve(result({}, 401)); await old;
  assert.equal(h.hooks.token(), 'new-fake-token'); assert.equal(h.el('#workspace').hidden, false);
  assert.match(h.el('#welcome').textContent, /Lina fictive/);
});

test('livreur : changement de rôle pendant la connexion ignore la réponse précédente', async () => {
  const h = harness(''); let resolve;
  h.fetchWith(() => new Promise(done => { resolve = done; })); const pending = h.login();
  await h.modeButtons[1].click(); h.fetchWith(() => result({ drivers: [], orders: [] })); resolve(result({ token: 'old-fake-token', driver: { name: 'Ancien' } })); await pending;
  assert.equal(h.hooks.token(), ''); assert.equal(h.el('#workspace').hidden, true);
  assert.equal(h.stored.get('krokly-mode'), 'owner');
});

test('livreur : retour HTML invalide reste lisible et bloque les actions non vérifiées', async () => {
  const h = harness(); await flush();
  h.fetchWith(() => ({ ok: true, status: 200, json: async () => { throw SyntaxError('Unexpected token <'); } }));
  await h.hooks.refresh();
  assert.match(h.el('#feedback').textContent, /serveur|réponse/i);
  assert.doesNotMatch(h.el('#feedback').textContent, /SyntaxError|JSON|Unexpected/);
  assert.equal(h.controls[0].disabled, true);
});

test('livreur : réponse de mutation perdue ne permet pas un second clic aveugle', async () => {
  const h = harness(); await flush(); let posts = 0;
  h.fetchWith((url, options) => { if (options.method === 'POST') { posts++; throw Error('Coupure fictive'); } return result(state()); });
  await h.action(); await h.action(); assert.equal(posts, 1);
  assert.match(h.el('#feedback').textContent, /[Aa]ctualis/); assert.equal(h.controls[0].disabled, true);
  await h.hooks.refresh(); assert.equal(h.controls[0].disabled, false);
  assert.ok(h.calls.every(c => c.options.signal), 'each network call has a finite timeout');
});

test('livreur : déconnexion immédiate même si la suppression des alertes ne répond pas', async () => {
  const h = harness(); await flush();
  h.context.navigator.serviceWorker = { ready: new Promise(() => {}) };
  const pending = h.logout();
  assert.equal(h.hooks.token(), ''); assert.equal(h.el('#workspace').hidden, true); assert.equal(h.el('#content').innerHTML, '');
  await pending;
});

test('livreur : réponse tardive pendant le décodage JSON ne réaffiche pas les données après déconnexion', async () => {
  const h = harness(); await flush(); let decode;
  h.fetchWith(() => ({ ok: true, status: 200, json: () => new Promise(resolve => { decode = resolve; }) }));
  const request = h.hooks.refresh(true); await flush(); h.logout(); decode(state()); await request;
  assert.equal(h.el('#content').innerHTML, ''); assert.equal(h.el('#workspace').hidden, true);
});

test('livreur : les doubles clics et vérifications périodiques ne cumulent pas les requêtes', async () => {
  const h = harness(); await flush(); let resolve, posts = 0;
  h.fetchWith((url, options) => {
    if (options.method === 'POST') { posts++; return new Promise(done => { resolve = done; }); }
    return result(state());
  });
  const action = h.action(); await h.action(); await h.hooks.refresh(); assert.equal(posts, 1);
  resolve(result({ changed: true })); await action;
  const before = h.calls.length; let refreshed;
  h.fetchWith(() => new Promise(done => { refreshed = done; }));
  const refresh = h.hooks.refresh(); await h.hooks.refresh(); assert.equal(h.calls.length, before + 1);
  refreshed(result(state())); await refresh;
});

test('restaurant : le mot de passe créé reste visible si le rechargement échoue, puis disparaît à la déconnexion', async () => {
  const h = harness('owner-only-fake', 'owner'); await flush();
  const account = { driver: { id: 'fake-d', name: 'Fictif', username: 'fictif' }, password: 'fake-password-not-real' };
  h.fetchWith((url, options) => {
    if (options.method === 'POST') return result(account);
    throw Error('Coupure fictive après création');
  });
  await h.create();
  assert.match(h.el('#secret').innerHTML, /fake-password-not-real/);
  assert.match(h.el('#feedback').textContent, /Coupure/); assert.equal(h.controls[0].disabled, true);
  h.fetchWith(() => result({ orders: [], drivers: [account.driver] })); await h.hooks.refresh(true);
  assert.match(h.el('#secret').innerHTML, /fake-password-not-real/);
  h.logout(); assert.equal(h.el('#content').innerHTML, '');
  h.fetchWith(url => result(url.endsWith('/login') ? { token: 'another-owner-fake' } : { orders: [], drivers: [] }));
  await h.login();
  // A real DOM replaces the old secret node when content is emptied; the fake
  // node is retained by this harness, so inspect the newly-rendered content.
  assert.doesNotMatch(h.el('#content').innerHTML, /fake-password-not-real/);
});

test('restaurant : création tardive ne montre jamais le mot de passe dans une autre session', async () => {
  const h = harness('owner-only-fake', 'owner'); await flush(); let resolve;
  h.fetchWith(() => new Promise(done => { resolve = done; })); const request = h.create();
  h.logout(); resolve(result({ driver: { name: 'Fictif', username: 'fictif' }, password: 'old-private-fake' })); await request;
  assert.equal(h.el('#workspace').hidden, true); assert.doesNotMatch(h.el('#secret').innerHTML, /old-private-fake/);
});

test('livreur : les requêtes fonctionnent aussi sans la méthode récente AbortSignal.timeout', async () => {
  const h = harness(); await flush(); h.context.AbortSignal = {};
  assert.equal(await h.hooks.refresh(true), true);
  assert.equal(h.calls.at(-1).options.signal instanceof AbortSignal, true);
  assert.equal(h.el('#workspace').hidden, false);
});
