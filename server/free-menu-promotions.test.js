const test = require('node:test'), assert = require('node:assert/strict');
const merchant = require('./merchant-promotions'), promo = require('./promo-codes');
const { previewPromotion } = require('../promo-client');
const { PRODUCT_CATALOG } = require('./catalog');
const offer = (db={orders:[]}) => merchant.save(db, {code:'FICTIONALMENU',type:'free_menu',minimum:0,oncePerCustomer:true,enabled:true,combineWelcome:false,confirmActivation:true,message:'Un menu individuel offert, hors livraison et suppléments.'});
const item = (id='classique-menu',quantity=1,extras=0) => ({productId:id,quantity,price:PRODUCT_CATALOG[id].price+extras,options:extras?[{groupId:'extras',id:'cheddar',price:extras}]:[]});
test('one menu: every burger menu and the Solo is eligible, delivery unchanged',()=>{
 const p=offer();
 for (const [id,product] of Object.entries(PRODUCT_CATALOG).filter(([,x])=>x.menu||x.kind==='solo')) {
  const x=item(id),base={subtotal:x.price,deliveryFee:3.99,discountRate:0};
  const actual=merchant.apply(base,p,[x]);assert.equal(actual.discount,product.price,id);assert.equal(actual.total,3.99,id);assert.equal(actual.deliveryFee,3.99,id);
 }
});
test('quantity and other menu lines never multiply the gift',()=>{
 const p=offer();
 assert.equal(merchant.discountFor(p,[item('classique-menu',3)],44.7,4.99).products,14.9);
 const two=[item('classique-menu'),item('duck-menu')];
 const result=merchant.apply({subtotal:33.8,deliveryFee:4.99,discountRate:0},p,two);
 assert.equal(result.promotionDiscount,18.9);assert.equal(result.total,19.89);
});
test('extras, premium sides, added desserts and other products remain payable',()=>{
 const p=offer(),menu=item('classique-menu',1,3.5),side=item('frites-maison');
 const result=merchant.apply({subtotal:22.3,deliveryFee:3.99,discountRate:.1},p,[menu,side]);
 assert.equal(result.promotionDiscount,14.9);assert.equal(result.baseDiscount,0);assert.equal(result.total,11.39);
});
test('naan menu format is included, an added topping stays payable; naan alone and Duo excluded',()=>{
 const p=offer(),naan={productId:'naan-boeuf',quantity:1,price:11.9,options:[{groupId:'naan-format',id:'menu',price:3},{groupId:'extras',id:'cheddar',price:1}]};
 assert.equal(merchant.apply({subtotal:11.9,deliveryFee:0,discountRate:0},p,[naan]).total,1);
 for(const x of [item('classique'),item('menu-duo-tenders'),item('naan-boeuf'),item('drink-coca')])assert.throws(()=>merchant.discountFor(p,[x],x.price),/menu individuel/);
});
test('existing offer price is respected and no gift exceeds its real unit price',()=>{
 const p=offer(),x={...item(),basePrice:12.9,price:13.9,options:[{groupId:'extras',price:1}]};
 assert.equal(merchant.discountFor(p,[x],13.9).products,12.9);
});
test('installed clients receive their existing supported preview shape, including API 2',()=>{
 const db={orders:[]},p=offer(db),items=[item('classique-menu',2)];
 for(const version of [undefined,1,2,3]) {
  const view=merchant.compatiblePreview({...merchant.publicView(p),previewProductDiscount:14.9,previewBaseRate:0},version);
  assert.equal(view.type,'percent_order');assert.equal(view.originalType,'free_menu');
  const actual=previewPromotion({deliveryFee:4.99,discountRate:.1},29.8,view,'delivery');
  assert.equal(actual.total,19.89);assert.equal(actual.deliveryFee,4.99);
 }
});
test('per-customer use rejects paid and pending replays but keeps other recipients eligible',()=>{
 const db={orders:[]},p=offer(db);
 db.orders.push({id:'paid',promotion:{id:p.id},customerId:'one',payment:{status:'PAID'},createdAt:new Date().toISOString()});
 assert.throws(()=>merchant.assertAvailable(db,p,'one'),/déjà utilisé/);assert.doesNotThrow(()=>merchant.assertAvailable(db,p,'two'));
 db.orders.push({id:'pending',promotion:{id:p.id},customerId:'two',status:'awaiting_payment',createdAt:new Date().toISOString()});
 assert.throws(()=>merchant.assertAvailable(db,p,'two'),/déjà utilisé/);
});
test('free pickup settles without a provider; paid delivery cannot be auto-settled',()=>{
 const db={orders:[]},p=offer(db),make=()=>({id:'gift',customerId:'one',status:'awaiting_payment',promotion:p,items:[item()],subtotal:14.9,discount:14.9,deliveryFee:0,total:0});
 const pickup=make();assert.equal(promo.settlePromotionalOrder(pickup,new Date(),db),true);assert.deepEqual([pickup.payment.provider,pickup.payment.amount],['promotion',0]);
 const delivery={...make(),deliveryFee:3.99,total:3.99};assert.equal(promo.settlePromotionalOrder(delivery,new Date(),db),false);assert.equal(delivery.payment,undefined);
 const forged={...make(),items:[item('classique-menu',2)],subtotal:29.8,discount:29.8};assert.throws(()=>promo.settlePromotionalOrder(forged,new Date(),db),/incohérent/);
});
test('pausing, expiry and global caps still apply to free menus',()=>{
 const db={orders:[]},p=offer(db);p.enabled=false;assert.throws(()=>merchant.assertAvailable(db,p,'one'),/pas actif/);
 p.enabled=true;p.endsAt=new Date(Date.now()-1000).toISOString();assert.throws(()=>merchant.assertAvailable(db,p,'one'),/pas actif/);
 p.endsAt=null;p.usageLimit=1;db.orders.push({promotion:{id:p.id},customerId:'one',payment:{status:'PAID'}});assert.throws(()=>merchant.assertAvailable(db,p,'two'),/limite/);
});

test('latest owner direction: free menu is pickup-only, even for an existing delivery subscriber',()=>{
 const p=offer();assert.equal(merchant.publicView(p).pickupOnly,true);assert.doesNotThrow(()=>promo.assertPromotionMethod(merchant.publicView(p),'pickup'));assert.throws(()=>promo.assertPromotionMethod(merchant.publicView(p),'delivery'),/retrait/);
});
