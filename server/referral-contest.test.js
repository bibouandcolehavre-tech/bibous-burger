const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultContest, saveContestDraft, publicContest, customerContest, joinContest, withdrawContest, purgeExpiredContestEntries, dashboardContest, contestStatus } = require('./referral-contest');
const { dashboardNews, publicNews, saveNews } = require('./news');
const now = new Date('2026-10-04T12:00:00Z');
const customer = (id, old = false) => ({ id, phone: '+3360000000'+id, verifiedPhone: '+3360000000'+id, phoneVerifiedAt: now.toISOString(), firstPhoneVerifiedAt: now.toISOString(), createdAt: old ? '2026-01-01T12:00:00Z' : now.toISOString(), referralCode: 'BIBOU-'+id, points: 200 });
const fixture = () => ({ customers: [customer('1',true),customer('2'),customer('3')], orders: [], referralContest: { ...defaultContest(), status:'published', revision:1, startDate:'2026-10-01', endDate:'2026-10-14', leaderPrize:'Lot fictif A', drawPrize:'Lot fictif B', rules:'Règlement fictif réservé aux tests.' } });
const input = code => ({contestId:'bibou-launch',revision:1,acceptRules:true,confirmAdult:true,confirmRegion:true,sponsorCode:code});
test('Brouillon privé, validation des dates et aucune activation par PATCH', () => {
  const db={customers:[],orders:[]};
  assert.deepEqual(publicContest(db,now),{status:'inactive'});
  assert.equal(dashboardContest(db,now).launchLocked,true);
  assert.throws(()=>saveContestDraft(db,{revision:0,status:'published'}),/activation/);
  for(const date of ['2026-99-99','2026-02-30','not-a-date']) assert.throws(()=>saveContestDraft(db,{revision:0,startDate:date}),/date/i);
  saveContestDraft(db,{revision:0,title:'Nouveau titre'},now);
  assert.throws(()=>saveContestDraft(db,{revision:0,title:'Écraser'}),/changé/);
  assert.deepEqual(publicContest(db,now),{status:'inactive'});
});
test('Fenêtre du concours calculée selon le jour de Paris, fermeture inclusive',()=>{
  const c=fixture().referralContest;
  assert.equal(contestStatus(c,new Date('2026-09-30T21:59:59Z')),'scheduled');
  assert.equal(contestStatus(c,new Date('2026-09-30T22:00:00Z')),'active');
  assert.equal(contestStatus(c,new Date('2026-10-14T21:59:59Z')),'active');
  assert.equal(contestStatus(c,new Date('2026-10-14T22:00:00Z')),'closed');
});
test('Participation vérifiée, idempotente et sans modification des points fidélité',()=>{
  const db=fixture(); const first=joinContest(db,db.customers[0],input(),'secret',now);
  assert.equal(first.participation.referrals,0);
  assert.equal(joinContest(db,db.customers[0],input(),'secret',now).changed,false);
  joinContest(db,db.customers[1],input('BIBOU-1'),'secret',now);
  assert.equal(customerContest(db,db.customers[0],now).participation.referrals,1);
  assert.equal(db.customers[0].points,200);
  assert.equal(db.customers[1].referredByCustomerId,undefined);
  const exposed=JSON.stringify(customerContest(db,db.customers[0],now));
  assert.equal(exposed.includes(db.customers[1].phone),false);
  assert.equal(exposed.includes('phoneHash'),false);
  assert.equal(dashboardContest(db,now).statistics.newReferrals,1);
});
test('Refus des validations manquantes, auto-parrainage, code inconnu et téléphone non vérifié',()=>{
  const db=fixture();
  assert.throws(()=>joinContest(db,db.customers[0],{...input(),acceptRules:false},'secret',now),/Confirme/);
  assert.throws(()=>joinContest(db,db.customers[0],input('UNKNOWN'),'secret',now),/code/);
  assert.throws(()=>joinContest(db,db.customers[0],input('BIBOU-1'),'secret',now));
  db.customers[0].verifiedPhone='';
  assert.throws(()=>joinContest(db,db.customers[0],input(),'secret',now),/SMS/);
  db.referralContest.status='draft';
  assert.throws(()=>joinContest(db,db.customers[1],input(),'secret',now),/pas ouvert/);
});
test('Les anciens comptes participent mais ne génèrent pas de nouvelle inscription parrainée',()=>{
  const db=fixture();joinContest(db,db.customers[1],input(),'secret',now);
  joinContest(db,db.customers[0],input('BIBOU-2'),'secret',now);
  assert.equal(customerContest(db,db.customers[1],now).participation.referrals,0);
  assert.equal(dashboardContest(db,now).ranking[0].tied,true);
});
test('Suppression/recréation : retrait du classement et blocage du même numéro, purge après conservation',()=>{
  const db=fixture();joinContest(db,db.customers[0],input(),'secret',now);
  joinContest(db,db.customers[1],input('BIBOU-1'),'secret',now);
  withdrawContest(db,db.customers[1],now);
  assert.equal(customerContest(db,db.customers[0],now).participation.referrals,0);
  const duplicate={...db.customers[1],id:'recreated'};db.customers.push(duplicate);
  assert.throws(()=>joinContest(db,duplicate,input(),'secret',now),/déjà participé/);
  assert.equal(purgeExpiredContestEntries(db,new Date('2027-01-20T00:00:00Z')),true);
  assert.deepEqual(db.referralContest.entries,[]);
});
test('Actualités : aucun burger, vidéo Epicu et concours, visibilité et ordre enregistrés',()=>{
  const db={};const n=dashboardNews(db);
  assert.equal(n.items[2].kind,'contest');assert.equal(n.items.length,4);assert.equal(n.items.some(item=>item.kind==='product'),false);assert.match(n.items[0].url,/DX1QN8DIdet/);
  saveNews(db,{revision:0,items:n.items.map((x,i)=>({...x,enabled:i!==0})).reverse()},now);
  assert.equal(publicNews(db).items[0].kind,'article');assert.equal(publicNews(db).items.length,3);
  assert.throws(()=>saveNews(db,{revision:0,items:[]}),/changé/);
});
test('Actualités : pas de javascript, lien avec identifiants, doublon ni produit inconnu',()=>{
  const card={id:'test',kind:'article',enabled:true,title:'Test',subtitle:''};
  for(const url of ['javascript:alert(1)','http://example.com','https://user:secret@example.com/','https://127.0.0.1/x']) assert.throws(()=>saveNews({}, {revision:0,items:[{...card,url}]}),/HTTPS/);
  assert.throws(()=>saveNews({}, {revision:0,items:[{...card,url:'https://example.com'},{...card,url:'https://example.com'}]}),/répété/);
  assert.throws(()=>saveNews({}, {revision:0,items:[{...card,kind:'product',productId:'unknown'}]}),/Type/);
});
