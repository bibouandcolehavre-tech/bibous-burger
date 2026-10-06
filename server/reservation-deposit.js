const { createHash } = require('node:crypto');
const { serviceSlotInstant } = require('./availability');

const DEPOSIT_PER_GUEST_EUROS = 10;
const DEPOSIT_TERMS_VERSION = 'attendance-or-hour-early-cancellation-refund-v2';
const CANCELLATION_REFUND_NOTICE_MS = 60 * 60 * 1000;

function depositCancellationDecision(reservation, by, now = new Date()) {
  if (!['customer', 'restaurant'].includes(by)) throw new Error('Motif d’annulation invalide.');
  const appointment = serviceSlotInstant(reservation.serviceDate, String(reservation.slot).slice(0, 5));
  if (!appointment) throw new Error('Heure de réservation invalide.');
  const cancelledAt = new Date(now);
  if (!Number.isFinite(cancelledAt.getTime())) throw new Error('Heure d’annulation invalide.');
  return {
    by,
    cancelledAt: cancelledAt.toISOString(),
    refundable: by === 'restaurant' || cancelledAt.getTime() <= appointment.getTime() - CANCELLATION_REFUND_NOTICE_MS,
    refundCutoffAt: new Date(appointment.getTime() - CANCELLATION_REFUND_NOTICE_MS).toISOString(),
  };
}

function cancelDepositReservation(reservation, by, now = new Date()) {
  if (!reservation?.deposit || reservation.payment?.status !== 'PAID' || reservation.orderId) throw new Error('Cette réservation ne relève pas du paiement de table seule.');
  if (reservation.status === 'cancelled') return reservation;
  if (!['pending', 'confirmed'].includes(reservation.status)) throw new Error('Cette réservation ne peut plus être annulée ici.');
  if (reservation.deposit.attendanceStatus !== 'unrecorded') throw new Error('La présence a déjà été enregistrée. Contacte le restaurant.');
  reservation.deposit.cancellation = depositCancellationDecision(reservation, by, now);
  reservation.status = 'cancelled';
  reservation.updatedAt = reservation.deposit.cancellation.cancelledAt;
  return reservation;
}

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

module.exports = { DEPOSIT_PER_GUEST_EUROS, DEPOSIT_TERMS_VERSION, CANCELLATION_REFUND_NOTICE_MS, depositCancellationDecision, cancelDepositReservation, depositFingerprint, prepareDepositReservation, finalizePaidDepositReservation, recordDepositAttendance };
