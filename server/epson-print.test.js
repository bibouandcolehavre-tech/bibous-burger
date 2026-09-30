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
  assert.match(request, /Camille &amp; Co/);
  assert.match(request, /2 x Burger &lt;Classique&gt;/);
  assert.match(request, /Sauce &gt; à part/);
  assert.match(request, /TICKET DE PREPARATION - NON FISCAL/);
  assert.match(request, /<cut type="feed"\/>/);
  assert.doesNotMatch(request, /<text>[^<]*<Classique>/);
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
