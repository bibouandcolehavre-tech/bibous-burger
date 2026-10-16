const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('./krokli-preparation');
const { preparationMinutes } = require('../service-policy');
const now = Date.parse('2026-10-16T17:00:00Z');
function order(overrides = {}) { return { id: 'test-only', method: 'delivery', status: 'preparing', payment: { status: 'PAID' }, subtotal: 20,
  items: [{ productId: 'classique', quantity: 2, price: 10 }], serviceDate: '2026-10-16', slot: '19:00', ...overrides }; }
function planned(overrides) { const o = order(overrides); o.krokliPreparation = P.plan(o, { acceptedAt: new Date(now).toISOString(), activationId: 'test-activation' }); return o; }

test('one shared kitchen policy: below 40 = 15 min, 40 through 100 = 30 min, above 100 = 35 min, before adding road travel', () => {
  for (const [amount, expected] of [[0,15],[25,15],[39.99,15],[40,30],[59.99,30],[60,30],[60.01,30],[100,30],[100.01,35],[150,35]]) assert.equal(P.estimateMinutes(amount), expected);
  assert.deepEqual([15,30,35], [preparationMinutes(20), preparationMinutes(70), preparationMinutes(150)]);
  for (const invalid of [null, '20', NaN, Infinity, -1, 1_000_001]) assert.throws(() => P.estimateMinutes(invalid));
});
test('a 15-minute basket calls after ten minutes, does not mark the meal ready, and is due at the exact deadline', () => {
  const o = planned(), before = structuredClone(o);
  assert.equal(o.krokliPreparation.estimatedReadyAt, '2026-10-16T17:15:00.000Z');
  assert.equal(o.krokliPreparation.notifyAt, '2026-10-16T17:10:00.000Z');
  assert.equal(P.due(o, now + 10 * 60_000 - 1), false); assert.equal(P.due(o, now + 10 * 60_000), true);
  assert.equal(o.status, 'preparing'); assert.deepEqual(o, before);
});
test('higher baskets defer the call without discount or delivery fee affecting kitchen work', () => {
  for (const [subtotal, prep, delay] of [[45,30,25],[70,30,25],[150,35,30]]) {
    const o = planned({ subtotal, total: 0, discount: 100, deliveryFee: 50 });
    assert.equal(o.krokliPreparation.preparationMinutes, prep);
    assert.equal(Date.parse(o.krokliPreparation.notifyAt) - now, delay * 60_000);
  }
});
test('future slot/day waits for the booked service rather than notifying immediately after early acceptance', () => {
  for (const [date, slot, ready] of [['2026-10-16','21:00','2026-10-16T19:00:00.000Z'],['2026-10-17','12:00','2026-10-17T10:00:00.000Z'],['2026-10-26','12:00','2026-10-26T11:00:00.000Z']]) {
    const o = planned({ serviceDate: date, slot }); assert.equal(o.krokliPreparation.estimatedReadyAt, ready);
    assert.equal(P.due(o, now + 15 * 60_000), false);
  }
});
test('payment, acceptance, amendment, review, Uber and date guards suspend every delayed action', () => {
  for (const mutation of [o=>o.payment.status='PENDING',o=>o.status='cancelled',o=>o.status='confirmed',o=>o.status='awaiting_customer',o=>o.method='pickup',o=>o.amendment={status:'pending'},o=>o.reviewMode=true,o=>o.uberDirect={phase:'uncertain'}]) {
    const o=planned(); mutation(o); assert.equal(P.due(o, now+20*60_000),false);
  }
  assert.equal(P.due(planned(),now+24*3600_000),false);
});
test('basket or slot changes invalidate the old schedule; customer details do not affect it or enter the fingerprint', () => {
  for (const mutation of [o=>o.subtotal+=1,o=>o.items[0].quantity+=1,o=>o.slot='19:15',o=>o.serviceDate='2026-10-17']) {
    const o=planned();mutation(o);assert.equal(P.validPlan(o),false);assert.equal(P.view(o,now),null);
  }
  const o=planned();o.customerName='Private fixture';o.customerPhone='not-real';o.deliveryAddress={address:'private'};
  assert.equal(P.validPlan(o),true);assert.equal(JSON.stringify(o.krokliPreparation).includes('Private'),false);
});
test('bad timestamps, malformed profiles and impossible calendar data are rejected, never immediate dispatch', () => {
  for (const input of [{ acceptedAt: 'wrong', activationId: 'x' },{acceptedAt:new Date(now).toISOString(),activationId:''},{acceptedAt:new Date(now).toISOString(),activationId:'x',approachMinutes:-1}]) assert.throws(()=>P.plan(order(),input));
  for (const bad of [{serviceDate:'2026-99-99'},{slot:'not-a-slot'},{items:[]},{subtotal:null}]) assert.throws(()=>planned(bad));
  for(const mutation of [p=>p.notifyAt='bad',p=>p.estimatedReadyAt='bad',p=>p.preparationMinutes=NaN,p=>p.attemptedDriverIds=null,p=>p.state='cancelled']) {const o=planned();mutation(o.krokliPreparation);assert.equal(P.due(o,now+20*60_000),false);}
});
test('scheduling is opt-in and only a new acceptance starts the clock; old preparing orders are not backfilled', () => {
  const o=order(),db={};assert.equal(P.recordAcceptance(db,o,'confirmed',now),false);
  db.krokliDispatchSettings={enabled:true,activationId:'new-activation'};
  assert.equal(P.recordAcceptance(db,o,'preparing',now),false);
  assert.equal(P.recordAcceptance(db,o,'confirmed',now),true);
  const first=structuredClone(o.krokliPreparation);assert.equal(P.recordAcceptance(db,o,'preparing',now+5*60_000),false);assert.deepEqual(o.krokliPreparation,first);
  const restored=JSON.parse(JSON.stringify(o));assert.equal(P.due(restored,now+10*60_000),true);
});
test('explicit ready confirmation advances the call and can cover an older acceptance, without backfilling ready orders', () => {
  const db={krokliDispatchSettings:{enabled:true,activationId:'test-activation'}};
  const o=planned();o.status='ready';
  assert.equal(P.recordReady(db,o,'preparing',now+60_000),true);
  assert.equal(P.due(o,now+60_000),true);
  assert.equal(o.krokliPreparation.notifyAt,new Date(now+60_000).toISOString());
  assert.equal(P.view(o,now+60_000).manuallyReadyAt,new Date(now+60_000).toISOString());
  const old=order({status:'ready'});assert.equal(P.recordReady(db,old,'preparing',now),true);
  assert.equal(P.recordReady(db,order({status:'ready'}),'ready',now),false);
  assert.equal(P.recordReady({},order({status:'ready'}),'preparing',now),false);
});
test('manual ready does not replace pending or accepted couriers, payment guards, manual override or other service days', () => {
  const db={krokliDispatchSettings:{enabled:true,activationId:'test-activation'}};
  for(const mutate of [o=>o.kroklyDriver={status:'offered'},o=>o.kroklyDriver={status:'accepted'},o=>o.krokliPreparation.state='manual',o=>o.payment.status='PENDING',o=>o.uberDirect={phase:'sending'},o=>o.amendment={status:'pending'},o=>o.reviewMode=true,o=>o.serviceDate='2026-10-17']) {
    const o=planned();o.status='ready';mutate(o);const before=JSON.stringify(o);
    assert.equal(P.recordReady(db,o,'preparing',now+60_000),false);delete o.kitchenReadyAt;assert.equal(JSON.stringify(o),before);
  }
});
