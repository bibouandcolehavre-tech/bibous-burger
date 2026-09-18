const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
function harness() {
  const elements = new Map(), calls = [];
  let token = 'fake-session', pending = null, enabled = true, lastCampaign, unauthorized = 0;
  const fields = { title: '<img src=x onerror=bad()>', body: '<script>bad()</script>', audience: 'all', screen: 'menu' };
  const el = key => {
    if (!elements.has(key)) elements.set(key, { innerHTML: '', _text: '', get textContent() { return this._text; }, set textContent(value) { this._text = value; this.innerHTML = ''; }, checked: false, hidden: true, disabled: false, handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; }, reset() {} });
    return elements.get(key);
  };
  const state = () => ({ enabled, platforms: enabled ? ['ios'] : [], optedInCustomers: 1, registeredDevices: 1, eligibleCustomers: enabled ? 1 : 0, campaigns: lastCampaign ? [lastCampaign] : [] });
  const context = { window: {}, crypto, AbortSignal, Date, FormData: class { [Symbol.iterator]() { return Object.entries(fields)[Symbol.iterator](); } }, fetch: async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    if (pending) return pending;
    if (url.endsWith('/preview')) {
      const input = JSON.parse(options.body);
      lastCampaign = { ...input, id: input.requestId, status: 'draft', previewExpiresAt: Date.now() + 900000, createdAt: Date.now(), customers: enabled ? 1 : 0, devices: enabled ? 1 : 0, counts: { queued: 0, sending: 0, accepted: 0, provider_ok: 0, failed: 0, uncertain: 0, cancelled: 0, expired: 0 } };
      return response({ ...state(), campaign: lastCampaign });
    }
    if (url.endsWith('/send')) { lastCampaign = { ...lastCampaign, status: 'sent' }; return response({ ...state(), campaign: lastCampaign }); }
    return response(state());
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/notifications.js'), 'utf8'), context);
  const panel = context.window.BibouNotifications({ root: { querySelector: el, querySelectorAll: () => [...elements.values()], set innerHTML(_) {} }, api: 'https://fake.test/api', token: () => token, onUnauthorized: () => { unauthorized++; panel.clear(); } });
  return { panel, el, calls, fields, state, setToken: value => { token = value; }, pending: value => { pending = value; }, disable: () => { enabled = false; }, campaign: () => lastCampaign, unauthorized: () => unauthorized, submit: () => el('#push-form').handlers.submit({ preventDefault() {} }), send: () => el('#push-send').handlers.click() };
}

test('interface push : aperçu sans envoi, contenu échappé et confirmation obligatoire', async () => {
  const h = harness(); await h.panel.load(); await h.submit();
  assert.equal(h.calls.filter(c => c.url.endsWith('/send')).length, 0);
  assert.equal(h.el('#push-send').disabled, true);
  assert.match(h.el('#push-history').innerHTML, /&lt;script&gt;/);
  assert.ok(!h.el('#push-history').innerHTML.includes('<img'));
  await h.send(); assert.equal(h.calls.filter(c => c.url.endsWith('/send')).length, 0);
  h.el('#push-consent').checked = true; h.el('#push-consent').handlers.change();
  assert.equal(h.el('#push-send').disabled, false);
  await h.send(); await h.send();
  assert.equal(h.calls.filter(c => c.url.endsWith('/send')).length, 1);
  assert.equal(h.el('#push-send').disabled, true);
});

test('interface push : texte modifié invalide l’aperçu et les envois inactifs restent verrouillés', async () => {
  const h = harness(); await h.panel.load(); await h.submit();
  h.el('#push-consent').checked = true; h.el('#push-form').handlers.input();
  assert.equal(h.el('#push-consent').checked, false); assert.equal(h.el('#push-confirmation').hidden, true);
  h.disable(); await h.submit(); h.el('#push-consent').checked = true; h.el('#push-consent').handlers.change();
  assert.equal(h.el('#push-send').disabled, true);
  assert.match(h.el('#push-status').innerHTML, /non activés/);
});

test('interface push : aperçu expiré renouvelable et absence de double soumission simultanée', async () => {
  const h = harness(); await h.panel.load(); await h.submit(); const first = h.campaign().id;
  h.campaign().previewExpiresAt = 0; await h.submit(); assert.notEqual(h.campaign().id, first);
  let resolve; h.pending(new Promise(r => { resolve = r; }));
  const a = h.submit(), b = h.submit();
  assert.equal(h.calls.filter(c => c.url.endsWith('/preview')).length, 3);
  resolve(response({ ...h.state(), campaign: h.campaign() })); await Promise.all([a, b]);
});

test('interface push : session terminée ignore les réponses tardives et efface le contenu', async () => {
  const h = harness(); await h.panel.load();
  let resolve; h.pending(new Promise(r => { resolve = r; }));
  const load = h.panel.load(); h.setToken(''); h.panel.clear();
  resolve(response(h.state())); await load;
  assert.equal(h.el('#push-history').innerHTML, ''); assert.equal(h.el('#push-status').textContent, '');
  h.setToken('other'); h.pending(Promise.resolve(response({}, 401))); await h.panel.load();
  assert.equal(h.unauthorized(), 1);
});
