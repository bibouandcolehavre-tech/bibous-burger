const CASH_HOLD_MS = 15 * 60 * 1000;
const error = message => Object.assign(new Error(message), { statusCode: 409 });
function cashRequested(input) {
  if (input.paymentMethod !== undefined && !['card','cash'].includes(input.paymentMethod)) throw Object.assign(new Error('Mode de paiement invalide.'), { statusCode: 400 });
  return input.paymentMethod === 'cash';
}
function prepareCashOrder(order) {
  if (order.method !== 'pickup' || order.payment || order.status !== 'awaiting_payment' || !Number.isFinite(order.total) || order.total <= 0) throw error('Cette commande ne peut pas être réglée en espèces.');
  order.kioskCash = true;
  order.payment = { provider:'cash', channel:'kiosk_cash', status:'CASH_DUE', amount:order.total, currency:'EUR' };
  return order;
}
function cashDue(order) { return order?.kioskCash === true && order.status === 'awaiting_payment' && order.payment?.provider === 'cash' && order.payment.status === 'CASH_DUE'; }
function confirmCashOrder(order, amount, now = new Date()) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.round(amount*100) !== Math.round(order.total*100)) throw error('Le montant encaissé doit correspondre au total de cette commande.');
  if (!order.kioskCash || order.payment?.provider !== 'cash' || order.status === 'cancelled') throw error('Aucun encaissement espèces à confirmer pour cette commande.');
  if (order.payment.status === 'PAID') return false; // Retry is idempotent, never grant twice.
  if (!cashDue(order) || !Number.isFinite(Date.parse(order.createdAt)) || now.getTime() >= Date.parse(order.createdAt) + CASH_HOLD_MS) throw error('Cette demande espèces a expiré. Ne prenez pas d’argent : recréez la commande sur la borne.');
  order.payment.status = 'PAID';
  order.payment.paidAt = now.toISOString();
  order.payment.collectedAt = now.toISOString();
  order.payment.collectedBy = 'restaurant';
  return true;
}
function cancelCashOrder(order, now = new Date()) {
  if (order?.kioskCash && order.payment?.provider === 'cash' && order.status === 'cancelled' && order.payment.status === 'CANCELLED') return false;
  if (!cashDue(order)) throw error('Seule une demande espèces non encaissée peut être annulée ici.');
  order.status='cancelled'; order.updatedAt=now.toISOString(); order.payment.status='CANCELLED';
  return true;
}
module.exports = { CASH_HOLD_MS, cashRequested, prepareCashOrder, cashDue, confirmCashOrder, cancelCashOrder };
