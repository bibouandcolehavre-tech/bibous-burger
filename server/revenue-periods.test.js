const test = require('node:test');
const assert = require('node:assert/strict');
const { revenuePeriods } = require('./revenue-periods');

const paid = (id, paidAt, total, extra = {}) => ({ id, total, status: 'delivered', payment: { status: 'PAID', paidAt }, ...extra });

test('revenue is split into Paris calendar day, Monday week and month', () => {
  const orders = [
    paid('today', '2026-09-24T08:00:00Z', 20),
    paid('paris-midnight', '2026-09-23T22:30:00Z', 10),
    paid('monday', '2026-09-21T18:00:00Z', 30),
    paid('previous-week', '2026-09-20T18:00:00Z', 40),
    paid('previous-month', '2026-08-31T18:00:00Z', 50)
  ];
  assert.deepEqual(revenuePeriods(orders, new Date('2026-09-24T12:00:00Z')), { today: 30, week: 60, month: 100 });
});

test('cancelled, unpaid and malformed orders never count as turnover', () => {
  const when = '2026-09-24T10:00:00Z';
  const orders = [
    paid('valid', when, 16.9),
    paid('cancelled', when, 100, { status: 'cancelled' }),
    { ...paid('pending', when, 100), payment: { status: 'PENDING', paidAt: when } },
    paid('invalid', when, 'not-a-number')
  ];
  assert.deepEqual(revenuePeriods(orders, new Date('2026-09-24T12:00:00Z')), { today: 16.9, week: 16.9, month: 16.9 });
});
