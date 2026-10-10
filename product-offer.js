// Merchant-approved, one-service offer. The booking time is deliberately not
// the service-window start: customers may preorder earlier in the day.
const DYNAMITE_OFFER = Object.freeze({
  id: 'dynamite-2026-10-10-evening', productId: 'dynamite', price: 9.9,
  serviceDate: '2026-10-10', startSlot: '19:00', endSlot: '22:00',
  bookingStartsAt: '2026-10-09T22:00:00.000Z',
  bookingEndsAt: '2026-10-10T20:00:00.000Z',
});
const cents = value => Math.round(value * 100);
function displayedProductOffer(now = new Date()) {
  const time = new Date(now).getTime();
  return time >= Date.parse(DYNAMITE_OFFER.bookingStartsAt) && time < Date.parse(DYNAMITE_OFFER.bookingEndsAt)
    ? DYNAMITE_OFFER : null;
}
function productOfferForService(productId, context = {}, now = new Date()) {
  const offer = displayedProductOffer(now);
  const serviceDate = context.serviceDate || context.date;
  const match = typeof context.slot === 'string' && context.slot.match(/^([0-2]\d:[0-5]\d)(?:$|\s*[–-])/);
  const slot = match && match[1];
  return offer && productId === offer.productId && serviceDate === offer.serviceDate
    && slot && slot >= offer.startSlot && slot < offer.endSlot ? offer : null;
}
function offerCatalogProduct(productId, regularPrice, now = new Date()) {
  const offer = displayedProductOffer(now);
  return offer && productId === offer.productId
    ? { price: offer.price, regularPrice, productOffer: { ...offer } } : { price: regularPrice };
}
function repriceOfferCart(cart, now = new Date()) {
  if (!cart) return cart;
  const items = cart.items.map(item => {
    if (item.product.id !== DYNAMITE_OFFER.productId) return item;
    const regularPrice = item.product.regularPrice ?? (item.product.productOffer ? 11.9 : item.product.price);
    const chosen = Boolean(cart.delivery?.slot);
    const offer = chosen ? productOfferForService(item.product.id, cart.delivery, now) : displayedProductOffer(now);
    const price = offer ? offer.price : regularPrice;
    const total = (cents(item.total) - cents(item.product.price) + cents(price)) / 100;
    return { ...item, total, product: { ...item.product, price, regularPrice, productOffer: offer ? { ...offer } : null } };
  });
  return { ...cart, items, total: items.reduce((sum, item) => sum + cents(item.total), 0) / 100 };
}
module.exports = { DYNAMITE_OFFER, displayedProductOffer, productOfferForService, offerCatalogProduct, repriceOfferCart };
