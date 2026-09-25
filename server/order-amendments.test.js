const test = require('node:test'), assert = require('node:assert/strict');
const amendments = require('./order-amendments');
const {validateAndPriceOrderItems} = require('./catalog');
const {assertOrderTransition, applyVerifiedCheckout} = require('./sumup-payment');
const push = require('./push-notifications');
const now = Date.parse('2026-09-26T10:00:00Z');
const items = [{productId:'drink-coca',quantity:2,selections:[]}];
const draft = () => ({revision:0,reason:'Coca indisponible',items:[{productId:'drink-perrier',quantity:1,selections:[]}]});
const order = () => ({id:'o1',customerId:'c1',status:'confirmed',serviceDate:'2026-09-26',slot:'19:00',method:'pickup',items:validateAndPriceOrderItems(items).items,subtotal:3.6,total:3.6,discountRate:0,deliveryFee:0,payment:{status:'PAID',checkoutId:'checkout',checkoutReference:'ref',merchantCode:'merchant'}});
const propose = (o,input=draft()) => { const result=amendments.preview(o,input,{},now); return amendments.propose(o,{...input,previewFingerprint:result.fingerprint},{},now); };
test('proposal preserves paid basket, requires current revision and blocks both preparing and direct completion',()=>{
 const o=order();propose(o);assert.equal(o.status,'awaiting_customer');assert.equal(o.total,3.6);assert.equal(o.items[0].productId,'drink-coca');
 for(const status of ['confirmed','preparing','ready','out_for_delivery','delivered'])assert.throws(()=>assertOrderTransition(o,status));
 assert.throws(()=>amendments.decide(o,{revision:0,decision:'accept'},{},now));
 assert.throws(()=>amendments.propose(o,{...draft(),previewFingerprint:'forged'},{},now));
});
test('acceptance applies only server-priced cart, leaves SumUp amount verifiable and is idempotent',()=>{
 const o=order();propose(o);assert.equal(amendments.decide(o,{revision:1,decision:'accept'},{},now),true);
 assert.equal(o.status,'confirmed');assert.equal(o.total,1.8);assert.equal(o.paidTotal,3.6);assert.equal(o.refund.amount,1.8);assert.equal(o.refund.status,'due');
 assert.equal(amendments.decide(o,{revision:1,decision:'accept'},{},now),false);
 applyVerifiedCheckout(o,{id:'checkout',checkout_reference:'ref',amount:3.6,currency:'EUR',merchant_code:'merchant',status:'PAID'},'merchant');
 assert.throws(()=>amendments.preview(o,{...draft(),revision:1},{},now));
 amendments.recordRefund(o,{amount:1.8,reference:'SumUp-test'},now);assert.equal(o.refund.status,'recorded');
 amendments.cancel(o,'cancelled',now);assert.equal(o.refund.amount,1.8);assert.equal(o.refundHistory[0].amount,1.8);
});
test('refusal cancels entire order; expiration and stock changes cannot be accepted',()=>{
 const o=order();propose(o);amendments.decide(o,{revision:1,decision:'refuse'},{},now);assert.equal(o.status,'cancelled');assert.equal(o.refund.amount,3.6);
 assert.throws(()=>amendments.decide(o,{revision:1,decision:'accept'},{},now));
 const expired=order();propose(expired);assert.throws(()=>amendments.decide(expired,{revision:1,decision:'accept'},{},now+31*60000));
 const stock=order();propose(stock);assert.throws(()=>amendments.decide(stock,{revision:1,decision:'accept'},{'drink-perrier':false},now));assert.equal(stock.status,'awaiting_customer');
});
test('discounts preserved; increases, empty baskets, invalid options and altered preview rejected',()=>{
 const o=order();o.discountRate=.1;o.discount=.36;o.total=3.24;
 const preview=amendments.preview(o,draft(),{},now);assert.equal(preview.proposal.total,1.62);assert.equal(preview.proposal.refundAmount,1.62);
 assert.throws(()=>amendments.preview(o,{...draft(),items:[]},{},now));
 assert.throws(()=>amendments.preview(o,{...draft(),items:[{productId:'drink-perrier',quantity:10,selections:[]}]},{},now));
 assert.throws(()=>amendments.preview(o,{...draft(),items:[{productId:'classique',quantity:1,selections:[]}]},{},now));
 assert.throws(()=>amendments.propose(o,{...draft(),reason:'autre',previewFingerprint:preview.fingerprint},{},now));
});
test('revised proposal rejects old response and notifications are distinct for every revision',()=>{
 const o=order(); const db={customers:[{id:'c1',pushPreferences:{service:true}}],orders:[o]};
 const config={enabled:true,platforms:['android']};
 push.registerDevice(db,db.customers[0],{installationId:'11111111-1111-4111-8111-111111111111',secret:'22222222-2222-4222-8222-222222222222',token:'ExpoPushToken[abcdefghijklmno]',platform:'android'},now);
 propose(o);push.queueAmendmentNotification(db,o,config,now);
 propose(o,{...draft(),revision:1,reason:'Autre remplacement',items:[{productId:'drink-coca-cherry',quantity:1,selections:[]}]});push.queueAmendmentNotification(db,o,config,now);
 assert.equal(db.pushNotifications.jobs.filter(j=>j.status==='queued').length,1);assert.equal(db.pushNotifications.jobs.length,2);
 assert.throws(()=>amendments.decide(o,{revision:1,decision:'accept'},{},now));
 assert.equal(o.amendmentHistory[0].status,'superseded');
});
