const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const birthday=require('./dashboard-birthdays'),crm=require('./crm'),push=require('./push-notifications');
const NOW=Date.parse('2026-10-18T10:00:00Z'),OFF={enabled:false,platforms:[]},ON={enabled:true,platforms:['ios','android']};
const customer=(id,b='10-18')=>({id,name:'Client fictif '+id,createdAt:'2025-01-01T12:00:00Z',phone:'PRIVATE-PHONE',address:'PRIVATE-ADDRESS',crmPreferences:{birthday:b,personalizedOffers:true},pushPreferences:{marketing:true}});
const database=()=>({customers:[customer('a'),customer('b','10-19'),customer('c','01-01')],orders:[]});
const input=()=>({customerId:'a',birthdayDate:'2026-10-18',title:'Bon anniversaire',discountPercent:15,minSubtotal:10,validityDays:7,confirm:true});
function register(db,id){const device={installationId:crypto.randomUUID(),secret:crypto.randomUUID(),token:'ExpoPushToken['+crypto.randomBytes(16).toString('hex')+']',platform:'ios'};push.registerDevice(db,db.customers.find(c=>c.id===id),device,NOW);return device;}
test('anniversaires : dates Paris, aujourd’hui/demain, lecture sans mutation et aucune coordonnée privée',()=>{
  const db=database(),before=JSON.stringify(db),state=birthday.birthdayDashboard(db,NOW);
  assert.deepEqual(state.todayCustomers.map(c=>c.id),['a']);assert.deepEqual(state.tomorrowCustomers.map(c=>c.id),['b']);assert.equal(state.offerDefaults.discountPercent,null);
  assert.equal(JSON.stringify(db),before);assert.doesNotMatch(JSON.stringify(state),/PRIVATE-/);
  const midnight=birthday.birthdayDashboard(db,Date.parse('2026-10-17T22:30:00Z'));assert.equal(midnight.today,'2026-10-18');
  const edge=database();edge.customers[0].crmPreferences.birthday='12-31';edge.customers[1].crmPreferences.birthday='01-01';assert.equal(birthday.birthdayDashboard(edge,Date.parse('2026-12-31T11:00:00Z')).tomorrowCustomers.length,2);
});
test('anniversaires : consentement, inscription récente et avantage utilisé restent protégés',()=>{
  for(const kind of ['consent','registration','recorded','used']){
    const db=database(),c=db.customers[0];if(kind==='consent')c.crmPreferences.personalizedOffers=false;if(kind==='registration')c.createdAt=new Date(NOW).toISOString();if(kind==='recorded')c.crmPreferences.birthdayRecordedAt=new Date(NOW).toISOString();if(kind==='used')c.birthdayBenefitUsedYears=['2026'];
    assert.equal(birthday.birthdayDashboard(db,NOW).todayCustomers[0].canOffer,false);assert.throws(()=>birthday.createBirthdayOffer(db,input(),NOW));assert.equal(db.crm,undefined);
  }
});
test('réduction manuelle : confirmation, destinataire, date et paramètres vérifiés, aucune activation ou notification',()=>{
  const db=database();for(const change of [{confirm:false},{birthdayDate:'2026-10-17'},{customerId:'b'},{discountPercent:51},{discountPercent:0},{minSubtotal:-1},{validityDays:91},{title:''},{extra:true}])assert.throws(()=>birthday.createBirthdayOffer(db,{...input(),...change},NOW));
  const result=birthday.createBirthdayOffer(db,input(),NOW);assert.equal(result.created,true);assert.equal(result.offer.discountPercent,15);assert.equal(db.crm.settings.enabled,false);assert.equal(db.pushNotifications,undefined);assert.equal(crm.customerState(db,db.customers[0],NOW).offers[0].status,'available');assert.equal(crm.customerState(db,db.customers[1],NOW).offers.length,0);
  assert.equal(birthday.createBirthdayOffer(db,input(),NOW).created,false);assert.equal(db.crm.offers.length,1);
});
test('offre annuelle : ni doublon automatique/manuel, ni renouvellement après expiration ou utilisation',()=>{
  for(const status of ['expired','used','automatic']){const db=database();birthday.createBirthdayOffer(db,input(),NOW);const offer=db.crm.offers[0];if(status==='expired')offer.expiresAt=NOW-1;if(status==='used')db.orders.push({id:'p',crmOfferId:offer.id,payment:{status:'PAID'}});if(status==='automatic')delete offer.createdBy;
    assert.equal(birthday.createBirthdayOffer(db,input(),NOW).created,false);assert.equal(db.crm.offers.length,1);
  }
});
test('29 février : aucun anniversaire inventé en année non bissextile',()=>{
  const db={customers:[customer('a','02-29')],orders:[]};assert.equal(birthday.birthdayDashboard(db,Date.parse('2027-02-28T12:00:00Z')).todayCustomers.length,0);assert.equal(birthday.birthdayDashboard(db,Date.parse('2028-02-29T12:00:00Z')).todayCustomers.length,1);
});
test('push anniversaire : un seul client ciblé, aperçu sans envoi, destinataires généraux refusés',()=>{
  const db=database();db.customers[1].crmPreferences.birthday='10-18';register(db,'a');register(db,'b');const p={requestId:crypto.randomUUID(),title:'Bon anniversaire',body:'Un message fictif',screen:'account',audience:'birthday',customerIds:['a'],birthdayDate:'2026-10-18'};
  const view=push.prepareCampaign(db,p,ON,NOW);assert.equal(view.customers,1);assert.equal(view.recipients[0].name,'Client fictif a');assert.equal(db.pushNotifications.jobs.length,0);
  assert.throws(()=>push.prepareCampaign(db,{...p,requestId:crypto.randomUUID(),customerIds:[]},ON,NOW));assert.throws(()=>push.prepareCampaign(db,{...p,requestId:crypto.randomUUID(),audience:'all'},ON,NOW));assert.throws(()=>push.prepareCampaign(db,{...p,requestId:crypto.randomUUID(),birthdayDate:'2026-10-17'},ON,NOW));
  push.sendCampaign(db,p.requestId,{confirm:true},ON,NOW);assert.deepEqual(db.pushNotifications.jobs.map(j=>j.customerId),['a']);push.sendCampaign(db,p.requestId,{confirm:true},ON,NOW);assert.equal(db.pushNotifications.jobs.length,1);
});
test('push anniversaire : changement de date, retrait des accords, suppression et réattribution revérifiés avant envoi',()=>{
  for(const change of ['birthday','consent','marketing','deleted','midnight']){const db=database();register(db,'a');const p={requestId:crypto.randomUUID(),title:'Bon anniversaire',body:'Message fictif',screen:'menu',audience:'birthday',customerIds:['a'],birthdayDate:'2026-10-18'};push.prepareCampaign(db,p,ON,NOW);
    if(change==='birthday')db.customers[0].crmPreferences.birthday='10-20';if(change==='consent')db.customers[0].crmPreferences.personalizedOffers=false;if(change==='marketing')db.customers[0].pushPreferences.marketing=false;if(change==='deleted')db.customers.shift();
    assert.throws(()=>push.sendCampaign(db,p.requestId,{confirm:true},ON,change==='midnight'?Date.parse('2026-10-18T22:01:00Z'):NOW));assert.equal(db.pushNotifications.jobs.length,0);
  }
});
