const test = require('node:test');
const assert = require('node:assert/strict');
const { DEPOSIT_PER_GUEST_EUROS, DEPOSIT_TERMS_VERSION, depositCancellationDecision, cancelDepositReservation, depositFingerprint, prepareDepositReservation, finalizePaidDepositReservation, recordDepositAttendance } = require('./reservation-deposit');

test('a table-only booking charges exactly 10 euros per guest, never an order reward', () => {
  assert.equal(DEPOSIT_PER_GUEST_EUROS, 10);
  const input = { name: 'Camille Test', phone: '06 00 00 00 00', guests: 3, serviceDate: '2026-10-20', slot: '19:00', note: '' };
  const reservation = prepareDepositReservation({ guests: 3, status: 'pending' }, 'attempt-table-test-0001', input);
  assert.equal(reservation.amount, 30);
  assert.equal(reservation.deposit.amount, 30);
  assert.equal(reservation.deposit.termsVersion, DEPOSIT_TERMS_VERSION);
  assert.equal(reservation.deposit.attendanceStatus, 'unrecorded');
  assert.equal(reservation.status, 'awaiting_payment');
  assert.equal(reservation.requestFingerprint, depositFingerprint(input));
  assert.equal(finalizePaidDepositReservation(reservation), false);
  reservation.payment = { status: 'PAID', paidAt: '2026-10-06T12:00:00.000Z' };
  assert.equal(finalizePaidDepositReservation(reservation), true);
  assert.equal(reservation.status, 'pending');
  assert.equal(reservation.deposit.refundStatus, 'not_refunded');
  assert.throws(() => recordDepositAttendance(reservation, 'present'));
  reservation.status = 'confirmed';
  recordDepositAttendance(reservation, 'no_show');
  assert.equal(reservation.deposit.attendanceStatus, 'no_show');
  recordDepositAttendance(reservation, 'present');
  assert.equal(reservation.deposit.attendanceStatus, 'present');
  assert.deepEqual(reservation.deposit.attendanceHistory.map(entry => entry.status), ['no_show', 'present']);
  reservation.deposit.refundStatus = 'recorded';
  assert.throws(() => recordDepositAttendance(reservation, 'no_show'));
  assert.equal(finalizePaidDepositReservation(reservation), false);
});

test('cancellation cutoff is exactly one hour before the Paris reservation slot', () => {
  const reservation = { serviceDate: '2026-10-20', slot: '19:00' };
  assert.equal(depositCancellationDecision(reservation, 'customer', new Date('2026-10-20T15:59:59Z')).refundable, true);
  assert.equal(depositCancellationDecision(reservation, 'customer', new Date('2026-10-20T16:00:00Z')).refundable, true);
  assert.equal(depositCancellationDecision(reservation, 'customer', new Date('2026-10-20T16:00:01Z')).refundable, false);
  assert.equal(depositCancellationDecision(reservation, 'restaurant', new Date('2026-10-20T18:30:00Z')).refundable, true);
  assert.equal(depositCancellationDecision({ serviceDate: '2026-10-27', slot: '19:00' }, 'customer', new Date('2026-10-27T17:00:00Z')).refundable, true);
  assert.equal(depositCancellationDecision({ serviceDate: '2026-10-27', slot: '19:00' }, 'customer', new Date('2026-10-27T17:00:01Z')).refundable, false);
});

test('a paid table cancellation is recorded once and cannot overwrite an attendance decision', () => {
  const makeReservation = () => ({ serviceDate: '2026-10-20', slot: '19:00', status: 'confirmed', payment: { status: 'PAID' }, deposit: { attendanceStatus: 'unrecorded', refundStatus: 'not_refunded' } });
  const early = makeReservation();
  cancelDepositReservation(early, 'customer', new Date('2026-10-20T16:00:00Z'));
  assert.equal(early.status, 'cancelled');
  assert.equal(early.deposit.cancellation.refundable, true);
  assert.equal(early.deposit.cancellation.refundCutoffAt, '2026-10-20T16:00:00.000Z');
  assert.equal(cancelDepositReservation(early, 'restaurant', new Date('2026-10-20T16:30:00Z')).deposit.cancellation.by, 'customer');
  const late = makeReservation();
  cancelDepositReservation(late, 'customer', new Date('2026-10-20T16:00:01Z'));
  assert.equal(late.deposit.cancellation.refundable, false);
  const attended = makeReservation();
  attended.deposit.attendanceStatus = 'present';
  assert.throws(() => cancelDepositReservation(attended, 'customer', new Date('2026-10-20T15:00:00Z')));
});
