const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { paidOrderTurnCount, remainingLabel, wheelPresentation, wheelDiameter } = require('../wheel-presentation');
const wheel = require('./wheel');
const now = new Date('2026-10-15T16:00:00Z');
const order = (id, subtotal, extra = {}) => ({ id, customerId: 'fictional', subtotal, discount: 0, total: subtotal,
  wheelEurosPerTurn: 15, status: 'confirmed', payment: { status: 'PAID', provider: 'sumup', paidAt: now.toISOString() }, ...extra });
const fixture = orders => ({ wheel: wheel.defaultWheel(), customers: [{ id: 'fictional', points: 0 }], orders, wheelSpins: [] });

test('wheel counter follows the server after 3 → 2 → 1 → 0 turns, without changing the 15-euro rate', () => {
  const paid = order('paid-three', 45), db = fixture([paid]);
  for (let played = 0; played <= 3; played++) {
    const state = wheel.customerWheelState(db, 'fictional', now), display = wheelPresentation(state, paid);
    assert.equal(display.available, 3 - played);
    assert.equal(display.remainingText, remainingLabel(3 - played));
    assert.equal(display.orderUnlockedText, 'Ta commande te permet de déverrouiller 3 tours de roue.');
    assert.equal(display.canRequest, played < 3);
    if (played < 3) wheel.spinWheel(db, 'fictional', { now, orderId: display.source.orderId, requestId: `fictional-spin-${played}`, randomInt: () => 60 });
  }
  assert.equal(db.wheelSpins.length, 3);
  assert.equal(remainingLabel(1), '1 tour restant'); assert.equal(remainingLabel(0), '0 tour restant');
});

test('wheel shows all unplayed order and referral turns, not just the first order', () => {
  const db = fixture([order('first', 15), order('second', 30)]);
  db.customers.push({ id: 'friend', referredByCustomerId: 'fictional', referralRewardGrantedAt: now.toISOString() });
  let shown = wheelPresentation(wheel.customerWheelState(db, 'fictional', now), db.orders[1]);
  assert.equal(shown.available, 4); assert.equal(shown.source.orderId, 'second');
  assert.equal(shown.fromOrders, 3); assert.equal(shown.fromReferrals, 1); assert.equal(shown.currentOrderRemaining, 2);
  for (let i = 0; i < 4; i++) {
    shown = wheelPresentation(wheel.customerWheelState(db, 'fictional', now), null, true);
    assert.equal(shown.available, 4 - i);
    wheel.spinWheel(db, 'fictional', { now, ...(shown.source ? { orderId: shown.source.orderId } : {}), requestId: `all-sources-spin-${i}`, randomInt: () => 60 });
  }
  assert.equal(wheelPresentation(wheel.customerWheelState(db, 'fictional', now), null, true).available, 0);
  assert.equal(db.wheelSpins.filter(spin => spin.referralCustomerId).length, 1);
});

test('displayed command turns match existing server rules including discounts, fees, refunds and legacy orders', () => {
  for (const paid of [order('one', 15), order('two', 30), order('three', 45), order('four', 60),
    order('discount', 45, { discount: 4.5, total: 40.5 }), order('fees', 14.99, { total: 18.99, deliveryFee: 4 }),
    order('refund', 45, { refund: { status: 'recorded', amount: 15 } }), order('refund-due', 45, { refund: { status: 'due' } }),
    order('cancelled', 45, { status: 'cancelled' }), order('unpaid', 45, { payment: { status: 'PENDING' } }),
    order('gift', 45, { payment: { status: 'PAID', provider: 'promotion', paidAt: now.toISOString() } }),
    order('cash', 45, { payment: { status: 'PAID', provider: 'cash', paidAt: now.toISOString() } }),
    order('legacy', 30, { wheelEurosPerTurn: undefined })]) {
    assert.equal(paidOrderTurnCount(paid), wheel.eligibleOrderTurns(paid, wheel.defaultWheel()), paid.id);
  }
  assert.equal(wheelPresentation({ status: 'inactive', available: 0 }, order('closed', 45)).orderUnlockedText, '');
});

test('counter is never optimistic and malformed or unavailable sources cannot authorize a request', () => {
  for (const value of [undefined, null, NaN, -1, Infinity, '3', 1.5]) {
    assert.equal(wheelPresentation({ available: value }).available, 0);
  }
  assert.equal(wheelPresentation({ available: 3 }).canRequest, false);
  const state = { status: 'active', available: 2, availableFromReferrals: 0, orderTurns: [{ orderId: 'existing', available: 5 }] };
  assert.equal(wheelPresentation(state).available, 2);
  assert.equal(wheelPresentation(state).fromOrders, 2);
  assert.deepEqual(state.orderTurns, [{ orderId: 'existing', available: 5 }]);
});

test('larger wheel fits its measured card, small phones, rotations and desktop without overflow', () => {
  for (const width of [0, 160, 228, 264, 298, 334, 374, 390, 430, 640, 1280]) {
    const diameter = wheelDiameter(width);
    assert(diameter >= 0 && diameter <= 360);
    if (width >= 36) assert(diameter + 36 <= width);
  }
  assert.equal(wheelDiameter(334), 298); assert.equal(wheelDiameter(390), 354);
  assert.equal(wheelDiameter(640), 360); assert.equal(wheelDiameter(NaN), 0);
});

test('the shared native/web wheel renders a large visible server counter and prevents double taps', () => {
  const source = fs.readFileSync(path.join(__dirname, '../WheelAfterPayment.js'), 'utf8');
  assert.match(source, /testID="wheel-remaining-counter"/);
  assert.match(source, /width=\{diameter\} height=\{diameter\}/);
  assert.match(source, /working\.current/);
  assert.match(source, /setState\(payload\.state\)/);
  assert.doesNotMatch(source, /setState\([^)]*available\s*[-+]/);
});
