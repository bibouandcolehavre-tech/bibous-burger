const { randomUUID } = require('node:crypto');
const { paymentError } = require('./sumup-payment');
const cents = value => typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) : null;

// Persist this intent before opening the SDK. Reuse it after any interruption;
// a missing result never authorizes creating another charge.
function prepareTerminalIntent(order, merchantCode, now = new Date()) {
  if (!merchantCode || order.status !== 'awaiting_payment') throw paymentError('Commande non disponible pour un paiement au terminal.');
  if (order.payment) {
    if (order.payment.channel !== 'sumup_terminal'
        || order.payment.merchantCode !== merchantCode
        || order.payment.amountCents !== cents(order.paidTotal ?? order.total)) {
      throw paymentError('Un autre parcours de paiement existe déjà ou la commande a changé.');
    }
    // Only a failed/cancelled result fetched from the merchant API allows a
    // deliberate retry. A missing SDK callback or API 404 does not.
    if (!['FAILED', 'CANCELLED'].includes(order.payment.status) || !order.payment.transactionId || !order.payment.verifiedAt) return order.payment;
    order.terminalPaymentHistory = [...(order.terminalPaymentHistory || []), { ...order.payment }];
  }
  const amount = cents(order.paidTotal ?? order.total);
  if (!Number.isSafeInteger(amount) || amount < 100) throw paymentError('Le terminal nécessite un montant minimum de 1 €.');
  order.payment = {
    channel: 'sumup_terminal', status: 'PENDING', currency: 'EUR', amountCents: amount,
    merchantCode, foreignTransactionId: `bibou-kiosk-${randomUUID()}`,
    createdAt: now.toISOString(), updatedAt: now.toISOString()
  };
  // Existing hold/recovery logic uses the presence of this reference to keep
  // uncertain payments reserved. It is not a hosted checkout identifier.
  order.payment.checkoutReference = order.payment.foreignTransactionId;
  return order.payment;
}

// Transaction must come from the authenticated merchant Transactions API,
// not from SDK callbacks, browser input, or webhook payloads.
function applyVerifiedTerminalTransaction(order, transaction, merchantCode, now = new Date()) {
  const p = order.payment;
  if (!p || p.channel !== 'sumup_terminal' || !transaction?.id
      || p.merchantCode !== merchantCode || transaction.merchant_code !== merchantCode
      || transaction.foreign_transaction_id !== p.foreignTransactionId
      || transaction.currency !== 'EUR' || cents(transaction.amount) !== p.amountCents
      || cents(order.paidTotal ?? order.total) !== p.amountCents
      || transaction.payment_type !== 'POS'
      || !['PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(transaction.status)
      || (p.transactionId && p.transactionId !== transaction.id)) {
    throw paymentError('Le paiement au terminal ne correspond pas à cette commande. Ne payez pas à nouveau.');
  }
  p.transactionId = transaction.id;
  p.updatedAt = now.toISOString();
  p.verifiedAt = now.toISOString();
  // Reversed payments need reconciliation, never a fresh preparation trigger.
  const events = [...(Array.isArray(transaction.events) ? transaction.events : []),
    ...(Array.isArray(transaction.transaction_events) ? transaction.transaction_events : [])];
  const reversal = ['REFUNDED', 'CHARGEBACK', 'NON_COLLECTION', 'CANCELLED'].includes(transaction.simple_status)
    || events.some(event => ['REFUND', 'CHARGE_BACK'].includes(event.type || event.event_type)
      && event.status !== 'FAILED');
  if (transaction.status === 'REFUNDED' || reversal) p.status = 'REFUNDED';
  else if (p.status !== 'PAID' && p.status !== 'REFUNDED') {
    p.status = transaction.status === 'SUCCESSFUL' ? 'PAID' : transaction.status;
  }
  if (p.status === 'PAID') p.paidAt ||= now.toISOString();
  return p;
}
module.exports = { prepareTerminalIntent, applyVerifiedTerminalTransaction };
