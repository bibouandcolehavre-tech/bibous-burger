const test = require('node:test'), assert = require('node:assert/strict');
const { defaultContest } = require('./referral-contest');
const { thirtyDayWindow, prepareInstagramPrize } = require('./instagram-prize-preparation');
function fixture() {
  return { customers: [{ id: 'fictional-winner', phone: '+33600000001', verifiedPhone: '+33600000001', phoneVerifiedAt: '2026-10-30T09:00:00Z' }],
    orders: [], referralContest: { ...defaultContest(), status: 'published', revision: 3, startDate: '2026-10-15', startTime: '11:00', endDate: '2026-12-31', entries: [] } };
}
const input = () => ({ periodNumber: 1, customerId: 'fictional-winner', instagramUsername: 'Participant_Fictif', drawnAt: '2026-10-30T10:00:00+01:00', source: 'instagram_comments', verifiedCompleteList: true, verifiedIdentity: true, verifiedAdultAndResidence: true });
const now = new Date('2026-10-30T12:00:00Z');
test('Instagram : préparation privée sans achat ni inscription au classement, sans attribution, code ou message', () => {
  const db = fixture(), before = JSON.stringify(db), p = prepareInstagramPrize(db, input(), now);
  assert.equal(p.menus,1); assert.equal(p.readOnly,true); assert.equal(p.appOnly,true); assert.equal(p.fulfillmentBlocked,true);
  assert.equal(p.code,undefined); assert.equal(p.paidExtrasAllowed,false); assert.equal(p.deliveryFeesPayable,true);
  assert.equal(p.source,'instagram_comments'); assert.equal(p.instagramUsername,'participant_fictif');
  assert.equal(JSON.stringify(db),before); assert.equal(p.expiresAt,'2026-11-29T09:00:00.000Z');
});
test('Instagram : validité glissante de 30 jours, indépendante de la fin du mois et de l’heure d’hiver', () => {
  const w=thirtyDayWindow('2026-10-24T12:00:00+02:00');
  assert.equal(w.startsAt,'2026-10-24T10:00:00.000Z'); assert.equal(w.expiresAt,'2026-11-23T10:00:00.000Z');
  assert.equal(Date.parse(w.expiresAt)-Date.parse(w.startsAt),30*86400000);
  const leap=thirtyDayWindow('2028-02-20T12:00:00+01:00'); assert.equal(leap.expiresAt,'2028-03-21T11:00:00.000Z');
});
test('Instagram : pas de préparation avant la fin de quinzaine, ni pour les trois derniers jours', () => {
  for(const periodNumber of [0,6,'1',1.5]) assert.throws(()=>prepareInstagramPrize(fixture(),{...input(),periodNumber},now));
  assert.throws(()=>prepareInstagramPrize(fixture(),input(),new Date('2026-10-29T21:59:59Z')),/pas terminée/);
  assert.throws(()=>prepareInstagramPrize(fixture(),{...input(),drawnAt:'2026-10-29T22:00:00Z'},now),/après la quinzaine/);
});
test('Instagram : heure du tirage obligatoire, ni futur, ni prolongation des codes après 30 jours', () => {
  for(const drawnAt of ['2026-10-30','2026-10-30T09:00:00','2026-02-30T09:00:00Z','2026-02-29T09:00:00Z','invalid']) assert.throws(()=>thirtyDayWindow(drawnAt));
  assert.throws(()=>prepareInstagramPrize(fixture(),{...input(),drawnAt:'2026-10-31T12:00:00Z'},now),/future/);
  assert.throws(()=>prepareInstagramPrize(fixture(),input(),new Date('2026-11-29T09:00:00Z')),/déjà écoulés/);
  assert.equal(prepareInstagramPrize(fixture(),input(),new Date('2026-11-29T08:59:59.999Z')).validDays,30);
});
test('Instagram : jamais de liste clients Bibou à la place des commentaires ni de validation implicite', () => {
  for(const key of ['verifiedCompleteList','verifiedIdentity','verifiedAdultAndResidence']) assert.throws(()=>prepareInstagramPrize(fixture(),{...input(),[key]:false},now),/Vérifier/);
  assert.throws(()=>prepareInstagramPrize(fixture(),{...input(),source:'bibou_customers'},now),/Vérifier/);
  for(const instagramUsername of ['@test','<script>','https://instagram.com/test','a\nphone','test.']) assert.throws(()=>prepareInstagramPrize(fixture(),{...input(),instagramUsername},now),/Identifiant/);
});
test('Instagram : compte réel vérifié et publication indispensables ; préparation échouée sans mutation', () => {
  for(const change of [db=>db.customers=[],db=>db.customers[0].reviewMode=true,db=>delete db.customers[0].verifiedPhone,db=>db.referralContest.status='draft']) {
    const db=fixture();change(db);const before=JSON.stringify(db);assert.throws(()=>prepareInstagramPrize(db,input(),now));assert.equal(JSON.stringify(db),before);
  }
  assert.throws(()=>prepareInstagramPrize(fixture(),{...input(),confirmation:'ISSUE'},now),/invalide/);
});
