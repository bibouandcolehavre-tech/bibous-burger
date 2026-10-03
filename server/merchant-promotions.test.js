const test = require('node:test');
const assert = require('node:assert/strict');
const promos = require('./merchant-promotions');
const { bibouPlusOrderPricing } = require('./bibou-plus');

const example = (type, changes = {}) => ({ code:'BURGER10', type, percent:10, productId:type === 'percent_burger' ? 'classique' : null,
  minimum:0, startsAt:null, endsAt:null, usageLimit:null, oncePerCustomer:true, enabled:false, message:'Offre Bibou', ...changes });
const item = (id, price, quantity = 1) => ({ productId:id, price, quantity });

test('une nouvelle offre reste en pause et exige une confirmation pour être activée', () => {
  const db = { orders:[] };
  const draft = promos.save(db, example('percent_order'));
  assert.equal(draft.enabled, false);
  assert.throws(() => promos.findByCode(db, draft.code), /pas actif/);
  assert.throws(() => promos.save(db, { ...draft, enabled:true }), /Confirme/);
  const enabled = promos.save(db, { ...draft, enabled:true, confirmActivation:true });
  assert.equal(promos.findByCode(db, enabled.code).id, enabled.id);
  assert.throws(() => promos.save(db, { ...draft, enabled:false }), { statusCode:409 });
  assert.throws(() => promos.save(db, example('percent_order', { code:'CHORUS' })), { statusCode:409 });
});

test('le code et les limites sont validés côté serveur', () => {
  const db = { orders:[] };
  const code = promos.save(db, { ...example('percent_order', { code:'MIDI15', percent:15, minimum:25, usageLimit:1 }), enabled:true, confirmActivation:true });
  assert.throws(() => promos.discountFor(code, [item('classique', 9.9)], 9.9), /au moins/);
  promos.assertAvailable(db, code, 'client-1');
  db.orders.push({ promotion:{ id:code.id, code:code.code }, customerId:'client-1', payment:{ status:'PAID' }, status:'confirmed' });
  assert.throws(() => promos.assertAvailable(db, code, 'client-2'), { statusCode:409 });
  assert.throws(() => promos.save(db, example('percent_order', { code:'MIDI15' })), { statusCode:409 });
});

test('un burger offert est le moins cher, hors menus et suppléments; bienvenue sur le solde', () => {
  const bogo = promos.validate(example('bogo_burger', { code:'DUOBURGER' }));
  const items = [item('classique', 11.9), item('duck', 14.9), item('classique-menu', 14.9)];
  const subtotal = 41.7;
  assert.deepEqual(promos.discountFor(bogo, items, subtotal), { products:9.9, delivery:0 });
  const price = promos.apply(bibouPlusOrderPricing({ subtotal, deliveryFee:0, active:false, discountRate:.1 }), bogo, items);
  assert.equal(price.promotionDiscount, 9.9);
  assert.equal(price.baseDiscount, 3.18);
  assert.equal(price.total, 28.62);
  assert.throws(() => promos.discountFor(bogo, [item('classique-menu', 14.9)], 14.9), /deux burgers seuls/);
});

test('la remise produit ne réduit pas les suppléments; livraison offerte se cumule avec la bienvenue', () => {
  const burger = promos.validate(example('percent_burger'));
  const items = [item('classique', 11.9, 2), item('drink-coca', 1.8)];
  const subtotal = 25.6;
  const price = promos.apply(bibouPlusOrderPricing({ subtotal, deliveryFee:0, active:false, discountRate:.1 }), burger, items);
  assert.equal(price.promotionDiscount, 1.98);
  assert.equal(price.baseDiscount, 2.36);
  assert.equal(price.total, 21.26);
  const delivery = promos.validate(example('free_delivery', { code:'LIVRAISON' }));
  const shipped = promos.apply(bibouPlusOrderPricing({ subtotal:30, deliveryFee:4.99, active:false, discountRate:.1 }), delivery, [item('classique', 30)]);
  assert.equal(shipped.total, 27);
  assert.equal(shipped.promotionDeliveryDiscount, 4.99);
});
