'use strict';
const cents = value => Math.round(Number(value) * 100);
function eligibleOffer(offer, cart, now = Date.now()) {
  if (!offer?.id || offer.automatic !== true || offer.type !== 'bogo_burger' || !offer.productId ||
      (offer.startsAt && Date.parse(offer.startsAt) > now) || (offer.endsAt && Date.parse(offer.endsAt) <= now) ||
      (offer.activeWindows?.length && !offer.activeWindows.some(w => Date.parse(w.startsAt) <= now && now < Date.parse(w.endsAt))) ||
      (Number(cart?.total) < Number(offer.minimum || 0))) return false;
  const rule = offer.serviceConditions;
  if (rule) {
    const slot = cart?.delivery?.slot?.slice(0,5);
    if (!['pickup','delivery'].includes(cart?.delivery?.method) || cart?.delivery?.date !== rule.serviceDate ||
        !slot || slot < rule.startSlot || slot >= rule.endSlot) return false;
  }
  return true;
}
function offerUnits(offer, cart) {
  return (cart?.items || []).filter(item => item.product?.id === offer.productId && !item.product?.isMenu)
    .flatMap(item => {
      const quantity = item.quantity === undefined ? 1 : item.quantity;
      const base = cents(item.product.price);
      return Number.isInteger(quantity) && quantity > 0 && quantity <= 20 && Number.isSafeInteger(base) && base > 0 ? Array(quantity).fill(base) : [];
    }).sort((a,b) => a-b);
}
function automaticCartPricing(base, cart, benefitRate = 0, now = Date.now()) {
  let best = base;
  for (const offer of cart?.automaticPromotions || []) {
    if (!eligibleOffer(offer,cart,now)) continue;
    const units = offerUnits(offer,cart), free = Math.floor(units.length / 2);
    if (!free) continue;
    const productCents = units.slice(0,free).reduce((sum,value) => sum+value,0);
    const subtotalCents = cents(cart.total);
    if (productCents > subtotalCents) continue;
    const rate = offer.combineWelcome === false && benefitRate === .1 ? 0 : benefitRate;
    const baseDiscountCents = Math.round((subtotalCents-productCents)*rate);
    const total = (subtotalCents-productCents-baseDiscountCents+cents(base.deliveryFee || 0))/100;
    if (total < best.total) best = {...base,total,discount:(productCents+baseDiscountCents)/100,discountRate:rate,
      baseDiscount:baseDiscountCents/100,automaticPromotionDiscount:productCents/100,automaticPromotion:offer,
      freeBurgerCount:free,discountLabel:'Offre automatique · 1 acheté = 1 offert'+(rate===.1?' + bienvenue':rate===.05?' + Bibou +':'')};
  }
  return best;
}
const chooseCheaperPricing = (first, second) => second.total < first.total ? second : first;
function automaticOfferMessage({product,cart}, now = Date.now()) {
  const offers = product?.automaticOffer ? [product.automaticOffer] : cart?.automaticPromotions || [];
  for (const offer of offers) {
    if (!eligibleOffer(offer,cart || {total:Number.MAX_SAFE_INTEGER},now)) continue;
    if (product && (product.id!==offer.productId || product.isMenu)) continue;
    const count = product ? 0 : offerUnits(offer,cart).length;
    if (!product && !count) continue;
    const name = product?.name || cart.items.find(item=>item.product.id===offer.productId)?.product.name || 'ce burger';
    return {title:'1 acheté = 1 offert',text:`Ajoute 2 ${name} seuls dans ton panier pour avoir le deuxième offert automatiquement, sans code. Un seul reste au prix normal. Hors menus et suppléments.`,count,freeCount:Math.floor(count/2)};
  }
  return null;
}
module.exports = {eligibleOffer,offerUnits,automaticCartPricing,chooseCheaperPricing,automaticOfferMessage};
