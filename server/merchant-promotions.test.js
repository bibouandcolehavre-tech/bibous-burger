const test = require('node:test');
const assert = require('node:assert/strict');
const promos = require('./merchant-promotions');
const { bibouPlusOrderPricing } = require('./bibou-plus');

const example = (type, changes = {}) => ({ code:'BURGER10', type, percent:10, productId:type === 'percent_burger' ? 'classique' : null,
  minimum:0, startsAt:null, endsAt:null, usageLimit:null, oncePerCustomer:true, enabled:false, message:'Offre Bibou', ...changes });
const item = (id, price, quantity = 1) => ({ productId:id, price, quantity });

test('les promos burger utilisent le vrai prix du burger composé, pas sa base de 6,90 €', () => {
  const custom = item('custom-burger', 13.9);
  const percent = promos.validate(example('percent_burger', { code:'COMPOSE10', productId:'custom-burger' }));
  assert.deepEqual(promos.discountFor(percent, [custom], 13.9), { products:1.39, delivery:0 });
  const bogo = promos.validate(example('bogo_burger', { code:'COMPOSEDEUX' }));
  assert.deepEqual(promos.discountFor(bogo, [custom, item('classique', 9.9)], 23.8), { products:9.9, delivery:0 });
});

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

test('trois burgers seuls achetés : le quatrième le moins cher est offert, hors suppléments et menus', () => {
  const offer = promos.validate(example('buy3_get1_burger', { code:'QUATREBURGER' }));
  const items = [item('classique', 11.9), item('duck', 13.9), item('dynamite', 11.9), item('hambagu', 11.9), item('taurus', 16.9)];
  assert.throws(() => promos.discountFor(offer, items.slice(0, 3), 37.7), /quatre burgers seuls/);
  assert.deepEqual(promos.discountFor(offer, items, 66.5), { products:9.9, delivery:0 });
  const price = promos.apply({ subtotal:66.5, deliveryFee:0, discountRate:.1 }, offer, items);
  assert.equal(price.promotionDiscount, 9.9);
  assert.equal(price.baseDiscount, 5.66);
  assert.equal(price.total, 50.94);
  assert.deepEqual(promos.discountFor(offer, [item('classique', 9.9, 8)], 79.2), { products:19.8, delivery:0 });
});

test('trois menus burgers achetés : le quatrième le moins cher est offert, hors suppléments et burgers seuls', () => {
  const offer = promos.validate(example('buy3_get1_menu', { code:'QUATREMENUS' }));
  const items = [item('classique-menu', 16.9), item('duck-menu', 18.9), item('montagnes-menu', 16.9), item('dynamite-menu', 16.9), item('classique', 9.9)];
  assert.throws(() => promos.discountFor(offer, [item('classique-menu', 14.9, 3), item('classique', 9.9)], 54.6), /quatre menus burgers/);
  assert.deepEqual(promos.discountFor(offer, items, 79.5), { products:14.9, delivery:0 });
  const price = promos.apply({ subtotal:79.5, deliveryFee:0, discountRate:.1 }, offer, items);
  assert.equal(price.promotionDiscount, 14.9);
  assert.equal(price.baseDiscount, 6.46);
  assert.equal(price.total, 58.14);
  assert.throws(() => promos.discountFor(offer, [item('menu-duo-tenders', 19.9, 4)], 79.6), /quatre menus burgers/);
});

test('le quatrième burger offert peut exclure la bienvenue sans supprimer les avantages Bibou +', () => {
  const offer = promos.validate(example('buy3_get1_burger', { code:'QUATREBURGER', combineWelcome:false }));
  assert.equal(promos.publicView(offer).combineWelcome, false);
  assert.equal(promos.publicView({ ...offer, combineWelcome:undefined }).combineWelcome, true);
  assert.throws(() => promos.validate(example('buy3_get1_burger', { combineWelcome:'false' })), /Cumul/);
  const items = [item('classique', 9.9, 4)];
  const price = promos.apply({ subtotal:39.6, deliveryFee:3.99, discountRate:.1 }, offer, items);
  assert.equal(price.baseDiscount, 0);
  assert.equal(price.discountRate, 0);
  assert.equal(price.total, 33.69);
  const plus = promos.apply({ subtotal:39.6, deliveryFee:0, discountRate:.05 }, offer, items);
  assert.equal(plus.baseDiscount, 1.49);
  assert.equal(plus.total, 28.21);
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

const fridaySaturday = [
  { startsAt:'2026-10-08T22:00:00.000Z', endsAt:'2026-10-09T22:00:00.000Z' },
  { startsAt:'2026-10-10T17:00:00.000Z', endsAt:'2026-10-10T20:00:00.000Z' }
];
test('plages promo : ce soir conservé, samedi strictement 19–22 h à Paris, jamais entre les deux', () => {
  const db = { orders:[] };
  const offer = promos.save(db, { ...example('buy3_get1_burger', { code:'QUATREBURGER', combineWelcome:false,
    endsAt:'2026-10-10T20:00:00.000Z', activeWindows:fridaySaturday, oncePerCustomer:false }), enabled:true, confirmActivation:true });
  for (const iso of ['2026-10-09T16:00:00.000Z','2026-10-09T21:59:59.999Z','2026-10-10T17:00:00.000Z','2026-10-10T19:59:59.999Z']) {
    assert.equal(promos.findByCode(db, offer.code, Date.parse(iso)),offer);
    promos.assertAvailable(db,offer,'fictif',Date.parse(iso));
  }
  for (const iso of ['2026-10-08T21:59:59.999Z','2026-10-09T22:00:00.000Z','2026-10-10T12:00:00.000Z','2026-10-10T16:59:59.999Z','2026-10-10T20:00:00.000Z']) {
    assert.throws(() => promos.findByCode(db,offer.code,Date.parse(iso)),/pas actif/);
    assert.throws(() => promos.assertAvailable(db,offer,'fictif',Date.parse(iso)),/pas actif/);
  }
});

test('plages promo : limites, ISO strict, bornes, chevauchements et champs inconnus refusés', () => {
  const input = example('percent_order', { startsAt:fridaySaturday[0].startsAt, endsAt:fridaySaturday[1].endsAt });
  for (const activeWindows of [null,{},Array(9).fill(fridaySaturday[0]),[{ startsAt:null, endsAt:null }],
    [{ ...fridaySaturday[0], startsAt:'2026-10-09T19:00' }],
    [{ startsAt:fridaySaturday[0].endsAt, endsAt:fridaySaturday[0].startsAt }],
    [{ ...fridaySaturday[0], startsAt:'2026-10-08T20:00:00.000Z' }],
    [{ ...fridaySaturday[1], endsAt:'2026-10-11T20:00:00.000Z' }],
    [fridaySaturday[0],fridaySaturday[0]], [{ ...fridaySaturday[0], unexpected:true }]]) {
    assert.throws(() => promos.validate({ ...input, activeWindows }),/plage/i);
  }
  assert.deepEqual(promos.validate({ ...input, activeWindows:[...fridaySaturday].reverse() }).activeWindows,fridaySaturday);
  assert.equal(promos.validate(input).activeWindows,undefined,'les anciennes promos restent inchangées');
});
