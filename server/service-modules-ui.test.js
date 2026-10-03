const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const element = () => ({
    textContent: '', disabled: false, dataset: {}, handlers: {}, children: [],
    addEventListener(type, handler) { this.handlers[type] = handler; },
    setAttribute(name, value) { this[name] = value; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }
  });
  const root = element();
  const nodes = new Map();
  root.querySelector = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const state = { revision: 0, modules: { pickup: true, delivery: true, tables: true } };
  const calls = [];
  let session = 'restaurant-test-token';
  const context = vm.createContext({
    window: {}, document: { createElement: element }, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      if (options.method === 'PATCH') {
        const body = JSON.parse(options.body);
        if (body.revision !== state.revision) return { ok: false, status: 409, json: async () => ({ error: 'Conflit' }) };
        Object.assign(state.modules, body.modules);
        state.revision++;
      }
      return { ok: true, status: 200, json: async () => ({ revision: state.revision, modules: { ...state.modules } }) };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/modules.js'), 'utf8'), context);
  let unauthorized = false;
  const panel = context.window.BibouModules({
    root, api: 'https://local.invalid/api', token: () => session,
    onUnauthorized: () => { unauthorized = true; }
  });
  return {
    panel, root, nodes, state, calls,
    toggle(id) { root.handlers.click({ target: { closest: () => ({ dataset: { module: id } }) } }); },
    click(id) { return nodes.get(id).handlers.click(); },
    logout() { session = ''; panel.clear(); },
    get unauthorized() { return unauthorized; }
  };
}

test('modules UI: ouverture réelle, brouillon sans effet puis double validation ciblée', async () => {
  const h = harness();
  await h.panel.load();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, 'GET');
  h.toggle('pickup');
  assert.equal(h.state.modules.pickup, true, 'le brouillon ne ferme pas le vrai service');
  assert.equal(h.nodes.get('#module-save').disabled, false);
  await h.click('#module-save');
  assert.equal(h.calls.length, 1, 'le premier clic ne sauvegarde pas');
  assert.match(h.nodes.get('#module-feedback').textContent, /Bibou’s Burgers.*fermer/);
  await h.click('#module-save');
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].method, 'PATCH');
  assert.equal(h.calls[1].headers.Authorization, 'Bearer restaurant-test-token');
  assert.deepEqual(JSON.parse(h.calls[1].body), { revision: 0, modules: { pickup: false } });
  assert.deepEqual(h.state.modules, { pickup: false, delivery: true, tables: true });
  assert.equal(h.nodes.get('#module-save').disabled, true);
  h.logout();
  assert.equal(h.nodes.get('#module-choices').children.every(row => row.children[1].disabled), true);
});

test('modules UI: actualiser un brouillon exige deux clics et ne ferme rien', async () => {
  const h = harness();
  await h.panel.load();
  h.toggle('delivery');
  await h.click('#module-refresh');
  assert.equal(h.calls.length, 1);
  assert.equal(h.state.modules.delivery, true);
  await h.click('#module-refresh');
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].method, 'GET');
  assert.equal(h.nodes.get('#module-save').disabled, true);
});
