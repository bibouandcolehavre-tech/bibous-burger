// Unit prices remain separate from quantities. Prices and stock are ultimately
// authorized by the server, not by this draft basket.
const quantityOf = item => Number.isInteger(item?.quantity) && item.quantity >= 1 && item.quantity <= 20 ? item.quantity : 1;
const cents = amount => Math.round(amount * 100);
const cartUnitCount = cart => (cart?.items || []).reduce((sum, item) => sum + quantityOf(item), 0);
const cartTotal = items => items.reduce((sum, item) => sum + cents(item.total) * quantityOf(item), 0) / 100;
const withItems = (cart, items) => items.length ? { ...cart, items, total: cartTotal(items) } : null;
function changeCartQuantity(cart, lineId, delta) {
  if (!cart || ![-1, 1].includes(delta)) return cart;
  const item = cart.items.find(entry => entry.lineId === lineId);
  if (!item || quantityOf(item) + delta > 20) return cart;
  const next = quantityOf(item) + delta;
  return withItems(cart, next === 0 ? cart.items.filter(entry => entry.lineId !== lineId) : cart.items.map(entry => entry.lineId === lineId ? { ...entry, quantity: next } : entry));
}
function replaceCartLine(cart, lineId, replacement) {
  if (!cart?.items.some(item => item.lineId === lineId)) return cart;
  return withItems(cart, cart.items.map(item => item.lineId === lineId ? { ...replacement, lineId, quantity: quantityOf(item) } : item));
}
function choicesFromLine(item) {
  return (item?.selections || []).reduce((choices, entry) => {
    (choices[entry.groupId] ||= []).push(entry.id);
    return choices;
  }, {});
}
const serializeCartItems = cart => (cart?.items || []).map(item => ({ productId: item.product.id, quantity: quantityOf(item), selections: item.selections || [] }));
module.exports = { quantityOf, cartUnitCount, cartTotal, changeCartQuantity, replaceCartLine, choicesFromLine, serializeCartItems };
