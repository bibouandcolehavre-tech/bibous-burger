const MAX_AGE = 7 * 86400000;

function createAttempt(customerId, kind, input, now = Date.now()) {
  return { version: 1, customerId, kind, input, createdAt: now, requestId: `attempt-${now.toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
}

function parseAttempt(value, customerId, now = Date.now()) {
  try {
    if (typeof value !== 'string' || value.length > 65536) return null;
    const attempt = JSON.parse(value);
    if (attempt.version !== 1 || attempt.customerId !== customerId || !['order', 'bibou-plus'].includes(attempt.kind)) return null;
    if (!/^[a-zA-Z0-9_-]{16,96}$/.test(attempt.requestId) || !Number.isFinite(attempt.createdAt) || now - attempt.createdAt > MAX_AGE || attempt.createdAt > now + 60000) return null;
    if (attempt.kind === 'order' && (attempt.input?.customerId !== customerId || !Array.isArray(attempt.input?.items))) return null;
    return attempt;
  } catch { return null; }
}

function paymentState(record, kind, now = Date.now()) {
  if (!record) return 'not-created';
  if (record.status === 'cancelled') return 'cancelled';
  if (record.payment?.status === 'PAID' || (kind === 'bibou-plus' && record.activatedAt)) return 'paid';
  // A locally elapsed hold does NOT prove that a bank payment failed. Verify with
  // SumUp before allowing this attempt to be forgotten and a new one to be made.
  if (record.payment?.status === 'EXPIRED') return 'expired';
  if (!record.payment?.checkoutReference && kind === 'order' && now - Date.parse(record.createdAt) >= 15 * 60000) return 'expired';
  if (record.payment?.status === 'FAILED') return 'failed';
  return 'pending';
}

function safeCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'checkout.sumup.com' || url.hostname.endsWith('.sumup.com')) && !url.username && !url.password;
  } catch { return false; }
}

module.exports = { createAttempt, parseAttempt, paymentState, safeCheckoutUrl };
