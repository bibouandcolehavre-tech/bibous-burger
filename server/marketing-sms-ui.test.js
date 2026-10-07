const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
function harness() {
  const elements = new Map(), calls = [], fields = { title: 'Fictif', body: '<script>fictif</script>', audience: 'all' };
  let token = 'test-session', enabled = true, campaign = null, pending = null;
  const el = id => { if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', checked: false, hidden: true, disabled: false, handlers: {}, addEventListener(e, fn) { this.handlers[e] = fn; }, reset() {} }); return elements.get(id); };
  const state = () => ({ connection: { enabled, missing: ['Twilio à vérifier'] }, allowedNow: true, optedInCustomers: 1, eligibleCustomers: 1, sampleStopUrl: '[STOP]', campaigns: campaign ? [{ ...campaign, recipients: undefined }] : [] });
  // Real FormData omits disabled controls: capture the values before freeze(true).
  const ctx = { window: {}, crypto, AbortSignal, Date, FormData: class { constructor(form) { this.values = form.disabled ? [] : Object.entries(fields); } [Symbol.iterator]() { return this.values[Symbol.iterator](); } }, fetch: async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null; calls.push({ url, body }); if (pending) return pending;
    if (url.endsWith('/preview')) campaign = { ...body, id: body.requestId, status: 'draft', expiresAt: Date.now() + 900000, customers: 1, recipients: [{ name: 'Alex <script>test</script>' }], segmentsPerMessage: 2, maxSegments: 2, counts: {} };
    if (url.endsWith('/send')) campaign.status = 'sent';
    return { ok: true, status: 200, json: async () => ({ ...state(), campaign }) };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/marketing-sms.js'), 'utf8'), ctx);
  const panel = ctx.window.BibouMarketingSms({ root: { querySelector: el, querySelectorAll: () => [...elements.values()], set innerHTML(_) {} }, api: 'https://fake.example/api', token: () => token, onUnauthorized: () => panel.clear() });
  return { panel, calls, el, fields, state, campaign: () => campaign, disable: () => { enabled = false; }, setToken: v => { token = v; }, pending: p => { pending = p; }, preview: () => el('#sms-form').handlers.submit({ preventDefault() {} }), send: () => el('#sms-send').handlers.click() };
}
test('SMS UI : lecture et aperçu sans envoi ; contenu échappé et facturation explicitement confirmée', async () => {
  const h = harness(); await h.panel.load(); await h.preview(); await h.send(); assert.equal(h.calls.filter(c => c.url.endsWith('/send')).length, 0);
  assert.deepEqual(h.calls.find(c => c.url.endsWith('/preview')).body, { ...h.fields, requestId: h.campaign().id });
  assert.match(h.el('#sms-history').innerHTML, /&lt;script&gt;/); assert.equal(h.el('#sms-send').disabled, true);
  h.el('#sms-consent').checked = true; h.el('#sms-consent').handlers.change(); await h.send(); await h.send();
  const sends = h.calls.filter(c => c.url.endsWith('/send')); assert.equal(sends.length, 1); assert.equal(sends[0].body.confirm, true); assert.equal(sends[0].body.maxSegments, 2);
});
test('SMS UI : connexion absente, aperçu expiré et SMS modifié restent verrouillés', async () => {
  const h = harness(); await h.panel.load(); h.disable(); await h.preview(); h.el('#sms-consent').checked = true; await h.send(); assert.equal(h.calls.filter(c => c.url.endsWith('/send')).length, 0);
  assert.match(h.el('#sms-status').innerHTML, /non activé/); h.el('#sms-form').handlers.input(); assert.equal(h.el('#sms-confirmation').hidden, true); assert.equal(h.el('#sms-consent').checked, false);
  const other = harness(); await other.panel.load(); await other.preview(); const first = other.campaign().id; other.campaign().expiresAt = 0; await other.preview(); assert.notEqual(other.campaign().id, first);
});
test('SMS UI : déconnexion ignore les réponses tardives et efface l’aperçu privé', async () => {
  const h = harness(); await h.panel.load(); let resolve; h.pending(new Promise(r => { resolve = r; })); const pending = h.panel.load(); h.setToken(''); h.panel.clear(); resolve({ ok: true, status: 200, json: async () => h.state() }); await pending;
  assert.equal(h.el('#sms-status').textContent, ''); assert.equal(h.el('#sms-confirmation').hidden, true); assert.equal(h.el('#sms-send').disabled, true);
});

test('SMS UI : liste nominative avant facturation, échappée et effacée à la déconnexion', async () => {
  const h = harness(); await h.panel.load(); await h.preview();
  assert.match(h.el('#sms-recipients').innerHTML, /Alex &lt;script&gt;/);
  assert.ok(!h.el('#sms-recipients').innerHTML.includes('<script>'));
  await h.panel.load(); assert.match(h.el('#sms-recipients').innerHTML, /Alex/);
  assert.equal(h.calls.filter(c => c.url.endsWith('/send')).length, 0);
  h.el('#sms-form').handlers.input(); assert.equal(h.el('#sms-recipients').innerHTML, '');
  await h.preview(); h.panel.clear(); assert.equal(h.el('#sms-recipients').innerHTML, '');
});
