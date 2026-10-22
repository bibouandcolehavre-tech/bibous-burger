'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const pro = require('../restaurant-dashboard/phone-contact.js');
const driver = require('../driver-app/phone-contact.js');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
test('Pro and Driver share exactly the same safe telephone policy', () => {
  assert.equal(source('restaurant-dashboard/phone-contact.js'), source('driver-app/phone-contact.js'));
  for (const input of ['06 00 00 00 01', '06.00.00.00.01', '+33 (0)6 00 00 00 01', '0033600000001', '+33600000001']) {
    assert.equal(pro.href(input), 'tel:+33600000001');
    assert.equal(driver.href(input), 'tel:+33600000001');
  }
  assert.equal(pro.href('02 00 00 00 01'), 'tel:+33200000001');
  assert.equal(pro.href('+44 20 0000 0001'), 'tel:+442000000001');
});
test('never create executable, USSD, extension, ambiguous or missing telephone links', () => {
  for (const input of [null, '', {}, 600000001, '0000000000', '0600', '+33600', '+3306000000011', '06 00 00 00 01#123', '*21*0600000001#', '0600000001,123', '0600000001;123', 'javascript:alert(1)', 'tel:+33600000001', '++33600000001', '<img src=x>', '0600000001\" onclick=\"alert(1)']) {
    assert.equal(pro.href(input), null, String(input));
    assert.doesNotMatch(pro.markup(input), /href=/);
  }
  assert.doesNotMatch(pro.markup('<img src=x>'), /<img/);
});
test('call control displays the original number and only a telephone target, no contact tracking', () => {
  const markup = pro.markup('06 00 00 00 01');
  assert.match(markup, /href="tel:\+33600000001"/);
  assert.match(markup, /Appeler le client/);
  assert.match(markup, /customer-call-number">06 00 00 00 01/);
  assert.doesNotMatch(markup, /onclick|https:|token|target=/);
  for (const css of ['restaurant-dashboard/styles.css', 'driver-app/style.css']) assert.match(source(css), /\.customer-call\s*\{[^}]*min-height:48px/);
});
test('browser helper initializes without any request, navigation or call', () => {
  const window = {};
  vm.runInNewContext(source('restaurant-dashboard/phone-contact.js'), { window });
  assert.equal(window.KrokliPhoneContact.href('0600000001'), 'tel:+33600000001');
  assert.deepEqual(Object.keys(window), ['KrokliPhoneContact']);
});
test('actual Pro order rendering includes call controls without changing status, amount or address', () => {
  const app = source('restaurant-dashboard/app.js'), nodes = new Map();
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', hidden: false }); return nodes.get(selector); };
  const order = { id: 42, apiId: 'fictional-42', phone: '0600000001', customer: 'Client fictif', type: 'Livraison', total: 21, items: [], status: 'Prête', age: 'Exemple', slot: '19:15', deliveryAddress: { address: 'Adresse fictive' }, raw: { serviceDate: '2026-10-22', slot: '19:15' } };
  const context = { orders: [order], filter: 'all', archiveSearch: '', selectedOrderId: null, openOrderDisclosures: new Set(), pendingPrints: new Set(), uncertainPrints: new Set(), printFeedback: new Map(), pendingOrderChanges: new Set(), active: () => [order], cashDue: () => false, euro: n => n.toFixed(2), escapeHtml: s => String(s ?? ''), serviceDateLabel: s => s, orderItemMarkup: () => '', orderPricingMarkup: () => '', amendmentMarkup: () => '', actionMarkup: () => '', window: { KrokliPhoneContact: pro }, document: { querySelector: node, querySelectorAll: () => [] } };
  vm.runInNewContext(app.slice(app.indexOf('function renderOrders()'), app.indexOf('function refreshMetrics()')), context);
  const before = JSON.stringify(order); context.renderOrders();
  assert.match(node('#orders-list').innerHTML, /href="tel:\+33600000001"/);
  assert.equal(JSON.stringify(order), before);
});
test('actual Driver card withholds contact until accepted and has no automatic dialling', () => {
  const app = source('driver-app/app.js');
  const context = { window: { KrokliPhoneContact: driver }, escapeHtml: value => String(value ?? '') };
  vm.runInNewContext(app.slice(app.indexOf('function statusLabel('), app.indexOf('function renderDriver(')), context);
  const order = { id: 'fixture-1', number: 1, status: 'offered', customerPhone: '0600000001', customerName: 'Client fictif', restaurant: 'Restaurant fictif' };
  assert.doesNotMatch(context.driverCard(order), /tel:|0600000001|Client fictif/);
  order.status = 'accepted'; assert.match(context.driverCard(order), /href="tel:\+33600000001"/);
  assert.doesNotMatch(context.driverCard(order), /onclick|openURL/);
});
test('telephone helper loads before app and dispatch, including the offline public shell', () => {
  for (const [html, helper, app] of [['restaurant-dashboard/index.html','./phone-contact.js','./dispatch.js'], ['driver-app/index.html','/driver/phone-contact.js','/driver/app.js']]) {
    const text = source(html); assert.ok(text.indexOf(helper) >= 0); assert.ok(text.indexOf(helper) < text.indexOf(app));
  }
  assert.match(source('driver-app/sw.js'), /shell-v13/);
  assert.match(source('driver-app/sw.js'), /'\/driver\/phone-contact.js'/);
  assert.match(source('restaurant-dashboard/dispatch.js'), /contact\(order, details\)/);
});
