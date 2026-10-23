'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
// DOM contract fixture, not browser automation. All network/printer calls are fake.
class Element {
  constructor(html = '', attrs = '') { this.style = {}; this.dataset = {}; this.disabled = false; this.hidden = /\bhidden\b/.test(attrs); this.attrs = attrs; this.innerHTML = html; }
  set innerHTML(value) {
    this.html = value; this.nodes = new Map(); this.buttons = [];
    for (const tag of value.matchAll(/<(button|form|div|p)\b([^>]*)>/g)) {
      const node = new Element('', tag[2]); this.buttons.push(...(tag[1] === 'button' ? [node] : []));
      for (const attr of tag[2].matchAll(/\b(data-[\w-]+)/g)) this.nodes.set(`[${attr[1]}]`, node);
    }
  }
  get innerHTML() { return this.html; }
  hasAttribute(name) { return new RegExp(`\\b${name}(?:\\s|=|$)`).test(this.attrs); }
  querySelector(selector) { return this.nodes.get(selector) || null; }
  querySelectorAll(selector) { return selector.startsWith('button') ? this.buttons.filter(b => !selector.includes(':not') || !b.hasAttribute('data-close')) : []; }
  showModal() { this.open = true; } close() { this.open = false; } remove() { this.removed = true; } addEventListener() {}
}
function fixture({ mode = 'issued', persisted = new Map(), slow = false, dropSession = false } = {}) {
  const order = { id: 'order-999', number: 999, total: 10, customerName: 'Client fictif', customerPhone: '' };
  let element, current = true, issued = mode !== 'guest', sends = 0, probes = 0, releaseSend;
  const calls = [], api = '/api';
  const document = { createElement: () => element = new Element(), body: { appendChild() {} } };
  const context = { document, AbortController, setTimeout, clearTimeout, sessionStorage: { getItem: k => persisted.get(k), setItem: (k,v) => persisted.set(k,v), removeItem: k => persisted.delete(k) },
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form.values?.[key]; } },
    fetch: async (route, options) => {
      calls.push({ route, method: options.method, body: options.body });
      const data = route.endsWith('/settings') ? { configured: true }
        : route.endsWith('/status') ? (issued ? { status: 'issued', source: mode === 'imported' ? 'laddition' : 'application', number: 'WEB-2026-999999' } : { status: 'validation_required', billing: { name: '', address: '' } })
        : route.endsWith('/issue') ? (issued = true, { status: 'issued' }) : { invoice: { number: 'WEB-2026-999999' } };
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    },
    window: { BibouEpsonPrint: {
      invoiceEnvelope: () => '<?xml version="1.0"?><fake-invoice/>',
      probe: async host => { assert.equal(host, '192.168.192.50'); probes++; if (dropSession) current = false; if (mode === 'offline') throw Error('Fausse imprimante hors ligne.'); return { success: true }; },
      send: async () => { sends++; if (slow) await new Promise(resolve => releaseSend = resolve); if (mode === 'uncertain') throw Error('Faux délai dépassé.'); return { success: true }; }
    } }
  };
  vm.runInNewContext(fs.readFileSync(__dirname + '/invoice-panel.js', 'utf8'), context);
  const open = printOnOpen => context.window.BibouInvoices.open(order, { api, headers: {}, current: () => current, printOnOpen });
  return { open, context, calls, get element() { return element; }, get sends() { return sends; }, get probes() { return probes; }, release() { releaseSend?.(); }, persisted };
}
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
test('owner print: existing invoice is one click, no download, issuance, SMS or second sale', async () => {
  const f = fixture(); await f.open(true);
  assert.equal(f.sends, 1); assert.equal(f.probes, 1);
  assert(f.calls.every(call => call.method === 'GET'));
  assert(!f.calls.some(call => /issue|\/pdf|\/sms/.test(call.route)));
  assert.match(f.element.querySelector('[data-message]').textContent, /Impression confirmée/);
  assert.equal(f.element.querySelector('[data-print-check]').hidden, true);
});
test('opening the invoice panel for inspection never prints without explicit print intent', async () => {
  const f = fixture(); await f.open(false); assert.equal(f.sends, 0); assert.equal(f.probes, 0);
  assert.match(f.element.innerHTML, /Imprimer la facture/); assert.doesNotMatch(f.element.innerHTML, /Télécharger le PDF/);
});
test('double tap is locked while printer request is in flight', async () => {
  const f = fixture({ slow: true }); await f.open(false);
  f.element.querySelector('[data-print]').onclick(); await settle();
  assert.equal(f.sends, 1); assert.equal(f.element.querySelector('[data-print]').disabled, true);
  f.element.querySelector('[data-print]').onclick(); await settle(); assert.equal(f.sends, 1);
  f.release(); await settle(); assert.equal(f.element.querySelector('[data-print]').disabled, false);
});
test('uncertain send survives reopening/reload; acknowledgement never prints automatically', async () => {
  const f = fixture({ mode: 'uncertain' }); await f.open(true); assert.equal(f.sends, 1);
  assert.match(f.element.querySelector('[data-message]').textContent, /Vérifiez le papier/);
  assert.equal(f.element.querySelector('[data-print-check]').hidden, false);
  await f.open(true); assert.equal(f.sends, 1);
  const reload = fixture({ persisted: f.persisted }); await reload.open(true); assert.equal(reload.sends, 0);
  reload.element.querySelector('[data-print-check]').onclick(); assert.equal(reload.sends, 0);
  reload.element.querySelector('[data-print]').onclick(); await settle(); assert.equal(reload.sends, 1);
});
test('offline or changed owner session cannot send the invoice to the printer', async () => {
  for (const options of [{ mode: 'offline' }, { dropSession: true }]) {
    const f = fixture(options); await f.open(true); assert.equal(f.sends, 0); assert.equal(f.persisted.size, 0);
  }
});
test('guest requires explicit billing then issues once and prints the recorded invoice', async () => {
  const f = fixture({ mode: 'guest' }); await f.open(true); assert.equal(f.sends, 0);
  const form = f.element.querySelector('[data-billing]'); form.values = { name: 'Client Fictif Complet', address: '', omitAddress: 'on' };
  form.onsubmit({ preventDefault() {} }); await settle(); assert.equal(f.sends, 1);
  const issueCalls = f.calls.filter(c => c.route.endsWith('/issue')); assert.equal(issueCalls.length, 1);
  assert.deepEqual(JSON.parse(issueCalls[0].body), { confirm: true, billing: { name: 'Client Fictif Complet', address: '', omitAddress: true } });
  assert.equal(f.calls.filter(c => c.route.endsWith('/print')).length, 1);
});
test('imported original is not rebuilt or sent to Epson; original PDF remains an explicit action', async () => {
  const f = fixture({ mode: 'imported' }); await f.open(true);
  assert.equal(f.sends, 0); assert(f.element.querySelector('[data-original]')); assert.equal(f.element.querySelector('[data-print]'), null);
  assert(!f.calls.some(c => c.route.endsWith('/pdf')));
});
