const test = require('node:test');
const assert = require('node:assert/strict');
const { contestWheelEvents, wheelRulesConflict, wheelBonusDeclared } = require('./contest-wheel-points');
const { defaultContest, customerContest, dashboardContest, saveContestDraft, publishContest, withdrawContest } = require('./referral-contest');
const { spinWheel, customerWheelState } = require('./wheel');
const { finalizationPreview, finalize } = require('./contest-prizes');
const now = new Date('2026-10-15T10:00:00Z');
function fixture() {
  return { customers: [{ id: 'c1', points: 100, createdAt: '2026-01-01T12:00:00Z', referralCode: 'BIBOU-FIXTURE' }],
    orders: [{ id: 'order-1', customerId: 'c1', subtotal: 45, discount: 0, total: 45, paidTotal: 45, wheelEurosPerTurn: 15, status: 'confirmed', payment: { provider: 'sumup', status: 'PAID', paidAt: '2026-10-15T09:00:00Z' } }],
    wheelSpins: [{ id: 'wheel-1', requestId: 'fictitious-spin-1', customerId: 'c1', orderId: 'order-1', prizeId: 'points-20', pointsAdded: 20, awardedAt: '2026-10-15T09:15:00Z' }],
    referralContest: { ...defaultContest(), status: 'published', revision: 1, wheelPointsInRanking: true, startDate: '2026-10-15', startTime: '11:00', endDate: '2026-12-31', rules: 'Règlement fictif pour les tests.', entries: [{ customerId: 'c1', alias: 'Participant FICTIF', joinedAt: '2026-10-15T09:00:00Z', shareEvents: [] }] } };
}
const bonus = db => customerContest(db, db.customers[0], now).participation.wheelPoints;

test('Bonus roue : même total et rang pour les trois clients, lectures sans nouveau crédit de fidélité', () => {
  const db = fixture(), original = JSON.stringify(db);
  for (const platform of ['ios','android','web']) {
    const state = customerContest(db, db.customers[0], now);
    assert.equal(state.participation.purchasePoints, 45, platform);
    assert.equal(state.participation.wheelPoints, 20, platform);
    assert.equal(state.participation.score, 65, platform);
    assert.equal(state.participation.rank, 1, platform);
    assert.equal(state.contest.scoring.pointsPerAwardedWheelPoint, 1);
    assert.match(state.contest.rules, /1 point réellement gagné à la roue/);
  }
  assert.equal(dashboardContest(db, now).ranking[0].wheelPoints, 20);
  assert.equal(JSON.stringify(db), original);
});
test('Un gain réel crédite déjà la fidélité ; le bonus classement ne la crédite pas une seconde fois', () => {
  const db = fixture(); db.wheelSpins = []; db.orders[0].subtotal = db.orders[0].total = db.orders[0].paidTotal = 15;
  const spin = spinWheel(db, 'c1', { now, orderId: 'order-1', requestId: 'real-fixture-spin-01', randomInt: () => 75 });
  assert.equal(spin.spin.pointsAdded, 40); assert.equal(db.customers[0].points, 140);
  const state = customerContest(db, db.customers[0], now);
  assert.equal(state.participation.score, 55); assert.equal(state.participation.wheelPoints, 40);
  assert.equal(spinWheel(db, 'c1', { now, orderId: 'order-1', requestId: 'real-fixture-spin-01' }).replayed, true);
  assert.equal(customerContest(db, db.customers[0], now).participation.score, 55);
  assert.equal(db.customers[0].points, 140); assert.equal(db.wheelSpins.length, 1);
});
test('Éditions historiques : aucun changement de score sans le choix explicite bonus roue', () => {
  for (const value of [undefined, false, 'true', 1]) {
    const db = fixture(); db.referralContest.wheelPointsInRanking = value;
    const state = customerContest(db, db.customers[0], now);
    assert.equal(state.participation.score, 45);
    assert.equal(state.participation.wheelPoints, undefined);
    assert.equal(state.contest.scoring.pointsPerAwardedWheelPoint, undefined);
  }
});
test('Règles de roue : lien au classement uniquement après publication du choix explicite, sans changer la fidélité ni les chances', () => {
  const db = fixture(), before = JSON.stringify(db), state = customerWheelState(db, 'c1', now);
  assert.match(state.rules, /chaque point réellement gagné à la roue pendant sa période ajoute aussi un point au classement/);
  assert.doesNotMatch(state.rules, /classement est distinct et reste fermé/);
  const disabled = structuredClone(db); disabled.referralContest.wheelPointsInRanking = false;
  const legacy = customerWheelState(disabled, 'c1', now);
  assert.match(legacy.rules, /classement est distinct et reste fermé/);
  assert.deepEqual(state.baseSegments, legacy.baseSegments); assert.deepEqual(state.orderTurns, legacy.orderTurns);
  disabled.referralContest.wheelPointsInRanking = true; disabled.referralContest.status = 'draft';
  assert.equal(customerWheelState(disabled, 'c1', now).rules, legacy.rules);
  disabled.referralContest.status = 'published'; disabled.wheel = { status: 'draft' };
  assert.equal(customerWheelState(disabled, 'c1', now).rules, null);
  assert.equal(JSON.stringify(db), before);
});
test('Tours dupliqués : identifiant et requête ne comptent jamais deux fois', () => {
  const db = fixture(); db.wheelSpins.push({ ...db.wheelSpins[0] }, { ...db.wheelSpins[0], id: 'duplicate-request-id' });
  assert.equal(bonus(db), 20); assert.equal(contestWheelEvents(db, db.referralContest, now).length, 1);
});
test('Bornes 11 h Paris et 31 décembre : anciens gains, gains futurs et après clôture exclus', () => {
  for (const [at, expected] of [['2026-10-15T08:59:59.999Z',0],['2026-10-15T09:00:00.000Z',20],['2026-10-15T10:00:00.001Z',0],['invalid',0]]) {
    const db = fixture(); db.wheelSpins[0].awardedAt = at;
    assert.equal(bonus(db), expected, at);
  }
  const db = fixture(); db.wheelSpins[0].awardedAt = '2026-12-31T22:59:59.999Z';
  assert.equal(customerContest(db, db.customers[0], new Date('2027-01-01T12:00:00Z')).participation.wheelPoints, 20);
  db.wheelSpins[0].awardedAt = '2026-12-31T23:00:00Z';
  assert.equal(customerContest(db, db.customers[0], new Date('2027-01-01T12:00:00Z')).participation.wheelPoints, 0);
});
test('Gains sans source valable, faux montants, cadeaux et tours fictifs exclus', () => {
  const cases = [
    db => { db.wheelSpins[0].revokedAt = now.toISOString(); },
    db => { db.wheelSpins[0].pointsAdded = 20000; },
    db => { db.wheelSpins[0].prizeId = 'fries'; },
    db => { db.wheelSpins[0].orderId = 'unknown'; },
    db => { db.orders[0].customerId = 'someone-else'; },
    db => { db.orders[0].status = 'cancelled'; },
    db => { db.orders[0].payment.status = 'PENDING'; },
    db => { db.orders[0].payment.provider = 'cash'; },
    db => { db.orders[0].payment.provider = 'promotion'; db.orders[0].promotion = { code: 'CHORUS' }; },
    db => { db.orders[0].reviewMode = true; },
    db => { db.wheelSpins[0].reviewMode = true; },
    db => { db.orders[0].payment.paidAt = '2026-10-15T09:30:00Z'; },
    db => { db.wheelSpins[0].referralCustomerId = 'also-a-referral'; },
  ];
  for (const change of cases) { const db = fixture(); change(db); const before = JSON.stringify(db); assert.equal(bonus(db), 0); assert.equal(JSON.stringify(db), before); }
});
test('Remboursement partiel : chaque résultat consomme son tour ; seuls les tours encore justifiés donnent le bonus', () => {
  const db = fixture(); db.wheelSpins[0].prizeId = 'none'; delete db.wheelSpins[0].pointsAdded;
  db.wheelSpins.push({ ...db.wheelSpins[0], id:'spin-2',requestId:'request-2',prizeId:'points-20',pointsAdded:20 },{ ...db.wheelSpins[0],id:'spin-3',requestId:'request-3',prizeId:'points-40',pointsAdded:40 });
  assert.equal(bonus(db), 60);
  db.orders[0].refund = { status:'recorded', amount:15 }; assert.equal(bonus(db),20);
  db.orders[0].refund.amount = 30; assert.equal(bonus(db),0);
  db.orders[0].refund.amount = 45; assert.equal(bonus(db),0);
  db.orders[0].refund.status = 'due'; assert.equal(bonus(db),0);
});
test('Un tour issu du parrainage validé peut donner des points sans achat, puis est retiré si le parrainage est révoqué', () => {
  const db = fixture(); db.orders = []; db.customers.push({ id:'friend',referredByCustomerId:'c1',referralRewardGrantedAt:'2026-10-15T09:10:00Z' });
  delete db.wheelSpins[0].orderId; db.wheelSpins[0].referralCustomerId = 'friend';
  assert.equal(bonus(db),20);
  db.wheelSpins.push({ ...db.wheelSpins[0], id:'second-referral-spin',requestId:'second-referral-request' }); assert.equal(bonus(db),20);
  db.customers[1].referralRewardRevokedAt = now.toISOString(); assert.equal(bonus(db),0);
});
test('Suppression ou retrait : aucune présence au classement ; jamais de transfert du solde fidélité', () => {
  const db = fixture(); db.customers[0].points = 999999;
  assert.equal(bonus(db),20); withdrawContest(db, db.customers[0], now);
  assert.equal(customerContest(db, db.customers[0], now).participation,null);
  assert.equal(dashboardContest(db, now).ranking.length,0);
  assert.equal(db.customers[0].points,999999);
});
test('Bonus roue protégé par brouillon, choix booléen, règlement cohérent et confirmation explicite', () => {
  const db = { customers:[],orders:[] }, input = { revision:0,startDate:'2026-10-15',startTime:'11:00',endDate:'2026-12-31',rules:'Règlement fictif.',wheelPointsInRanking:true };
  assert.throws(()=>saveContestDraft(db,{...input,wheelPointsInRanking:'true'},now),/oui ou non/);
  saveContestDraft(db,input,now); assert.equal(publicState(db).status,'inactive');
  publishContest(db,{revision:1,confirmation:'PUBLIER LE CONCOURS'},now);
  assert.equal(db.referralContest.wheelPointsInRanking,true);
  assert.throws(()=>saveContestDraft(db,{revision:2,wheelPointsInRanking:false},now),/publié/);
  function publicState(value){return require('./referral-contest').publicContest(value,now);}
  const invalid={customers:[],orders:[]}; saveContestDraft(invalid,{...input,rules:'Les points gagnés à la roue ne sont pas ajoutés au classement.'},now);
  assert.throws(()=>publishContest(invalid,{revision:1,confirmation:'PUBLIER LE CONCOURS'},now),/bonus de points de roue/);
  assert(wheelRulesConflict(invalid.referralContest.rules));
  assert(wheelBonusDeclared('Les points gagnés à la roue rapportent aussi des points au classement.'));
  const unchecked={customers:[],orders:[]}; saveContestDraft(unchecked,{...input,wheelPointsInRanking:false,rules:'Les points gagnés à la roue rapportent aussi des points au classement.'},now);
  assert.throws(()=>publishContest(unchecked,{revision:1,confirmation:'PUBLIER LE CONCOURS'},now),/cocher le bonus roue/);
});
test('Départage et résultats finaux tiennent compte de la date du gain de roue', () => {
  const db = fixture(); db.orders[0].total=db.orders[0].subtotal=db.orders[0].paidTotal=15;
  db.customers.push({...db.customers[0],id:'c2',createdAt:'2026-02-01T12:00:00Z'});
  db.orders.push({...db.orders[0],id:'order-2',customerId:'c2'});
  db.referralContest.entries.push({...db.referralContest.entries[0],customerId:'c2',alias:'Second fictif'});
  db.wheelSpins.push({...db.wheelSpins[0],id:'second-spin',requestId:'second-request',customerId:'c2',orderId:'order-2',awardedAt:'2026-10-15T09:10:00Z'});
  const ranking=dashboardContest(db,now).ranking; assert.equal(ranking[0].customerId,'c2'); assert.equal(ranking[0].score,35);
  assert.equal(finalizationPreview(db,new Date('2027-01-01T12:00:00Z')).winners[0].customerId,'c2');
});
test('Une révocation de gain de roue invalide la confirmation préparée des lots', () => {
  const db = fixture(), finalAt = new Date('2027-01-01T12:00:00Z'), preview = finalizationPreview(db, finalAt);
  const input = { confirmation: 'VALIDER LES LOTS DU CONCOURS', requestId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    rankingFingerprint: preview.rankingFingerprint, startMonth: '2027-02', eligibleMenuIds: ['classique-menu'] };
  db.wheelSpins[0].revokedAt = finalAt.toISOString();
  assert.notEqual(finalizationPreview(db, finalAt).rankingFingerprint, preview.rankingFingerprint);
  assert.throws(() => finalize(db, input, finalAt), /classement a changé/);
  assert.equal(db.contestPrizes, undefined); assert.equal(db.customers[0].points, 100);
});
