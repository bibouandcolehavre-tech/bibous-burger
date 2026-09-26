const crypto = require("node:crypto");

const REFERRAL_BONUS_POINTS = 100;

const normalizeReferralCode = (value) => String(value || "").trim().toUpperCase();

const createReferralCode = (database) => {
  const usedCodes = new Set((database.customers || []).map((customer) => normalizeReferralCode(customer.referralCode)).filter(Boolean));
  let code;
  do {
    code = `BIBOU-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  } while (usedCodes.has(code));
  return code;
};

const ensureReferralCode = (customer, database) => {
  const normalized = normalizeReferralCode(customer.referralCode);
  if (normalized && !(database.customers || []).some((item) => item.id !== customer.id && normalizeReferralCode(item.referralCode) === normalized)) {
    if (customer.referralCode === normalized) return false;
    customer.referralCode = normalized;
    return true;
  }
  customer.referralCode = createReferralCode(database);
  return true;
};

const ensureAllReferralCodes = (database) => (database.customers || []).reduce(
  (changed, customer) => ensureReferralCode(customer, database) || changed,
  false
);

const referralError = (message) => Object.assign(new Error(message), { statusCode: 400 });

const applyReferralCode = (database, customer, value, now = new Date()) => {
  const code = normalizeReferralCode(value);
  if (!code) return { changed: false, sponsor: null };

  const sponsor = (database.customers || []).find((item) => normalizeReferralCode(item.referralCode) === code);
  if (!sponsor) throw referralError("Ce code de parrainage n’existe pas.");
  if (sponsor.id === customer.id) throw referralError("Tu ne peux pas utiliser ton propre code de parrainage.");
  if (customer.referredByCustomerId && customer.referredByCustomerId !== sponsor.id) throw referralError("Un autre parrain est déjà associé à ce compte.");
  if (customer.referredByCustomerId === sponsor.id) return { changed: false, sponsor };

  const alreadyOrdered = (database.orders || []).some((order) => order.customerId === customer.id && order.payment?.status === "PAID" && order.payment.provider !== 'promotion');
  if (alreadyOrdered) throw referralError("Le code de parrainage doit être ajouté avant la première commande payée.");

  customer.referredByCustomerId = sponsor.id;
  customer.referredAt = now.toISOString();
  return { changed: true, sponsor };
};

const paidActiveOrdersFor = (database, customerId) => (database.orders || [])
  .filter((order) => order.customerId === customerId && order.payment?.status === "PAID" && order.payment.provider !== 'promotion' && order.status !== "cancelled")
  .sort((left, right) => {
    const dateDifference = new Date(left.payment?.paidAt || left.createdAt || 0) - new Date(right.payment?.paidAt || right.createdAt || 0);
    return dateDifference || (Number(left.number) || 0) - (Number(right.number) || 0);
  });

const grantReferralReward = (order, database, now = new Date()) => {
  if (order.payment?.status !== "PAID" || order.payment.provider === 'promotion' || order.status === "cancelled" || order.referralRewardGrantedAt) return { changed: false, pointsAdded: 0, sponsor: null };

  const referredCustomer = (database.customers || []).find((customer) => customer.id === order.customerId);
  if (!referredCustomer?.referredByCustomerId || referredCustomer.referralRewardGrantedAt) return { changed: false, pointsAdded: 0, sponsor: null };

  const firstPaidOrder = paidActiveOrdersFor(database, referredCustomer.id)[0];
  if (!firstPaidOrder || firstPaidOrder.id !== order.id) return { changed: false, pointsAdded: 0, sponsor: null };

  const sponsor = database.customers.find((customer) => customer.id === referredCustomer.referredByCustomerId);
  if (!sponsor || sponsor.id === referredCustomer.id) return { changed: false, pointsAdded: 0, sponsor: null };

  sponsor.points = Math.max(0, Number(sponsor.points) || 0) + REFERRAL_BONUS_POINTS;
  order.referralRewardGrantedAt = now.toISOString();
  order.referralRewardPoints = REFERRAL_BONUS_POINTS;
  order.referralSponsorCustomerId = sponsor.id;
  referredCustomer.referralRewardGrantedAt = order.referralRewardGrantedAt;
  referredCustomer.referralRewardOrderId = order.id;
  delete referredCustomer.referralRewardRevokedAt;
  return { changed: true, pointsAdded: REFERRAL_BONUS_POINTS, sponsor };
};

const revokeReferralReward = (order, database, now = new Date()) => {
  if (order.status !== "cancelled" || !order.referralRewardGrantedAt || order.referralRewardRevokedAt) return false;
  const sponsor = (database.customers || []).find((customer) => customer.id === order.referralSponsorCustomerId);
  if (sponsor) sponsor.points = Math.max(0, (Number(sponsor.points) || 0) - (Number(order.referralRewardPoints) || REFERRAL_BONUS_POINTS));

  const referredCustomer = database.customers.find((customer) => customer.id === order.customerId);
  if (referredCustomer?.referralRewardOrderId === order.id) {
    delete referredCustomer.referralRewardGrantedAt;
    delete referredCustomer.referralRewardOrderId;
    referredCustomer.referralRewardRevokedAt = now.toISOString();
  }
  order.referralRewardRevokedAt = now.toISOString();
  return true;
};

module.exports = {
  REFERRAL_BONUS_POINTS,
  applyReferralCode,
  ensureAllReferralCodes,
  ensureReferralCode,
  grantReferralReward,
  normalizeReferralCode,
  revokeReferralReward
};
