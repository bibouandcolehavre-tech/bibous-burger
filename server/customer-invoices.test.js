const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { prepare, allocate, createInvoiceStore, validateSettings } = require('./customer-invoices');
const now = new Date('2026-10-22T12:00:00Z');
const customer = { id: 'fictitious', name: 'Client de démonstration', phone: '+33600000000' };
const settings = { confirm: 'ACTIVER LES FACTURES WEB', sameSaleReconciliation: true, menuPolicy: 'whole-menu-10',
  seller: { name: 'SOCIETE FICTIVE', tradeName: 'Exemple de restaurant', address: '1 rue fictive, 75000 Paris', siret: '00000000000000', vatNumber: 'FR00000000000', legalForm: 'SAS', rcs: 'RCS FICTIF', capitalCents: 100000 } };
const order = extra => ({ id: 'order-1', number: 1, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone,
  deliveryAddress: { address: '1 rue fictive', postalCode: '75000', city: 'Ville fictive' },
  items: [{ productId: 'duck-menu', name: 'Menu Duck', quantity: 1, price: 18.9, options: [{ groupId: 'drink', id: 'coca', label: 'Coca 33 cl', price: 0 }] }],
  subtotal: 18.9, discount: 1.89, deliveryFee: 3.99, total: 21, status: 'delivered', serviceDate: '2026-10-19', method: 'delivery', welcomeRewardApplied: true,
  payment: { status: 'PAID', provider: 'sumup', paidAt: '2026-10-19T19:00:00Z' }, ...extra });

test('invoice arithmetic: owner-confirmed whole-menu 10%, actual welcome discount and delivery reconcile with paid total', () => {
  const invoice = prepare(order(), customer, settings, now);
  assert.deepEqual([invoice.totalCents, invoice.htCents, invoice.vatCents], [2100, 1909, 191]);
  assert.equal(invoice.tax.length, 1); assert.equal(invoice.tax[0].rate, 1000);
  assert.equal(invoice.discountCents, 189); assert.equal(invoice.items[0].ttcCents, 1701);
  assert.equal(invoice.number, undefined); // preparing a document never allocates a number
});
test('invoice VAT: a separately purchased can is 5.5%, mixed delivery and discounts reconcile to every cent', () => {
  const items = [{ productId: 'classique', name: 'Burger', quantity: 1, price: 9.9, options: [] }, { productId: 'drink-coca', name: 'Coca', quantity: 1, price: 1.8, options: [] }];
  const result = prepare(order({ items, subtotal: 11.7, discount: 1.17, deliveryFee: 3.99, total: 14.52 }), customer, settings, now);
  assert.deepEqual(result.tax.map(r => r.rate), [550, 1000]);
  assert.equal(result.tax.reduce((n, r) => n + r.ttcCents, 0), 1452);
  assert.equal(result.tax.reduce((n, r) => n + r.deliveryCents, 0), 399);
  assert.equal(result.htCents + result.vatCents, result.totalCents);
  const dineIn = prepare(order({ items, subtotal: 11.7, discount: 0, deliveryFee: 0, total: 11.7, dineIn: true }), customer, settings, now);
  assert.deepEqual(dineIn.tax.map(r => r.rate), [1000]);
});
test('invoice VAT: current menu soft-drink identifiers are recognized without opening unknown drinks', () => {
  for (const id of ['coca', 'coca-cherry', 'coca-zero', 'coca-vanille', 'fanta-orange', 'fanta', 'fanta-dragon', 'fuse-menthe', 'lipton', 'lipton-framboise', 'lipton-peche', 'oasis', 'oasis-pomme', 'oasis-tropical', 'perrier', 'tropico', 'tropico-exotique', 'cristaline', 'eau']) {
    const sample = order(); sample.items[0].options[0].id = id;
    assert.equal(prepare(sample, customer, settings, now).tax[0].rate, 1000, id);
  }
  const unknown = order(); unknown.items[0].options[0].id = 'future-drink';
  assert.throws(() => prepare(unknown, customer, settings, now), /boisson/);
});
test('invoice VAT: owner-confirmed closed tiramisu pots are mapped individually, not inferred for future desserts', () => {
  const productRates = Object.fromEntries(['dessert-oreo', 'dessert-cookie', 'dessert-speculoos'].map(id => [id, { dineIn: 1000, takeaway: 550 }]));
  const mapped = validateSettings({ ...settings, productRates });
  for (const productId of Object.keys(productRates)) {
    const sample = order({ items: [{ productId, name: 'Tiramisu', quantity: 2, price: 3.9, options: [] }], subtotal: 7.8, discount: 0, deliveryFee: 0, total: 7.8 });
    assert.equal(prepare(sample, customer, mapped, now).tax[0].rate, 550);
    assert.equal(prepare({ ...sample, dineIn: true }, customer, mapped, now).tax[0].rate, 1000);
  }
  assert.throws(() => validateSettings({ ...settings, productRates: { 'dessert-future': { dineIn: 1000, takeaway: 550 } } }), /Validation des desserts/);
});
test('private billing details: a pickup customer can provide an address or explicitly omit it, never alter order totals', async t => {
  const pickup = order({ method: 'pickup', deliveryFee: 0, total: 17.01, deliveryAddress: null });
  assert.throws(() => prepare(pickup, customer, settings, now), /adresse/);
  const withAddress = prepare(pickup, customer, settings, now, { name: 'Client fictif complet', address: '2 rue de démonstration', omitAddress: false });
  assert.equal(withAddress.customerAddress, '2 rue de démonstration'); assert.equal(withAddress.totalCents, 1701);
  const withoutAddress = prepare(pickup, customer, settings, now, { name: 'Client fictif complet', address: '', omitAddress: true });
  assert.equal(withoutAddress.customerAddress, ''); assert.equal(withoutAddress.customerAddressOmittedAtRequest, true);
  assert.throws(() => prepare(pickup, customer, settings, now, { name: 'Client', address: '', omitAddress: false }), /adresse/);
  assert.throws(() => prepare(pickup, customer, settings, now, { name: 'Client', address: '', omitAddress: true, totalCents: 1 }), /Coordonnées/);
});
test('invoice VAT: unknown dessert/alcohol/promotion, changed order or unpaid order fail closed, never guessed', () => {
  const dessert = [{ productId: 'dessert-oreo', name: 'Tiramisu', quantity: 1, price: 3.9, options: [] }];
  assert.throws(() => prepare(order({ items: dessert, subtotal: 3.9, discount: 0, deliveryFee: 0, total: 3.9 }), customer, settings, now), /TVA de ce dessert/);
  const mapped = { ...settings, productRates: { 'dessert-oreo': { dineIn: 1000, takeaway: 550 } } };
  assert.equal(prepare(order({ items: dessert, subtotal: 3.9, discount: 0, deliveryFee: 0, total: 3.9 }), customer, mapped, now).tax[0].rate, 550);
  for (const extra of [{ payment: { status: 'PENDING' } }, { refund: {} }, { amendment: {} }, { promotion: {} }, { status: 'cancelled' }, { total: 21.01 }, { isTest: true }, { serviceDate: '2099-01-01' }, { deliveryAddress: null }])
    assert.throws(() => prepare(order(extra), customer, settings, now));
  const beer = structuredClone(order()); beer.items[0].options[0] = { groupId: 'drink', id: 'blonde', label: 'Blonde' };
  assert.throws(() => prepare(beer, customer, settings, now), /boisson/);
});
test('largest remainder allocation is exact and deterministic including rounding boundaries', () => {
  for (let total = 0; total < 100; total++) for (const weights of [[1, 1, 1], [0, 1, 2], [99, 22, 5]]) {
    const result = allocate(total, weights); assert.equal(result.reduce((a, b) => a + b, 0), total); assert(result.every(Number.isSafeInteger));
    assert.deepEqual(result, allocate(total, weights));
  }
  assert.throws(() => allocate(1, [0, 0]));
});
test('invoice ledger: concurrent/repeated requests return one immutable PDF and continuous series across restart', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'invoice-ledger-')), file = path.join(dir, 'invoices.json');
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const original = JSON.stringify(order()), store = createInvoiceStore(file, { now: () => now });
  assert.equal((await store.issue(order(), customer, { request: true })).status, 'requested');
  assert.equal((await store.read()).records.length, 0);
  await assert.rejects(store.configure({ ...settings, sameSaleReconciliation: false }));
  await store.configure(settings);
  const results = await Promise.all(Array.from({ length: 8 }, () => store.issue(order(), customer)));
  assert(results.every(r => r.number === 'WEB-2026-000001'));
  const pdf = await store.pdf('order-1'); assert(pdf.buffer.toString('ascii', 0, 5) === '%PDF-');
  const fresh = createInvoiceStore(file, { now: () => now });
  assert.deepEqual((await fresh.pdf('order-1')).buffer, pdf.buffer);
  assert.equal((await fresh.issue(order({ id: 'order-2', number: 2 }), customer)).number, 'WEB-2026-000002');
  assert.equal(JSON.stringify(order()), original, 'The original order/payment must not be mutated');
  const state = await fresh.read(); assert.equal(state.records.length, 2);
  assert(!state.records[0].pdfBase64.includes(customer.phone));
  const corrupted = structuredClone(state); corrupted.nextByYear['2026'] = 1; await fs.writeFile(file, JSON.stringify(corrupted));
  await assert.rejects(fresh.issue(order({ id: 'order-3', number: 3 }), customer), /Séquence/);
});
test('invoice SMS access: exact recipient, expiry, opaque token, no duplicate on ambiguous provider result', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'invoice-sms-')), file = path.join(dir, 'invoices.json');
  t.after(() => fs.rm(dir, { recursive: true, force: true })); let clock = now;
  const store = createInvoiceStore(file, { now: () => clock }); await store.configure(settings); await store.issue(order(), customer);
  await assert.rejects(store.prepareSms('order-1', customer, '+33600000001'));
  const job = await store.prepareSms('order-1', customer, customer.phone); assert.equal(job.token.length, 32);
  assert.equal((await store.access(job.token)).orderId, 'order-1');
  assert.equal((await fs.readFile(file, 'utf8')).includes(job.token), false);
  assert.equal((await store.finishSms(job.id, 'unknown')).status, 'uncertain');
  await assert.rejects(store.prepareSms('order-1', customer, customer.phone), /doublon/);
  clock = new Date(+now + 8 * 86400000); await assert.rejects(store.access(job.token), /expiré/);
  await assert.rejects(store.access('../arbitrary')); await assert.rejects(store.access('X'.repeat(32)));
});
test('invoice ledger corruption never resets history or allocates new numbers', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'invoice-corrupt-')), file = path.join(dir, 'invoices.json');
  t.after(() => fs.rm(dir, { recursive: true, force: true })); await fs.writeFile(file, '{broken');
  const store = createInvoiceStore(file); await assert.rejects(store.read(), /registre/); await assert.rejects(store.configure(settings));
  assert.equal(await fs.readFile(file, 'utf8'), '{broken');
});
test('existing L’Addition PDF: exact bytes, original number, no new invoice sequence, strict paid amount and original customer', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'invoice-import-')), file = path.join(dir, 'invoices.json');
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = createInvoiceStore(file, { now: () => now });
  const { renderInvoice } = require('./pdf/customer-invoice');
  const snapshot = prepare(order(), customer, settings, now); snapshot.number = 'FICTIF-1'; snapshot.seller = settings.seller;
  const pdf = await renderInvoice(snapshot, { example: true });
  const input = { confirm: true, source: 'laddition', number: 'FICTIF-1/2', documentDate: '2026-10-20', totalCents: 2100, sameSaleConfirmed: true, pdfBase64: pdf.toString('base64') };
  await assert.rejects(store.importOriginal(order(), customer, { ...input, totalCents: 2101 }));
  await assert.rejects(store.importOriginal(order(), customer, { ...input, sameSaleConfirmed: false }));
  await assert.rejects(store.importOriginal(order(), customer, { ...input, documentDate: '2026-02-31' }));
  await assert.rejects(store.importOriginal(order(), customer, { ...input, pdfBase64: Buffer.from('not PDF').toString('base64') }));
  const result = await store.importOriginal(order(), customer, input);
  assert.equal(result.number, 'FICTIF-1/2'); assert.equal(result.filename, 'facture-commande-1-laddition.pdf');
  assert.deepEqual((await store.pdf('order-1', customer.id)).buffer, pdf);
  assert.equal((await store.read()).settings, null); assert.deepEqual((await store.read()).nextByYear, {});
  assert.deepEqual(await store.importOriginal(order(), customer, input), result);
  assert.equal((await store.issue(order(), customer)).number, 'FICTIF-1/2');
  await assert.rejects(store.pdf('order-1', 'another-customer'));
  await assert.rejects(store.importOriginal(order({ id: 'order-2' }), customer, input), /autre commande/);
  await assert.rejects(store.importOriginal(order(), customer, { ...input, number: 'FICTIF-3' }), /déjà associée/);
  const job = await store.prepareSms('order-1', customer, customer.phone);
  assert.deepEqual((await store.access(job.token)).buffer, pdf);
  assert.equal((await createInvoiceStore(file).pdf('order-1')).filename, 'facture-commande-1-laddition.pdf');
});
