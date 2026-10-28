const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

function renderFixture({ slot = '19:15', serviceDate = '2026-10-17', type = 'Retrait', filter = 'all' } = {}) {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { hidden: false, innerHTML: '', value: '' });
    return nodes.get(selector);
  };
  const order = { id: 42, apiId: 'fixture-42', customer: 'Client de test', phone: '', items: [],
    total: 16.9, type, slot: `Demain · ${slot}`, status: 'Prête', age: 'Il y a 5 min',
    raw: { serviceDate, slot, payment: { status: 'PAID' } } };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const context = { Set, Map, Date, Number, String, orders: [order], filter, archiveSearch: '', selectedOrderId: null,
    openOrderDisclosures: new Set(), pendingPrints: new Set(), uncertainPrints: new Set(), pendingOrderChanges: new Set(), printFeedback: new Map(),
    window: {}, escapeHtml, euro: value => `${value.toFixed(2)} €`, active: () => [order], cashDue: () => false,
    serviceDateLabel: date => date === '2026-10-17' ? 'Demain' : date,
    orderItemMarkup: () => '', orderPricingMarkup: () => '', amendmentMarkup: () => '', actionMarkup: () => '',
    reservations: [], feedHealth: { orders: { lastSuccess: 1 }, reservations: { lastSuccess: 1 } }, revenue: { today: 0 },
    todayDateKey: () => '2026-10-16', updateText() {},
    document: { querySelector: node, querySelectorAll: () => [] } };
  vm.runInNewContext(source.slice(source.indexOf('function renderOrders()'), source.indexOf('function refreshMetrics()')), context);
  vm.runInNewContext(source.slice(source.indexOf('function renderHome()'), source.indexOf('function setOrderFilter(')), context);
  context.renderOrders();
  context.renderHome();
  return { queue: node('#order-queue').innerHTML, detail: node('#orders-list').innerHTML, home: node('#home-orders').innerHTML, order };
}

test('pickup time is visible directly on the card and home; date is retained without a queue selection', () => {
  const fixture = renderFixture();
  assert.equal(fixture.queue, '');
  for (const html of [fixture.detail, fixture.home]) {
    assert.match(html, /<strong class="order-time">19:15<\/strong>/);
    assert.match(html, /Retrait(?: prévu)? · Demain/);
    assert.doesNotMatch(html, /order-time">Demain/);
  }
  assert.equal(fixture.order.raw.slot, '19:15');
  assert.equal(fixture.order.status, 'Prête');
});
test('delivery time ranges and ASAP labels remain intact, without time conversion', () => {
  for (const slot of ['19:15–19:30', 'Dès que possible', '00:15']) {
    const fixture = renderFixture({ slot, type: 'Livraison' });
    assert.ok(fixture.detail.includes(`<strong class="order-time">${slot}</strong>`));
    assert.match(fixture.detail, /Livraison prévue · Demain/);
  }
});
test('service date and time are escaped, including archived order details', () => {
  const fixture = renderFixture({ slot: '<img src=x onerror=alert(1)>', serviceDate: '<script>bad</script>', filter: 'Historique' });
  assert.doesNotMatch(fixture.detail, /<img|<script>/);
  assert.match(fixture.detail, /&lt;img/);
  assert.match(fixture.detail, /&lt;script/);
});
test('large bold styling is scoped to order times and asset URLs are refreshed', () => {
  const css = fs.readFileSync(path.join(__dirname, 'pwa.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.match(css, /\.queue-order \.order-time,\.home-row \.order-time\{[^}]*font-size:26px;[^}]*font-weight:900/);
  assert.match(css, /\.order-appointment>\.order-time\{[^}]*font-size:clamp\(32px,5vw,40px\);[^}]*font-weight:900/);
  assert.ok(html.includes('pwa.css?v=pickup-time-20261016'));
  assert.ok(html.includes('app.js?v=service-direct-20261028'));
});

module.exports = { renderFixture };
