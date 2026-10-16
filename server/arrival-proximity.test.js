const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const N=require('./arrival-proximity'),push=require('./push-notifications');
const now=Date.now(),order=()=>({id:'o1',customerId:'c1',method:'delivery',status:'out_for_delivery',payment:{status:'PAID'},kroklyDriver:{status:'picked_up'},deliveryDestination:{latitude:49.49,longitude:.12,source:'google-routes'}});
const position=()=>({latitude:49.4905,longitude:.12,accuracy:10,ageSeconds:1,validForMs:29000});
test('arrival estimate uses a recent accurate nearby GPS fix, never just elapsed preparation/road time',()=>{
  assert.equal(N.near(order(),position()),true);
  for(const p of [null,{...position(),latitude:49.5},{...position(),accuracy:80},{...position(),ageSeconds:15},{...position(),validForMs:0},{...position(),accuracy:-1}])assert.equal(N.near(order(),p),false);
  for(const o of [{...order(),status:'delivered'},{...order(),reviewMode:true},{...order(),deliveryDestination:null},{...order(),amendment:{status:'pending'}}])assert.equal(N.near(o,position()),false);
});
test('one arrival push per authorized device, short expiry and cancellation if no longer relevant',async()=>{
  const o=order(),customer={id:'c1',pushPreferences:{service:true}},db={customers:[customer],orders:[o]};let near=true;
  const config={enabled:true,platforms:['ios','android'],arrivalEligible:()=>near};
  for(const platform of ['ios','android'])push.registerDevice(db,customer,{installationId:crypto.randomUUID(),secret:crypto.randomUUID(),token:`ExpoPushToken[${crypto.randomBytes(16).toString('hex')}]`,platform},now);
  assert.equal(push.queueArrivalNotification(db,o,config,now),true);assert.equal(push.queueArrivalNotification(db,o,config,now),false);assert.equal(db.pushNotifications.jobs.length,2);assert.ok(db.pushNotifications.jobs.every(j=>j.expiresAt===now+45000&&j.screen==='orders'&&!JSON.stringify(j).includes('latitude')));
  near=false;const worker=push.createPushWorker({config,clock:()=>now,transact:async fn=>fn(db),fetchImpl:()=>assert.fail('No obsolete arrival notification')});await worker.tick();assert.ok(db.pushNotifications.jobs.every(j=>j.status==='cancelled'));
});
