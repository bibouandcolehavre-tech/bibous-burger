'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const printer = require('../restaurant-dashboard/epson-print');
const { prepare } = require('./customer-invoices');
const seller = { name: 'SOCIETE FICTIVE', tradeName: 'RESTAURANT FICTIF', address: '1 rue de démonstration, 75000 Ville fictive', siret: '00000000000000', vatNumber: 'FR00000000000', legalForm: 'SAS', capitalCents: 100000, rcs: 'RCS FICTIF' };
function fixture(extra = {}) {
  const customer = { id: 'fictif', name: 'Client fictif & famille' };
  const order = { id: 'order-999', number: 999, customerId: customer.id, customerName: customer.name,
    method: 'delivery', status: 'delivered', serviceDate: '2026-10-19',
    deliveryAddress: { address: '1 rue de démonstration particulièrement longue', postalCode: '75000', city: 'Ville fictive' },
    items: [{ productId: 'classique', name: 'Burger <fictif>', quantity: 2, price: 9.9, options: [] },
      { productId: 'drink-coca', name: 'Canette fictive', quantity: 1, price: 1.8, options: [] }],
    subtotal: 21.6, discount: 2.16, deliveryFee: 3.99, total: 23.43,
    payment: { status: 'PAID', provider: 'sumup', paidAt: '2026-10-19T18:00:00Z' } };
  return { ...prepare(order, customer, { seller }, new Date('2026-10-23T12:00:00Z')), number: 'WEB-2026-999999', seller, ...extra };
}
test('thermal invoice: same recorded number, paid amount, mixed VAT and no lost cent', () => {
  const invoice = fixture(), original = JSON.stringify(invoice), lines = printer.invoiceLines(invoice), text = lines.join('\n');
  assert(lines.every(line => Array.from(line).length <= 32));
  for (const term of ['FACTURE ACQUITTEE', invoice.number, 'P.U. HT', 'Taux 5,5 %', 'Taux 10 %', 'Livraison TTC 3,99 EUR', 'Remise totale -2,16 EUR', 'TOTAL TTC 23,43 EUR', 'RESTE A PAYER 0,00 EUR', 'Meme numero et meme vente.', seller.siret]) assert(text.includes(term), term);
  for (const row of invoice.tax) assert(text.includes('TVA ' + (row.vatCents / 100).toFixed(2).replace('.', ',') + ' EUR'));
  assert.equal(JSON.stringify(invoice), original);
  const xml = printer.invoiceEnvelope(invoice);
  assert.match(xml, /Burger &lt;fictif&gt;/); assert.match(xml, /Client fictif &amp; famille/);
  assert.equal((xml.match(/<cut type="feed"\/>/g) || []).length, 1);
  assert.doesNotMatch(xml, /NON FACTURE TVA|width="[234]"|dw="true"/);
});
test('thermal invoice: long names, addresses and XML cannot truncate or inject printer commands', () => {
  const invoice = fixture({ customerName: 'Client ' + 'W'.repeat(100) + ' <cut type="feed"/>', customerAddress: 'adresse très longue '.repeat(30) + 'FIN-ADRESSE' });
  const lines = printer.invoiceLines(invoice), xml = printer.invoiceEnvelope(invoice);
  assert(lines.every(line => Array.from(line).length <= 32));
  assert(lines.join('\n').includes('FIN-ADRESSE'));
  assert.equal((xml.match(/<cut type="feed"\/>/g) || []).length, 1);
  assert.match(xml, /&lt;cut/);
});
test('thermal invoice: no raw order, imported PDF, missing tax, corrupted total or incomplete identity', () => {
  for (const extra of [{ source: 'laddition' }, { number: undefined }, { tax: [] }, { totalCents: 2344 }, { htCents: 1 }, { seller: { name: 'Fictif' } }, { items: [] }]) assert.throws(() => printer.invoiceEnvelope(fixture(extra)));
  const bad = fixture(); bad.items[0].ttcCents++; assert.throws(() => printer.invoiceEnvelope(bad));
  assert.throws(() => printer.invoiceEnvelope({ id: 'order-1', payment: { status: 'PAID' }, total: 23.43 }));
});
test('guest kiosk invoice: explicit dashboard-only identity, no guest session issuance, unchanged VAT policy', () => {
  const guest = { id: 'guest-fictif', isKioskGuest: true }, billing = { name: 'Client Fictif Complet', address: '', omitAddress: true };
  const order = { id: 'order-10', number: 10, customerId: guest.id, customerName: 'Client borne', kioskGuest: true, kioskImmediate: true, dineIn: true, method: 'pickup',
    status: 'delivered', serviceDate: '2026-10-19', items: [{ productId: 'classique', name: 'Classique fictif', quantity: 1, price: 9.9, options: [] }],
    subtotal: 9.9, discount: 0, deliveryFee: 0, total: 9.9, payment: { status: 'PAID', provider: 'cash' } };
  const clock = new Date('2026-10-23T12:00:00Z');
  assert.throws(() => prepare(order, guest, { seller }, clock, billing));
  assert.throws(() => prepare(order, guest, { seller }, clock, undefined, { dashboardGuest: true }), /nom complet/);
  assert.throws(() => prepare(order, guest, { seller }, clock, { ...billing, name: 'Client borne' }, { dashboardGuest: true }), /nom complet/);
  assert.throws(() => prepare({ ...order, kioskImmediate: false }, guest, { seller }, clock, billing, { dashboardGuest: true }));
  const snapshot = prepare(order, guest, { seller }, clock, billing, { dashboardGuest: true });
  assert.equal(snapshot.method, 'Sur place'); assert.equal(snapshot.totalCents, 990); assert.equal(snapshot.tax[0].rate, 1000); assert.equal(snapshot.customerName, billing.name);
  assert.equal(prepare({ ...order, dineIn: false }, guest, { seller }, clock, billing, { dashboardGuest: true }).method, 'À emporter');
});
