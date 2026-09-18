const BIBOU_PLUS_PRICE = 9.99;
const BIBOU_PLUS_DISCOUNT_RATE = 0.05;
const BIBOU_PLUS_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const ensureBibouPlusStore = (database) => {
  let changed = false;
  if (!Array.isArray(database.bibouPlusPurchases)) {
    database.bibouPlusPurchases = [];
    changed = true;
  }
  if (!Number.isInteger(database.nextBibouPlusNumber) || database.nextBibouPlusNumber < 1) {
    const highest = database.bibouPlusPurchases.reduce((value, purchase) => Math.max(value, Number(purchase.number) || 0), 0);
    database.nextBibouPlusNumber = highest + 1;
    changed = true;
  }
  return changed;
};

const bibouPlusStatus = (customer, value = new Date()) => {
  const expiresAt = customer?.bibouPlusExpiresAt || null;
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  return {
    active: Number.isFinite(expiresAtMs) && expiresAtMs > value.getTime(),
    expiresAt,
    price: BIBOU_PLUS_PRICE,
    discountRate: BIBOU_PLUS_DISCOUNT_RATE,
  };
};

const bibouPlusOrderPricing = ({ subtotal, deliveryFee, active, discountRate }) => {
  const safeSubtotal = roundMoney(Math.max(0, Number(subtotal) || 0));
  const standardDeliveryFee = roundMoney(Math.max(0, Number(deliveryFee) || 0));
  const appliedDiscountRate = Math.max(0, Number(discountRate ?? (active ? BIBOU_PLUS_DISCOUNT_RATE : 0)) || 0);
  const discount = roundMoney(safeSubtotal * appliedDiscountRate);
  const chargedDeliveryFee = active ? 0 : standardDeliveryFee;
  return {
    subtotal: safeSubtotal,
    discountRate: appliedDiscountRate,
    discount,
    standardDeliveryFee,
    deliveryFee: chargedDeliveryFee,
    total: roundMoney(safeSubtotal - discount + chargedDeliveryFee),
  };
};

const activateBibouPlus = (customer, purchase, value = new Date()) => {
  if (!customer || purchase?.payment?.status !== "PAID" || purchase.activatedAt) return false;
  const currentExpiry = customer.bibouPlusExpiresAt ? new Date(customer.bibouPlusExpiresAt).getTime() : 0;
  const startsAt = Math.max(value.getTime(), Number.isFinite(currentExpiry) ? currentExpiry : 0);
  customer.bibouPlusExpiresAt = new Date(startsAt + BIBOU_PLUS_DURATION_MS).toISOString();
  purchase.activatedAt = value.toISOString();
  purchase.expiresAt = customer.bibouPlusExpiresAt;
  return true;
};

module.exports = {
  BIBOU_PLUS_DISCOUNT_RATE,
  BIBOU_PLUS_DURATION_MS,
  BIBOU_PLUS_PRICE,
  activateBibouPlus,
  bibouPlusOrderPricing,
  bibouPlusStatus,
  ensureBibouPlusStore,
};
