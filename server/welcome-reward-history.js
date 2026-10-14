// Private, purpose-scoped anti-abuse records. Never expose these through a customer API.
const crypto = require('node:crypto');
const { PENDING_RESERVATION_MS } = require('./availability');
const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const normalizePhone = value => {
  const phone = String(value || '').replace(/[\s.-]/g, '');
  return /^0[67]\d{8}$/.test(phone) ? '+33' + phone.slice(1) : /^\+33[67]\d{8}$/.test(phone) ? phone : null;
};
function fingerprint(customer, secret) {
  const phone = normalizePhone(customer?.verifiedPhone || customer?.phone);
  if (!phone || !secret) return null;
  return crypto.createHmac('sha256', secret).update('welcome-discount-deletion-v1:' + phone).digest('hex');
}
const relevantOrder = (order, now) => order?.welcomeRewardApplied === true && order.status !== 'cancelled' &&
  (order.payment?.status === 'PAID' || Number.isFinite(Date.parse(order.createdAt)) && Date.parse(order.createdAt) + PENDING_RESERVATION_MS > +now);
function purge(db, now = new Date()) {
  if (!Array.isArray(db.welcomeRewardHistory)) return false;
  const retained = db.welcomeRewardHistory.filter(record => Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) > +now);
  if (retained.length === db.welcomeRewardHistory.length) return false;
  db.welcomeRewardHistory = retained;
  return true;
}
function rememberBeforeDeletion(db, customer, secret, now = new Date()) {
  purge(db, now);
  const phoneHash = fingerprint(customer, secret);
  if (!phoneHash) return false;
  const orders = (db.orders || []).filter(order => order.customerId === customer.id && relevantOrder(order, now));
  // Older imported customers may have a consumed benefit without an order record.
  // A recreated, blocked account is NOT evidence of a second use and never renews retention.
  const reward = customer.welcomeReward;
  const usedWithoutOrder = reward?.status === 'used' && !reward.antiAbuseBlocked &&
    !(db.orders || []).some(order => order.id === reward.usedOrderId || order.customerId === customer.id && order.welcomeRewardApplied);
  if (!orders.length && !usedWithoutOrder) return false;
  const history = db.welcomeRewardHistory ||= [];
  const existing = history.find(record => record.phoneHash === phoneHash);
  if (existing) {
    existing.orderIds = [...new Set([...existing.orderIds, ...orders.map(order => order.id)])];
    existing.usedWithoutOrder ||= usedWithoutOrder;
  } else history.push({ phoneHash, orderIds: orders.map(order => order.id), usedWithoutOrder, expiresAt: new Date(+now + RETENTION_MS).toISOString() });
  return true;
}
function blockedPhones(db, now) {
  const orders = new Map((db.orders || []).map(order => [order.id, order]));
  return new Set((db.welcomeRewardHistory || []).filter(record => Date.parse(record.expiresAt) > +now &&
    (record.usedWithoutOrder || record.orderIds.some(id => relevantOrder(orders.get(id), now)))).map(record => record.phoneHash));
}
function setBlocked(customer, blocked) {
  const before = JSON.stringify(customer.welcomeReward);
  const reward = customer.welcomeReward;
  if (blocked && reward?.status === 'available') {
    customer.welcomeReward = { ...reward, status: 'used', antiAbuseBlocked: true };
  } else if (!blocked && reward?.antiAbuseBlocked) {
    // Pending/annulled payments must not permanently consume a welcome discount.
    customer.welcomeReward = { ...reward, status: 'available' };
    delete customer.welcomeReward.antiAbuseBlocked;
  }
  return before !== JSON.stringify(customer.welcomeReward);
}
function applyToCustomer(db, customer, secret, now = new Date()) {
  return setBlocked(customer, blockedPhones(db, now).has(fingerprint(customer, secret)));
}
function reconcile(db, secret, now = new Date()) {
  let changed = purge(db, now);
  const blocked = db.welcomeRewardHistory?.length ? blockedPhones(db, now) : new Set();
  for (const customer of db.customers || []) {
    if (!db.welcomeRewardHistory?.length && !customer.welcomeReward?.antiAbuseBlocked) continue;
    changed = setBlocked(customer, blocked.has(fingerprint(customer, secret))) || changed;
  }
  return changed;
}
module.exports = { RETENTION_MS, rememberBeforeDeletion, applyToCustomer, reconcile, purge };
