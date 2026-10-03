const test = require('node:test');
const assert = require('node:assert/strict');
const print = require('./auto-print');

const start = '2026-10-03T20:00:00.000Z';
const paid = (id, paidAt, status = 'confirmed') => ({
  id, number: id, status, payment: { status: 'PAID', paidAt },
  createdAt: paidAt, items: [{ name: 'Menu', quantity: 1, price: 15 }]
});

test('ne récupère ni ancienne commande, ni impayée, ni commande annulée', () => {
  const db = { orders: [paid('old', '2026-10-03T19:59:59.000Z'),
    { ...paid('unpaid', '2026-10-03T20:01:00.000Z'), payment: { status: 'PENDING' } },
    paid('cancelled', '2026-10-03T20:02:00.000Z', 'cancelled')] };
  assert.equal(print.claim(db, start), null);
  assert.equal(db.restaurantAutoPrint.startedAt, start);
});

test('une commande payée est réclamée une seule fois, même sans accusé de réception', () => {
  const db = { orders: [paid('one', '2026-10-03T20:01:00.000Z')] };
  const job = print.claim(db, start);
  assert.equal(job.order.id, 'one');
  assert.equal(print.claim(db, start), null);
  assert.throws(() => print.finish(db, 'one', { claimId: 'wrong', status: 'printed' }), /attente/);
  assert.deepEqual(print.finish(db, 'one', { claimId: job.claimId, status: 'printed' }), { status: 'printed' });
  assert.equal(print.claim(db, start), null);
});

test('un échec ou une incertitude ne déclenche pas de second ticket automatiquement', () => {
  for (const status of ['failed', 'uncertain']) {
    const db = { orders: [paid(status, '2026-10-03T20:01:00.000Z')] };
    const job = print.claim(db, start);
    print.finish(db, status, { claimId: job.claimId, status });
    assert.equal(print.claim(db, start), null);
  }
});

test('le bouton manuel peut réimprimer une ancienne commande sans doubler un envoi en cours', () => {
  const db = { orders: [paid('old', '2026-10-03T19:00:00.000Z', 'delivered')] };
  const first = print.manual(db, 'old', start, new Date(start));
  assert.throws(() => print.manual(db, 'old', start, new Date('2026-10-03T20:00:05Z')), /cours/);
  print.finish(db, 'old', { claimId: first.claimId, status: 'printed' });
  const second = print.manual(db, 'old', start, new Date('2026-10-03T20:02:00Z'));
  assert.notEqual(second.claimId, first.claimId);
});
