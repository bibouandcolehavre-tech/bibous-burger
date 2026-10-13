const test = require('node:test'), assert = require('node:assert/strict');
const crm = require('./crm'), push = require('./push-notifications'), policy = require('./birthday-policy');
const NOW = Date.parse('2026-10-13T10:00:00Z'), off = { enabled: false, platforms: [] };
function setup(createdAt = '2026-10-13T08:00:00Z') {
  const c = { id: 'birthday-fictional', name: 'Client fictif', createdAt, points: 650, welcomeReward: { status: 'available' }, crmPreferences: { personalizedOffers: true, birthday: '' } };
  const db = { customers: [c], orders: [] }, settings = crm.defaults();
  settings.enabled = true; Object.assign(settings.rules.find(r => r.type === 'birthday'), { enabled: true, discountPercent: 15, channel: 'in_app_push' });
  crm.saveSettings(db, { ...settings, confirmActivation: true }, NOW);
  return { db, c };
}
test('anniversaire : inscription et anniversaire le même jour, aucun 15 %, première offre au prochain anniversaire', () => {
  const { db, c } = setup(); crm.updateCustomerPreferences(db, c, { personalizedOffers: true, birthday: '10-13' }, NOW);
  assert.equal(c.crmPreferences.birthdayEligibleFrom, '2027-10-13'); assert.equal(crm.evaluate(db, off, NOW), 0);
  assert.equal(crm.bestOffer(db, c, 30, .1, NOW), null); assert.equal(c.points, 650); assert.equal(c.welcomeReward.status, 'available');
  assert.equal(crm.evaluate(db, off, Date.parse('2027-10-12T10:00:00Z')), 1);
  assert.equal(db.crm.offers[0].birthdayDate, '2027-10-13'); assert.equal(db.crm.offers[0].discountPercent, 15);
});
test('anniversaire : pas de remise à l’inscription pour un anniversaire du lendemain ; attribution possible le jour venu', () => {
  const { db, c } = setup(); crm.updateCustomerPreferences(db, c, { personalizedOffers: true, birthday: '10-14' }, NOW);
  assert.equal(crm.evaluate(db, off, NOW), 0); assert.equal(crm.evaluate(db, off, NOW + 86400000), 1);
  assert.equal(crm.bestOffer(db, c, 30, .1, NOW + 86400000).discountPercent, 15);
});
test('anniversaire : ancien compte inchangé conserve son offre de la veille ; aucun reset par simple changement de consentement', () => {
  const { db, c } = setup('2025-10-01T10:00:00Z'); c.crmPreferences.birthday = '10-14';
  assert.equal(crm.evaluate(db, off, NOW), 1);
  crm.updateCustomerPreferences(db, c, { personalizedOffers: true, birthday: '10-14' }, NOW);
  assert.equal(c.crmPreferences.birthdayRecordedAt, undefined); assert.equal(crm.bestOffer(db, c, 30, 0, NOW).discountPercent, 15);
});
test('anniversaire : modification le jour même et aller-retour de dates n’activent pas un ancien bon', () => {
  const { db, c } = setup('2025-10-01T10:00:00Z'); c.crmPreferences.birthday = '10-13';
  const offer = { id: 'legacy-birthday', ruleId: 'birthday', eventKey: 'birthday:2026', customerId: c.id, discountPercent: 15, minSubtotal: 0, createdAt: NOW - 86400000, expiresAt: NOW + 14 * 86400000 };
  db.crm.offers.push(offer);
  crm.updateCustomerPreferences(db, c, { personalizedOffers: true, birthday: '10-20' }, NOW);
  crm.updateCustomerPreferences(db, c, { personalizedOffers: true, birthday: '10-13' }, NOW);
  assert.equal(c.crmPreferences.birthdayEligibleFrom, '2027-10-13'); assert.equal(crm.bestOffer(db, c, 30, 0, NOW), null);
  assert.equal(crm.customerState(db, c, NOW).offers[0].status, 'ineligible_birthday');
  const recorded = c.crmPreferences.birthdayRecordedAt; crm.updateCustomerPreferences(db, c, { personalizedOffers: true, birthday: '10-13' }, NOW + 1000); assert.equal(c.crmPreferences.birthdayRecordedAt, recorded);
});
test('anniversaire : ancien bon indu bloqué, autres bons et commandes déjà payées ou en paiement conservés', () => {
  const { db, c } = setup(); c.crmPreferences.birthday = '10-13';
  const birthday = { id: 'birthday-old', ruleId: 'birthday', eventKey: 'birthday:2026', customerId: c.id, discountPercent: 15, minSubtotal: 0, createdAt: NOW, expiresAt: NOW + 86400000 };
  const other = { ...birthday, id: 'frequency', ruleId: 'frequency', discountPercent: 12 }; db.crm.offers.push(birthday, other);
  assert.equal(crm.bestOffer(db, c, 30, .1, NOW).id, other.id);
  const paid = { id: 'paid', crmOfferId: birthday.id, customerId: c.id, total: 25.5, status: 'confirmed', payment: { status: 'PAID' } }; db.orders.push(paid);
  assert.equal(crm.customerState(db, c, NOW).offers.find(o => o.id === birthday.id).status, 'used'); assert.equal(paid.total, 25.5);
  paid.payment = { status: 'PENDING', checkoutId: 'fictional' }; paid.status = 'awaiting_payment'; paid.createdAt = new Date(NOW).toISOString();
  assert.equal(crm.customerState(db, c, NOW).offers.find(o => o.id === birthday.id).status, 'reserved'); assert.equal(paid.total, 25.5);
});
test('anniversaire : jours calculés à Paris, passage d’année et 29 février sans fausse date', () => {
  const { c } = setup('2026-10-12T22:30:00Z'); c.crmPreferences.birthday = '10-13'; assert.equal(policy.eligibleBirthdayDate(c, '2026-10-13'), false);
  assert.equal(policy.nextBirthdayDate('01-01', Date.parse('2026-12-31T23:30:00Z')), '2028-01-01');
  assert.equal(policy.nextBirthdayDate('02-29', Date.parse('2028-02-29T10:00:00Z')), '2032-02-29');
});
test('anniversaire : client ne peut pas forger les preuves de date et suppression efface le ciblage', () => {
  const { db, c } = setup(); assert.throws(() => crm.updateCustomerPreferences(db, c, { personalizedOffers: true, birthday: '10-13', birthdayEligibleFrom: '2026-10-13' }));
  crm.updateCustomerPreferences(db, c, { personalizedOffers: true, birthday: '10-13' }, NOW); crm.updateCustomerPreferences(db, c, { personalizedOffers: true, birthday: '' }, NOW);
  assert.equal(c.crmPreferences.birthday, ''); assert.equal(c.crmPreferences.birthdayRecordedAt, undefined); assert.equal(c.crmPreferences.birthdayEligibleFrom, undefined);
});
test('anniversaire : aucune notification d’un bon désormais inéligible', async () => {
  const { db, c } = setup(); c.crmPreferences.birthday = '10-13'; c.pushPreferences = { marketing: true };
  const offer = { id: 'invalid-birthday', ruleId: 'birthday', eventKey: 'birthday:2026', customerId: c.id, title: 'Joyeux anniversaire', discountPercent: 15, minSubtotal: 0, createdAt: NOW, expiresAt: NOW + 86400000 }; db.crm.offers.push(offer);
  const config = { enabled: true, platforms: ['ios'] }; push.registerDevice(db, c, { installationId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', secret: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', token: 'ExpoPushToken[abcdefghij123456]', platform: 'ios' }, NOW);
  push.queueCrmNotification(db, offer, config, NOW); const worker = push.createPushWorker({ config, transact: async fn => fn(db), clock: () => NOW, fetchImpl: async () => assert.fail('No real or mocked provider send should occur') });
  await worker.tick(); assert.equal(db.pushNotifications.jobs[0].status, 'cancelled');
});
