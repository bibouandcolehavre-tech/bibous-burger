// Merchant-authorized codes stay on the server. Never trust a client-supplied
// discount, price or payment state. CHORUS has no usage cap or expiry by request.
const normalizePromoCode = value => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 40) throw Object.assign(new Error('Code promo invalide.'), { statusCode: 400 });
  return value.trim().toUpperCase();
};
const promotionForCode = value => {
  const code = normalizePromoCode(value);
  if (!code) return null;
  if (code !== 'CHORUS') throw Object.assign(new Error('Ce code promo n’est pas valide.'), { statusCode: 400 });
  return { code, discountPercent: 100, freeDelivery: true };
};
const applyPromotion = (pricing, promotion) => {
  if (!promotion) return pricing;
  if (promotion.discountPercent !== 100 || promotion.freeDelivery !== true) throw new Error('Promotion non prise en charge.');
  return { ...pricing, discountRate: 1, discount: pricing.subtotal, deliveryFee: 0, total: 0 };
};
const settlePromotionalOrder = (order, now = new Date()) => {
  if (!order.promotion || order.status !== 'awaiting_payment' || order.payment) return false;
  const promo = promotionForCode(order.promotion.code);
  if (!promo || order.total !== 0 || order.deliveryFee !== 0 || order.discount !== order.subtotal || order.discountRate !== 1) throw new Error('Total promotionnel incohérent.');
  // PAID means settled to the order workflow; the provider and amount explicitly
  // distinguish a fully gifted order from a SumUp card transaction.
  order.payment = { provider: 'promotion', status: 'PAID', amount: 0, paidAt: now.toISOString() };
  return true;
};
module.exports = { normalizePromoCode, promotionForCode, applyPromotion, settlePromotionalOrder };
