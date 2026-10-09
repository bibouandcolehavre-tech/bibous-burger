const { paymentError } = require('./sumup-payment');
const { applyVerifiedTerminalTransaction } = require('./kiosk-terminal-payment');
// Read-only reconciliation. The API credential is never returned to a client.
async function reconcileTerminalPayment(order, { apiKey, merchantCode, fetchImpl = fetch }) {
  const payment = order.payment;
  if (!apiKey || !merchantCode || payment?.channel !== 'sumup_terminal'
      || payment.merchantCode !== merchantCode) throw paymentError();
  const url = new URL(`https://api.sumup.com/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions`);
  url.searchParams.set('foreign_transaction_id', payment.foreignTransactionId);
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
    });
  } catch { throw paymentError(); }
  // Not found is not a failed charge and never permits a fresh attempt.
  if (response.status === 404) return payment;
  if (!response.ok) throw paymentError();
  let transaction;
  try { transaction = await response.json(); } catch { throw paymentError(); }
  applyVerifiedTerminalTransaction(order, transaction, merchantCode);
  if (['FAILED', 'CANCELLED'].includes(payment.status) && payment.verifiedAt && Date.parse(order.createdAt) + 15 * 60000 <= Date.now()) payment.status = 'EXPIRED';
  return payment;
}
module.exports = { reconcileTerminalPayment };
