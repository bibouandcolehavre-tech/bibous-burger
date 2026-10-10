const test = require('node:test');
const assert = require('node:assert/strict');
const { displayedProductOffer, productOfferForService, repriceOfferCart } = require('../product-offer');
const { validateAndPriceOrderItems, availabilityCatalog } = require('./catalog');
const { applyProductStock } = require('../stock-client');
const { publicNews } = require('./news');
const { DEFAULT_NEWS } = require('../news-config');
const before = new Date('2026-10-10T12:00:00.000Z');
const context = { serviceDate: '2026-10-10', slot: '19:00' };
const item = (productId = 'dynamite', extra = []) => ({ productId, quantity: 1, price: 0, selections: [
  { groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'roquette' },
  { groupId: 'sauces', id: 'fixed-dynamite' }, ...extra,
  ...(productId.endsWith('-menu') ? [{ groupId: 'drink', id: 'coca' }] : []),
] });
test('Dynamite seul : précommande avant 19 h et commande du service à 9,90 €, menu intact', () => {
  for (const now of [before, new Date('2026-10-10T17:01:00Z'), new Date('2026-10-10T19:59:59Z')]) {
    assert.equal(validateAndPriceOrderItems([item()], {}, context, now).subtotal, 9.9);
    assert.equal(validateAndPriceOrderItems([item('dynamite-menu')], {}, context, now).subtotal, 16.9);
  }
  const result = validateAndPriceOrderItems([{ ...item(), quantity: 3 }], {}, context, before);
  assert.equal(result.subtotal, 29.7);
  assert.equal(result.items[0].basePrice, 9.9);
  assert.equal(result.items[0].regularBasePrice, 11.9);
  assert.equal(validateAndPriceOrderItems([item('dynamite', [{ groupId:'extras', id:'cheddar' }])], {}, context, before).subtotal, 10.9);
});
test('Ni autre service ni prix forgé ; le tarif normal revient automatiquement à 22 h', () => {
  for (const invalid of [{serviceDate:'2026-10-11',slot:'19:00'}, {serviceDate:'2026-10-10',slot:'18:40'}, {serviceDate:'2026-10-10',slot:'22:00'}, {}]) {
    assert.equal(validateAndPriceOrderItems([item()], {}, invalid, before).subtotal, 11.9);
    assert.equal(productOfferForService('dynamite', invalid, before), null);
  }
  assert.ok(productOfferForService('dynamite', {...context,slot:'19:00 – 19:30'},before));
  assert.equal(validateAndPriceOrderItems([item()], {}, context, new Date('2026-10-10T20:00:00Z')).subtotal, 11.9);
  assert.equal(displayedProductOffer(new Date('2026-10-09T21:59:59Z')),null);
  assert.throws(()=>validateAndPriceOrderItems([item()],{dynamite:false},context,before),/indisponible/);
});
test('Catalogue web à 9,90 € et revalidation du panier selon le créneau, sans perte de suppléments', () => {
  const catalog = availabilityCatalog({},before);
  const product = applyProductStock({id:'dynamite',price:11.9},catalog);
  assert.equal(product.price,9.9);
  assert.equal(product.regularPrice,11.9);
  const cart = {items:[{product,total:10.9,lineId:'fake-line'}],delivery:{date:context.serviceDate,slot:'19:00'}};
  assert.equal(repriceOfferCart(cart,before).total,10.9);
  const tomorrow = repriceOfferCart({...cart,delivery:{date:'2026-10-11',slot:'19:00'}},before);
  assert.equal(tomorrow.total,12.9);
  assert.equal(tomorrow.items[0].lineId,'fake-line');
  assert.equal(repriceOfferCart({...tomorrow,delivery:cart.delivery},before).total,10.9);
  assert.equal(availabilityCatalog({},new Date('2026-10-10T20:00:00Z')).products.find(p=>p.id==='dynamite').price,11.9);
});
test('Annonce automatique lisible sur Android déjà installé, sans activer le concours', () => {
  const db={merchantPromotions:[],news:{revision:0,items:DEFAULT_NEWS.map(p=>({...p}))}};
  const original=JSON.stringify(db);
  const news=publicNews(db,before);
  assert.equal(news.items[0].id,'epicu');
  assert.match(news.items[0].title,/9,90/);
  assert.match(news.items[0].subtitle,/avant 19 h/);
  assert.ok(news.items[0].subtitle.length<=160);
  assert.equal(new Set(news.items.map(p=>p.id)).size,news.items.length);
  assert.equal(JSON.stringify(db),original);
  assert.deepEqual(publicNews(db,new Date('2026-10-10T20:00:00Z')).items,DEFAULT_NEWS);
});
