const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultContest, saveContestDraft, publishContest, contestStatus, publicContest, joinContest, customerContest } = require('./referral-contest');
const { publicNews, dashboardNews } = require('./news');
const { periodsFor } = require('./contest-periods');
const { regularSlotsForDate } = require('./availability');
const fixture = () => ({ customers: [{ id: 'fixture', phone: '+33600000001', verifiedPhone: '+33600000001', phoneVerifiedAt: '2026-10-01T12:00:00Z', firstPhoneVerifiedAt: '2026-10-01T12:00:00Z', createdAt: '2026-10-01T12:00:00Z', points: 200, referralCode: 'BIBOU-FIXTURE' }], orders: [] });
function prepare(db) {
  saveContestDraft(db, { revision: 0, startDate: '2026-10-15', startTime: '11:00', endDate: '2026-12-31', rules: 'Règlement fictif réservé aux tests, sans publication réelle.' }, new Date('2026-10-14T21:00:00Z'));
}
function publish(db) { prepare(db); publishContest(db, { revision: 1, confirmation: 'PUBLIER LE CONCOURS' }, new Date('2026-10-14T21:00:00Z')); }
test('Ouverture propriétaire à 11 h Paris : brouillon fermé, avant 11 h bloqué, après 11 h ouvert sans ajout de roue', () => {
  const db = fixture(); prepare(db);
  assert.deepEqual(publicContest(db, new Date('2026-10-15T09:00:00Z')), { status: 'inactive' });
  publishContest(db, { revision: 1, confirmation: 'PUBLIER LE CONCOURS' }, new Date('2026-10-14T21:00:00Z'));
  const before = new Date('2026-10-15T08:59:59.999Z'), opening = new Date('2026-10-15T09:00:00Z');
  assert.equal(contestStatus(db.referralContest, before), 'scheduled');
  assert.equal(contestStatus(db.referralContest, opening), 'active');
  const input = { contestId: 'bibou-launch', revision: 2, acceptRules: true, confirmAdult: true, confirmRegion: true };
  assert.throws(() => joinContest(db, db.customers[0], input, 'test-only', before), /pas ouvert/);
  joinContest(db, db.customers[0], input, 'test-only', opening);
  db.orders = [before, opening].map(at => ({ customerId: 'fixture', total: 20, paidTotal: 20, status: 'confirmed', createdAt: at.toISOString(), payment: { status: 'PAID', paidAt: at.toISOString() } }));
  db.wheelSpins = [{ customerId: 'fixture', awardedAt: opening.toISOString(), pointsAdded: 60 }];
  assert.equal(customerContest(db, db.customers[0], opening).participation.score, 20);
  assert.equal(db.customers[0].points, 200);
  assert.deepEqual(publicContest(db, opening).scoring, { pointsPerEuro: 1, pointsPerVerifiedReferral: 20, pointsPerDailyShareAction: 1 });
  assert.equal(periodsFor(db.referralContest)[0].startsAt, '2026-10-15T09:00:00.000Z');
  assert.equal(contestStatus(db.referralContest, new Date('2026-12-31T22:59:59.999Z')), 'active');
  assert.equal(contestStatus(db.referralContest, new Date('2026-12-31T23:00:00Z')), 'closed');
});
test('Annonce prioritaire dans les actualités : date de fin visible, ouverture à 11 h exacte, données non modifiées', () => {
  const db = fixture(); publish(db);
  db.news = { revision: 0, items: dashboardNews(db).items.slice().reverse() };
  const original = JSON.stringify(db);
  const scheduled = publicNews(db, new Date('2026-10-15T08:59:59Z')).items[0];
  assert.equal(scheduled.kind, 'contest'); assert.match(scheduled.title, /31 décembre/); assert.match(scheduled.subtitle, /15 octobre à 11:00/);
  const active = publicNews(db, new Date('2026-10-15T09:00:00Z')).items[0];
  assert.equal(active.kind, 'contest'); assert.match(active.title, /ouvert.*31 décembre/); assert.match(active.subtitle, /gratuite/);
  for (const item of [scheduled, active]) { assert(item.title.length <= 70); assert(item.subtitle.length <= 160); }
  assert.equal(JSON.stringify(db), original);
  assert.doesNotMatch(publicNews(db, new Date('2026-10-15T09:00:00Z'), false).items.find(item => item.kind === 'contest').title, /ouvert/);
});
test('Une fermeture du restaurant ne masque plus le concours publié, sans masquer la fermeture', () => {
  const db = fixture(); publish(db); const day = '2026-10-15';
  db.serviceSchedule = { dates: { [day]: { services: Object.fromEntries(['pickup','delivery','reservation'].map(method => [method, Object.fromEntries(regularSlotsForDate(day, method).filter(slot => slot >= '18:00').map(slot => [slot, false]))])) } } };
  const items = publicNews(db, new Date('2026-10-15T16:00:00Z')).items;
  assert.match(items[0].title, /Fermé exceptionnellement/);
  assert(items.some(item => item.kind === 'contest' && /31 décembre/.test(item.title)));
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
});
