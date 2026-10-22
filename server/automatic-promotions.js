'use strict';
const merchant = require('./merchant-promotions');

// Old binaries cannot display a new automatic discount in their basket.
// Negotiate the capability explicitly: never silently change an old checkout.
const supported = request => request?.headers?.['x-bibou-automatic-offers'] === '1';
function publicOffers(database, now = Date.now()) {
  return (database.merchantPromotions || []).filter(offer => {
    if (offer.automatic !== true || offer.type !== 'bogo_burger' || !offer.productId) return false;
    try { return merchant.findByCode(database, offer.code, now) === offer && (merchant.assertAvailable(database,offer,null,now), true); }
    catch { return false; }
  }).map(merchant.publicView);
}
function select(database, items, context, fallback, automaticBase, now = Date.now()) {
  let selected = fallback;
  for (const offer of publicOffers(database, now)) {
    try {
      merchant.assertServiceConditions(offer,context.method,context);
      const pricing = merchant.apply(automaticBase,offer,items);
      // One product promotion only. Never stack a coupon/CRM discount on a
      // free burger. Keep an explicitly chosen promotion when equally good.
      if (pricing.total < selected.pricing.total) selected = {promotion:offer,pricing,automatic:true};
    } catch { /* An unrelated basket is not an ordering error. */ }
  }
  return selected;
}
module.exports = { supported, publicOffers, select };
