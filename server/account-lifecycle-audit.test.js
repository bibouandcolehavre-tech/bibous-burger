const test = require('node:test'), assert = require('node:assert/strict');
const referrals = require('./referrals'), contest = require('./referral-contest');
const history = require('./welcome-reward-history'), { anonymizeCustomerAccount } = require('./account-deletion');
const { grantWelcomeReward } = require('./welcome-reward');
const crm = require('./crm');
const preset = require('../restaurant-dashboard/contest-launch-20261015.json');
const now = new Date('2026-10-15T10:00:00Z'), secret = 'fictitious-lifecycle-key';
const person = (id, phone, createdAt = '2025-01-01T12:00:00Z') => ({ id, phone, verifiedPhone: phone, phoneVerifiedAt: createdAt, firstPhoneVerifiedAt: createdAt, createdAt, name: 'Fictif', points: 0 });
function fixture() {
  const sponsor = person('sponsor', '+33700000000'), friend = person('friend', '+33600000000');
  const db = { customers: [sponsor, friend], orders: [] }; referrals.ensureAllReferralCodes(db);
  return { db, sponsor, friend };
}
function deleteAndRecreate(db, old, at = now) {
  history.rememberBeforeDeletion(db, old, secret, at); anonymizeCustomerAccount(db, old, at);
  const next = person(old.id + '-recreated', old.phone, at.toISOString()); grantWelcomeReward(next, at);
  history.applyToCustomer(db, next, secret, at); db.customers.push(next); referrals.ensureAllReferralCodes(db); return next;
}
function paid(db, friend, id) { const order = { id, customerId: friend.id, status: 'confirmed', createdAt: now.toISOString(), total: 10,
  payment: { status: 'PAID', provider: 'sumup', paidAt: now.toISOString() } }; db.orders.push(order); return order; }

test('cycle compte : un même numéro ne redonne pas 100 points de parrainage après suppression', () => {
  const { db, sponsor, friend } = fixture(); referrals.applyReferralCode(db, friend, sponsor.referralCode, now);
  referrals.grantReferralReward(paid(db, friend, 'first-paid'), db, now); assert.equal(sponsor.points, 100);
  const next = deleteAndRecreate(db, friend);
  assert.throws(() => referrals.applyReferralCode(db, next, sponsor.referralCode, now), /première|nouveau|déjà/i);
  next.referredByCustomerId = sponsor.id; // Defence in depth against stale/migrated links, not a client-writable field.
  assert.equal(referrals.grantReferralReward(paid(db, next, 'second-paid'), db, now).pointsAdded, 0);
  assert.equal(sponsor.points, 100);
});
test('cycle compte : annulation après suppression du filleul retire toujours le bonus du parrain', () => {
  const { db, sponsor, friend } = fixture(); referrals.applyReferralCode(db, friend, sponsor.referralCode, now);
  const order = paid(db, friend, 'cancel-after-deletion'); referrals.grantReferralReward(order, db, now);
  history.rememberBeforeDeletion(db, friend, secret, now); anonymizeCustomerAccount(db, friend, now);
  order.status = 'cancelled'; assert.equal(referrals.revokeReferralReward(order, db, now), true);
  assert.equal(sponsor.points, 0); assert.equal(order.customerId, null); assert.equal(order.customerPhone, undefined);
  assert.equal(referrals.revokeReferralReward(order, db, now), false);
});
test('cycle compte : ancien compte recréé pendant le concours ne devient pas un nouvel ami', () => {
  const { db, sponsor, friend } = fixture();
  db.referralContest = { ...contest.defaultContest(), ...preset, status: 'published', revision: 3 };
  const input = { contestId: 'bibou-launch', revision: 3, acceptRules: true, confirmAdult: true, confirmRegion: true };
  contest.joinContest(db, sponsor, input, secret, now);
  const next = deleteAndRecreate(db, friend);
  contest.joinContest(db, next, { ...input, sponsorCode: sponsor.referralCode }, secret, now);
  assert.equal(contest.customerContest(db, sponsor, now).participation.score, 0);
  assert.equal(contest.customerContest(db, next, now).participation.score, 0);
});
test('cycle compte : nouveau client réel inscrit pendant le concours garde ses droits après un abandon de compte', () => {
  const { db, sponsor, friend } = fixture(); const registered = '2026-10-15T09:10:00Z';
  Object.assign(friend, { createdAt: registered, firstPhoneVerifiedAt: registered, phoneVerifiedAt: registered });
  db.referralContest = { ...contest.defaultContest(), ...preset, status: 'published', revision: 3 };
  const input = { contestId: 'bibou-launch', revision: 3, acceptRules: true, confirmAdult: true, confirmRegion: true };
  contest.joinContest(db, sponsor, input, secret, now); const next = deleteAndRecreate(db, friend);
  contest.joinContest(db, next, { ...input, sponsorCode: sponsor.referralCode }, secret, now);
  assert.equal(contest.customerContest(db, sponsor, now).participation.score, 20);
  assert.equal(next.welcomeReward.status, 'available');
});

test('cycle compte : une remise anniversaire déjà payée ne revient pas la même année après recréation', () => {
  const { db, friend } = fixture(); const usedAt = new Date('2026-11-01T10:00:00Z'), recreatedAt = new Date('2026-11-05T10:00:00Z');
  db.crm = { settings: crm.defaults(), offers: [{ id: 'birthday-first', customerId: friend.id, ruleId: 'birthday', eventKey: 'birthday:2026', discountPercent: 15, minSubtotal: 0, expiresAt: +usedAt + 86400000 }] };
  const order = paid(db, friend, 'birthday-paid'); order.payment.paidAt = usedAt.toISOString(); order.crmOfferId = 'birthday-first'; order.crmRuleId = 'birthday';
  const next = deleteAndRecreate(db, friend, recreatedAt);
  crm.updateCustomerPreferences(db, next, { birthday: '11-06', personalizedOffers: true }, +recreatedAt);
  db.crm.offers.push({ id: 'birthday-again', customerId: next.id, ruleId: 'birthday', eventKey: 'birthday:2026', birthdayDate: '2026-11-06', discountPercent: 15, minSubtotal: 0, createdAt: +recreatedAt, expiresAt: Date.parse('2026-11-10T10:00:00Z') });
  assert.equal(crm.bestOffer(db, next, 20, 0, Date.parse('2026-11-06T10:00:00Z')), null);
  const expiresAt = db.birthdayRewardHistory[0].expiresAt;
  assert.equal(expiresAt, '2026-12-31T23:00:00.000Z');
  assert(!JSON.stringify(db.birthdayRewardHistory).includes('11-06'), 'Birthday day/month must not be retained in the anti-abuse trace');
  history.reconcile(db, secret, new Date('2027-01-01T00:00:00Z'));
  assert.deepEqual(db.birthdayRewardHistory, []);
  assert.equal(next.birthdayBenefitUsedYears, undefined);
});

test('cycle compte : paiement anniversaire confirmé après suppression reste détecté, sans bloquer un paiement abandonné', () => {
  const { db, friend } = fixture();
  const usedAt = new Date('2026-11-01T10:00:00Z'), recreatedAt = new Date('2026-11-05T10:00:00Z');
  db.crm = { settings: crm.defaults(), offers: [{ id: 'birthday-pending', customerId: friend.id, ruleId: 'birthday', eventKey: 'birthday:2026' }] };
  const order = paid(db, friend, 'pending-birthday'); order.payment.status = 'PENDING'; delete order.payment.paidAt;
  order.crmOfferId = 'birthday-pending'; order.crmRuleId = 'birthday';
  const next = deleteAndRecreate(db, friend, recreatedAt);
  assert.equal(next.birthdayBenefitUsedYears, undefined);
  assert.deepEqual(db.birthdayRewardHistory[0].orderIds, [order.id]);
  order.payment.status = 'PAID'; order.payment.paidAt = usedAt.toISOString();
  history.reconcile(db, secret, recreatedAt);
  assert.deepEqual(next.birthdayBenefitUsedYears, ['2026']);
});

test('cycle compte : les traces minimales survivent à une sauvegarde vérifiée et ne contiennent pas le numéro', async () => {
  const { db, friend } = fixture(); deleteAndRecreate(db, friend);
  const { encodeBackup, decodeBackup } = require('./backups');
  const restored = await decodeBackup(await encodeBackup({ database: db, stock: {} }, now));
  assert.deepEqual(restored.data.database.welcomeRewardHistory, db.welcomeRewardHistory);
  assert(!JSON.stringify(db.welcomeRewardHistory).includes(friend.phone));
  history.reconcile(db, secret, new Date(+now + history.RETENTION_MS + 1));
  assert.deepEqual(db.welcomeRewardHistory, []);
});

test('cycle compte : une remise de veille du 1er janvier protège la bonne année sans interdire le prochain anniversaire légitime', () => {
  const { db, friend } = fixture(); const at = new Date('2026-12-31T10:00:00Z');
  db.crm = { offers: [{ id: 'birthday-next-year', ruleId: 'birthday', eventKey: 'birthday:2027', customerId: friend.id }] };
  const order = paid(db, friend, 'new-year-eve-birthday'); order.crmOfferId = 'birthday-next-year'; order.payment.paidAt = at.toISOString();
  const next = deleteAndRecreate(db, friend, at);
  assert.deepEqual(next.birthdayBenefitUsedYears, ['2027']);
  assert.equal(db.birthdayRewardHistory[0].expiresAt, '2027-12-31T23:00:00.000Z');
  const policy = require('./birthday-policy');
  const genuine = { createdAt: '2025-01-01T10:00:00Z', crmPreferences: { birthday: '01-01' }, birthdayBenefitUsedYears: ['2026'] };
  assert.equal(policy.birthdayTrigger(genuine, +at), 'birthday:2027');
  genuine.birthdayBenefitUsedYears.push('2027'); assert.equal(policy.birthdayTrigger(genuine, +at), null);
});
