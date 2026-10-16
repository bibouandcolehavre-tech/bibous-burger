const test=require('node:test'),assert=require('node:assert/strict');
const A=require('./krokli-driver-account'),F=require('./driver-feedback'),K=require('./krokly-drivers');
const now=new Date('2026-10-16T18:00:00Z'),driver={id:'d1',name:'Livreur exemple',username:'exemple'};
const order=(i=1,extra={})=>({id:`o${i}`,number:i,customerId:'c1',customerName:'PRIVATE_NAME',customerPhone:'PRIVATE_PHONE',deliveryAddress:{address:'PRIVATE_ADDRESS'},comment:'PRIVATE_COMMENT',gps:{latitude:49},method:'delivery',total:13.99,deliveryFee:3.99,payment:{status:'PAID'},status:'delivered',kroklyDriver:{driverId:'d1',status:'delivered',updatedAt:'2026-10-15T18:00:00Z'},...extra});
test('weeks use Paris midnight and Monday/Sunday including DST and year change',()=>{
  assert.equal(A.weekFor('2026-10-18T21:59:59Z').startDate,'2026-10-12');
  assert.equal(A.weekFor('2026-10-18T22:00:00Z').startDate,'2026-10-19');
  assert.equal(A.weekFor('2026-10-25T22:59:59Z').startDate,'2026-10-19');
  assert.equal(A.weekFor('2026-10-25T23:00:00Z').startDate,'2026-10-26');
  assert.equal(A.weekFor('2027-01-01T08:00:00Z').startDate,'2026-12-28');
  for(const key of ['2026-10-13','2026-02-30','2026-99-01','bad','2026-2-02'])assert.throws(()=>A.validWeek(key));
});
test('only own completed paid real deliveries enter the private history',()=>{
  const db={orders:[order(),order(2,{kroklyDriver:{driverId:'d2',status:'delivered',updatedAt:now.toISOString()}}),...[
    {status:'ready'},{payment:{status:'PENDING'}},{method:'pickup'},{reviewMode:true},{testMode:true},{isTest:true},
  ].map((change,i)=>order(i+3,change))]};
  const result=A.account(db,driver,{},now);assert.equal(result.history.length,1);assert.equal(result.summary.completedCount,1);
  assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);assert.equal(JSON.stringify(result).includes('latitude'),false);
  assert.throws(()=>A.account(db,null,{},now),e=>e.statusCode===401);
  assert.equal(result.summary.paidOutVerified,false);assert.equal(result.tipsEnabled,false);
});
test('per-order forfaits accumulate, preserve offered pay and never use the customer order total as earnings',()=>{
  const rows=[order(),order(2,{deliveryFee:4.99,total:29}),order(3,{deliveryFee:0,standardDeliveryFee:5.99,total:22})];
  const r=A.account({orders:rows},driver,{},now);assert.equal(r.summary.knownDriverPayCents,1497);assert.equal(r.summary.totalEntitlementCents,1497);assert.equal(r.summary.knownDeliveryFeesCents,898);assert.equal(JSON.stringify(r).includes('orderTotalCents'),false);
  const o=order(4,{status:'ready',serviceDate:'2026-10-16',kroklyDriver:undefined});const db={orders:[o]};const created=K.createDriver(db,{username:'lina',name:'Lina'},now.valueOf());K.assign(db,o.id,created.driver.id,now.valueOf());o.standardDeliveryFee=5.99;K.transition(db,o.id,created.driver.id,'accept',now.valueOf());assert.equal(K.assigned(db,created.driver.id)[0].courierPay,3.99);
});
test('legacy unknowns are not invented as zero; client-supplied tips are ignored',()=>{
  const o=order(1,{deliveryFee:'unknown',tipCents:999999,tip:{amount:500}});const r=A.account({orders:[o]},driver,{},now);
  assert.equal(r.summary.totalEntitlementCents,null);assert.equal(r.summary.unknownPayCount,1);assert.equal(r.summary.unknownDeliveryFees,1);assert.equal(r.summary.tipCents,0);
});
test('a later customer refund, anonymization or price edit cannot erase an already completed courier fee',()=>{
  const o=order();A.recordCompletion(o);o.payment.status='REFUNDED';o.total=0;o.customerId=null;o.status='cancelled';
  const r=A.account({orders:[o]},driver,{},now);assert.equal(r.summary.completedCount,1);assert.equal(r.summary.totalEntitlementCents,399);assert.equal(r.history[0].deliveryFeeCents,399);
});
test('first name only, no basket revenue; account deletion removes first name without erasing earnings',()=>{const db={orders:[order()],customers:[{id:'c1',firstName:'Thomas',lastName:'PRIVATE_SURNAME'}]};const r=A.account(db,driver,{},now);assert.equal(r.history[0].firstName,'Thomas');for(const key of ['orderTotalCents','PRIVATE_NAME','PRIVATE_SURNAME','PRIVATE_PHONE'])assert.equal(JSON.stringify(r).includes(key),false);db.customers=[];assert.equal(A.account(db,driver,{},now).history[0].firstName,'Client');});
test('only verified non-refunded provider-ledger tips count once, scoped to this driver/order',()=>{
  const p={orderId:'o1',driverId:'d1',state:'PAID',providerVerified:true,providerTransactionId:'fake-provider-receipt',amountCents:200,refundedCents:50};
  const db={orders:[order()],driverTipPayments:[p,p,{...p,providerTransactionId:'unverified',providerVerified:false},{...p,driverId:'d2',providerTransactionId:'other'},{...p,amountCents:1,refundedCents:2,providerTransactionId:'invalid'}]};
  const r=A.account(db,driver,{},now);assert.equal(r.summary.tipCents,150);assert.equal(r.summary.totalEntitlementCents,549);
});
test('pagination and full-week statement keep all totals and own rows, not only the first page',()=>{
  const db={orders:Array.from({length:205},(_,i)=>order(i+1))};const r=A.account(db,driver,{offset:100,limit:100},now);
  assert.equal(r.history.length,100);assert.equal(r.pagination.nextOffset,200);assert.equal(r.summary.completedCount,205);
  const full=A.statement(db,driver,undefined,now);assert.equal(full.history.length,205);assert.equal(full.summary.knownDriverPayCents,205*399);
  for(const options of [{offset:-1},{offset:.1},{limit:101},{limit:0},{week:'2026-10-19'}])assert.throws(()=>A.account(db,driver,options,now));
  assert.equal(A.account(db,driver,{week:'2026-10-05'},now).summary.completedCount,0);
});
test('rating is once per delivered order; invalid states and monetary fields cannot be submitted',()=>{
  const db={orders:[order()]},o=db.orders[0];assert.equal(F.view(db,o).eligible,true);
  for(const input of [{stars:0},{stars:6},{stars:2.5},{stars:5,tipCents:200},{stars:5,comment:'x'.repeat(501)}])assert.throws(()=>F.save(db,o,input,now));
  assert.throws(()=>F.save(db,{...o,status:'ready'},{stars:5},now),e=>e.statusCode===409);
  F.save(db,o,{stars:4,comment:' Rapide '},now);F.save(db,o,{stars:4,comment:'Rapide'},now);assert.equal(db.driverFeedback.length,1);
  assert.throws(()=>F.save(db,o,{stars:1},now),e=>e.statusCode===409);
  db.driverFeedback.unshift({orderId:'o1',driverId:'d1',customerId:'attacker',stars:1});
  assert.deepEqual(A.account(db,driver,{},now).ratings,{count:1,averageStars:4});assert.equal(JSON.stringify(A.account(db,driver,{},now)).includes('Rapide'),false);
  F.removeCustomer(db,'c1');assert.deepEqual(A.account(db,driver,{},now).ratings,{count:0,averageStars:null});
});
test('runtime PDF is actual PDF, including empty, provisional, unknown and multi-page cases',async()=>{
  const {renderStatement}=require('./pdf/driver-statement');
  for(const orders of [[],[order(1,{deliveryFee:0})],Array.from({length:80},(_,i)=>order(i+1))]){
    const pdf=await renderStatement(A.statement({orders},driver,undefined,now),{now,example:true});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>1000);assert.equal(pdf.includes(Buffer.from('PRIVATE_')),false);
  }
});
