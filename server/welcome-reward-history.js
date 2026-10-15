// Private, purpose-scoped anti-abuse records. Never expose these through a customer API.
const crypto = require('node:crypto');
const { PENDING_RESERVATION_MS, parisDateKey, serviceSlotInstant } = require('./availability');
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
  let changed = false;
  for (const key of ['welcomeRewardHistory', 'birthdayRewardHistory']) {
    if (!Array.isArray(db[key])) continue;
    const retained = db[key].filter(record => Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) > +now);
    if (retained.length !== db[key].length) { db[key] = retained; changed = true; }
  }
  return changed;
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
  const purchaseOrders = (db.orders || []).filter(order => order.customerId === customer.id && order.payment?.provider !== 'promotion');
  const year = parisDateKey(now).slice(0, 4);
  // Keep the payment reference even while it is pending: deletion must not
  // erase the guard if that existing checkout is confirmed afterwards.
  for (const order of purchaseOrders) {
    const offer = db.crm?.offers?.find(offer => offer.id === order.crmOfferId);
    if (order.crmRuleId !== 'birthday' && offer?.ruleId !== 'birthday') continue;
    const usedYear = /^birthday:(\d{4})$/.exec(offer?.eventKey || '')?.[1] ||
      (Number.isFinite(Date.parse(order.payment?.paidAt)) ? parisDateKey(new Date(order.payment.paidAt)).slice(0, 4) : null);
    // A legitimate eve-of-birthday offer on 31 December can belong to the
    // following benefit year. Preserve that year, not the payment's year.
    if (![year, String(Number(year) + 1)].includes(usedYear)) continue;
    const claims = db.birthdayRewardHistory ||= [];
    const claim = claims.find(claim => claim.phoneHash === phoneHash && claim.year === usedYear);
    if (claim) claim.orderIds = [...new Set([...(claim.orderIds || []), order.id])];
    else claims.push({ phoneHash, year: usedYear, orderIds: [order.id], expiresAt: serviceSlotInstant(`${Number(usedYear) + 1}-01-01`, '00:00').toISOString() });
  }
  const history = db.welcomeRewardHistory ||= [];
  const existing = history.find(record => record.phoneHash === phoneHash);
  if (existing) {
    existing.orderIds = [...new Set([...existing.orderIds, ...orders.map(order => order.id)])];
    existing.purchaseOrderIds = [...new Set([...(existing.purchaseOrderIds || []), ...purchaseOrders.map(order => order.id)])];
    existing.usedWithoutOrder ||= usedWithoutOrder;
  } else history.push({ phoneHash, orderIds: orders.map(order => order.id), usedWithoutOrder, purchaseOrderIds: purchaseOrders.map(order => order.id),
    firstSeenAt: Number.isFinite(Date.parse(customer.createdAt)) ? customer.createdAt : null,
    firstVerifiedAt: Number.isFinite(Date.parse(customer.firstPhoneVerifiedAt || customer.phoneVerifiedAt)) ? customer.firstPhoneVerifiedAt || customer.phoneVerifiedAt : null,
    expiresAt: new Date(+now + RETENTION_MS).toISOString() });
  return true;
}
function blockedPhones(db, now) {
  const orders = new Map((db.orders || []).map(order => [order.id, order]));
  const welcome = new Set(), referrals = new Set(), birthdays = new Map();
  for (const record of db.welcomeRewardHistory || []) {
    if (Date.parse(record.expiresAt) <= +now) continue;
    if (record.usedWithoutOrder || record.orderIds.some(id => relevantOrder(orders.get(id), now))) welcome.add(record.phoneHash);
    if ((record.purchaseOrderIds || []).some(id => { const order = orders.get(id); return order?.payment?.status === 'PAID' && order.payment.provider !== 'promotion' && order.status !== 'cancelled'; })) referrals.add(record.phoneHash);
  }
  for (const claim of db.birthdayRewardHistory || []) if (Date.parse(claim.expiresAt) > +now &&
    (!claim.orderIds || claim.orderIds.some(id => orders.get(id)?.payment?.status === 'PAID'))) {
    if (!birthdays.has(claim.phoneHash)) birthdays.set(claim.phoneHash, []);
    birthdays.get(claim.phoneHash).push(claim.year);
  }
  return { welcome, referrals, birthdays };
}
function setBlocked(customer, blocked, referralBlocked, birthdayYears = []) {
  const before = JSON.stringify([customer.welcomeReward, customer.referralBenefitsBlocked, customer.birthdayBenefitUsedYears]);
  const reward = customer.welcomeReward;
  if (blocked && reward?.status === 'available') {
    customer.welcomeReward = { ...reward, status: 'used', antiAbuseBlocked: true };
  } else if (!blocked && reward?.antiAbuseBlocked) {
    // Pending/annulled payments must not permanently consume a welcome discount.
    customer.welcomeReward = { ...reward, status: 'available' };
    delete customer.welcomeReward.antiAbuseBlocked;
  }
  if (referralBlocked) customer.referralBenefitsBlocked = true;
  else delete customer.referralBenefitsBlocked;
  if (birthdayYears.length) customer.birthdayBenefitUsedYears = [...new Set(birthdayYears)].sort();
  else delete customer.birthdayBenefitUsedYears;
  return before !== JSON.stringify([customer.welcomeReward, customer.referralBenefitsBlocked, customer.birthdayBenefitUsedYears]);
}
function applyToCustomer(db, customer, secret, now = new Date()) {
  const sets = blockedPhones(db, now), hash = fingerprint(customer, secret);
  return setBlocked(customer, sets.welcome.has(hash), sets.referrals.has(hash), sets.birthdays.get(hash));
}
function reconcile(db, secret, now = new Date()) {
  let changed = purge(db, now);
  const blocked = db.welcomeRewardHistory?.length || db.birthdayRewardHistory?.length ? blockedPhones(db, now) : { welcome: new Set(), referrals: new Set(), birthdays: new Map() };
  for (const customer of db.customers || []) {
    if (!db.welcomeRewardHistory?.length && !db.birthdayRewardHistory?.length && !customer.welcomeReward?.antiAbuseBlocked && !customer.referralBenefitsBlocked && !customer.birthdayBenefitUsedYears) continue;
    const hash = fingerprint(customer, secret);
    changed = setBlocked(customer, blocked.welcome.has(hash), blocked.referrals.has(hash), blocked.birthdays.get(hash)) || changed;
  }
  return changed;
}
function previousAccount(db, customer, secret, now = new Date()) {
  const hash = fingerprint(customer, secret);
  if (!hash) return null;
  return (db.welcomeRewardHistory || []).find(record => record.phoneHash === hash && Date.parse(record.expiresAt) > +now) ||
    ((db.birthdayRewardHistory || []).some(record => record.phoneHash === hash && Date.parse(record.expiresAt) > +now) ? { firstSeenAt: null, firstVerifiedAt: null } : null);
}
module.exports = { RETENTION_MS, rememberBeforeDeletion, applyToCustomer, reconcile, purge, previousAccount };
