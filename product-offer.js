// Merchant-approved, one-service offer. The booking time is deliberately not
// the service-window start: customers may preorder earlier in the day.
const DYNAMITE_OFFER = Object.freeze({
  id: 'dynamite-2026-10-10-evening', productId: 'dynamite', price: 9.9,
  serviceDate: '2026-10-10', startSlot: '19:00', endSlot: '22:00',
  bookingStartsAt: '2026-10-09T22:00:00.000Z',
  bookingEndsAt: '2026-10-10T20:00:00.000Z',
});
const DYNAMITE_WEEKEND_OFFER = Object.freeze({
  id: 'dynamite-2026-10-16-weekend', productId: 'dynamite', price: 9.9,
  serviceDates: Object.freeze(['2026-10-16', '2026-10-17', '2026-10-18']),
  bookingStartsAt: '2026-10-15T22:00:00.000Z',
  bookingEndsAt: '2026-10-18T22:00:00.000Z',
});
const cents = value => Math.round(value * 100);
function displayedProductOffer(now = new Date()) {
  const time = new Date(now).getTime();
  return [DYNAMITE_WEEKEND_OFFER, DYNAMITE_OFFER].find(offer =>
    time >= Date.parse(offer.bookingStartsAt) && time < Date.parse(offer.bookingEndsAt)) || null;
}
function productOfferForService(productId, context = {}, now = new Date()) {
  const offer = displayedProductOffer(now);
  const serviceDate = context.serviceDate || context.date;
  const match = typeof context.slot === 'string' && context.slot.match(/^([0-2]\d:[0-5]\d)(?:$|\s*[–-])/);
  const slot = match && match[1];
  if (!offer || productId !== offer.productId || !slot) return null;
  if (offer.serviceDates) return offer.serviceDates.includes(serviceDate) ? offer : null;
  return serviceDate === offer.serviceDate && slot >= offer.startSlot && slot < offer.endSlot ? offer : null;
}
function offerCatalogProduct(productId, regularPrice, now = new Date()) {
  const offer = displayedProductOffer(now);
  // Installed binaries contain the expired October 10 cart repricer. Sending
  // regularPrice/productOffer would make them restore 11.90 in their carts.
  // Their existing live catalogue support accepts the actual weekend price;
  // the server still verifies the service date and authoritative base price.
  if (offer?.serviceDates && productId === offer.productId) return { price: offer.price };
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
  return { ...cart, items, total: items.reduce((sum, item) => sum + cents(item.total) * (item.quantity || 1), 0) / 100 };
}
module.exports = { DYNAMITE_OFFER, DYNAMITE_WEEKEND_OFFER, displayedProductOffer, productOfferForService, offerCatalogProduct, repriceOfferCart };
