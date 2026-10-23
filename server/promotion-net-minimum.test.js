const test = require('node:test');
const assert = require('node:assert/strict');
const merchant = require('./merchant-promotions');
const input = { code:'DYNAMITEDUO', type:'bogo_burger', productId:'dynamite', minimum:15,
  minimumAfterDiscounts:true, startsAt:null, endsAt:null, usageLimit:null,
  oncePerCustomer:false, enabled:true, combineWelcome:true, message:'Minimum après remises.' };
const items = [{ productId:'dynamite', price:11.9, quantity:2 }];
const apply = (subtotal, rate=0, deliveryFee=0, changes={}) => merchant.apply(
  { subtotal, discountRate:rate, deliveryFee }, merchant.validate({ ...input, ...changes }), items);

test('minimum net: two Dynamite alone never qualify, including with welcome or delivery fees', () => {
  for (const rate of [0,.05,.1]) for (const deliveryFee of [0,3.99,20]) {
    assert.throws(() => apply(23.8,rate,deliveryFee), /15,00 €.*après toutes les remises, hors livraison/);
  }
});

test('minimum net: extra products qualify only after the actual customer reductions', () => {
  assert.equal(apply(27.7).total,15.8);
  assert.throws(() => apply(27.7,.1), /après toutes les remises/); // 14.22, not 15.80.
  assert.equal(apply(28.7,.1).total,15.12);
  assert.equal(apply(28.7,.05).total,15.96);
  assert.equal(apply(28.7,.1,4.99).total,20.11);
});

test('minimum net: cent boundary and final rounding are exact, no artificial price floor', () => {
  assert.throws(() => apply(26.89), /après toutes les remises/);
  assert.equal(apply(26.9).total,15);
  assert.throws(() => apply(28.56,.1), /après toutes les remises/);
  const exact = apply(28.57,.1);
  assert.equal(exact.total,15);
  assert.equal(exact.promotionDiscount,11.9);
  assert.equal(exact.baseDiscount,1.67);
});

test('minimum net is explicit, validated, public and retained on save; historical offers unchanged', () => {
  const db = { orders:[] };
  const saved = merchant.save(db,{ ...input, confirmActivation:true });
  assert.equal(merchant.publicView(saved).minimumAfterDiscounts,true);
  assert.equal(merchant.save(db,{ ...saved, confirmActivation:true }).minimumAfterDiscounts,true);
  for (const value of ['true',1,null]) assert.throws(() => merchant.validate({ ...input, minimumAfterDiscounts:value }), /Base du minimum/);
  const legacy = merchant.validate({ ...input, minimumAfterDiscounts:false });
  assert.equal(legacy.minimumAfterDiscounts,undefined);
  assert.equal(merchant.publicView(legacy).minimumAfterDiscounts,undefined);
  assert.equal(apply(23.8,.1,0,{ minimumAfterDiscounts:false }).total,10.71);
  assert.equal(apply(23.8,.1,0,{ minimum:0 }).total,10.71);
});
