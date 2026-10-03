const test = require('node:test');
const assert = require('node:assert/strict');
const { previewPromotion } = require('../promo-client');

test('le client affiche un code avec paiement et calcule la bienvenue après la promotion', () => {
  const base = { discountRate:.1, discount:1.98, deliveryFee:0, total:17.82 };
  const promotion = { id:'offer-1', code:'DUOBURGER', type:'bogo_burger', previewProductDiscount:9.9, previewBaseRate:.1 };
  const result = previewPromotion(base,19.8,promotion,'pickup');
  assert.equal(result.promotionDiscount,9.9);
  assert.equal(result.baseDiscount,.99);
  assert.equal(result.total,8.91);
  assert.match(result.discountLabel,/bienvenue/);
  assert.equal(previewPromotion(base,19.8,{ ...promotion, type:'free_delivery', previewProductDiscount:0 },'delivery').deliveryFee,0);
});

test('les bons cadeaux déjà existants restent gratuits et séparés des nouvelles remises', () => {
  const base = { discountRate:.1, discount:1.98, deliveryFee:3.99, total:21.81 };
  const result = previewPromotion(base,19.8,{ code:'TEST', discountPercent:100, freeDelivery:true },'delivery');
  assert.equal(result.total,0);
  assert.equal(result.deliveryFee,0);
  assert.throws(() => previewPromotion(base,19.8,{ id:'x',code:'X',type:'bogo_burger',previewProductDiscount:200 },'pickup'));
});
