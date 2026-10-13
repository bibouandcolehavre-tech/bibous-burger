const test = require('node:test'), assert = require('node:assert/strict');
const { statistics, windowFor } = require('./dashboard-statistics');
const now = new Date('2026-10-13T18:00:00Z');
const paid = (id, total, at, customerId = 'c1', extra = {}) => ({ id, customerId, total, createdAt: at, status: 'delivered', payment: { status: 'PAID', paidAt: at }, ...extra });
test('statistics: real recorded payments only, exact cents, refunds on their actual day, pending refunds not silently deducted', () => {
  const db = { customers: [{ id: 'c1', name: 'SECRET', phone: 'PRIVATE' }], orders: [paid('a', 19.4, '2026-10-13T10:00:00Z'), paid('b', 10.9, '2026-10-12T10:00:00Z', 'c1', { status: 'cancelled', refund: { status: 'recorded', amount: 10.9, recordedAt: '2026-10-13T11:00:00Z' } }), paid('c', 7.9, '2026-10-13T10:30:00Z', null), paid('d', 15, '2026-10-13T11:00:00Z', 'c2', { payment: { status: 'PENDING' } }), paid('e', 2, '2026-10-13T12:00:00Z', 'c1', { paidTotal: 5, refund: { status: 'due', amount: 3 } }), paid('f', 99, '2026-10-13T12:00:00Z', 'c1', { reviewMode: true })], bibouPlusPurchases: [{ id: 'plus', amount: 9.99, payment: { status: 'PAID', paidAt: '2026-10-13T09:00:00Z' } }] };
  const original = structuredClone(db), result = statistics(db, { date: '2026-10-13', granularity: 'hour' }, now);
  assert.deepEqual(result.totals, { grossCents: 4229, refundCents: 1090, netCents: 3139, orderCount: 3, subscriptionCount: 1 });
  assert.equal(result.pendingRefundsCents, 300); assert.equal(result.customers.unlinkedOrders, 1);
  assert.equal(result.series.reduce((sum, bucket) => sum + bucket.netCents, 0), result.totals.netCents);
  assert.equal(result.fictitious, false); assert(!JSON.stringify(result).includes('SECRET')); assert(!JSON.stringify(result).includes('PRIVATE')); assert.deepEqual(db, original);
});
test('statistics: returning clients are measured from preceding paid purchases, not accounts or unpaid/cancelled orders', () => {
  const db = { customers: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], orders: [paid('a', 10, '2026-10-01T10:00:00Z'), paid('b', 15, '2026-10-13T10:00:00Z'), paid('c', 15, '2026-10-13T11:00:00Z', 'c2'), paid('d', 15, '2026-10-13T12:00:00Z', 'c2'), paid('e', 15, '2026-10-12T12:00:00Z', 'c3', { status: 'cancelled' })] };
  const result = statistics(db, { date: '2026-10-13' }, now);
  assert.deepEqual(result.customers, { identified: 2, returning: 1, firstPurchaseInPeriod: 1, recurring: 2, returningPercent: 50, unlinkedOrders: 0 });
});
test('statistics: Paris midnight, Monday weeks, leap month and year, repeated local DST hour', () => {
  assert.deepEqual(windowFor('day', '2026-10-11'), { start: '2026-10-05', end: '2026-10-11' });
  assert.deepEqual(windowFor('week', '2028-02-01'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(windowFor('month', '2026-01-01'), { start: '2026-01-01', end: '2026-12-31' });
  const db = { orders: [paid('a', 1, '2026-10-24T23:30:00Z'), paid('b', 2, '2026-10-25T00:30:00Z'), paid('c', 3, '2026-10-25T01:30:00Z')] };
  const result = statistics(db, { date: '2026-10-25', granularity: 'hour' }, new Date('2026-10-26T12:00:00Z'));
  assert.equal(result.totals.netCents, 600); assert.equal(result.series.find(bucket => bucket.key === '02').netCents, 500);
  for (const granularity of ['hour', 'day', 'week', 'month']) assert(statistics(db, { date: '2026-10-25', granularity }, new Date('2026-10-26T12:00:00Z')).series.length > 0);
});
test('statistics: invalid dates rejected, duplicate payments and unknown dates reported, no fabricated history', () => {
  for (const date of ['bad', '2026-02-30', '2026-13-01']) assert.throws(() => statistics({}, { date }, now), { statusCode: 400 });
  assert.throws(() => statistics({}, { granularity: 'evil' }, now), { statusCode: 400 });
  const result = statistics({ orders: [paid('a', 0.1, '2026-10-13T10:00:00Z'), paid('a', 0.1, '2026-10-13T10:00:00Z'), paid('b', 4, 'invalid')] }, { date: '2026-10-13' }, now);
  assert.equal(result.totals.netCents, 10); assert.equal(result.warnings.duplicateRecords, 1); assert.equal(result.warnings.missingPaymentDates, 1);
  assert.equal(statistics({}, { date: '2026-10-13' }, now).customers.returningPercent, null);
});
