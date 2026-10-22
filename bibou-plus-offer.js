const BIBOU_PLUS_PRICE = 5.99;
const BIBOU_PLUS_DURATION_DAYS = 30;
const BIBOU_PLUS_VALUE_MESSAGE = 'Rentabilisé dès 2 livraisons sur 30 jours.';
const BIBOU_PLUS_VALUE_DETAIL = 'Deux livraisons habituellement facturées au moins 3,99 € représentent 7,98 € de frais évités, pour 5,99 € d’abonnement. Selon notre zone et nos créneaux habituels. En retrait, la rentabilité dépend du montant de tes achats.';
function bibouPlusOffer() {
  return {price:BIBOU_PLUS_PRICE,durationDays:BIBOU_PLUS_DURATION_DAYS,automaticRenewal:false,discountRate:.05,loyaltyMultiplier:2};
}
function shouldSuggestBibouPlus(order,customer,now=Date.now()) {
  const expiry=Date.parse(customer?.bibouPlusExpiresAt || '');
  return Boolean(order && order.payment?.status === 'PAID' && order.total > 0 &&
    order.status !== 'cancelled' && !order.reviewMode && !customer?.isKioskGuest &&
    !(Number.isFinite(expiry) && expiry > now));
}
module.exports={BIBOU_PLUS_PRICE,BIBOU_PLUS_DURATION_DAYS,BIBOU_PLUS_VALUE_MESSAGE,BIBOU_PLUS_VALUE_DETAIL,bibouPlusOffer,shouldSuggestBibouPlus};
