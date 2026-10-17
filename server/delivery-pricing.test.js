'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { DELIVERY_PRICING, DELIVERY_MAX_KM, DELIVERY_FEE_CENTS, deliveryFeeForDistance } = require('../delivery-pricing');
const A = require('./krokli-driver-account'), S = require('./driver-settlements');
const { bibouPlusOrderPricing } = require('./bibou-plus');
test('approved road-distance tiers preserve all old prices and include 7 km exactly', () => {
  assert.equal(DELIVERY_MAX_KM, 7);
  assert.deepEqual(DELIVERY_FEE_CENTS, [399, 499, 599, 699]);
  for (const [distance, fee] of [[0,3.99],[1.5,3.99],[1.500001,4.99],[3,4.99],[3.000001,5.99],[5,5.99],[5.000001,6.99],[6.5,6.99],[7,6.99],[7.000001,null],[70,null]]) assert.equal(deliveryFeeForDistance(distance), fee, String(distance));
  for (const invalid of [-1,NaN,Infinity,-Infinity,null,undefined,'7',{},[]]) assert.equal(deliveryFeeForDistance(invalid), null);
  assert(Object.isFrozen(DELIVERY_PRICING));
  assert(DELIVERY_PRICING.every(Object.isFrozen));
});
test('7 km Bibou Plus delivery stays free to the customer while the courier keeps the approved 6.99 forfait', () => {
  const pricing = bibouPlusOrderPricing({ subtotal:30, deliveryFee:6.99, active:true, discountRate:0.05 });
  assert.equal(pricing.deliveryFee, 0); assert.equal(pricing.standardDeliveryFee, 6.99);
  const driver={id:'d1',name:'Exemple',username:'exemple'};
  const order={id:'o1',number:1,customerId:'c1',method:'delivery',status:'delivered',payment:{status:'PAID'},deliveryFee:0,standardDeliveryFee:6.99,bibouPlusApplied:true,kroklyDriver:{driverId:'d1',status:'delivered',deliveredAt:'2026-10-17T11:00:00Z'}};
  A.freezeQuote(order); A.recordCompletion(order);
  assert.equal(order.kroklyDriver.financials.driverPayCents,699);
  assert.equal(A.account({orders:[order]},driver,{},new Date('2026-10-17T12:00:00Z')).summary.knownDriverPayCents,699);
  assert.equal(S.earnings({orders:[order]},driver)[0].amountCents,699);
  order.standardDeliveryFee=3.99;
  assert.equal(A.account({orders:[order]},driver,{},new Date('2026-10-17T12:00:00Z')).summary.knownDriverPayCents,699);
});
test('existing frozen courier quotes remain unchanged after the radius extension', () => {
  const order={standardDeliveryFee:5.99,deliveryFee:5.99,kroklyDriver:{}};
  A.freezeQuote(order); order.standardDeliveryFee=6.99;
  assert.equal(A.freezeQuote(order).driverPayCents,599);
});
test('customer entry keeps startup contests, removes only duplicated home cards, and retains voluntary News access', () => {
  const fs=require('node:fs'),path=require('node:path'),read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
  const app=read('App.js'),home=read('CustomerJourneyScreens.js').split('export function CustomerJourneyHome')[1].split('export function CustomerServiceScreen')[0];
  assert.doesNotMatch(home,/ContestEntry|contestEntry|ContestCampaignCards/);
  assert.doesNotMatch(app.split("screen === 'menu') return <CustomerJourneyHome")[1].split('\n')[0],/ContestEntry|contestEntry/);
  assert.match(app.split("screen === 'customer-news')")[1].split('\n')[0],/<ContestEntry /);
  assert.match(read('ContestWelcome.js'),/<ContestCampaignCards /);
  assert.match(read('ContestWelcome.js'),/Entrer dans l’application/);
  assert.doesNotMatch(read('ContestWelcome.js'),/Voir la carte et commander/);
  assert.match(app,/require\('\.\/delivery-pricing'\)/);
  assert.match(read('server/server.js'),/require\('\.\.\/delivery-pricing'\)/);
});
