const test = require('node:test');
const assert = require('node:assert/strict');
const printer = require('../restaurant-dashboard/epson-print');

test('sonde sans impression : document Epson vide', () => {
  const request = printer.statusEnvelope();
  assert.match(request, /<epos-print[^>]*><\/epos-print>/);
  assert.doesNotMatch(request, /<text|<cut/);
});

test('ticket de préparation : commande payée, options échappées et aucun contenu fiscal inventé', () => {
  const request = printer.preparationEnvelope({
    id: 'order-1', number: 123, payment: { status: 'PAID' }, method: 'pickup',
    serviceDate: '2026-09-30', slot: '20:20', customerName: 'Camille & Co',
    items: [{ name: 'Burger <Classique>', quantity: 2, options: [{ label: 'Sans oignons' }] }],
    comment: 'Sauce > à part',
  });
  assert.match(request, /#123/);
  assert.match(request, /<text>RETRAIT&#10;<\/text><text>POUR LE 30\/09\/2026&#10;<\/text><text>A 20:20&#10;<\/text>/);
  assert.match(request, /Camille &amp; Co/);
  assert.match(request, /2 x Burger &lt;Classique&gt;/);
  assert.match(request, /Sauce &gt; à part/);
  assert.match(request, /TICKET DE PREPARATION - NON FISCAL/);
  assert.match(request, /<cut type="feed"\/>/);
  assert.doesNotMatch(request, /<text>[^<]*<Classique>/);
});

test('repas réservé à table : le ticket affiche clairement l’heure d’arrivée et le nombre de personnes', () => {
  const request = printer.preparationEnvelope({
    id: 'order-table', number: 260, payment: { status: 'PAID' }, method: 'pickup', dineIn: true,
    serviceDate: '2026-10-07', slot: '19:20', tableGuests: 3, tableNote: 'Chaise bébé',
    customerName: 'Camille', items: [{ name: 'Burger classique', quantity: 1, options: [] }],
  });
  assert.match(request, /SUR PLACE - TABLE \+ REPAS/);
  assert.match(request, /ARRIVEE A 19:20/);
  assert.match(request, /TABLE DE 3 PERSONNE\(S\)/);
  assert.match(request, /Table : Chaise bébé/);
  assert.doesNotMatch(request, /<text>RETRAIT&#10;<\/text>/);
});

test('ticket refusé pour commande impayée ou compte de démonstration', () => {
  const order = { id: 'o', payment: { status: 'PAID' }, method: 'pickup', items: [] };
  assert.throws(() => printer.preparationEnvelope({ ...order, payment: { status: 'PENDING' } }));
  assert.throws(() => printer.preparationEnvelope({ ...order, reviewMode: true }));
});

test('adresse locale validée et réponse machine explicite', () => {
  assert.equal(printer.endpoint('192.168.192.50'), 'https://192.168.192.50/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000');
  assert.throws(() => printer.endpoint('192.168.192.50/path'));
  assert.deepEqual(printer.responseResult({ getElementsByTagName: () => [{ getAttribute: key => ({ success: 'true', code: '', status: '2' })[key] }] }), { success: true, code: '', status: '2' });
});

test('sonde envoie un document vide sans imprimer et lit la confirmation Epson', async () => {
  let sent;
  const response = { getElementsByTagName: () => [{ getAttribute: key => ({ success: 'true', code: '', status: '2' })[key] }] };
  const result = await printer.probe('192.168.192.50', { xhrFactory: () => ({
    open(method, url) { assert.equal(method, 'POST'); assert.match(url, /^https:\/\/192\.168\.192\.50\//); },
    setRequestHeader() {},
    send(body) { sent = body; this.status = 200; this.responseXML = response; queueMicrotask(() => this.onload()); },
  }) });
  assert.equal(result.success, true);
  assert.doesNotMatch(sent, /<text|<cut/);
});

test('ticket d’essai distinct de toute commande réelle', () => {
  const request = printer.testEnvelope();
  assert.match(request, /ESSAI BIBOU/);
  assert.match(request, /AUCUNE COMMANDE REELLE/);
  assert.match(request, /<cut type="feed"\/>/);
  assert.doesNotMatch(request, /Client|Tel|TVA/);
});

test('choisit la commande réelle réglée et terminée la plus récente pour un unique test', () => {
  const base = { id: 'old', status: 'delivered', payment: { status: 'PAID' }, method: 'pickup', items: [{ name: 'Burger', quantity: 1 }], createdAt: '2026-09-29T12:00:00.000Z' };
  const selected = printer.completedOrderForTest([
    base,
    { ...base, id: 'new', createdAt: '2026-09-30T12:00:00.000Z' },
    { ...base, id: 'unpaid', payment: { status: 'PENDING' }, createdAt: '2026-09-30T14:00:00.000Z' },
    { ...base, id: 'ongoing', status: 'confirmed', createdAt: '2026-09-30T15:00:00.000Z' },
    { ...base, id: 'review', reviewMode: true, createdAt: '2026-09-30T16:00:00.000Z' },
  ]);
  assert.equal(selected.id, 'new');
  assert.equal(printer.completedOrderForTest([]), null);
});

test('duplicata contient la vraie commande mais interdit de la préparer et ne prétend pas être fiscal', () => {
  const order = { id: 'order-2', number: 824, status: 'delivered', payment: { status: 'PAID' }, method: 'delivery',
    serviceDate: '2026-09-29', slot: '20:20', customerName: 'Camille',
    deliveryAddress: { address: '153 Quai Georges V', postalCode: '76600', city: 'Le Havre' },
    items: [{ name: 'Menu Classique', quantity: 1, options: [{ label: 'Boisson citron' }] }] };
  const request = printer.preparationEnvelope(order, { duplicateTest: true });
  assert.match(request, /#824/);
  assert.match(request, /<text>LIVRAISON&#10;<\/text><text>POUR LE 29\/09\/2026&#10;<\/text><text>CRENEAU 20:20&#10;<\/text>/);
  assert.match(request, /Menu Classique/);
  assert.match(request, /Boisson citron/);
  assert.match(request, /153 Quai Georges V 76600 Le Havre/);
  assert.doesNotMatch(request, /\[object Object\]/);
  assert.equal((request.match(/DUPLICATA TEST - NE PAS PREPARER/g) || []).length, 2);
  assert.match(request, /NON FISCAL/);
  assert.throws(() => printer.preparationEnvelope({ ...order, status: 'confirmed' }, { duplicateTest: true }));
});

test('récapitulatif client : articles, paiement initial, état et aucun taux de TVA inventé', () => {
  const request = printer.orderReceiptEnvelope({
    id: 'paid-1', number: 42, status: 'delivered', method: 'pickup', serviceDate: '2026-10-01', slot: '19:20', createdAt: '2026-09-30T18:00:00Z',
    customerName: 'Camille & Co', payment: { status: 'PAID', paidAt: '2026-09-30T18:01:00Z' },
    items: [
      { productId: 'classique-menu', name: 'Menu <Classique>', quantity: 2, price: 14.9,
        options: [{ groupId: 'drink', label: 'Coca & frites' }] },
      { productId: 'classique', name: 'Classique', quantity: 1, price: 9.9, options: [] },
    ],
    total: 39.7, discount: 0,
  });
  assert.match(request, /COMMANDE #42/);
  assert.match(request, /Camille &amp; Co/);
  assert.match(request, /2 x Menu &lt;Classique&gt;/);
  assert.match(request, /<text dw="false" dh="true" em="true"\/><text>RETRAIT&#10;<\/text><text>POUR LE 01\/10\/2026&#10;<\/text><text>A 19:20&#10;<\/text>/);
  assert.match(request, /Paiement : 30\/09\/2026/);
  assert.match(request, /<text dw="true" dh="true" em="true"\/><text>MENU&#10;<\/text><text>2 x Menu &lt;Classique&gt;&#10;<\/text>/);
  assert.match(request, /<text dw="true" dh="true" em="true"\/><text>BURGER SEUL&#10;<\/text><text>1 x Classique&#10;<\/text>/);
  assert.match(request, /<text dw="false" dh="true" em="false"\/><text>&#32;&#32;Boisson : Coca &amp; frites/);
  assert.match(request, /Boisson : Coca &amp; frites/);
  assert.match(request, /Prix article : 29,80 EUR/);
  assert.match(request, /<text>PAIEMENT INITIAL&#10;<\/text><text dw="true" dh="true"\/><text>39,70 EUR&#10;<\/text>/);
  assert.ok((request.match(/<text>&#10;<\/text>/g) || []).length >= 6, 'le ticket sépare visuellement les groupes');
  assert.match(request, /NON FACTURE TVA/);
  assert.doesNotMatch(request, /5,5 %|10 %|TVA collectee/);
  assert.match(request, /<cut type="feed"\/>/);
});

test('récapitulatif livraison : le créneau figure en haut, pas seulement l’heure du paiement', () => {
  const request = printer.orderReceiptEnvelope({
    id: 'paid-delivery', number: 259, method: 'delivery', serviceDate: '2026-10-01', slot: '19:00 – 19:20',
    payment: { status: 'PAID' }, items: [{ productId: 'classique', name: 'Classique', quantity: 1, price: 9.9 }], total: 9.9,
  });
  assert.match(request, /COMMANDE #259/);
  assert.match(request, /<text>LIVRAISON&#10;<\/text><text>POUR LE 01\/10\/2026&#10;<\/text><text>CRENEAU 19:00 - 19:20&#10;<\/text>/);
});

test('récapitulatif refusé pour paiement non confirmé ou prix manquant', () => {
  const order = { id: 'paid-1', method: 'pickup', payment: { status: 'PAID' }, items: [{ name: 'Burger', quantity: 1, price: 10 }], total: 10 };
  assert.throws(() => printer.orderReceiptEnvelope({ ...order, payment: { status: 'PENDING' } }));
  assert.throws(() => printer.orderReceiptEnvelope({ ...order, reviewMode: true }));
  assert.throws(() => printer.orderReceiptEnvelope({ ...order, items: [{ name: 'Burger', quantity: 1 }] }));
});

test('les intitulés MENU et BURGER SEUL suivent les produits et non le nom libre', () => {
  const base = { id: 'paid-2', number: 43, method: 'pickup', payment: { status: 'PAID' }, total: 26.8 };
  const request = printer.orderReceiptEnvelope({ ...base, items: [
    { productId: 'taurus', name: 'Taurus', quantity: 1, price: 16.9, options: [] },
    { productId: 'classique', name: 'Classique', quantity: 1, price: 9.9, options: [] },
  ] });
  assert.match(request, /<text>MENU&#10;<\/text><text>1 x Taurus/);
  assert.match(request, /<text>BURGER SEUL&#10;<\/text><text>1 x Classique/);
});
