const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const printer = require('../restaurant-dashboard/epson-print');
const order = { id: 'ticket-size-fixture', number: 42, method: 'pickup', serviceDate: '2026-10-16', slot: '19:15',
  payment: { status: 'PAID' }, customerName: 'Client de test', total: 9.9,
  items: [{ productId: 'classique', name: 'Classique', quantity: 1, price: 9.9 }] };

// Model documented ePOS text state to verify that scaling cannot leak to the
// following client details, products or customer remarks. No printer is called.
function textRuns(xml) {
  const state = { width: 1, height: 1, em: false, align: 'left' }, runs = [];
  for (const match of xml.matchAll(/<text\b([^>]*?)(?:\/>|>(.*?)<\/text>)/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    if ('dw' in attrs) state.width = attrs.dw === 'true' ? 2 : 1;
    if ('dh' in attrs) state.height = attrs.dh === 'true' ? 2 : 1;
    if ('width' in attrs) state.width = Number(attrs.width);
    if ('height' in attrs) state.height = Number(attrs.height);
    if ('em' in attrs) state.em = attrs.em === 'true';
    if ('align' in attrs) state.align = attrs.align;
    if (match[2]) runs.push({ ...state, text: match[2].replace(/&#10;/g, '').replace(/&#32;/g, ' ') });
  }
  return runs;
}
for (const [name, render] of [['preparation', printer.preparationEnvelope], ['receipt', printer.orderReceiptEnvelope]]) {
  test(`${name}: pickup hour is isolated, centered, bold and triple sized; input is unchanged`, () => {
    const before = JSON.stringify(order), runs = textRuns(render(order));
    const time = runs.filter(run => run.text === '19:15');
    assert.deepEqual(time, [{ width: 3, height: 3, em: true, align: 'center', text: '19:15' }]);
    assert.ok(runs.some(run => run.text === 'HEURE DE RETRAIT'));
    assert.ok(runs.some(run => run.text === 'POUR LE 16/10/2026'));
    assert.equal(JSON.stringify(order), before);
    // The later owner-approved contact layout uses a separate large client
    // block; verify its state and the reset, not the obsolete single-line label.
    assert.deepEqual(runs.find(run => run.text === 'Client de test'), { width: 2, height: 2, em: true, align: 'left', text: 'Client de test' });
    const separator = runs.find(run => run.text === '--------------------------------');
    assert.equal(separator.width, 1); assert.equal(separator.height, 1); assert.equal(separator.em, false);
  });
  test(`${name}: delivery range fits a narrow 32-column receipt, with full original times`, () => {
    const run = textRuns(render({ ...order, method: 'delivery', slot: '19:00 – 19:20' })).find(run => run.text === '19:00 - 19:20');
    assert.ok(run); assert.equal(run.width, 2); assert.equal(run.height, 3); assert.equal(run.em, true);
    assert.ok(run.text.length * run.width <= 32);
  });
  test(`${name}: missing time stays explicit and kiosk immediate orders invent no scheduled time`, () => {
    const missing = textRuns(render({ ...order, slot: '' })).find(run => run.text === 'HEURE A CONFIRMER');
    assert.ok(missing); assert.equal(missing.height, 3);
    const xml = render({ ...order, kioskImmediate: true, kioskDiningMode: 'take' });
    assert.match(xml, /COMMANDE BORNE/); assert.doesNotMatch(xml, /HEURE DE RETRAIT|19:15|height="3"/);
  });
  test(`${name}: remarks still print bold at their existing size and escape text`, () => {
    const xml = render({ ...order, slot: '<script>19:15</script>', comment: 'Sauce à part' });
    assert.doesNotMatch(xml, /<script>/); assert.match(xml, /&lt;script&gt;/);
    const remark = textRuns(xml).find(run => run.text === 'Sauce à part');
    assert.equal(remark.width, 1); assert.equal(remark.height, 2); assert.equal(remark.em, true);
  });
}
test('both automatic and manual back-office printing use the corrected receipt generator', () => {
  const source = fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/app.js'), 'utf8');
  assert.equal((source.match(/BibouEpsonPrint\.orderReceiptEnvelope\(/g) || []).length, 2);
  for (const file of ['index.html', 'ancienne-interface.html', 'epson-test.html', 'epson-real-order-test.html']) {
    const html = fs.readFileSync(path.join(__dirname, '../restaurant-dashboard', file), 'utf8');
    assert.match(html, /epson-print\.js\?v=(?:pickup-ticket-time-20261016|customer-contact-large-20261020|thermal-invoice-20261023)/);
  }
});
