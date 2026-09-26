const { createHash } = require('node:crypto');
const { normalizePromoCode } = require('./promo-codes');

function validateRequestId(value) {
  if (value === undefined) return null; // Older published clients remain supported.
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,96}$/.test(value)) {
    throw Object.assign(new Error('Identifiant de tentative invalide.'), { statusCode: 400 });
  }
  return value;
}

function orderFingerprint(input) {
  const selection = item => ({ groupId: item.groupId, id: item.id });
  const canonical = {
    customerId: input.customerId, method: input.method, serviceDate: input.serviceDate, slot: input.slot,
    items: Array.isArray(input.items) ? input.items.map(item => ({
      productId: item.productId, quantity: item.quantity,
      selections: Array.isArray(item.selections) ? item.selections.map(selection) : item.selections,
    })) : input.items,
  };
  if (typeof input.comment === 'string' && input.comment.trim()) canonical.comment = input.comment.trim();
  const promoCode = normalizePromoCode(input.promoCode);
  if (promoCode) canonical.promoCode = promoCode;
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

module.exports = { validateRequestId, orderFingerprint };
