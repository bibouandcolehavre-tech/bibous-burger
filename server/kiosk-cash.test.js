const test=require('node:test'),assert=require('node:assert/strict');
const {prepareCashOrder,cashRequested,cashDue,confirmCashOrder,cancelCashOrder,CASH_HOLD_MS}=require('./kiosk-cash');
const {orderFingerprint}=require('./order-attempt');
const {eligibleOrderTurns,defaultWheel}=require('./wheel');
const {kioskWheelDatabase}=require('./kiosk-connections');
const {validateAndPriceOrderItems,PRODUCT_CATALOG}=require('./catalog');
const fresh=()=>({id:'fictional-cash',method:'pickup',status:'awaiting_payment',createdAt:new Date().toISOString(),total:19.8,subtotal:19.8});
test('Montagnes has a potato patty with bacon retained, for burger and meal',()=>{
  for(const productId of ['montagnes','montagnes-menu']) {
    const selections=[{groupId:'protein',id:'galette'},{groupId:'salad',id:'roquette'},{groupId:'sauces',id:PRODUCT_CATALOG[productId].fixedSauce || 'mayo'},...(productId.endsWith('-menu')?[{groupId:'drink',id:'coca'}]:[])];
    const result=validateAndPriceOrderItems([{productId,quantity:1,selections}]);
    assert.equal(result.items[0].options.find(o=>o.groupId==='protein').label,'Galette de pomme de terre (bacon conservé)');
    assert.equal(result.subtotal,PRODUCT_CATALOG[productId].price);
    assert.throws(()=>validateAndPriceOrderItems([{productId,quantity:1,selections}],{'ingredient-potato-patty':false}),/disponible/);
  }
});
test('cash is explicit, durable, never a terminal checkout or an automatic payment',()=>{
  assert.equal(cashRequested({}),false);assert.equal(cashRequested({paymentMethod:'cash'}),true);
  assert.throws(()=>cashRequested({paymentMethod:'other'}),{statusCode:400});
  const order=prepareCashOrder(fresh());assert.ok(cashDue(order));assert.equal(order.payment.status,'CASH_DUE');
  assert.equal(order.payment.checkoutReference,undefined);assert.equal(order.payment.paidAt,undefined);
  assert.throws(()=>prepareCashOrder({...fresh(),method:'delivery'}));
  assert.throws(()=>prepareCashOrder({...fresh(),payment:{provider:'sumup',status:'PENDING'}}));
  assert.throws(()=>prepareCashOrder({...fresh(),total:0}));
  assert.notEqual(orderFingerprint({paymentMethod:'cash'}),orderFingerprint({}));
  assert.equal(orderFingerprint({paymentMethod:'card'}),orderFingerprint({}));
});
test('only exact cash collection, idempotent confirmation, no reversal or wheel',()=>{
  const order=prepareCashOrder(fresh());
  assert.throws(()=>confirmCashOrder(order,0.01));assert.equal(order.payment.status,'CASH_DUE');
  assert.ok(confirmCashOrder(order,19.8));assert.equal(order.payment.status,'PAID');
  assert.equal(confirmCashOrder(order,19.8),false);
  assert.throws(()=>cancelCashOrder(order));
  assert.equal(eligibleOrderTurns(order,{...defaultWheel(),startDate:'2020-01-01',endDate:'2099-01-01'}),0);
  const cancelled=prepareCashOrder(fresh());cancelCashOrder(cancelled);assert.equal(cancelCashOrder(cancelled),false);
  assert.throws(()=>confirmCashOrder(cancelled,19.8));
  const expired=prepareCashOrder(fresh());assert.throws(()=>confirmCashOrder(expired,19.8,new Date(Date.parse(expired.createdAt)+CASH_HOLD_MS)));
  assert.equal(expired.payment.status,'CASH_DUE');
});
test('kiosk wheel excludes historical spins, orders and referral data',()=>{
  const database={orders:[{id:'now',customerId:'a',kioskSessionId:'current'},{id:'old',customerId:'a',kioskSessionId:'old'},{id:'other',customerId:'b',kioskSessionId:'current'}],customers:[{id:'a'}],wheelSpins:[{orderId:'now',customerId:'a'},{orderId:'old',customerId:'a'},{orderId:'now',customerId:'b'}]};
  const scoped=kioskWheelDatabase(database,{id:'current'},'a');
  assert.deepEqual(scoped.orders.map(o=>o.id),['now']);assert.deepEqual(scoped.customers,[]);assert.equal(scoped.wheelSpins.length,1);
  assert.equal(kioskWheelDatabase(database,null,'a'),database);
});
