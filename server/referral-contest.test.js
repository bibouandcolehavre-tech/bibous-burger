const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultContest, saveContestDraft, publishContest, publicContest, customerContest, joinContest, recordShareAction, withdrawContest, purgeExpiredContestEntries, dashboardContest, contestStatus } = require('./referral-contest');
const { dashboardNews, publicNews, saveNews } = require('./news');
const now = new Date('2026-10-04T12:00:00Z');
const customer = (id, old = false) => ({ id, phone: '+3360000000'+id, verifiedPhone: '+3360000000'+id, phoneVerifiedAt: now.toISOString(), firstPhoneVerifiedAt: now.toISOString(), createdAt: old ? '2026-01-01T12:00:00Z' : now.toISOString(), referralCode: 'BIBOU-'+id, points: 200 });
const fixture = () => ({ customers: [customer('1',true),customer('2'),customer('3')], orders: [], referralContest: { ...defaultContest(), status:'published', revision:1, startDate:'2026-10-01', endDate:'2026-10-14', firstPrize:'Lot fictif A', secondPrize:'Lot fictif B', thirdPrize:'Lot fictif C', rules:'Règlement fictif réservé aux tests.' } });
const input = code => ({contestId:'bibou-launch',revision:1,acceptRules:true,confirmAdult:true,confirmRegion:true,sponsorCode:code});
test('Brouillon privé, validation des dates et aucune activation par PATCH', () => {
  const db={customers:[],orders:[]};
  assert.equal(defaultContest().startDate,'2026-10-05');
  assert.equal(defaultContest().endDate,'2026-10-31');
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
test('Publication explicite uniquement après règlement finalisé, puis ouverture et fermeture aux dates approuvées',()=>{
  const db={customers:[],orders:[]};
  const confirmation={revision:0,confirmation:'PUBLIER LE CONCOURS'};
  assert.throws(()=>publishContest(db,confirmation,new Date('2026-10-03T12:00:00Z')),/règlement/);
  assert.throws(()=>publishContest(db,{...confirmation,confirmation:'oui'},new Date('2026-10-03T12:00:00Z')),/Confirmation/);
  saveContestDraft(db,{revision:0,rules:'Règlement fictif réservé aux tests.'},new Date('2026-10-03T12:00:00Z'));
  assert.equal(publishContest(db,{revision:1,confirmation:'PUBLIER LE CONCOURS'},new Date('2026-10-03T12:00:00Z')).status,'published');
  assert.equal(dashboardContest(db,new Date('2026-10-03T12:00:00Z')).launchLocked,false);
  assert.equal(publicContest(db,new Date('2026-10-04T21:59:59Z')).status,'scheduled');
  assert.equal(publicContest(db,new Date('2026-10-04T22:00:00Z')).status,'active');
  assert.equal(publicContest(db,new Date('2026-10-31T22:59:59Z')).status,'active');
  assert.equal(publicContest(db,new Date('2026-10-31T23:00:00Z')).status,'closed');
  assert.throws(()=>saveContestDraft(db,{revision:2,title:'Nouvelle version'}),/publié/);
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
test('Classement provisoire : achat payé et filleul vérifié, sans tirage ni achat obligatoire',()=>{
  const db=fixture();
  joinContest(db,db.customers[0],input(),'secret',now);
  joinContest(db,db.customers[1],input('BIBOU-1'),'secret',now);
  joinContest(db,db.customers[2],input(),'secret',now);
  db.orders=[
    {customerId:'2',total:25.90,status:'confirmed',createdAt:now.toISOString(),payment:{status:'PAID',paidAt:now.toISOString()}},
    {customerId:'1',total:99,status:'cancelled',createdAt:now.toISOString(),payment:{status:'PAID',paidAt:now.toISOString()}},
    {customerId:'3',total:100,status:'confirmed',createdAt:now.toISOString(),payment:{status:'PENDING'}},
  ];
  const ranking=dashboardContest(db,now).ranking;
  assert.deepEqual(ranking.map(row=>[row.customerId,row.score]),[['2',25],['1',20],['3',0]]);
  assert.equal(dashboardContest(db,now).statistics.paidOrders,1);
  assert.equal(dashboardContest(db,now).statistics.paidRevenue,25.9);
  assert.equal(customerContest(db,db.customers[0],now).participation.rank,2);
  assert.equal(customerContest(db,db.customers[2],now).participation.score,0);
  const exposed=JSON.stringify(customerContest(db,db.customers[0],now).leaderboard);
  assert.equal(exposed.includes('customerId'),false);
  assert.equal(exposed.includes('phone'),false);
  assert.equal(exposed.includes('drawPrize'),false);
});
test('Partager : un seul point par jour de Paris, sans preuve de publication ni achat',()=>{
  const db=fixture();
  const at=new Date('2026-10-04T21:50:00Z');
  joinContest(db,db.customers[0],input(),'secret',at);
  const request={contestId:'bibou-launch',revision:1};
  assert.equal(recordShareAction(db,db.customers[0],request,at).changed,true);
  assert.equal(recordShareAction(db,db.customers[0],request,new Date('2026-10-04T21:59:00Z')).changed,false);
  assert.equal(customerContest(db,db.customers[0],at).participation.score,1);
  assert.equal(recordShareAction(db,db.customers[0],request,new Date('2026-10-04T22:01:00Z')).changed,true);
  const next=customerContest(db,db.customers[0],new Date('2026-10-04T22:01:00Z')).participation;
  assert.equal(next.sharePoints,2);
  assert.equal(next.score,2);
  assert.equal(next.sharedToday,true);
  assert.equal(db.customers[0].points,200,'les points fidélité ne changent pas');
  assert.equal(db.referralContest.entries[0].shareEvents.length,2);
  assert.throws(()=>recordShareAction(db,db.customers[1],request,at),/Inscris-toi/);
  assert.throws(()=>recordShareAction(db,db.customers[0],{...request,revision:0},at),/Actualise/);
  assert.throws(()=>recordShareAction(db,db.customers[0],request,new Date('2026-10-14T22:00:00Z')),/pas ouvert/);
});
test('À points égaux, la première personne à atteindre son score est classée devant',()=>{
  const db=fixture();
  joinContest(db,db.customers[0],input(),'secret',now);
  joinContest(db,db.customers[1],input(),'secret',now);
  db.orders=[
    {customerId:'1',total:10,status:'confirmed',createdAt:'2026-10-04T13:00:00Z',payment:{status:'PAID',paidAt:'2026-10-04T13:00:00Z'}},
    {customerId:'2',total:10,status:'confirmed',createdAt:'2026-10-04T12:30:00Z',payment:{status:'PAID',paidAt:'2026-10-04T12:30:00Z'}},
  ];
  assert.deepEqual(dashboardContest(db,now).ranking.map(row=>[row.customerId,row.score,row.rank,row.tied]),[['2',10,1,false],['1',10,2,false]]);
});
test('Les commandes remboursées ou hors période ne gonflent pas le classement',()=>{
  const db=fixture();joinContest(db,db.customers[0],input(),'secret',now);
  db.orders=[
    {customerId:'1',total:60,paidTotal:100,refund:{amount:40,status:'recorded'},status:'confirmed',createdAt:now.toISOString(),payment:{status:'PAID',paidAt:now.toISOString()}},
    {customerId:'1',total:19.90,status:'confirmed',createdAt:'2026-09-29T12:00:00Z',payment:{status:'PAID',paidAt:'2026-09-29T12:00:00Z'}},
    {customerId:'1',total:30,status:'confirmed',createdAt:now.toISOString(),payment:{status:'PENDING'}},
  ];
  assert.equal(customerContest(db,db.customers[0],now).participation.purchasePoints,60);
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
  assert.deepEqual(n.items.map(item=>item.id),['contest','epicu','paris-normandie','social']);assert.equal(n.items.length,4);assert.equal(n.items.some(item=>item.kind==='product'),false);assert.match(n.items[1].url,/DX1QN8DIdet/);
  assert.equal(n.items[2].kind,'video');assert.match(n.items[2].url,/presse\.havraise\/videos\/bibous-burger\/1226219005580139/);assert.match(n.items[2].subtitle,/13 juin 2025/);assert.equal(JSON.stringify(n.items).includes('Étoiles gourmandes'),false);
  saveNews(db,{revision:0,items:n.items.map((x,i)=>({...x,enabled:i!==0})).reverse()},now);
  assert.equal(publicNews(db).items[0].kind,'social');assert.equal(publicNews(db).items.length,3);
  assert.throws(()=>saveNews(db,{revision:0,items:[]}),/changé/);
});
test('La carte du concours annonce sa vraie phase après publication, sans exposer le brouillon',()=>{
  const db=fixture();
  assert.match(publicNews(db,new Date('2026-09-30T12:00:00Z')).items[0].subtitle,/Ouverture le 1 octobre/);
  assert.match(publicNews(db,new Date('2026-10-04T12:00:00Z')).items[0].title,/ouvert/);
  assert.match(publicNews(db,new Date('2026-10-15T12:00:00Z')).items[0].title,/terminé/);
  assert.match(publicNews({}).items[0].title,/se prépare/);
});
test('Actualités : pas de javascript, lien avec identifiants, doublon ni produit inconnu',()=>{
  const card={id:'test',kind:'article',enabled:true,title:'Test',subtitle:''};
  for(const url of ['javascript:alert(1)','http://example.com','https://user:secret@example.com/','https://127.0.0.1/x']) assert.throws(()=>saveNews({}, {revision:0,items:[{...card,url}]}),/HTTPS/);
  assert.throws(()=>saveNews({}, {revision:0,items:[{...card,url:'https://example.com'},{...card,url:'https://example.com'}]}),/répété/);
  assert.throws(()=>saveNews({}, {revision:0,items:[{...card,kind:'product',productId:'unknown'}]}),/Type/);
});
