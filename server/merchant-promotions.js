const crypto = require('node:crypto');
const { PRODUCT_CATALOG } = require('./catalog');

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const burgerIds = Object.keys(PRODUCT_CATALOG).filter(id => !PRODUCT_CATALOG[id].menu && !PRODUCT_CATALOG[id].kind);
const types = ['percent_order', 'percent_burger', 'bogo_burger', 'buy3_get1_burger', 'buy3_get1_menu', 'free_delivery'];
const normalizeCode = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const activeOrders = (db, promotion, now = Date.now()) => (db.orders || []).filter(order => {
  if (order.promotion?.id !== promotion.id) return false;
  if (order.payment?.status === 'PAID') return true;
  if (order.status === 'cancelled') return false;
  return order.status === 'awaiting_payment' && Date.parse(order.createdAt) + 15 * 60 * 1000 > now && !['FAILED', 'EXPIRED'].includes(order.payment?.status);
});
const publicView = promotion => ({ id: promotion.id, code: promotion.code, type: promotion.type,
  percent: promotion.percent, productId: promotion.productId, minimum: promotion.minimum,
  message: promotion.message, combineWelcome: true });

function validate(input, existing = []) {
  if (!plain(input)) fail('Offre invalide.');
  const allowed = ['id', 'revision', 'code', 'type', 'percent', 'productId', 'minimum', 'startsAt', 'endsAt', 'usageLimit', 'oncePerCustomer', 'enabled', 'message'];
  if (Object.keys(input).some(key => !allowed.includes(key))) fail('Réglage de promotion inconnu.');
  const id = input.id === undefined ? crypto.randomUUID() : input.id;
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) fail('Identifiant d’offre invalide.');
  const revision = input.revision === undefined ? 0 : input.revision;
  if (!Number.isInteger(revision) || revision < 0) fail('Version de l’offre invalide.');
  const code = normalizeCode(input.code);
  if (!/^[A-Z0-9_-]{4,40}$/.test(code)) fail('Le code doit contenir 4 à 40 lettres, chiffres, tirets ou tirets bas.');
  if (['CHORUS', 'GROSLARD'].includes(code) || existing.some(item => item.id !== id && item.code === code)) fail('Ce code est déjà utilisé.', 409);
  if (!types.includes(input.type)) fail('Choisis un type de promotion.');
  const percent = input.type.startsWith('percent_') ? Number(input.percent) : 0;
  if (input.type.startsWith('percent_') && (!Number.isInteger(percent) || percent < 1 || percent > 50)) fail('Choisis une remise de 1 à 50 %.');
  const productId = input.type === 'percent_burger' ? input.productId : null;
  if (input.type === 'percent_burger' && !burgerIds.includes(productId)) fail('Choisis un burger seul de la carte.');
  const minimum = Number(input.minimum ?? 0);
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 10000 || money(minimum) !== minimum) fail('Minimum de commande invalide.');
  const startsAt = input.startsAt || null, endsAt = input.endsAt || null;
  for (const [value, label] of [[startsAt, 'Début'], [endsAt, 'Fin']]) {
    if (value && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)) fail(`${label} de l’offre invalide.`);
  }
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) fail('La fin doit être après le début.');
  const usageLimit = input.usageLimit === null || input.usageLimit === undefined || input.usageLimit === '' ? null : Number(input.usageLimit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > 100000)) fail('Limite d’utilisation invalide.');
  if (typeof input.oncePerCustomer !== 'boolean' || typeof input.enabled !== 'boolean') fail('Activation ou limite par client invalide.');
  const message = String(input.message || '').trim();
  if (message.length > 180 || /[\u0000-\u001f]/.test(message)) fail('Description trop longue ou invalide.');
  return { id, revision, code, type: input.type, percent, productId, minimum, startsAt, endsAt, usageLimit,
    oncePerCustomer: input.oncePerCustomer, enabled: input.enabled, message };
}

function save(db, input, now = new Date()) {
  const promotions = db.merchantPromotions || [];
  const { confirmActivation, createdAt, updatedAt, used, ...fields } = input || {};
  const next = validate(fields, promotions);
  const current = promotions.find(item => item.id === next.id);
  if (current && current.revision !== next.revision) fail('Cette offre a changé dans un autre onglet. Recharge-la.', 409);
  if (!current && next.revision !== 0) fail('Cette offre n’existe plus.', 409);
  if (next.enabled && confirmActivation !== true) fail('Confirme l’activation de cette promotion.', 409);
  next.revision++;
  next.updatedAt = now.toISOString();
  if (!current) next.createdAt = next.updatedAt;
  else next.createdAt = current.createdAt;
  db.merchantPromotions ||= [];
  if (current) db.merchantPromotions[db.merchantPromotions.indexOf(current)] = next;
  else db.merchantPromotions.push(next);
  return next;
}

function findByCode(db, value, now = Date.now()) {
  const code = normalizeCode(value);
  const promotion = (db.merchantPromotions || []).find(item => item.code === code);
  if (!promotion) return null;
  if (!promotion.enabled || (promotion.startsAt && Date.parse(promotion.startsAt) > now) || (promotion.endsAt && Date.parse(promotion.endsAt) <= now)) fail('Ce code promo n’est pas actif actuellement.');
  return promotion;
}

function assertAvailable(db, promotion, customerId, now = Date.now()) {
  if (!promotion?.id) return;
  const current = (db.merchantPromotions || []).find(item => item.id === promotion.id && item.code === promotion.code);
  if (!current) fail('Ce code promo n’est plus disponible.', 409);
  findByCode(db, current.code, now);
  const used = activeOrders(db, current, now);
  if (current.usageLimit !== null && used.length >= current.usageLimit) fail('Ce code promo a atteint sa limite d’utilisations.', 409);
  if (current.oncePerCustomer && used.some(order => order.customerId === customerId)) fail('Tu as déjà utilisé ce code promo.', 409);
}

function discountFor(promotion, items, subtotal, deliveryFee = 0) {
  if (!promotion?.id) return { products: 0, delivery: 0 };
  if (subtotal < promotion.minimum) fail(`Ce code nécessite au moins ${promotion.minimum.toFixed(2).replace('.', ',')} € de produits.`);
  let products = 0, delivery = 0;
  if (promotion.type === 'percent_order') products = money(subtotal * promotion.percent / 100);
  if (promotion.type === 'percent_burger') {
    products = money(items.filter(item => item.productId === promotion.productId)
      .reduce((sum, item) => sum + PRODUCT_CATALOG[item.productId].price * item.quantity, 0) * promotion.percent / 100);
    if (!products) fail('Ajoute le burger concerné pour utiliser ce code.');
  }
  if (promotion.type === 'bogo_burger') {
    const prices = items.filter(item => burgerIds.includes(item.productId))
      .flatMap(item => Array(item.quantity).fill(PRODUCT_CATALOG[item.productId].price)).sort((a, b) => a - b);
    if (prices.length < 2) fail('Ajoute au moins deux burgers seuls pour profiter de cette offre. Les menus ne comptent pas.');
    products = money(prices.slice(0, Math.floor(prices.length / 2)).reduce((sum, price) => sum + price, 0));
  }
  if (promotion.type === 'buy3_get1_burger' || promotion.type === 'buy3_get1_menu') {
    const menu = promotion.type === 'buy3_get1_menu';
    const prices = items.filter(item => menu ? PRODUCT_CATALOG[item.productId]?.menu === true : burgerIds.includes(item.productId))
      .flatMap(item => Array(item.quantity).fill(PRODUCT_CATALOG[item.productId].price)).sort((a, b) => a - b);
    if (prices.length < 4) fail(menu ? 'Ajoute au moins quatre menus burgers pour profiter de cette offre.' : 'Ajoute au moins quatre burgers seuls pour profiter de cette offre.');
    products = money(prices.slice(0, Math.floor(prices.length / 4)).reduce((sum, price) => sum + price, 0));
  }
  if (promotion.type === 'free_delivery') {
    if (!deliveryFee) fail('Ce code est réservé aux commandes en livraison avec des frais à payer.');
    delivery = deliveryFee;
  }
  return { products, delivery };
}

function apply(pricing, promotion, items) {
  const { products, delivery } = discountFor(promotion, items, pricing.subtotal, pricing.deliveryFee);
  // A welcome discount is calculated on the remaining products after the
  // promotional item discount, never on already free products or delivery.
  const baseRate = pricing.discountRate || 0;
  const baseDiscount = money((pricing.subtotal - products) * baseRate);
  const discount = money(products + baseDiscount);
  const deliveryFee = money(pricing.deliveryFee - delivery);
  return { ...pricing, discount, baseDiscount, promotionDiscount: products, promotionDeliveryDiscount: delivery,
    deliveryFee, total: money(pricing.subtotal - discount + deliveryFee) };
}

function dashboard(db) {
  const promotions = db.merchantPromotions || [];
  return { promotions: promotions.map(item => ({ ...item, used: activeOrders(db, item).filter(order => order.payment?.status === 'PAID').length })),
    burgers: burgerIds.map(id => ({ id, name: PRODUCT_CATALOG[id].name, price: PRODUCT_CATALOG[id].price })) };
}

module.exports = { validate, save, findByCode, assertAvailable, discountFor, apply, dashboard, publicView };
