// Merchant-authorized codes stay on the server. Never trust a client-supplied
// discount, price or payment state. CHORUS has no usage cap or expiry by request.
const { PRODUCT_CATALOG } = require('./catalog');
const merchant = require('./merchant-promotions');
const normalizePromoCode = value => {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 40) throw Object.assign(new Error('Code promo invalide.'), { statusCode: 400 });
  return value.trim().toUpperCase();
};
const promotionForCode = (value, database) => {
  const code = normalizePromoCode(value);
  if (!code) return null;
  if (code === 'CHORUS') return { code, discountPercent: 100, freeDelivery: true };
  if (code === 'GROSLARD') return { code, discountPercent: 100, freeDelivery: false, pickupOnly: true, requiredMenuCount: 2, singleUse: true,
    message: 'Ce code promo vous permet de bénéficier de deux menus offerts, au choix. Choisissez le retrait en Click & Collect ; vous pouvez aussi déguster vos menus sur place. Hors suppléments payants.' };
  if (database) {
    const configured = merchant.findByCode(database, code);
    if (configured) return merchant.publicView(configured);
  }
  throw Object.assign(new Error('Ce code promo n’est pas valide.'), { statusCode: 400 });
};
const assertPromotionAvailable = (database, promotion, customerId) => {
  if (promotion?.id) return merchant.assertAvailable(database, promotion, customerId);
  if (!promotion?.singleUse) return;
  if ((database.orders || []).some(order => order.promotion?.code === promotion.code && order.payment?.status === 'PAID')) {
    throw Object.assign(new Error('Ce code promo a déjà été utilisé.'), { statusCode: 409 });
  }
};
const assertPromotionMethod = (promotion, method) => {
  if (promotion?.type === 'free_delivery' && method !== 'delivery') throw Object.assign(new Error('Ce code est réservé à la livraison.'), { statusCode: 400 });
  if (promotion?.pickupOnly && method !== 'pickup') {
    throw Object.assign(new Error('Ce code est réservé au Click & Collect. Vous pouvez retirer vos menus et les déguster sur place.'), { statusCode: 400 });
  }
};
const assertPromotionCart = (promotion, items) => {
  if (promotion?.id) {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    merchant.discountFor(promotion, items, subtotal, promotion.type === 'free_delivery' ? 1 : 0);
    return;
  }
  if (!promotion?.requiredMenuCount) return;
  const count = Array.isArray(items) && items.every(item => PRODUCT_CATALOG[item.productId]?.menu === true)
    ? items.reduce((sum, item) => sum + item.quantity, 0) : 0;
  if (count !== promotion.requiredMenuCount) {
    throw Object.assign(new Error('Ce code est valable pour exactement deux menus de la carte, sans autre produit.'), { statusCode: 400 });
  }
  if (items.some(item => item.options?.some(option => option.price > 0))) {
    throw Object.assign(new Error('Ce code offre deux menus hors suppléments payants. Retirez les suppléments pour continuer.'), { statusCode: 400 });
  }
};
const applyPromotion = (pricing, promotion, method, items = []) => {
  if (!promotion) return pricing;
  assertPromotionMethod(promotion, method);
  if (promotion.id) return merchant.apply(pricing, promotion, items);
  if (promotion.discountPercent !== 100 || (!promotion.freeDelivery && !promotion.pickupOnly)) throw new Error('Promotion non prise en charge.');
  return { ...pricing, discountRate: 1, discount: pricing.subtotal, deliveryFee: 0, total: 0 };
};
const settlePromotionalOrder = (order, now = new Date()) => {
  if (!order.promotion || order.status !== 'awaiting_payment' || order.payment) return false;
  if (order.promotion.id) return false;
  const promo = promotionForCode(order.promotion.code);
  assertPromotionMethod(promo, order.method);
  if (!promo || order.total !== 0 || order.deliveryFee !== 0 || order.discount !== order.subtotal || order.discountRate !== 1) throw new Error('Total promotionnel incohérent.');
  // PAID means settled to the order workflow; the provider and amount explicitly
  // distinguish a fully gifted order from a SumUp card transaction.
  order.payment = { provider: 'promotion', status: 'PAID', amount: 0, paidAt: now.toISOString() };
  return true;
};
module.exports = { normalizePromoCode, promotionForCode, assertPromotionAvailable, assertPromotionMethod, assertPromotionCart, applyPromotion, settlePromotionalOrder };
