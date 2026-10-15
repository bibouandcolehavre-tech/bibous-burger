const test = require('node:test'), assert = require('node:assert/strict');
const { clarifyContestRules, RULES_CLARIFICATION_VERSION } = require('./contest-rules-clarifications');
const { CONTEST_PRIZE_RULES } = require('../contest-prize-policy');
const { defaultContest, publicContest, customerContest, dashboardContest } = require('./referral-contest');
const { assertCart } = require('./contest-prizes');
const preset = require('../restaurant-dashboard/contest-launch-20261015.json');
function fixture() {
  return { customers: [{ id: 'fixture-customer', createdAt: '2026-01-01T12:00:00Z' }],
    orders: [{ id: 'fixture-order', customerId: 'fixture-customer', subtotal: 45, total: 45, paidTotal: 45, wheelEurosPerTurn: 15, status: 'confirmed', payment: { provider: 'sumup', status: 'PAID', paidAt: '2026-10-16T10:00:00Z' } }],
    wheelSpins: [{ id: 'fixture-spin', requestId: 'fixture-request', customerId: 'fixture-customer', orderId: 'fixture-order', prizeId: 'points-20', pointsAdded: 20, awardedAt: '2026-10-16T11:00:00Z' }],
    referralContest: { ...defaultContest(), ...preset, status: 'published', revision: 3, entries: [{ customerId: 'fixture-customer', alias: 'Participant fictif', joinedAt: '2026-10-17T10:00:00Z', shareEvents: [] }] } };
}
test('Règles : préciser les lots mensuels ne réduit jamais les 30 jours du menu Instagram', () => {
  const db=fixture(), original=JSON.stringify(db), out=publicContest(db,new Date('2026-10-17T12:00:00Z'));
  assert.match(out.rules,/Conditions d’utilisation des lots du classement uniquement/);
  assert.match(CONTEST_PRIZE_RULES,/uniquement les trois lots du classement, pas les menus bonus Instagram qui restent valables 30 jours/);
  assert.match(out.rules,/valable 30 jours à partir de la date du tirage/);
  assert.equal(out.rulesClarificationVersion,RULES_CLARIFICATION_VERSION);
  assert.equal(JSON.stringify(db),original);
});
test('Règles : les formulations historiques sont clarifiées sans modifier le règlement enregistré ni sa révision', () => {
  const db=fixture();
  db.referralContest.rules='Les suppléments et les frais de livraison éventuels restent à payer ; la livraison demeure soumise aux zones et créneaux du restaurant.\nLes suppléments et frais de livraison éventuels restent à payer.\nSeuls les points gagnés entre le 15 octobre à 11 h et la clôture du 31 décembre sont retenus, une fois le client inscrit au concours ; les gains antérieurs et futurs sont exclus.\nLes commandes réellement payées pendant la période du concours rapportent 1 point par euro effectivement payé et conservé.';
  const original=JSON.stringify(db), now=new Date('2026-10-17T12:00:00Z'), result=publicContest(db,now);
  assert.match(result.rules,/menus offerts sont sans suppléments payants/);
  assert.match(result.rules,/menu offert est sans suppléments payants/);
  assert.match(result.rules,/avant son inscription mais après l’ouverture/);
  assert.match(result.rules,/même si elles précèdent l’inscription/);
  assert.doesNotMatch(result.rules,/Les suppléments et/);
  assert.equal(dashboardContest(db,now).draft.rules,clarifyContestRules(db.referralContest.rules));
  assert.equal(result.revision,3);assert.equal(JSON.stringify(db),original);
  assert.equal(clarifyContestRules(result.rules),result.rules);
});
test('Règles : source déjà clarifiée idempotente, textes inconnus préservés et aucun double paragraphe', () => {
  assert.equal(clarifyContestRules(preset.rules),preset.rules);
  assert.equal(clarifyContestRules('Texte indépendant à préserver.'),'Texte indépendant à préserver.');
  assert.equal(clarifyContestRules(null),'');
  const repeated=clarifyContestRules(clarifyContestRules(preset.rules));
  assert.equal((repeated.match(/même si elles précèdent l’inscription/g)||[]).length,1);
});
test('Calcul inchangé : inscription après un achat et un gain valides de la période récupère ces points, pas les anciens', () => {
  const db=fixture(), now=new Date('2026-10-17T12:00:00Z'), before=JSON.stringify(db);
  for(const platform of ['ios','android','web']) {
    const state=customerContest(db,db.customers[0],now);
    assert.equal(state.participation.purchasePoints,45,platform);
    assert.equal(state.participation.wheelPoints,20,platform);
    assert.equal(state.participation.score,65,platform);
  }
  assert.equal(JSON.stringify(db),before);
  db.orders[0].payment.paidAt='2026-10-15T08:59:59.999Z';
  db.wheelSpins[0].awardedAt='2026-10-15T08:59:59.999Z';
  assert.equal(customerContest(db,db.customers[0],now).participation.score,0);
});
test('Choix propriétaire sans recompilation : les suppléments restent refusés, les menus simples restent acceptés', () => {
  const promo={eligibleMenuIds:['classique-menu'],menuAllowance:1};
  assert.equal(assertCart(promo,[{productId:'classique-menu',quantity:1,options:[]}]),1);
  assert.throws(()=>assertCart(promo,[{productId:'classique-menu',quantity:1,options:[{price:1}]}]),/Retire les suppléments/);
  assert.match(preset.rules,/menu offert est sans suppléments payants/);
  assert.doesNotMatch(preset.rules,/Les suppléments et (?:les )?frais de livraison éventuels restent à payer/);
});
