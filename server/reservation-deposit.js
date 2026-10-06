const { createHash } = require('node:crypto');

const DEPOSIT_PER_GUEST_EUROS = 10;
const DEPOSIT_TERMS_VERSION = 'attendance-refund-no-show-retained-v1';

function depositFingerprint(input) {
  return createHash('sha256').update(JSON.stringify({
    name: String(input.name || '').trim(),
    phone: String(input.phone || '').replace(/[\s.()-]/g, ''),
    guests: Number(input.guests),
    serviceDate: input.serviceDate,
    slot: input.slot,
    note: String(input.note || '').trim(),
  })).digest('hex');
}

function prepareDepositReservation(reservation, requestId, input) {
  reservation.status = 'awaiting_payment';
  reservation.requestId = requestId;
  reservation.requestFingerprint = depositFingerprint(input);
  reservation.amount = reservation.guests * DEPOSIT_PER_GUEST_EUROS;
  reservation.deposit = {
    amount: reservation.amount,
    amountPerGuest: DEPOSIT_PER_GUEST_EUROS,
    refundStatus: 'not_refunded',
    attendanceStatus: 'unrecorded',
    termsVersion: DEPOSIT_TERMS_VERSION,
    termsAcceptedAt: new Date().toISOString(),
  };
  return reservation;
}

function finalizePaidDepositReservation(reservation, now = new Date()) {
  if (!reservation?.deposit || reservation.payment?.status !== 'PAID' || reservation.status !== 'awaiting_payment') return false;
  reservation.status = 'pending';
  reservation.updatedAt = now.toISOString();
  reservation.deposit.paidAt = reservation.payment.paidAt || now.toISOString();
  return true;
}

function recordDepositAttendance(reservation, status, now = new Date()) {
  if (!reservation?.deposit || reservation.payment?.status !== 'PAID' || reservation.status !== 'confirmed') throw new Error('Confirme d’abord la table payée avant de noter la présence.');
  if (!['present', 'no_show'].includes(status)) throw new Error('Présence invalide.');
  if (status === 'no_show' && reservation.deposit.refundStatus === 'recorded') throw new Error('Un remboursement a déjà été enregistré pour cette table.');
  if (reservation.deposit.attendanceStatus === status) return reservation;
  reservation.deposit.attendanceHistory = [...(reservation.deposit.attendanceHistory || []), { status, recordedAt: now.toISOString() }].slice(-20);
  reservation.deposit.attendanceStatus = status;
  reservation.deposit.attendanceRecordedAt = now.toISOString();
  reservation.updatedAt = now.toISOString();
  return reservation;
}

module.exports = { DEPOSIT_PER_GUEST_EUROS, DEPOSIT_TERMS_VERSION, depositFingerprint, prepareDepositReservation, finalizePaidDepositReservation, recordDepositAttendance };
