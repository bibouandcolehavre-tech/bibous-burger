const test=require('node:test'),assert=require('node:assert/strict');
const crm=require('./crm'),push=require('./push-notifications');
const {bestClientOffer}=require('../crm-client');
const {anonymizeCustomerAccount}=require('./account-deletion');
const NOW=Date.parse('2026-09-19T10:00:00Z'),DAY=86400000,off={enabled:false,platforms:[]};
const customer=(id,consent=true)=>({id,name:'Fictif '+id,createdAt:new Date(NOW-100*DAY).toISOString(),crmPreferences:{personalizedOffers:consent,birthday:'09-20'}});
const order=(id,c,ago,total=20,extra={})=>({id,customerId:c,subtotal:total,total,payment:{status:'PAID',paidAt:new Date(NOW-ago*DAY).toISOString()},status:'delivered',createdAt:new Date(NOW-ago*DAY).toISOString(),...extra});
const database=()=>({customers:[customer('c1')],orders:[order('o1','c1',46)]});
function activate(db,type,override={},settings={}) {
  const next=crm.defaults();Object.assign(next,settings,{enabled:true});const r=next.rules.find(r=>r.id===type);Object.assign(r,{enabled:true,discountPercent:15},override);crm.saveSettings(db,{...next,confirmActivation:true},NOW);return db.crm.settings;
}
test('CRM defaults off, blank business thresholds, read-only preview and strict validation',()=>{
  const db=database(),before=JSON.stringify(db);assert.equal(crm.evaluate(db,off,NOW),0);const dash=crm.dashboard(db,off,30,NOW);assert.equal(dash.settings.enabled,false);assert.equal(dash.settings.rules[0].inactiveDays,45);assert.ok(dash.settings.rules.every(r=>r.discountPercent===null&&!r.enabled));assert.equal(JSON.stringify(db),before);
  assert.throws(()=>crm.saveSettings(db,{...crm.defaults(),foo:1}),/invalides/);
  const next=crm.defaults();next.enabled=true;next.rules[0].enabled=true;assert.throws(()=>crm.saveSettings(db,next),/remise/);next.rules[0].discountPercent=15;assert.throws(()=>crm.saveSettings(db,next),/Confirmez/);crm.saveSettings(db,{...next,confirmActivation:true},NOW);assert.throws(()=>crm.saveSettings(db,next),/autre onglet/);
  for(const value of [null,'5',-1,NaN,51]){const x=crm.defaults();x.rules[0].enabled=true;x.rules[0].discountPercent=value;assert.throws(()=>crm.validateSettings(x));}
});
test('inactive threshold exactly 45 days, no unpaid/cancelled/future/no-order targeting',()=>{
  const db={customers:['at','under','new','unpaid','cancel','future'].map(c=>customer(c)),orders:[order('a','at',45),order('b','under',44.99),order('u','unpaid',50,20,{payment:{status:'PENDING'}}),order('c','cancel',50,20,{status:'cancelled'}),order('f','future',-1)]};activate(db,'inactive');assert.equal(crm.evaluate(db,off,NOW),1);assert.equal(db.crm.offers[0].customerId,'at');assert.equal(crm.evaluate(db,off,NOW+DAY),1);assert.equal(db.crm.offers[1].customerId,'under');assert.equal(crm.evaluate(db,off,NOW+30*DAY),0);
});
test('birthday tomorrow uses Paris calendar, year transition and leap day, missing dates ignored',()=>{
  const db={customers:[customer('a'),customer('b')],orders:[]};delete db.customers[1].crmPreferences.birthday;activate(db,'birthday');assert.equal(crm.evaluate(db,off,NOW),1);assert.equal(crm.evaluate(db,off,NOW+3600000),0);
  const edge=Date.parse('2026-12-31T11:00:00Z');db.customers[0].crmPreferences.birthday='01-01';assert.equal(crm.evaluate(db,off,edge),1);assert.match(db.crm.offers[1].eventKey,/2027/);
  const leap={customers:[customer('leap')],orders:[]};leap.customers[0].crmPreferences.birthday='02-29';activate(leap,'birthday');assert.equal(crm.evaluate(leap,off,Date.parse('2027-02-28T11:00:00Z')),0);assert.equal(crm.evaluate(leap,off,Date.parse('2028-02-28T11:00:00Z')),1);
});
test('active customers: basket, frequency and spend evaluated only on paid non-cancelled orders',()=>{
  for(const [type,criteria] of [['large_order',{minAmount:50}],['frequency',{minOrders:3}],['spend',{minAmount:100}]]){
    const db={customers:[customer('a'),customer('b')],orders:[order('a1','a',1,50),order('a2','a',2,30),order('a3','a',3,20),order('b1','b',1,100,{status:'cancelled'}),order('b2','b',2,100,{payment:{status:'PENDING'}})]};activate(db,type,criteria);assert.equal(crm.evaluate(db,off,NOW),1,type);assert.equal(db.crm.offers[0].customerId,'a');assert.equal(crm.evaluate(db,off,NOW+8*DAY),0,'same event not repeated');
  }
});
test('consent, safety window, daily ceiling, per-customer cooldown and rule priority',()=>{
  const db={customers:[customer('a'),customer('b'),customer('c',false)],orders:[order('a','a',50),order('b','b',50),order('c','c',50)]};const settings=activate(db,'inactive',{}, {dailyLimit:1});settings.rules[1].enabled=true;settings.rules[1].discountPercent=15;
  assert.equal(crm.evaluate(db,off,Date.parse('2026-09-19T04:00:00Z')),0);assert.equal(crm.evaluate(db,off,NOW),1);assert.equal(crm.evaluate(db,off,NOW+1),0);assert.equal(db.crm.offers[0].ruleId,'inactive');assert.equal(crm.preview(db,settings,NOW)[0].noConsent,1);
  const resumed=structuredClone(db);assert.equal(crm.evaluate(resumed,off,NOW+DAY),1);assert.equal(resumed.crm.offers[1].customerId,'b');assert.equal(crm.preview(resumed,settings,NOW+DAY)[1].eligible,0);
});
test('birthday is optional, validated without a year, protected consent and erasure',()=>{
  const db=database(),c=db.customers[0];for(const birthday of ['02-30','13-01','00-10','2020-01-01','abc'])assert.throws(()=>crm.updateCustomerPreferences(db,c,{personalizedOffers:true,birthday}),/Anniversaire/);
  assert.throws(()=>crm.updateCustomerPreferences(db,c,{personalizedOffers:'yes',birthday:'01-01'}));crm.updateCustomerPreferences(db,c,{personalizedOffers:false,birthday:'02-29'},NOW);assert.equal(c.crmPreferences.birthday,'02-29');assert.equal(c.crmPreferences.personalizedOffers,false);crm.updateCustomerPreferences(db,c,{personalizedOffers:false,birthday:''});assert.equal(c.crmPreferences.birthday,'');
});
test('coupons: highest discount, no stacking, minimum basket, payment hold and one use',()=>{
  const db=database(),c=db.customers[0];activate(db,'inactive',{minSubtotal:20});crm.evaluate(db,off,NOW);const o=db.crm.offers[0];assert.equal(crm.bestOffer(db,c,19.99,0,NOW),null);assert.equal(crm.bestOffer(db,c,20,.2,NOW),null);assert.equal(crm.bestOffer(db,c,20,.1,NOW).id,o.id);
  assert.equal(bestClientOffer(crm.customerState(db,c,NOW).offers,20,.1,NOW).id,o.id);
  db.orders.push({id:'attempt',crmOfferId:o.id,customerId:c.id,createdAt:new Date(NOW).toISOString(),status:'awaiting_payment'});assert.equal(crm.bestOffer(db,c,20,0,NOW+1),null);assert.equal(crm.bestOffer(db,c,20,0,NOW+16*60000).id,o.id);
  db.orders.at(-1).payment={status:'PAID'};db.orders.at(-1).status='cancelled';assert.equal(crm.bestOffer(db,c,20,0,NOW+16*60000),null);assert.equal(crm.customerState(db,c,NOW).offers[0].status,'used');
  assert.equal(crm.customerState(db,customer('other'),NOW).offers.length,0);
});
test('stats use actual transactions, cancellations excluded, blank ratios never fabricated',()=>{
  const empty=crm.statistics({customers:[],orders:[]},30,NOW);assert.equal(empty.averageBasket,null);assert.equal(empty.conversion,null);
  const db=database();activate(db,'inactive');crm.evaluate(db,off,NOW-DAY);const coupon=db.crm.offers[0];db.orders.push(order('success','c1',0,30,{crmOfferId:coupon.id,discount:4.5}),order('cancel','c1',0,100,{crmOfferId:coupon.id,status:'cancelled'}));const s=crm.statistics(db,30,NOW);assert.equal(s.orders,1);assert.equal(s.revenue,30);assert.equal(s.used,1);assert.equal(s.conversion,100);assert.equal(s.discounts,4.5);
});
test('sales overview is distinct from marketing-attributed revenue',()=>{
  const db={customers:[customer('c1')],orders:[order('a','c1',2,30),order('b','c1',5,40)]};
  const s=crm.statistics(db,30,NOW);assert.equal(s.orders,2);assert.equal(s.revenue,70);assert.equal(s.averageBasket,35);assert.equal(s.attributedOrders,0);assert.equal(s.attributedRevenue,0);
});
test('push CRM requires independent consent and live flags; deletion removes targeting data',async()=>{
  const db=database();activate(db,'inactive',{channel:'in_app_push'});db.customers[0].pushPreferences={marketing:true};push.registerDevice(db,db.customers[0],{installationId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',secret:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',token:'ExpoPushToken[abcdefghij123456]',platform:'ios'},NOW);
  crm.evaluate(db,off,NOW);assert.equal(db.pushNotifications.jobs.length,0);
  const live={enabled:true,platforms:['ios']};push.queueCrmNotification(db,db.crm.offers[0],live,NOW);assert.equal(db.pushNotifications.jobs.length,1);
  crm.updateCustomerPreferences(db,db.customers[0],{personalizedOffers:false,birthday:''},NOW);assert.equal(db.pushNotifications.jobs[0].status,'cancelled');
  let sends=0;const worker=push.createPushWorker({config:live,transact:async fn=>fn(db),clock:()=>NOW,fetchImpl:async()=>{sends++;throw Error('No real network');}});await worker.tick();assert.equal(sends,0);
  anonymizeCustomerAccount(db,db.customers[0],new Date(NOW));assert.equal(db.crm.offers.length,0);assert.equal(db.pushNotifications.jobs.length,0);assert.equal(db.customers.length,0);
});
test('CRM push dispatch and receipt are mocked, pause and expiry block queued messages',async()=>{
  const live={enabled:true,platforms:['ios']};
  const setup=()=>{
    const db=database();activate(db,'inactive',{channel:'in_app_push'});
    push.registerDevice(db,db.customers[0],{installationId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',secret:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',token:'ExpoPushToken[abcdefghij123456]',platform:'ios'},NOW);
    push.updatePreferences(db,db.customers[0],{marketing:true},NOW);
    crm.evaluate(db,live,NOW);return db;
  };
  const db=setup();let clock=NOW,calls=0;
  const worker=push.createPushWorker({config:live,transact:async fn=>fn(db),clock:()=>clock,fetchImpl:async(url,options)=>{
    calls++;const body=JSON.parse(options.body);
    if(url.endsWith('/send')){assert.equal(body.length,1);assert.equal(body[0].data.accountId,'c1');assert.equal(body[0].data.screen,'account');assert.equal(body[0].channelId,'promotions');assert.match(body[0].body,/15/);return new Response(JSON.stringify({data:[{status:'ok',id:'mock-ticket'}]}));}
    return new Response(JSON.stringify({data:{'mock-ticket':{status:'ok'}}}));
  }});
  await worker.tick();assert.equal(db.pushNotifications.jobs[0].status,'accepted');
  clock+=15*60000;await worker.tick();assert.equal(db.pushNotifications.jobs[0].status,'provider_ok');assert.equal(calls,2);
  for(const cause of ['pause','expiry','push-consent','crm-consent','rule']){
    const blocked=setup();
    if(cause==='pause')crm.saveSettings(blocked,{...blocked.crm.settings,enabled:false},NOW);
    if(cause==='expiry')blocked.crm.offers[0].expiresAt=NOW;
    if(cause==='push-consent')blocked.customers[0].pushPreferences.marketing=false;
    if(cause==='crm-consent')blocked.customers[0].crmPreferences.personalizedOffers=false;
    if(cause==='rule')blocked.crm.settings.rules[0].enabled=false;
    const w=push.createPushWorker({config:live,transact:async fn=>fn(blocked),clock:()=>NOW,fetchImpl:async()=>{assert.fail('No provider call allowed');}});
    await w.tick();assert.equal(blocked.pushNotifications.jobs[0].status,'cancelled',cause);
  }
});
test('an unresolved provider checkout keeps its coupon reserved after the local hold',()=>{
  const db=database(),c=db.customers[0];activate(db,'inactive');crm.evaluate(db,off,NOW);const offer=db.crm.offers[0];
  const attempt={id:'payment',customerId:c.id,crmOfferId:offer.id,createdAt:new Date(NOW).toISOString(),status:'awaiting_payment',payment:{status:'PENDING',checkoutId:'mock-checkout'}};db.orders.push(attempt);
  assert.equal(crm.bestOffer(db,c,30,0,NOW+16*60000),null);
  attempt.payment.status='FAILED';assert.equal(crm.bestOffer(db,c,30,0,NOW+16*60000).id,offer.id);
  assert.equal(crm.bestOffer(db,c,30,0,offer.expiresAt),null);
});
