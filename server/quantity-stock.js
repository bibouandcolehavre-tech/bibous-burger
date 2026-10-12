// Transactional quantity ledger for the next release. Callers must hold the
// existing database lock. Legacy manual stock flags remain a separate file.
const { STOCK_CATALOG, PRODUCT_CATALOG, optionProductId } = require('./catalog');
const fail = message => { throw Object.assign(new Error(message), { statusCode: 409 }); };
const canonical = id => id.endsWith('-menu') && Object.hasOwn(PRODUCT_CATALOG, id.slice(0, -5)) ? id.slice(0, -5) : id;
const state = database => database.quantityStock ||= { version: 1, quantities: {}, orders: {} };
const HOLD_MS = 15 * 60000;
const bankingPending = order => Boolean(order.payment?.checkoutReference || order.payment?.checkoutId || order.payment?.launchClaimedAt) && !['FAILED', 'EXPIRED', 'CANCELLED'].includes(order.payment.status);
const needsHold = (order, now) => order.payment?.status !== 'PAID' && (bankingPending(order) || order.status !== 'cancelled' && Date.parse(order.createdAt) + HOLD_MS > now.getTime() && order.payment?.status !== 'EXPIRED');
function units(items) {
  const quantities = {};
  const add = (id, n) => { if (id) quantities[canonical(id)] = (quantities[canonical(id)] || 0) + n; };
  for (const item of items || []) {
    const n = Number(item.quantity);
    if (!Number.isInteger(n) || n < 1 || n > 20 || !Object.hasOwn(PRODUCT_CATALOG, item.productId)) fail('Article ou quantité invalide pour le stock.');
    add(item.productId, n);
    for (const option of item.options || item.selections || []) add(optionProductId(option), n);
    const p = PRODUCT_CATALOG[item.productId], choices = item.options || item.selections || [];
    if (p.menu && !choices.some(o => o.groupId === 'menu-fries')) add('frites-maison', n);
    if (p.kind === 'solo' && !choices.some(o => o.groupId === 'solo-fries')) add('frites-maison', n);
    if (p.kind === 'duo') for (const group of ['duo-fries-one', 'duo-fries-two']) if (!choices.some(o => o.groupId === group)) add('frites-maison', n);
  }
  return quantities;
}
function recordedItems(items) {
  return (items || []).map(item => {
    if (Object.hasOwn(item, 'productId')) return item;
    // Historical orders stored a recipe name and unit price, not a SKU. Recover
    // only an exact, unique catalog match; never alter the saved order or guess
    // a drink, an extra, a recipe whose price changed, or an unknown article.
    const price = item.unitPrice ?? item.price;
    const matches = typeof item.name === 'string' && typeof price === 'number' && Number.isFinite(price)
      ? Object.entries(PRODUCT_CATALOG).filter(([, product]) => product.name === item.name && Math.round(product.price * 100) === Math.round(price * 100)) : [];
    if (matches.length !== 1) fail('Un ancien panier ne peut pas être identifié sans ambiguïté. Vérifiez ses paiements et ses articles avant d’activer le compteur.');
    return { ...item, productId: matches[0][0] };
  });
}
const orderUnits = (database, order) => units((database.orders || []).includes(order) ? recordedItems(order.items) : order.items);
function reserved(database, id, excludingOrderId) {
  const data = database.quantityStock;
  return Object.entries(data?.orders || {}).reduce((n, [orderId, hold]) => n + (orderId !== excludingOrderId && hold.status === 'held' ? hold.units[canonical(id)] || 0 : 0), 0);
}
function available(database, id, excludingOrderId) {
  const data = database.quantityStock, key = canonical(id), record = data?.quantities[key];
  return record?.quantity === undefined || record.quantity === null ? null : Math.max(0, record.quantity - reserved(database, key, excludingOrderId));
}
function setQuantity(database, id, input, now = new Date()) {
  if (!Object.hasOwn(STOCK_CATALOG, id) || !input || Object.keys(input).some(k => !['quantity', 'revision'].includes(k)) || input.quantity !== null && (!Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 100000)) fail('Saisis une quantité entière positive, zéro ou le mode sans limite.');
  const key = canonical(id), previous = database.quantityStock?.quantities[key];
  if (input.revision !== (previous?.revision || 0)) fail('Le stock a changé. Actualise avant de modifier la quantité.');
  // Enabling a counter must include orders already waiting for payment. Never
  // silently forget a hosted checkout or terminal intent from before activation.
  const pending = (database.orders || []).filter(order => needsHold(order, now) && database.quantityStock?.orders[order.id]?.status !== 'released');
  const pendingUnits = pending.map(order => ({ order, count: units(recordedItems(order.items))[key] || 0 }));
  const alreadyHeldIds = new Set(Object.keys(database.quantityStock?.orders || {}));
  const held = reserved(database, key) + pendingUnits.filter(({ order }) => !alreadyHeldIds.has(order.id)).reduce((n, entry) => n + entry.count, 0)
    + pendingUnits.filter(({ order }) => alreadyHeldIds.has(order.id)).reduce((n, entry) => n + Math.max(0, entry.count - (database.quantityStock.orders[entry.order.id]?.units[key] || 0)), 0);
  if (input.quantity !== null && input.quantity < held) fail('Cette quantité est inférieure aux articles réservés par des paiements en cours. Vérifie les paiements avant de la réduire.');
  const data = state(database);
  data.quantities[key] = { quantity: input.quantity, revision: (previous?.revision || 0) + 1, updatedAt: now.toISOString() };
  // A deliberate restaurant recount resolves this product's warning, while
  // keeping the original discrepancy in the private order ledger.
  if (input.quantity !== null) for (const hold of Object.values(data.orders)) {
    if (hold.shortages?.[key] && !hold.shortages[key].resolvedAt) hold.shortages[key].resolvedAt = now.toISOString();
  }
  if (input.quantity !== null) for (const { order, count } of pendingUnits) {
    const hold = data.orders[order.id] ||= { status: 'held', units: {}, createdAt: order.createdAt };
    if (hold.status === 'held' && count) {
      hold.units[key] = count;
      if (order.items.some(item => !Object.hasOwn(item, 'productId'))) hold.legacyItemsRecovered = true;
    }
  }
  return status(database, id);
}
function status(database, id) {
  const record = database.quantityStock?.quantities[canonical(id)];
  const holds = Object.values(database.quantityStock?.orders || {});
  const shortage = holds.reduce((n, hold) => n + (hold.shortages?.[canonical(id)]?.resolvedAt ? 0 : hold.shortages?.[canonical(id)]?.quantity || 0), 0);
  const legacyReserved = holds.reduce((n, hold) => n + (hold.status === 'held' && hold.legacyItemsRecovered ? hold.units[canonical(id)] || 0 : 0), 0);
  return { tracked: record?.quantity !== undefined && record.quantity !== null, quantity: record?.quantity ?? null, reserved: reserved(database, id), availableQuantity: available(database, id), legacyReserved, shortage, revision: record?.revision || 0, sharedStockId: canonical(id) };
}
function reserve(database, order, now = new Date()) {
  const requested = orderUnits(database, order), limited = Object.fromEntries(Object.entries(requested).filter(([id]) => available(database, id) !== null));
  if (!Object.keys(limited).length && !database.quantityStock?.orders[order.id]) return null;
  const data = state(database), previous = data.orders[order.id];
  if (previous?.status === 'sold') return previous;
  if (previous?.status === 'released') fail('Cette réservation de stock a été libérée. Recommence la commande.');
  if (previous && Object.keys({ ...previous.units, ...limited }).some(id => data.quantities[id]?.quantity !== null && (previous.units[id] || 0) !== (limited[id] || 0))) fail('Le panier réservé a changé. Vérifie les nouveaux choix avant de payer.');
  for (const [id, quantity] of Object.entries(limited)) if (quantity > available(database, id, order.id)) fail(`${STOCK_CATALOG[id].name} : il ne reste pas assez d’articles.`);
  data.orders[order.id] ||= { status: 'held', units: limited, createdAt: now.toISOString() };
  return data.orders[order.id];
}
function commit(database, order, now = new Date()) {
  const hold = database.quantityStock?.orders[order.id];
  if (!hold || hold.status === 'sold') return false;
  if (order.payment?.status !== 'PAID') fail('Le paiement n’est pas confirmé.');
  // A provider can confirm payment after a previously verified failure/expiry.
  // Never lose that financial confirmation because its stock hold was released.
  // Saturate depleted counters, keep the audit and request a physical recount.
  if (hold.status === 'released') hold.latePaymentAt ||= now.toISOString();
  for (const [id, n] of Object.entries(hold.units)) {
    const record = database.quantityStock.quantities[id];
    if (record?.quantity === null) continue;
    const shortage = Math.min(n, Math.max(0, n - (record?.quantity || 0) + reserved(database, id, order.id)));
    if (shortage) {
      hold.shortages ||= {};
      hold.shortages[id] = { quantity: shortage, detectedAt: now.toISOString() };
    }
    if (record) { record.quantity = Math.max(0, record.quantity - n); record.revision++; record.updatedAt = now.toISOString(); }
    else database.quantityStock.quantities[id] = { quantity: 0, revision: 1, updatedAt: now.toISOString() };
  }
  hold.status = 'sold'; hold.soldAt = now.toISOString(); return true;
}
function release(database, order, now = new Date()) {
  const hold = database.quantityStock?.orders[order.id];
  if (!hold || hold.status !== 'held') return false;
  if (order.payment?.status === 'PAID' || bankingPending(order)) fail('Le résultat bancaire doit être vérifié avant de libérer le dernier article.');
  hold.status = 'released'; hold.releasedAt = now.toISOString(); return true;
}
function effectiveFlags(database, flags, orderId, replacement = false) {
  const result = { ...flags };
  if (!database.quantityStock) return result;
  const order = replacement && database.orders?.find(o => o.id === orderId);
  const covered = order?.payment?.status === 'PAID' ? orderUnits(database, order) : {};
  for (const id of Object.keys(STOCK_CATALOG)) if (available(database, id, orderId) === 0 && !covered[canonical(id)]) result[id] = false;
  return result;
}
function assertChange(database, order, nextItems) {
  if (!database.quantityStock) return;
  const before = units(recordedItems(order.items)), after = units(nextItems);
  for (const [id, n] of Object.entries(after)) {
    const remaining = available(database, id, order.id);
    if (remaining !== null && n - (before[id] || 0) > remaining) fail(`${STOCK_CATALOG[id].name} : il ne reste pas assez d’articles pour ce remplacement.`);
  }
}
function applyChange(database, order, previousItems, now = new Date()) {
  if (!database.quantityStock) return;
  const before = units(recordedItems(previousItems)), after = units(order.items);
  assertChange(database, { ...order, items: previousItems }, order.items);
  for (const [id, n] of Object.entries(after)) {
    const record = database.quantityStock?.quantities[id], extra = Math.max(0, n - (before[id] || 0));
    if (record?.quantity !== undefined && record.quantity !== null && extra) {
      record.quantity -= extra; record.revision++; record.updatedAt = now.toISOString();
    }
  }
  // Removing an already-paid item does not automatically restock prepared food.
}
function reconcile(database, now = new Date()) {
  let changed = false;
  for (const [id, hold] of Object.entries(database.quantityStock?.orders || {})) {
    if (hold.status === 'sold') continue;
    const order = database.orders?.find(order => order.id === id);
    // An orphan hold remains reserved for manual investigation, never released.
    if (!order) continue;
    if (order.payment?.status === 'PAID') { changed = commit(database, order, now) || changed; }
    else if (hold.status === 'held' && !bankingPending(order) && (order.status === 'cancelled' || order.payment?.status === 'EXPIRED' || Date.parse(order.createdAt) + HOLD_MS <= now.getTime())) changed = release(database, order, now) || changed;
  }
  return changed;
}
function catalog(database, manual, now, dashboard = false) {
  const { availabilityCatalog } = require('./catalog');
  const result = availabilityCatalog(effectiveFlags(database, manual), now, database);
  if (dashboard) {
    const legacy = availabilityCatalog(manual, now, database);
    result.products = result.products.map(product => {
      const original = legacy.products.find(p => p.id === product.id), quantityStock = status(database, product.id);
      return { ...product, enabled: original.enabled, quantityStock,
        ...(quantityStock.availableQuantity === 0 && original.enabled && !['unpublished', 'outside_service'].includes(product.availabilityState) ? { reason: 'Quantité disponible épuisée ou réservée par un paiement en cours.', availabilityState: 'out_of_stock' } : {}) };
    });
  }
  return result;
}
module.exports = { canonical, units, setQuantity, status, available, reserve, commit, release, effectiveFlags, assertChange, applyChange, reconcile, catalog };
