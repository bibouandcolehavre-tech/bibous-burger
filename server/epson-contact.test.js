const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const printer = require('../restaurant-dashboard/epson-print');

// Inspect the actual ePOS XML, including inherited printer text state.
function runs(xml) {
  const state = { width: 1, height: 1, em: false, align: 'left' }, result = [];
  for (const match of xml.matchAll(/<text\b([^>]*?)(?:\/>|>(.*?)<\/text>)/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    if ('dw' in attrs) state.width = attrs.dw === 'true' ? 2 : 1;
    if ('dh' in attrs) state.height = attrs.dh === 'true' ? 2 : 1;
    for (const key of ['width', 'height']) if (key in attrs) state[key] = Number(attrs[key]);
    if ('em' in attrs) state.em = attrs.em === 'true';
    if ('align' in attrs) state.align = attrs.align;
    if (match[2]) result.push({ ...state, text: match[2].replace(/&#10;/g, '').replace(/&#32;/g, ' ')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') });
  }
  return result;
}
const fixture = extra => ({ id: 'contact-fixture', number: 999, status: 'confirmed', method: 'delivery',
  serviceDate: '2026-10-20', slot: '19:15', customerName: 'Camille Martin', customerPhone: '06 00 00 00 00',
  deliveryAddress: { address: '12 rue des Exemples', postalCode: '76600', city: 'Le Havre' },
  payment: { status: 'PAID', paidAt: '2026-10-20T16:00:00Z' }, total: 18.89, deliveryFee: 3.99,
  items: [{ productId: 'classique-menu', name: 'Menu exemple', quantity: 1, price: 14.9, options: [{ label: 'Sans oignons' }] }], ...extra });
function valuesBetween(all, label, next) {
  const start = all.findIndex(run => run.text === label);
  const values = [];
  for (const run of all.slice(start + 1)) {
    if (run.width !== 2 || run.height !== 2 || !run.text) break;
    values.push(run);
  }
  return values;
}
for (const [name, render] of [['préparation', printer.preparationEnvelope], ['récapitulatif', printer.orderReceiptEnvelope]]) {
  test(`${name} : nom, téléphone et adresse sont en double taille et gras avant les produits`, () => {
    const order = fixture(), original = JSON.stringify(order), xml = render(order), all = runs(xml);
    for (const text of ['Camille Martin', '06 00 00 00 00', '12 rue des', 'Exemples', '76600 Le Havre']) {
      const run = all.find(run => run.text === text && run.width === 2 && run.height === 2 && run.em);
      assert.deepEqual(run, { width: 2, height: 2, em: true, align: 'left', text });
    }
    for (const label of ['CLIENT', 'TELEPHONE', 'ADRESSE DE LIVRAISON']) {
      assert.equal(all.filter(run => run.text === label).length, 1);
      assert.ok(xml.indexOf(label) < xml.indexOf('1 x Menu exemple'));
    }
    assert.equal(JSON.stringify(order), original);
    assert.equal((xml.match(/<cut type="feed"\/>/g) || []).length, 1);
  });
  test(`${name} : aucune adresse longue ni aucun nom ne sont tronqués sur rouleau étroit`, () => {
    const customerName = 'Éléonore Saint-Exupéry Dupont', street = '123 avenue des Très Longs Noms de Rues appartement 42 bâtiment B';
    const all = runs(render(fixture({ customerName, deliveryAddress: { address: street, postalCode: '76600', city: 'Le Havre' } })));
    const contact = all.filter(run => run.width === 2 && run.height === 2 && run.em && run.align === 'left');
    assert.ok(contact.every(run => Array.from(run.text).length <= 16));
    assert.equal(valuesBetween(all, 'CLIENT', 'TELEPHONE').map(run => run.text).join(' '), customerName);
    assert.equal(valuesBetween(all, 'ADRESSE DE LIVRAISON', 'REMARQUE CLIENT').map(run => run.text).join(' '), `${street} 76600 Le Havre`);
    const unbroken = 'X'.repeat(55);
    assert.equal(valuesBetween(runs(render(fixture({ customerName: unbroken }))), 'CLIENT', 'TELEPHONE').map(run => run.text).join(''), unbroken);
  });
  test(`${name} : adresse texte historique et plusieurs lignes conservées, objets invalides ignorés`, () => {
    const xml = render(fixture({ deliveryAddress: '12 rue Exemple\nAppartement 42\r\n76600 Le Havre' }));
    assert.match(xml, /12 rue Exemple/); assert.match(xml, /Appartement 42/); assert.match(xml, /76600 Le Havre/);
    for (const invalid of [undefined, null, {}, { address: {}, postalCode: [], city: null }]) {
      const missing = render(fixture({ deliveryAddress: invalid, customerPhone: {}, customerName: null }));
      assert.match(missing, /NON RENSEIGNEE/); assert.doesNotMatch(missing, /\[object Object\]|undefined|null/);
    }
  });
  test(`${name} : aucun élément XML ou caractère de commande injecté par les coordonnées`, () => {
    const xml = render(fixture({ customerName: 'Camille & <cut/>', customerPhone: '06\u000000 00 00 00',
      deliveryAddress: { address: '<cut type="feed"/> & porte', postalCode: '76600', city: 'Le Havre' } }));
    assert.match(xml, /&amp;/); assert.match(xml, /&lt;cut/);
    assert.equal((xml.match(/<cut type="feed"\/>/g) || []).length, 1);
    assert.doesNotMatch(xml, /\u0000|\u001b/);
  });
  test(`${name} : retrait et sur place ne révèlent pas une ancienne adresse de livraison`, () => {
    for (const extra of [{ method: 'pickup' }, { method: 'delivery', dineIn: true }]) {
      const xml = render(fixture(extra));
      assert.doesNotMatch(xml, /ADRESSE DE LIVRAISON|12 rue des/);
      assert.match(xml, /Camille Martin/); assert.match(xml, /06 00 00 00 00/);
    }
  });
  test(`${name} : après les coordonnées, le style des remarques et produits reste inchangé`, () => {
    const all = runs(render(fixture({ comment: 'Sauce à part' })));
    assert.deepEqual(all.find(run => run.text === 'Sauce à part'), { width: 1, height: 2, em: true, align: 'left', text: 'Sauce à part' });
    const label = all.find(run => run.text === 'ADRESSE DE LIVRAISON');
    assert.equal(label.width, 1); assert.equal(label.height, 1);
    const product = all.find(run => run.text === '1 x Menu exemple');
    assert.equal(product.width, name === 'préparation' ? 1 : 2);
    assert.equal(product.height, name === 'préparation' ? 1 : 2);
    const hour = all.find(run => run.text === '19:15');
    assert.equal(hour.width, 3); assert.equal(hour.height, 3);
  });
}
test('chaque entrée de l’impression charge la nouvelle version, sans changer le tri ou les paiements', () => {
  for (const file of ['index.html', 'ancienne-interface.html', 'epson-test.html', 'epson-real-order-test.html']) {
    const html = fs.readFileSync(path.join(__dirname, '../restaurant-dashboard', file), 'utf8');
    assert.match(html, /epson-print\.js\?v=customer-contact-large-20261020/);
  }
  const source = fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/app.js'), 'utf8');
  assert.equal((source.match(/BibouEpsonPrint\.orderReceiptEnvelope\(/g) || []).length, 2);
});
