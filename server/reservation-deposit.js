const { createHash } = require('node:crypto');

const DEPOSIT_PER_GUEST_EUROS = 10;

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

module.exports = { DEPOSIT_PER_GUEST_EUROS, depositFingerprint, prepareDepositReservation, finalizePaidDepositReservation };
