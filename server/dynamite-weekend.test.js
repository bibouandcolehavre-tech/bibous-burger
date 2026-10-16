const test = require('node:test');
const assert = require('node:assert/strict');
const { displayedProductOffer, productOfferForService, repriceOfferCart } = require('../product-offer');
const { availabilityCatalog, validateAndPriceOrderItems } = require('./catalog');
const { applyProductStock } = require('../stock-client');
const merchant = require('./merchant-promotions');
const { publicNews } = require('./news');
const { DEFAULT_NEWS } = require('../news-config');
const now = new Date('2026-10-16T17:45:00Z');
const item = (productId = 'dynamite', extra = [], quantity = 1) => ({ productId, quantity, selections: [
  {groupId:'protein',id:'viande'}, {groupId:'salad',id:'roquette'},
  {groupId:'sauces',id:productId === 'hambagu' ? 'fixed-hambagu' : 'fixed-dynamite'}, ...extra,
  ...(productId.endsWith('-menu') ? [{groupId:'drink',id:'coca'}] : []),
] });
const promotion = { id:'weekend-test', type:'percent_burger', productId:'dynamite', percent:10, minimum:0, combineWelcome:true };
test('Dynamite 9.90 Friday through Sunday; all other burgers and menu retain their prices', () => {
  for (const serviceDate of ['2026-10-16','2026-10-17','2026-10-18']) {
    const context = {serviceDate,slot:'19:00'};
    const priced = validateAndPriceOrderItems([item()], {}, context, now);
    assert.equal(priced.subtotal,9.9);
    assert.equal(priced.items[0].basePrice,9.9);
    assert.equal(priced.items[0].regularBasePrice,11.9);
    assert.equal(validateAndPriceOrderItems([item('dynamite-menu')],{},context,now).subtotal,16.9);
    assert.equal(validateAndPriceOrderItems([item('hambagu')],{},context,now).subtotal,11.9);
  }
});
test('DYNAMITE10 gives 8.91, plus welcome gives 8.02; paid extras and menus are not discounted by this code', () => {
  const context = {serviceDate:'2026-10-16',slot:'19:00'};
  for (const [extra, expected] of [[[],8.91], [[{groupId:'extras',id:'cheddar'}],9.91]]) {
    const priced = validateAndPriceOrderItems([item('dynamite',extra)],{},context,now);
    const result = merchant.apply({...priced,deliveryFee:0,discountRate:0},promotion,priced.items);
    assert.equal(result.total,expected);
    assert.equal(result.promotionDiscount,.99);
  }
  const priced = validateAndPriceOrderItems([item()],{},context,now);
  const welcome = merchant.apply({...priced,deliveryFee:0,discountRate:.1},promotion,priced.items);
  assert.equal(welcome.total,8.02);
  assert.equal(welcome.baseDiscount,.89);
  const mixed = validateAndPriceOrderItems([item(),item('dynamite-menu')],{},context,now);
  assert.equal(merchant.apply({...mixed,deliveryFee:3.99,discountRate:0},promotion,mixed.items).total,29.8);
  assert.throws(()=>merchant.discountFor(promotion,[{productId:'dynamite-menu',quantity:1,price:16.9}],16.9),/burger concerné/);
});
test('Catalogue compatible with already-installed October 10 cart logic, no new mobile binary', () => {
  const product = applyProductStock({id:'dynamite',price:11.9},availabilityCatalog({},now));
  assert.equal(product.price,9.9);
  assert.equal(product.regularPrice,undefined);
  assert.equal(product.productOffer,undefined);
  // Exact fallback expression from the installed October 10 cart repricer.
  const legacyRegularPrice = product.regularPrice ?? (product.productOffer ? 11.9 : product.price);
  assert.equal(legacyRegularPrice,9.9);
  const cart={items:[{product,total:10.9,quantity:2}],delivery:{date:'2026-10-17',slot:'19:00'}};
  assert.equal(repriceOfferCart(cart,now).total,21.8);
});
test('Boundaries use Paris time and expire automatically; unrelated service dates cannot obtain 9.90', () => {
  assert.equal(displayedProductOffer(new Date('2026-10-15T21:59:59Z')),null);
  assert.equal(displayedProductOffer(new Date('2026-10-18T21:59:59Z')).price,9.9);
  assert.equal(displayedProductOffer(new Date('2026-10-18T22:00:00Z')),null);
  assert.equal(productOfferForService('dynamite',{serviceDate:'2026-10-19',slot:'19:00'},now),null);
  assert.equal(productOfferForService('dynamite',{},now),null);
  assert.equal(availabilityCatalog({},new Date('2026-10-18T22:00:00Z')).products.find(p=>p.id==='dynamite').price,11.9);
  assert.throws(()=>validateAndPriceOrderItems([item()],{dynamite:false},{serviceDate:'2026-10-16',slot:'19:00'},now),/indisponible/);
});
test('News states weekend price, code and scope rather than old single evening hours', () => {
  const db={news:{revision:0,items:DEFAULT_NEWS},merchantPromotions:[]};
  const before=JSON.stringify(db);
  const headline=publicNews(db,now).items[0];
  assert.match(headline.title,/9,90/);
  assert.match(headline.subtitle,/DYNAMITE10 : 8,91/);
  assert.match(headline.subtitle,/18\/10 à 23 h 59/);
  assert.doesNotMatch(headline.subtitle,/Ce soir|19–22/);
  assert.ok(headline.subtitle.length<=160);
  assert.equal(JSON.stringify(db),before);
});
