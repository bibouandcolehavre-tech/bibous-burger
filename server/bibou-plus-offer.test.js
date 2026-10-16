const test=require('node:test'),assert=require('node:assert/strict');
const offer=require('../bibou-plus-offer');
const plus=require('./bibou-plus');
test('Bibou Plus costs 5.99 for exactly 30 days, with no automatic renewal',()=>{
  assert.equal(offer.BIBOU_PLUS_PRICE,5.99);
  assert.equal(plus.BIBOU_PLUS_PRICE,5.99);
  assert.equal(plus.BIBOU_PLUS_DURATION_MS,30*86400000);
  assert.equal(plus.bibouPlusOffer().automaticRenewal,false);
  assert.equal(plus.bibouPlusStatus({}).price,5.99);
});
test('two delivery savings exceed the price; no unfounded average/pickup guarantee',()=>{
  assert.equal(Math.round((3.99*2-5.99)*100),199);
  assert.match(offer.BIBOU_PLUS_VALUE_MESSAGE,/2 livraisons/);
  assert.doesNotMatch(offer.BIBOU_PLUS_VALUE_MESSAGE,/moyenne|2 commandes/);
  assert.match(offer.BIBOU_PLUS_VALUE_DETAIL,/En retrait/);
});
test('suggest only after verified payment, never for members, cancelled, pending, free or review orders',()=>{
  const now=Date.parse('2026-10-16T18:00:00Z');
  const order={total:16.9,status:'confirmed',payment:{status:'PAID'}};
  assert.equal(offer.shouldSuggestBibouPlus(order,{},now),true);
  for(const patch of [{reviewMode:true},{total:0},{status:'cancelled'},{payment:{status:'PENDING'}},{payment:null}])assert.equal(offer.shouldSuggestBibouPlus({...order,...patch},{},now),false);
  assert.equal(offer.shouldSuggestBibouPlus(order,{bibouPlusExpiresAt:'2026-10-17T00:00:00Z'},now),false);
  assert.equal(offer.shouldSuggestBibouPlus(order,{bibouPlusExpiresAt:'2026-10-15T00:00:00Z'},now),true);
  assert.equal(offer.shouldSuggestBibouPlus(order,{isKioskGuest:true},now),false);
});
