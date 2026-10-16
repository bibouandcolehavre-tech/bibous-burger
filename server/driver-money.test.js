const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const S=require('./driver-settlements'),T=require('./driver-tips'),A=require('./krokli-driver-account'),F=require('./driver-feedback');
const key='a'.repeat(64),now=new Date('2026-10-19T07:00:00Z'),d={id:'d1',name:'Livreur test',username:'test',active:true};
const bank={holder:'Titulaire de test',iban:'FR1420041010050500013M02606',bic:'PSSTFRPPXXX'};
const order=(id,at='2026-10-18T18:00:00Z')=>({id,number:1,customerId:'c1',method:'delivery',status:'delivered',payment:{status:'PAID'},deliveryFee:3.99,kroklyDriver:{driverId:'d1',status:'delivered',deliveredAt:at}});
test('RIB checksum, encryption, masked reads and wrong-key / cross-driver protections',()=>{
  const db={};assert.throws(()=>S.saveBank(db,d,bank,''),e=>e.statusCode===503);assert.equal(db.driverBankProfiles,undefined);
  S.saveBank(db,d,bank,key,now);const raw=JSON.stringify(db);assert.equal(raw.includes(bank.iban),false);assert.equal(raw.includes(bank.bic),false);assert.match(S.bankView(db,d).maskedIban,/2606/);
  assert.throws(()=>S.iban(bank.iban.slice(0,-1)+'7'));assert.throws(()=>S.saveBank(db,d,{...bank,bic:'bad'},key));
  db.orders=[order('o1')];const r=S.request(db,d,key,{},now);assert.equal(S.requestBank(db,r.id,key).iban,bank.iban);assert.throws(()=>S.requestBank(db,r.id,'b'.repeat(64)),e=>e.statusCode===503);
  db.driverPaymentRequests[0].driverId='other';assert.throws(()=>S.requestBank(db,r.id,key));
});
test('manual requests reserve only unclaimed earnings, aggregate late tips, and do not transfer money',()=>{
  const db={orders:[order('o1')],kroklyDrivers:[d]};S.saveBank(db,d,bank,key,now);
  assert.equal(S.state(db,d,key).availableCents,399);const r=S.request(db,d,key,{},now);assert.equal(r.amountCents,399);assert.equal(S.state(db,d,key).availableCents,0);assert.throws(()=>S.request(db,d,key,{},now),e=>e.statusCode===409);
  assert.throws(()=>S.markPaid(db,r.id,{confirmPaid:false,reference:'test'}));S.markPaid(db,r.id,{confirmPaid:true,reference:'Virement fictif'},now);S.markPaid(db,r.id,{confirmPaid:true,reference:'Virement fictif'},now);
  db.driverTipPayments=[{orderId:'o1',driverId:'d1',amountCents:200,refundedCents:0,state:'PAID',providerVerified:true,providerTransactionId:'fake-checkout',paidAt:now.toISOString()}];
  const late=S.request(db,d,key,{},now);assert.equal(late.amountCents,200);assert.equal(late.tipCents,200);assert.equal(S.state(db,d,key).automaticTransfer,false);assert.equal(S.managerState(db).requests.length,2);
});
test('Monday job is idempotent, excludes current week and does not double request manually reserved gains',()=>{
  const db={orders:[order('sun'),order('mon','2026-10-19T06:00:00Z')],kroklyDrivers:[d]};S.saveBank(db,d,bank,key,now);
  assert.equal(S.weekly(db,key,now),true);assert.equal(S.weekly(db,key,now),false);assert.equal(db.driverPaymentRequests.length,1);assert.equal(db.driverPaymentRequests[0].source,'weekly');assert.equal(db.driverPaymentRequests[0].amountCents,399);assert.equal(S.state(db,d,key).availableCents,399);
  S.request(db,d,key,{},now);assert.equal(S.weekly(db,key,new Date('2026-10-26T07:00:00Z')),false);
});
test('tips are independent of rating, immutable/idempotent, and never credited merely from customer input',()=>{
  const o=order('o1'),db={orders:[o]};const input={amountCents:200,requestId:crypto.randomUUID()};const tip=T.create(db,o,input,now);assert.equal(T.create(db,o,input,now),tip);assert.equal(T.create(db,o,{...input,requestId:crypto.randomUUID()},now),tip);assert.equal(A.tipsFor(db,o,'d1'),0);assert.equal(F.view(db,o).feedback,null);
  for(const bad of [{...input,amountCents:0},{...input,amountCents:5001},{...input,amountCents:2.5},{...input,providerVerified:true}])assert.throws(()=>T.create(db,o,bad,now));
  assert.throws(()=>T.create(db,{...o,status:'ready'},input,now));
  tip.payment={status:'PAID',merchantCode:'FAKE',checkoutId:'fake-checkout',paidAt:now.toISOString()};T.finalizeVerified(tip);T.finalizeVerified(tip);assert.equal(A.tipsFor(db,o,'d1'),200);assert.equal(db.orders[0].loyaltyPointsAdded,undefined);assert.equal(db.orders[0].total,undefined);
});
test('refunded or uncertain tips cannot be paid through an outdated request; cancellation permits a corrected request',()=>{
  const o=order('o1'),db={orders:[o],customers:[],kroklyDrivers:[d]};S.saveBank(db,d,bank,key,now);const tip=T.create(db,o,{amountCents:200,requestId:crypto.randomUUID()},now);tip.payment={status:'PAID',checkoutId:'verified-fixture',merchantCode:'FAKE',paidAt:now.toISOString()};T.finalizeVerified(tip);const r=S.request(db,d,key,{},now);assert.equal(r.amountCents,599);
  T.reconcileVerifiedCheckout(tip,{id:'verified-fixture',transactions:[{status:'REFUNDED',amount:2,currency:'EUR',refunded_amount:.5}]});assert.equal(A.tipsFor(db,o,'d1'),150);assert.throws(()=>S.requestBank(db,r.id,key),e=>e.statusCode===409);assert.throws(()=>S.markPaid(db,r.id,{confirmPaid:true,reference:'fixture'}),e=>e.statusCode===409);
  S.reject(db,r.id,{confirm:true});const corrected=S.request(db,d,key,{},now);assert.equal(corrected.amountCents,549);
  T.reconcileVerifiedCheckout(tip,{id:'verified-fixture',transactions:[{status:'REFUNDED',amount:2,currency:'EUR'}]});assert.equal(tip.reconciliationHold,true);assert.equal(A.tipsFor(db,o,'d1'),0);assert.throws(()=>S.requestBank(db,corrected.id,key));
});
test('backup/restore preserves encrypted bank snapshots and reservations, never creating a duplicate entitlement',async()=>{
  const db={customers:[],orders:[order('o1')],kroklyDrivers:[d]};S.saveBank(db,d,bank,key,now);const r=S.request(db,d,key,{},now);
  const {encodeBackup,decodeBackup}=require('./backups');const restored=(await decodeBackup(await encodeBackup({database:db,stock:{}},now))).data.database;
  assert.equal(JSON.stringify(restored).includes(bank.iban),false);assert.equal(S.requestBank(restored,r.id,key).iban,bank.iban);assert.equal(S.state(restored,d,key).availableCents,0);assert.throws(()=>S.request(restored,d,key,{},now));
});
