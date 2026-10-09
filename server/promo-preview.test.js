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
  for (const type of ['buy3_get1_burger', 'buy3_get1_menu']) {
    assert.equal(previewPromotion(base,19.8,{ ...promotion, type, previewProductDiscount:9.9 },'pickup').total,8.91);
  }
});

test('les bons cadeaux déjà existants restent gratuits et séparés des nouvelles remises', () => {
  const base = { discountRate:.1, discount:1.98, deliveryFee:3.99, total:21.81 };
  const result = previewPromotion(base,19.8,{ code:'TEST', discountPercent:100, freeDelivery:true },'delivery');
  assert.equal(result.total,0);
  assert.equal(result.deliveryFee,0);
  assert.throws(() => previewPromotion(base,19.8,{ id:'x',code:'X',type:'bogo_burger',previewProductDiscount:200 },'pickup'));
});

test('les clients web et Android existants respectent le taux exclusif envoyé par le serveur', () => {
  const base = { discountRate:.1, discount:3.96, deliveryFee:0, total:35.64 };
  const promotion = { id:'offer-1', code:'QUATREBURGER', type:'buy3_get1_burger', combineWelcome:false, previewProductDiscount:9.9, previewBaseRate:0 };
  const result = previewPromotion(base,39.6,promotion,'pickup');
  assert.equal(result.baseDiscount,0);
  assert.equal(result.total,29.7);
  assert.doesNotMatch(result.discountLabel,/bienvenue/);
  assert.equal(previewPromotion(base,39.6,null,'pickup').total,35.64);
});
