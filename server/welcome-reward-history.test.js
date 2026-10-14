const test = require('node:test'), assert = require('node:assert/strict');
const history = require('./welcome-reward-history');
const { grantWelcomeReward, consumeWelcomeReward, welcomeRewardAvailable } = require('./welcome-reward');
const { anonymizeCustomerAccount } = require('./account-deletion');
const { encodeBackup, decodeBackup } = require('./backups');
const now = new Date('2026-10-15T09:00:00Z'), secret = 'fictitious-stable-session-key';
function fixture(status = 'PAID') {
  const customer = { id: 'first', phone: '+33600000000', name: 'Client fictif', address: 'Adresse fictive' };
  grantWelcomeReward(customer, now);
  const order = { id: 'order-first', customerId: customer.id, customerPhone: customer.phone, welcomeRewardApplied: true,
    status: status === 'PAID' ? 'confirmed' : 'awaiting_payment', createdAt: now.toISOString(), payment: { status } };
  if (status === 'PAID') consumeWelcomeReward(customer, order, now);
  return { db: { customers: [customer], orders: [order] }, customer, order };
}
function remove(db, customer, at = now) { history.rememberBeforeDeletion(db, customer, secret, at); anonymizeCustomerAccount(db, customer, at); }
function recreate(db, phone = '06 00 00 00 00', at = now) {
  const customer = { id: 'new-' + db.customers.length, phone };
  grantWelcomeReward(customer, at); history.applyToCustomer(db, customer, secret, at); db.customers.push(customer); return customer;
}
test('10 % : suppression/recréation même numéro bloque la remise, autres numéros préservés', () => {
  const { db, customer } = fixture(); remove(db, customer);
  const next = recreate(db);
  assert.equal(welcomeRewardAvailable(next, db.orders, now), false);
  assert.equal(next.welcomeReward.antiAbuseBlocked, true);
  assert.equal(welcomeRewardAvailable(recreate(db, '+33700000001'), db.orders, now), true);
  const record = JSON.stringify(db.welcomeRewardHistory);
  for (const value of ['+33600000000', '0600000000', 'Client fictif', 'Adresse fictive', 'customerId']) assert(!record.includes(value), value);
  assert.equal(db.welcomeRewardHistory[0].phoneHash.length, 64);
  const expiry = db.welcomeRewardHistory[0].expiresAt;
  remove(db, next, new Date(+now + 86400000));
  assert.equal(db.welcomeRewardHistory[0].expiresAt, expiry, 'Recreated account must not extend retention');
});
test('10 % : compte sans utilisation, commande impayée expirée ou annulée gardent la remise', () => {
  for (const variant of ['unused', 'expired', 'cancelled']) {
    const { db, customer, order } = fixture('PENDING');
    if (variant === 'unused') db.orders = [];
    if (variant === 'expired') order.createdAt = new Date(+now - 3600000).toISOString();
    if (variant === 'cancelled') order.status = 'cancelled';
    remove(db, customer);
    assert.equal(welcomeRewardAvailable(recreate(db), db.orders, now), true, variant);
  }
});
test('10 % : suppression pendant paiement, abandon, paiement tardif et annulation sont réconciliés', () => {
  const { db, customer, order } = fixture('PENDING'); remove(db, customer);
  const next = recreate(db);
  assert.equal(next.welcomeReward.status, 'used', 'Pending payment reserves benefit across deletion');
  const later = new Date(+now + 3600000);
  assert.equal(history.reconcile(db, secret, later), true);
  assert.equal(next.welcomeReward.status, 'available', 'Never-paid order cannot consume discount');
  order.payment.status = 'PAID'; history.reconcile(db, secret, later);
  assert.equal(next.welcomeReward.status, 'used', 'Late verified payment remains detectable');
  order.status = 'cancelled'; history.reconcile(db, secret, later);
  assert.equal(next.welcomeReward.status, 'available', 'Cancelled order restores benefit');
});
test('10 % : historique privé survit à une sauvegarde et un redémarrage, sans clé ni numéro brut', async () => {
  const { db, customer } = fixture(); remove(db, customer);
  const copy = (await decodeBackup(await encodeBackup({ database: db, stock: {} }, now))).data.database;
  assert.deepEqual(copy.welcomeRewardHistory, db.welcomeRewardHistory);
  assert(!JSON.stringify(copy.welcomeRewardHistory).includes(secret));
  assert.equal(welcomeRewardAvailable(recreate(copy), copy.orders, now), false);
});
test('10 % : anciens comptes utilisés, portée HMAC et rétention bornée à 365 jours', () => {
  const { db, customer } = fixture(); db.orders = []; remove(db, customer);
  assert.equal(recreate(db).welcomeReward.status, 'used', 'Legacy used status remains protected');
  const expiry = new Date(+now + history.RETENTION_MS);
  assert.equal(history.reconcile(db, secret, expiry), true);
  assert.deepEqual(db.welcomeRewardHistory, []);
  assert.equal(db.customers[0].welcomeReward.status, 'available');
  const a = fixture(), b = fixture();
  history.rememberBeforeDeletion(a.db, a.customer, secret, now);
  history.rememberBeforeDeletion(b.db, b.customer, 'different-fictitious-key', now);
  assert.notEqual(a.db.welcomeRewardHistory[0].phoneHash, b.db.welcomeRewardHistory[0].phoneHash);
});
