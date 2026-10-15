const test = require('node:test'), assert = require('node:assert/strict');
const { defaultContest, saveContestDraft, publishContest, publicContest, contestStatus, joinContest, customerContest, contestRanking } = require('./referral-contest');
const { dashboardContestPeriods, periodsFor } = require('./contest-periods');
const { contestWindow, withinContest } = require('./contest-window');
const fixture = () => ({ customers: ['a','b','c','d','e'].map(id => ({ id, name: 'Client fictif ' + id, phone: 'PRIVATE-PHONE', points: 200 })), orders: [], wheelSpins: [],
  referralContest: { ...defaultContest(), status: 'published', revision: 1, startDate: '2026-10-15', startTime: '12:00', endDate: '2026-12-31', rules: 'Règlement fictif de test', entries: ['a','b','c','d','e'].map((id, i) => ({ customerId: id, alias: 'Participant ' + id, joinedAt: i === 4 ? '2026-10-30T23:00:00Z' : '2026-10-15T10:00:00Z', shareEvents: [] })) } });
const readAt = new Date('2026-11-14T00:00:00Z');
test('Quinzaines communes : cinq périodes, aucun tirage du 29 au 31 décembre, passage hiver à Paris', () => {
  const periods = periodsFor(fixture().referralContest);
  assert.deepEqual(periods.map(p => [p.startDate, p.endDate]), [['2026-10-15','2026-10-29'],['2026-10-30','2026-11-13'],['2026-11-14','2026-11-28'],['2026-11-29','2026-12-13'],['2026-12-14','2026-12-28']]);
  assert.equal(periods[0].startsAt, '2026-10-15T10:00:00.000Z');
  assert.equal(periods[0].endsAt, '2026-10-29T23:00:00.000Z');
  assert.equal(periods[1].startsAt, periods[0].endsAt);
  assert.equal(periods[4].endsAt, '2026-12-28T23:00:00.000Z');
});
test('Ouverture réelle à midi : aucun accès ni point de commande avant, clôture fin du 31 décembre', () => {
  const db = fixture(), contest = db.referralContest;
  assert.equal(contestStatus(contest, new Date('2026-10-15T09:59:59.999Z')), 'scheduled');
  assert.equal(contestStatus(contest, new Date('2026-10-15T10:00:00Z')), 'active');
  assert.equal(withinContest(contest, '2026-10-15T09:59:59.999Z'), false);
  assert.equal(withinContest(contest, '2026-10-15T10:00:00Z'), true);
  assert.equal(contestStatus(contest, new Date('2026-12-31T22:59:59.999Z')), 'active');
  assert.equal(contestStatus(contest, new Date('2026-12-31T23:00:00Z')), 'closed');
  assert.equal(contestWindow(contest).endsAt, '2026-12-31T23:00:00.000Z');
  const input = { contestId: contest.id, revision: 1, acceptRules: true, confirmAdult: true, confirmRegion: true };
  assert.throws(() => joinContest(db, db.customers[0], input, 'fictitious-secret', new Date('2026-10-15T09:59:59Z')), /pas ouvert/);
  db.orders.push({ customerId: 'a', total: 60, createdAt: '2026-10-15T09:00:00Z', payment: { status: 'PAID', paidAt: '2026-10-15T09:30:00Z' } });
  assert.equal(customerContest(db, db.customers[0], readAt).participation.purchasePoints, 0);
});
test('Ancien concours sans heure conserve l’ouverture à minuit ; aucun lancement via brouillon', () => {
  const db = fixture(); delete db.referralContest.startTime;
  assert.equal(contestStatus(db.referralContest, new Date('2026-10-14T22:00:00Z')), 'active');
  const draft = { customers: [], orders: [] };
  for (const startTime of ['',' ','24:00','12:60','noon','12:00Z']) assert.throws(() => saveContestDraft(draft, { revision: 0, startTime }), /heure|startTime/);
  saveContestDraft(draft, { revision: 0, startDate: '2026-10-15', startTime: '12:00', endDate: '2026-12-31', rules: 'Test uniquement' });
  assert.deepEqual(publicContest(draft, readAt), { status: 'inactive' });
  publishContest(draft, { revision: 1, confirmation: 'PUBLIER LE CONCOURS' }, new Date('2026-10-14T12:00:00Z'));
  assert.equal(publicContest(draft, new Date('2026-10-15T09:00:00Z')).startTime, '12:00');
});
test('Inscription gratuite : une chance, pas de nécessité de commande ni gain de roue', () => {
  const db = fixture(), original = JSON.stringify(db);
  const report = dashboardContestPeriods(db, 1, readAt);
  assert.deepEqual(report.participants.map(row => [row.customerId, row.chances]), [['a',1],['b',1],['c',1],['d',1]]);
  assert(report.participants.every(row => row.actions.includes('registration')));
  assert.equal(report.exportReady, true);
  assert.deepEqual(report.bonusPrize, { menus: 1, validDays: 30 });
  assert.deepEqual(report.excludedTail, { startDate: '2026-12-29', endDate: '2026-12-31' });
  assert(!JSON.stringify(report).includes('PRIVATE-PHONE'));
  assert.equal(JSON.stringify(db), original);
});
test('Nouvelle activité obligatoire chaque quinzaine ; actions gratuites et achats dédoublonnés', () => {
  const db = fixture();
  db.referralContest.entries[1].shareEvents.push({ date: '2026-10-30', at: '2026-10-30T09:00:00Z' });
  db.referralContest.entries[4].newCustomer = true; db.referralContest.entries[4].sponsorId = 'c';
  db.orders.push(...[20,60,100].map(total => ({ customerId: 'b', total, createdAt: '2026-10-31T12:00:00Z', payment: { status: 'PAID', paidAt: '2026-10-31T12:00:00Z' } })));
  db.wheelSpins.push({ customerId: 'd', awardedAt: '2026-11-01T12:00:00Z', pointsAdded: 60 });
  const report = dashboardContestPeriods(db, 2, readAt);
  assert.deepEqual(report.participants.map(row => row.customerId), ['b','c','e']);
  assert.deepEqual(report.participants[0].actions, ['order','share']);
  assert(report.participants.every(row => row.chances === 1));
  assert(!report.participants.some(row => row.customerId === 'd'), 'Une roue seule ne qualifie pas Android/web au détriment d’iPhone');
  assert.equal(customerContest(db, db.customers[3], readAt).participation.score, 0, 'Aucun ajout des points de roue au classement');
});
test('Annulations, remboursement intégral ou en attente, paiement non confirmé et compte supprimé exclus', () => {
  const db = fixture();
  const base = { customerId: 'a', total: 20, createdAt: '2026-10-31T12:00:00Z', payment: { status: 'PAID', paidAt: '2026-10-31T12:00:00Z' } };
  db.orders = [{ ...base, status: 'cancelled' }, { ...base, refund: { status: 'recorded', amount: 20 } }, { ...base, refund: { status: 'due', amount: 1 } }, { ...base, payment: { ...base.payment, status: 'PENDING' } }, { ...base, total: NaN }, { ...base, payment: { ...base.payment, provider: 'promotion' } }];
  assert(!dashboardContestPeriods(db, 2, readAt).participants.some(row => row.customerId === 'a'));
  db.orders.push({ ...base, refund: { status: 'recorded', amount: 10 } });
  assert(dashboardContestPeriods(db, 2, readAt).participants.some(row => row.customerId === 'a'));
  db.referralContest.entries[0].withdrawnAt = readAt.toISOString();
  assert(!dashboardContestPeriods(db, 2, readAt).participants.some(row => row.customerId === 'a'));
});
test('Bornes exactes, activité avant inscription ou future exclue, brouillon non éligible', () => {
  const db = fixture(), period = periodsFor(db.referralContest)[1];
  const paid = at => ({ customerId: 'a', total: 20, payment: { status: 'PAID', paidAt: at } });
  db.orders = [paid(new Date(Date.parse(period.startsAt) - 1).toISOString()), paid(period.endsAt)];
  assert(!dashboardContestPeriods(db, 2, readAt).participants.some(row => row.customerId === 'a'));
  db.orders.push(paid(period.startsAt));
  assert(dashboardContestPeriods(db, 2, readAt).participants.some(row => row.customerId === 'a'));
  db.orders = [{ ...paid('2026-10-30T12:00:00Z'), customerId: 'e' }];
  assert.deepEqual(dashboardContestPeriods(db, 2, new Date('2026-10-30T20:00:00Z')).participants, []);
  db.referralContest.status = 'draft'; assert.equal(dashboardContestPeriods(db, 1, readAt).total, 0);
});
test('Empreinte stable à liste identique ; changement d’éligibilité invalide la liste', () => {
  const db = fixture(), first = dashboardContestPeriods(db, 1, readAt);
  assert.equal(first.fingerprint, dashboardContestPeriods(db, 1, new Date('2026-11-15T00:00:00Z')).fingerprint);
  db.customers[0].name = 'Autre nom'; assert.equal(first.fingerprint, dashboardContestPeriods(db, 1, readAt).fingerprint);
  db.customers = db.customers.filter(c => c.id !== 'a'); assert.notEqual(first.fingerprint, dashboardContestPeriods(db, 1, readAt).fingerprint);
});
test('Filtres invalides rejetés ; liste vide sans calendrier valide ; liste provisoire non exportable', () => {
  const db = fixture();
  for (const value of ['0','6','-1','01','x','1.5','1&other=2']) assert.throws(() => dashboardContestPeriods(db, value, readAt), /quinzaine/);
  assert.equal(dashboardContestPeriods({}, undefined, readAt).total, 0);
  assert.equal(dashboardContestPeriods(db, 2, new Date('2026-11-01T12:00:00Z')).exportReady, false);
  assert.equal(dashboardContestPeriods(db, undefined, new Date('2026-12-30T12:00:00Z')).period.number, 5);
  assert(!dashboardContestPeriods(db, undefined, new Date('2026-12-30T12:00:00Z')).periods.some(p => p.startDate === '2026-12-29'));
});
test('Égalité : atteinte du score, inscription puis ancienneté du compte ; âge inconnu reste à vérifier', () => {
  const db = fixture(); db.referralContest.entries = db.referralContest.entries.slice(0, 2);
  db.customers[0].createdAt = '2026-10-01T12:00:00Z'; db.customers[1].createdAt = '2026-01-01T12:00:00Z';
  const ranked = contestRanking(db, db.referralContest);
  assert.deepEqual(ranked.map(row => [row.customerId, row.rank, row.tied]), [['b',1,false],['a',2,false]]);
  db.referralContest.entries[0].joinedAt = '2026-10-15T09:59:59Z';
  assert.equal(contestRanking(db, db.referralContest)[0].customerId, 'a', 'L’ancienneté du compte ne passe pas avant l’inscription au concours');
  db.referralContest.entries[0].joinedAt = db.referralContest.entries[1].joinedAt;
  delete db.customers[0].createdAt;
  assert(contestRanking(db, db.referralContest).every(row => row.tied), 'Une ancienneté manquante ne départage pas artificiellement');
  const exposed = JSON.stringify(customerContest(db, db.customers[1], readAt).leaderboard);
  assert(!exposed.includes('accountCreatedAt'));
});
