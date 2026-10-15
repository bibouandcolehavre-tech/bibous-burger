const test = require('node:test'), assert = require('node:assert/strict');
const { defaultContest, contestRanking } = require('./referral-contest');

test('Classement : les conversions Paris sont bornées, pas répétées pour chaque commande', () => {
  const stamp = '2026-10-15T10:00:00.000Z';
  const db = { customers: Array.from({ length: 100 }, (_, i) => ({ id: 'fictitious-' + i, points: 123, createdAt: stamp })),
    orders: Array.from({ length: 1000 }, (_, i) => ({ id: 'fictitious-order-' + i, customerId: 'fictitious-' + (i % 100),
      total: 15, status: 'confirmed', createdAt: stamp, payment: { status: 'PAID', paidAt: stamp } })) };
  const contest = { ...defaultContest(), status: 'published', startDate: '2026-10-15', startTime: '11:00', endDate: '2026-12-31',
    entries: db.customers.map(customer => ({ customerId: customer.id, alias: customer.id, joinedAt: stamp, shareEvents: [] })) };
  const before = JSON.stringify(db), original = Intl.DateTimeFormat.prototype.formatToParts;
  let conversions = 0, ranking;
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) { conversions++; return original.apply(this, args); };
  try { ranking = contestRanking(db, contest, new Date('2026-10-15T12:00:00Z')); }
  finally { Intl.DateTimeFormat.prototype.formatToParts = original; }
  assert.equal(ranking.length, 100); assert(ranking.every(row => row.score === 150));
  assert(conversions <= 4, 'Expected bounded Paris conversions, got ' + conversions);
  assert.equal(JSON.stringify(db), before);
});
