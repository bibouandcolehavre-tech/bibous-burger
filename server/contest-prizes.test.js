const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const prizes = require('./contest-prizes'), alerts = require('./contest-prize-alerts'), contest = require('./referral-contest');
const promoCodes = require('./promo-codes'), { previewPromotion } = require('../promo-client');
const { CONTEST_PRIZE_RULES } = require('../contest-prize-policy');
const { encodeBackup, decodeBackup } = require('./backups');
const { anonymizeCustomerAccount } = require('./account-deletion');
const finalizedAt = new Date('2026-10-13T10:00:00Z'), november = new Date('2026-11-01T09:00:00Z');
function fixture() {
  const db = { customers: [1, 2, 3].map(n => ({ id: `c${n}`, name: `Gagnant fictif ${n}`, phone: `+3360000000${n}`, verifiedPhone: `+3360000000${n}`, phoneVerifiedAt: '2026-09-01T09:00:00Z', points: 650, pushPreferences: { service: true, marketing: false } })), orders: [], referralContest: { ...contest.defaultContest(), status: 'published', revision: 2, rules: 'Règlement fictif de test', startDate: '2026-09-01', endDate: '2026-09-30', entries: [1, 2, 3].map(n => ({ customerId: `c${n}`, alias: `Participant ${n}`, joinedAt: `2026-09-01T09:0${n}:00Z`, prizeAlerts: true, shareEvents: [] })) } };
  db.orders = [1, 2, 3].map(n => ({ id: `source${n}`, customerId: `c${n}`, total: 100 - n * 10, status: 'delivered', createdAt: '2026-09-01T10:00:00Z', payment: { status: 'PAID', paidAt: '2026-09-01T10:00:00Z' } }));
  return db;
}
function confirm(db = fixture(), now = finalizedAt) {
  const preview = prizes.finalizationPreview(db, now), input = { confirmation: 'VALIDER LES LOTS DU CONCOURS', requestId: crypto.randomUUID(), rankingFingerprint: preview.rankingFingerprint, startMonth: '2026-11', eligibleMenuIds: ['classique-menu', 'duck-menu', 'naan-poulet'] };
  prizes.finalize(db, input, now); return { db, input };
}
function ready() { const { db } = confirm(); prizes.issueCurrentMonth(db, november); return db; }
const menu = n => ({ productId: 'classique-menu', quantity: n, options: [] });
const codeFor = (db, id = 'c1') => db.contestPrizes.vouchers.find(v => v.customerId === id).code;
const pushDisabled = { enabled: false, platforms: [] }, smsDisabled = alerts.configFromEnv({});
const smsEnabled = alerts.configFromEnv({ CONTEST_PRIZE_SMS_ENABLED: 'true', KEYYO_LINE: '+33600000000', KEYYO_SIP_PASSWORD: 'fixture-only', KEYYO_WEBHOOK_SECRET: 'x'.repeat(43), KEYYO_SMS_PRIVACY_KEY: 'y'.repeat(43) });
test('lots : aucune finalisation avant clôture, ni attribution sans confirmation des résultats', () => {
  const db = fixture(), before = structuredClone(db);
  assert.throws(() => prizes.finalizationPreview(db, new Date('2026-09-20T12:00:00Z')), { statusCode: 409 });
  assert.throws(() => prizes.finalize(db, {}, finalizedAt)); assert.deepEqual(db, before);
  db.referralContest.status = 'draft'; assert.throws(() => prizes.finalizationPreview(db, finalizedAt), { statusCode: 409 });
});
test('lots : 24, 6 et 2 menus ; classement figé, mois complet, double confirmation idempotente', () => {
  const { db, input } = confirm();
  assert.deepEqual(db.contestPrizes.grants.map(g => [g.rank, g.menus * g.months, g.lastMonth]), [[1, 24, '2027-10'], [2, 6, '2027-04'], [3, 2, '2026-11']]);
  assert.equal(db.contestPrizes.vouchers.length, 0);
  assert.equal(prizes.finalize(db, input, finalizedAt).changed, false); assert.equal(db.contestPrizes.grants.length, 3);
  assert.throws(() => prizes.finalize(db, { ...input, startMonth: '2026-12' }, finalizedAt), { statusCode: 409 });
  assert.throws(() => prizes.finalize(db, { ...input, requestId: crypto.randomUUID() }, finalizedAt), { statusCode: 409 });
});
test('lots : résultats modifiés et ex æquo bloquent la distribution', () => {
  const db = fixture(), preview = prizes.finalizationPreview(db, finalizedAt);
  const input = { confirmation: 'VALIDER LES LOTS DU CONCOURS', requestId: crypto.randomUUID(), rankingFingerprint: preview.rankingFingerprint, startMonth: '2026-11', eligibleMenuIds: ['classique-menu'] };
  db.orders[0].status = 'cancelled'; assert.throws(() => prizes.finalize(db, input, finalizedAt), { statusCode: 409 });
  const tied = fixture(); tied.orders[1].total = tied.orders[0].total;
  const tiePreview = prizes.finalizationPreview(tied, finalizedAt); assert.equal(tiePreview.tied, true);
  assert.throws(() => prizes.finalize(tied, { ...input, rankingFingerprint: tiePreview.rankingFingerprint }, finalizedAt), { statusCode: 409 });
  assert.equal(tied.contestPrizes, undefined);
});
test('lots : codes uniques par gagnant et par mois, pas de report, pas de création avant le mois', () => {
  const { db } = confirm(); assert.equal(prizes.issueCurrentMonth(db, finalizedAt), false);
  assert.equal(prizes.issueCurrentMonth(db, november), true); assert.equal(prizes.issueCurrentMonth(db, november), false);
  const firstCodes = db.contestPrizes.vouchers.map(v => v.code); assert.equal(new Set(firstCodes).size, 3);
  prizes.issueCurrentMonth(db, new Date('2026-12-01T09:00:00Z'));
  const december = db.contestPrizes.vouchers.filter(v => v.month === '2026-12'); assert.equal(december.length, 2);
  assert.equal(december[0].menus, 2); assert.equal(december[1].menus, 1); assert(december.every(v => !firstCodes.includes(v.code)));
  assert.equal(prizes.customerState(db, db.customers[0], { appPlatform: 'ios' }, new Date('2026-12-01T09:00:00Z')).vouchers.find(v => v.month === '2026-11').status, 'expired');
  assert.throws(() => prizes.assertAvailable(db, prizes.findVoucher(db, firstCodes[0]), 'c1', { appPlatform: 'ios' }, new Date('2026-12-01T00:00:00Z')), { statusCode: 409 });
});
test('lots : mois civils Paris, année bissextile et changement d’heure ; rappel dix jours avant le dernier jour', () => {
  assert.deepEqual(prizes.monthWindow('2026-10'), { startsAt: '2026-09-30T22:00:00.000Z', expiresAt: '2026-10-31T23:00:00.000Z', lastDay: '2026-10-31', reminderAt: '2026-10-21T07:00:00.000Z', availableAlertAt: '2026-10-01T07:00:00.000Z' });
  assert.equal(prizes.monthWindow('2026-11').reminderAt, '2026-11-20T08:00:00.000Z');
  assert.equal(prizes.monthWindow('2028-02').lastDay, '2028-02-29'); assert.equal(prizes.monthWindow('2028-02').reminderAt, '2028-02-19T08:00:00.000Z');
  assert.equal(prizes.currentMonth(new Date('2026-10-31T23:00:00Z')), '2026-11');
});
test('lots : codes personnels non exposés au public ni au site web, autre compte et borne refusés', () => {
  const db = ready(), voucher = prizes.findVoucher(db, codeFor(db));
  prizes.assertAvailable(db, voucher, 'c1', { appPlatform: 'ios' }, november);
  assert.throws(() => prizes.assertAvailable(db, voucher, 'c2', { appPlatform: 'ios' }, november), { statusCode: 403 });
  for (const context of [{}, { appPlatform: 'web' }, { appPlatform: 'android', isKiosk: true }]) assert.throws(() => prizes.assertAvailable(db, voucher, 'c1', context, november), { statusCode: 403 });
  assert.equal(prizes.customerState(db, db.customers[0], {}, november).vouchers[0].code, null);
  assert(prizes.customerState(db, db.customers[0], { appPlatform: 'android' }, november).vouchers[0].code);
  const other = prizes.customerState(db, db.customers[1], { appPlatform: 'ios' }, november); assert(!JSON.stringify(other).includes(codeFor(db)));
  assert(!JSON.stringify(contest.publicContest(db, november)).includes(codeFor(db)));
});
test('lots : les menus, le quota et les suppléments sont vérifiés, pas de code pour une commande du mois suivant', () => {
  const db = ready(), promo = prizes.promotion(db, codeFor(db));
  assert.equal(prizes.assertCart(promo, [menu(1)]), 1); assert.equal(prizes.assertCart(promo, [menu(2)]), 2);
  for (const items of [[menu(3)], [{ productId: 'classique', quantity: 1 }], [{ ...menu(1), quantity: NaN }], [{ ...menu(1), options: [{ price: 1 }] }]]) assert.throws(() => prizes.assertCart(promo, items));
  assert.throws(() => prizes.assertCart(promo, [{ productId: 'naan-poulet', quantity: 1, options: [] }]), /pas un naan seul/);
  assert.equal(prizes.assertCart(promo, [{ productId: 'naan-poulet', quantity: 1, options: [{ groupId: 'naan-format', id: 'menu', price: 3 }] }]), 1);
  assert.throws(() => prizes.assertMethod(promo, 'pickup', { appPlatform: 'ios', serviceDate: '2026-12-01' }));
  prizes.assertMethod(promo, 'pickup', { appPlatform: 'ios', serviceDate: '2026-11-30' });
  const third = prizes.promotion(db, codeFor(db, 'c3')); assert.throws(() => prizes.assertCart(third, [menu(1)])); assert.equal(prizes.assertCart(third, [menu(2)]), 2);
});
test('lots : deux commandes possibles sans dépassement ; annulation libère le quota, jamais après expiration', () => {
  const db = ready(), code = codeFor(db), voucher = prizes.findVoucher(db, code);
  for (const n of [1, 2]) {
    const order = { id: `gift${n}`, customerId: 'c1', promotion: prizes.promotion(db, code), items: [menu(1)], status: 'awaiting_payment', contestPrizePlatform: 'ios' };
    assert.equal(prizes.reserve(db, order, november), true); db.orders.push(order);
    assert.equal(prizes.reserve(db, order, november), false);
  }
  assert.equal(prizes.remaining(db, voucher), 0);
  assert.throws(() => prizes.assertAvailable(db, voucher, 'c1', { appPlatform: 'ios' }, november));
  db.orders.find(o => o.id === 'gift1').status = 'cancelled'; assert.equal(prizes.remaining(db, voucher), 1);
  prizes.reconcile(db); assert.equal(voucher.allocations[0].status, 'released');
  assert.throws(() => prizes.assertAvailable(db, voucher, 'c1', { appPlatform: 'ios' }, new Date('2026-12-01T09:00:00Z')));
});
test('lots : commande sans débit distincte de SumUp, frais de livraison non offerts, aperçu identique', () => {
  const db = ready(), code = codeFor(db), promo = prizes.promotion(db, code);
  const base = { subtotal: 14.9, discount: 1.49, discountRate: .1, deliveryFee: 3.99, total: 17.4 };
  const context = { appPlatform: 'ios', serviceDate: '2026-11-10' };
  const priced = promoCodes.applyPromotion(base, promo, 'delivery', [menu(1)], context); assert.equal(priced.total, 3.99); assert.equal(priced.discount, 14.9);
  assert.equal(previewPromotion(base, 14.9, promo, 'delivery').total, priced.total);
  const order = { ...promoCodes.applyPromotion({ ...base, deliveryFee: 0 }, promo, 'pickup', [menu(1)], context), id: 'gift-free', customerId: 'c1', items: [menu(1)], promotion: promo, method: 'pickup', serviceDate: '2026-11-10', status: 'awaiting_payment', contestPrizePlatform: 'ios' };
  prizes.reserve(db, order, november); db.orders.push(order);
  assert.equal(promoCodes.settlePromotionalOrder(order, november, db), true); assert.equal(order.payment.provider, 'contest_prize'); assert.equal(order.payment.amount, 0);
  assert.equal(promoCodes.settlePromotionalOrder(order, november, db), false);
});
test('lots : rappels optionnels et transports désactivés ne produisent aucun SMS ou push', () => {
  const db = ready(); const before = JSON.stringify(db);
  alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsDisabled }, november);
  assert.equal(db.contestPrizes.smsJobs.length, 0); assert.equal(db.pushNotifications, undefined);
  assert.notEqual(JSON.stringify(db), before, 'in-app availability marker only');
  assert.equal(alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsDisabled }, november), false);
  prizes.updateAlerts(db, db.customers[0], { enabled: false }, november);
  alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsEnabled }, november);
  assert.equal(db.contestPrizes.smsJobs.filter(j => j.customerId === 'c1').length, 0);
});
test('lots : notification du mois et rappel à J-10 sans doublons ni envoi du code par SMS', () => {
  const db = ready();
  alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsEnabled }, november);
  assert.equal(db.contestPrizes.smsJobs.length, 3);
  alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsEnabled }, november); assert.equal(db.contestPrizes.smsJobs.length, 3);
  const n20 = new Date('2026-11-20T08:00:00Z');
  alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsEnabled }, new Date(+n20 - 1)); assert.equal(db.contestPrizes.smsJobs.length, 3);
  alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsEnabled }, n20); assert.equal(db.contestPrizes.smsJobs.length, 6);
  for (const v of db.contestPrizes.vouchers) for (const type of ['available', 'reminder']) { const copy = alerts.copyFor(v, type); assert(copy.sms.length <= 160); assert(!copy.sms.includes(v.code)); }
  assert(!JSON.stringify(db.contestPrizes.smsJobs).includes('+336'));
});
test('lots : aucun rappel pour un quota épuisé ; notification privilégiée au SMS', () => {
  const db = ready(), voucher = db.contestPrizes.vouchers.find(v => v.customerId === 'c1');
  db.pushNotifications = { devices: [{ installationId: crypto.randomUUID(), customerId: 'c2', platform: 'ios', token: 'ExpoPushToken[fictionalToken012345678]', lastSeenAt: november.toISOString() }], jobs: [], campaigns: [] };
  const order = { id: 'used', customerId: 'c1', promotion: prizes.promotion(db, voucher.code), items: [menu(2)], status: 'awaiting_payment', contestPrizePlatform: 'ios' };
  prizes.reserve(db, order, november); order.payment = { status: 'PAID' }; db.orders.push(order);
  alerts.schedule(db, { pushConfig: { enabled: true, platforms: ['ios'] }, smsConfig: smsEnabled }, november);
  assert.equal(db.pushNotifications.jobs.length, 1); assert.equal(db.pushNotifications.jobs[0].screen, 'contest');
  assert.equal(db.contestPrizes.smsJobs.length, 1); assert.equal(db.contestPrizes.smsJobs[0].customerId, 'c3');
});
test('lots : SMS simulé une seule fois ; réponse perdue et refus des rappels ne relancent pas de dépense', async () => {
  const db = ready(); alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsEnabled }, november);
  prizes.updateAlerts(db, db.customers[1], { enabled: false }, november); prizes.updateAlerts(db, db.customers[2], { enabled: false }, november);
  let calls = 0;
  const worker = alerts.createWorker({ config: smsEnabled, transact: async fn => fn(db), now: () => +november, sendSms: async (number, text, options) => { assert.equal(await options.canSend(), true); assert(text.includes('code personnel')); calls++; throw Error('Lost response'); } });
  await worker.tick(); await worker.tick(); assert.equal(calls, 1); assert.equal(db.contestPrizes.smsJobs.find(j => j.customerId === 'c1').status, 'uncertain');
});
test('lots : sauvegarde intégrale des codes et quotas, restauration sans nouveau SMS automatique', async () => {
  const db = ready(); alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsEnabled }, november);
  const captured = alerts.backupDatabase(db), restored = await decodeBackup(await encodeBackup({ database: captured, stock: {} }));
  assert.deepEqual(restored.data.database.contestPrizes.vouchers, db.contestPrizes.vouchers);
  assert.deepEqual(restored.data.database.contestPrizes.grants, db.contestPrizes.grants);
  assert(restored.data.database.contestPrizes.smsJobs.every(j => j.status === 'uncertain')); assert.equal(restored.data.database.customers[0].points, 650);
  assert(db.contestPrizes.smsJobs.every(j => j.status === 'queued'), 'backup normalization does not mutate the running queue');
});
test('lots : suppression du compte annule ses lots, efface ses codes et ses rappels sans toucher aux autres gagnants', () => {
  const db = ready(); alerts.schedule(db, { pushConfig: pushDisabled, smsConfig: smsEnabled }, november);
  const ownCode = codeFor(db), otherCode = codeFor(db, 'c2'); anonymizeCustomerAccount(db, db.customers[0], november);
  assert(!JSON.stringify(db).includes(ownCode)); assert(JSON.stringify(db).includes(otherCode));
  assert.equal(db.contestPrizes.grants.find(g => g.rank === 1).status, 'cancelled'); assert(!db.contestPrizes.smsJobs.some(j => j.customerId === 'c1'));
});
test('lots : règlement public inclut obligatoirement application, codes mensuels, perte sans report et rappel dix jours', () => {
  const publicData = contest.publicContest(fixture(), finalizedAt);
  assert(publicData.rules.includes(CONTEST_PRIZE_RULES)); assert.match(publicData.rules, /sans report/); assert.match(publicData.rules, /dix jours/);
  assert.equal(contest.publicContest({ customers: [], referralContest: contest.defaultContest() }).status, 'inactive');
});
