// Only use a promotion returned by the authenticated API. Final pricing and
// fulfillment authorization remain server-side. No redeemable code is bundled.
function previewPromotion(base, subtotal, promotion, method) {
  if (!promotion) return base;
  if (promotion.sourceContestPrize) {
    if (typeof promotion.code !== 'string' || promotion.discountPercent !== 100 || !Number.isInteger(promotion.menuAllowance) || promotion.menuAllowance < 1 || !Number.isFinite(base.deliveryFee || 0)) throw new Error('Réponse de lot personnel invalide.');
    const fee = method === 'delivery' ? (base.deliveryFee || 0) : 0;
    return { ...base, discountRate: 1, discount: subtotal, discountLabel: 'Menus gagnés au concours', deliveryFee: fee, total: fee };
  }
  if (promotion.id) {
    if (typeof promotion.code !== 'string' || !['percent_order','percent_burger','bogo_burger','buy3_get1_burger','buy3_get1_menu','free_delivery','free_drink','free_fries','free_dessert','free_classic'].includes(promotion.type)) throw new Error('Réponse de code promo invalide.');
    const productDiscount = Number(promotion.previewProductDiscount);
    if (!Number.isFinite(productDiscount) || productDiscount < 0 || productDiscount > subtotal) throw new Error('Remise du code promo invalide.');
    const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
    const baseRate = Number.isFinite(promotion.previewBaseRate) ? promotion.previewBaseRate : (base.discountRate || 0);
    const baseDiscount = round((subtotal - productDiscount) * baseRate);
    const deliveryFee = promotion.type === 'free_delivery' ? 0 : base.deliveryFee;
    const discount = round(productDiscount + baseDiscount);
    return { ...base, discount, baseDiscount, promotionDiscount: productDiscount,
      discountLabel: `Code ${promotion.code}${baseRate === .1 ? ' + bienvenue' : baseRate === .05 ? ' + Bibou +' : ''}`,
      deliveryFee, total: round(subtotal - discount + deliveryFee) };
  }
  if (typeof promotion.code !== 'string' || promotion.discountPercent !== 100 || (!promotion.freeDelivery && !promotion.pickupOnly) || (promotion.pickupOnly && method !== 'pickup')) throw new Error('Réponse de code promo invalide.');
  return { ...base, discountRate: 1, discount: subtotal, discountLabel: `Code promo ${promotion.code} · −100 %`, deliveryFee: 0, total: 0 };
}
function differentPendingPromo(attempt, kind, input) {
  if (!attempt || (attempt.kind !== 'order' && kind !== 'order')) return false;
  const code = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
  return code(attempt.input?.promoCode) !== code(input?.promoCode);
}
function promotionMinimum(promotion,subtotal,pricing){
  if(!promotion?.id||!Number.isFinite(promotion.minimum)||promotion.minimum<=0)return null;
  const afterDiscounts=promotion.minimumAfterDiscounts===true;
  const basisCents=Math.round((afterDiscounts?subtotal-(pricing.discount||0):subtotal)*100);
  const minimumCents=Math.round(promotion.minimum*100),missingCents=Math.max(0,minimumCents-basisCents);
  const euro=cents=>(cents/100).toFixed(2).replace('.',',')+' €';
  return {minimumCents,basisCents,missingCents,afterDiscounts,message:`Minimum du code : ${euro(minimumCents)} de produits${afterDiscounts?' après toutes les remises':''}, hors livraison.${missingCents?` Ton panier est à ${euro(basisCents)}${afterDiscounts?' après remises':''}. Ajoute des articles payants pour atteindre ce minimum.`:''}`};
}
module.exports = { previewPromotion, differentPendingPromo, promotionMinimum };
