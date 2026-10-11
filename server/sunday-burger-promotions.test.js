const test = require('node:test');
const assert = require('node:assert/strict');
const promos = require('./merchant-promotions');
const { promotionForCode, assertPromotionMethod, applyPromotion } = require('./promo-codes');
const { previewPromotion } = require('../promo-client');
const { validateAndPriceOrderItems } = require('./catalog');
const { publicNews } = require('./news');
const { DEFAULT_NEWS } = require('../news-config');
const now = new Date('2026-10-11T12:00:00.000Z');
const serviceConditions = { serviceDate:'2026-10-11', startSlot:'19:00', endSlot:'21:00', onlineOnly:true };
const context = { method:'pickup', serviceDate:'2026-10-11', slot:'19:00' };
const definitions = [['DYNAMITE10','dynamite'], ['GROSLARD10','gros-lard']];
const fixture = () => {
  const db = { orders:[], customers:[], merchantPromotions:[] };
  for (const [code, productId] of definitions) promos.save(db, { code, productId, type:'percent_burger', percent:10,
    minimum:0, startsAt:'2026-10-10T22:00:00.000Z', endsAt:'2026-10-11T19:00:00.000Z',
    usageLimit:null, oncePerCustomer:false, combineWelcome:true, message:'Offre du dimanche',
    serviceConditions, enabled:true, confirmActivation:true }, now);
  return db;
};
const item = (productId, quantity = 1, extra = []) => ({ productId, quantity, selections:[
  { groupId:'protein', id:'viande' }, { groupId:'salad', id:'roquette' },
  { groupId:'sauces', id:productId.startsWith('dynamite') ? 'fixed-dynamite' : 'mayo' },
  ...(productId.endsWith('-menu') ? [{ groupId:'drink', id:'coca' }] : []), ...extra
] });

test('dimanche : plusieurs burgers de la recette choisie, jamais les deux offres, hors menus et suppléments', () => {
  const db = fixture();
  const cart = validateAndPriceOrderItems([item('dynamite',2),item('gros-lard',2),item('dynamite-menu'),
    item('gros-lard',1,[{groupId:'extras',id:'cheddar'}])], {}, context, now);
  assert.equal(cart.subtotal,77.4);
  for (const [code,discount] of [['DYNAMITE10',2.38],['GROSLARD10',3.57]]) {
    const offer = promos.publicView(promos.findByCode(db,code,now.getTime()));
    const pricing = applyPromotion({subtotal:cart.subtotal,deliveryFee:3.99,discountRate:.1},offer,'delivery',cart.items,context);
    assert.equal(pricing.promotionDiscount,discount);
    const client = previewPromotion({deliveryFee:3.99,discountRate:.1},cart.subtotal,
      {...offer,previewProductDiscount:discount,previewBaseRate:.1},'delivery');
    assert.equal(client.total,pricing.total,'web et Android déjà installés montrent le même prix');
    assert.equal(pricing.baseDiscount,Math.round((cart.subtotal-discount)*10)/100);
    assert.equal(pricing.deliveryFee,3.99);
  }
  assert.throws(()=>promotionForCode(['DYNAMITE10','GROSLARD10'],db),/invalide/);
  assert.throws(()=>promotionForCode('DYNAMITE10 GROSLARD10',db),/pas valide/);
  const offer = promos.publicView(promos.findByCode(db,'DYNAMITE10',now.getTime()));
  const menu = validateAndPriceOrderItems([item('dynamite-menu',2)],{},context,now);
  assert.throws(()=>promos.discountFor(offer,menu.items,menu.subtotal),/burger concerné/);
  const single = validateAndPriceOrderItems([item('dynamite')],{},context,now);
  assert.equal(applyPromotion({subtotal:11.9,deliveryFee:0,discountRate:0},offer,'pickup',single.items,context).total,10.71);
  assert.equal(applyPromotion({subtotal:11.9,deliveryFee:0,discountRate:.1},offer,'pickup',single.items,context).total,9.64);
});

test('dimanche : précommande autorisée, restrictions du service et du canal vérifiées à la commande', () => {
  const offer = promos.publicView(fixture().merchantPromotions[0]);
  for (const method of ['pickup','delivery']) {
    assert.doesNotThrow(()=>assertPromotionMethod(offer,method,context));
    assert.doesNotThrow(()=>assertPromotionMethod(offer,method,{...context,slot:'20:40 – 21:00'}));
    assert.doesNotThrow(()=>assertPromotionMethod(offer,method,{}, {preview:true}),'compatibilité aperçu Android ancien');
  }
  for (const changes of [{serviceDate:'2026-10-12'},{slot:'18:40'},{slot:'21:00'},{slot:'22:00'},
    {slot:'29:00'},{tableReservation:{guests:2,note:''}},{dineIn:true},{isKiosk:true},{kioskService:'takeaway'}])
    assert.throws(()=>assertPromotionMethod(offer,'pickup',{...context,...changes}));
  assert.throws(()=>assertPromotionMethod(offer,'reservation',context));
  assert.throws(()=>assertPromotionMethod(offer,'pickup',{}),'pas de commande sans créneau');
  const db = fixture();
  assert.throws(()=>promos.findByCode(db,'DYNAMITE10',Date.parse('2026-10-11T19:00:00Z')),/pas actif/);
});

test('conditions de service : dates, heures et champs arbitraires refusés sans modifier les anciennes offres', () => {
  const input = fixture().merchantPromotions[0];
  const {createdAt,updatedAt,...fields} = input;
  for (const patch of [{serviceDate:'2026-02-30'},{startSlot:'19:60'},{endSlot:'29:00'},
    {startSlot:'22:00'},{onlineOnly:'true'},{unknown:true}])
    assert.throws(()=>promos.validate({...fields,serviceConditions:{...serviceConditions,...patch}}));
  const {serviceConditions:unused,...old} = fields;
  assert.equal(promos.validate(old).serviceConditions,undefined);
});

test('annonce des deux codes : Android et site compatibles, fin du service dimanche à 21 h, pas de concours', () => {
  const db=fixture(), before=JSON.stringify(db);
  const headline=publicNews(db,now).items[0];
  assert.equal(headline.id,'epicu');
  assert.match(headline.title,/−10 %/);
  assert.match(headline.subtitle,/DYNAMITE10 ou GROSLARD10/);
  assert.match(headline.subtitle,/Plusieurs burgers seuls de la même recette/);
  assert.match(headline.subtitle,/collect\/livraison/);
  assert.match(headline.subtitle,/Bienvenue cumulable/);
  assert.ok(headline.subtitle.length <= 160);
  assert.equal(JSON.stringify(db),before);
  assert.deepEqual(publicNews(db,new Date('2026-10-11T19:00:00Z')).items,DEFAULT_NEWS);
  for (const patch of [{enabled:false},{combineWelcome:false},{productId:'classique'},{percent:20},{serviceConditions:{...serviceConditions,onlineOnly:false}}]) {
    const changed=fixture();Object.assign(changed.merchantPromotions[0],patch);
    assert.deepEqual(publicNews(changed,now).items,DEFAULT_NEWS);
  }
});
