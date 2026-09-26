// Only use a promotion returned by the authenticated API. Final pricing and
// fulfillment authorization remain server-side. No redeemable code is bundled.
function previewPromotion(base, subtotal, promotion) {
  if (!promotion) return base;
  if (typeof promotion.code !== 'string' || promotion.discountPercent !== 100 || promotion.freeDelivery !== true) throw new Error('Réponse de code promo invalide.');
  return { ...base, discountRate: 1, discount: subtotal, discountLabel: `Code promo ${promotion.code} · −100 %`, deliveryFee: 0, total: 0 };
}
function differentPendingPromo(attempt, kind, input) {
  if (!attempt || (attempt.kind !== 'order' && kind !== 'order')) return false;
  const code = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
  return code(attempt.input?.promoCode) !== code(input?.promoCode);
}
module.exports = { previewPromotion, differentPendingPromo };
