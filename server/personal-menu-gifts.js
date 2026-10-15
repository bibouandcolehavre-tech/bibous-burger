// Owner-configured, single-use gifts. Values and customer identities never enter
// the client bundle or source repository. This is not a contest winner registry.
const ENV_KEY = 'BIBOU_PERSONAL_MENU_GIFTS_V1';
const { PRODUCT_CATALOG } = require('./catalog');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
function parseConfig(raw) {
  if (raw === undefined || raw === '') return [];
  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length > 50) throw new Error();
    const seen = new Set();
    return rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['code', 'customerId'].includes(key))) throw new Error();
      if (typeof row.code !== 'string' || typeof row.customerId !== 'string') throw new Error();
      const code = row.code.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9_-]{3,39}$/.test(code) || ['CHORUS', 'GROSLARD'].includes(code) || seen.has(code) || !/^[A-Za-z0-9_-]{1,100}$/.test(row.customerId)) throw new Error();
      seen.add(code);
      return Object.freeze({ code, customerId: row.customerId });
    });
  } catch { fail('Configuration des menus offerts personnels invalide.', 503); }
}
const gifts = Object.freeze(parseConfig(process.env[ENV_KEY]));
function promotion(code, database) {
  const gift = gifts.find(row => row.code === code);
  if (!gift) return null;
  if ((database?.merchantPromotions || []).some(row => row.code === code) || (database?.contestPrizes?.vouchers || []).some(row => row.code === code))
    fail('Ce code existe déjà dans une autre offre : vérification restaurant requise.', 409);
  return { code, discountPercent: 100, freeDelivery: false, pickupOnly: true, requiredMenuCount: 1, singleUse: true,
    sourcePersonalMenuGift: true, ownerCustomerId: gift.customerId,
    message: 'Un menu de la carte offert au choix, sans suppléments payants. Ajoutez exactement un menu, sans autre produit, puis choisissez le Click & Collect. Code personnel utilisable une seule fois sur votre compte.' };
}
function assertOwner(database, value, customerId) {
  const current = promotion(value.code, database);
  if (!current || current.ownerCustomerId !== value.ownerCustomerId || current.ownerCustomerId !== customerId ||
      !(database?.customers || []).some(customer => customer.id === customerId && !customer.reviewMode && !customer.isKioskGuest))
    fail('Ce code cadeau est réservé au compte de son bénéficiaire.', 403);
}
function assertCart(items) {
  if (!Array.isArray(items) || items.length !== 1 || items[0].quantity !== 1)
    fail('Ce code est valable pour exactement un menu de la carte, sans autre produit.');
  const item = items[0], product = PRODUCT_CATALOG[item.productId], naan = product?.kind === 'naan';
  const naanMenu = naan && item.options?.some(option => option.groupId === 'naan-format' && option.id === 'menu');
  if (!(product?.menu || product?.kind === 'solo' || naanMenu)) fail('Choisis un menu complet de la carte pour utiliser ce cadeau.');
  if (item.options?.some(option => option.price > 0 && !(naanMenu && option.groupId === 'naan-format' && option.id === 'menu')))
    fail('Ce code offre un menu hors suppléments payants. Retirez les suppléments pour continuer.');
}
function readiness(database) {
  let available = 0;
  for (const gift of gifts) {
    try {
      const value = promotion(gift.code, database);
      assertOwner(database, value, gift.customerId);
      if (!(database.orders || []).some(order => order.promotion?.code === gift.code && order.payment?.status === 'PAID')) available++;
    } catch { /* A collision, used code or deleted recipient never activates a replacement gift. */ }
  }
  return { configured: gifts.length, available };
}
module.exports = { ENV_KEY, parseConfig, promotion, assertOwner, assertCart, readiness, configuredCount: gifts.length };
