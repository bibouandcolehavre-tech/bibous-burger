'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const merchant=require('./merchant-promotions'),auto=require('./automatic-promotions');
function database(changes={}) { const db={orders:[]}; merchant.save(db,{code:'DYNAMITEDUO',type:'bogo_burger',productId:'dynamite',automatic:true,
  minimum:0,startsAt:null,endsAt:null,usageLimit:null,oncePerCustomer:false,enabled:true,combineWelcome:true,message:'Ajoute 2 Dynamite seuls pour avoir le deuxième offert.',confirmActivation:true,...changes});return db; }
const cart=(count=2,extra=0)=>[{productId:'dynamite',quantity:count,price:11.9+extra}, {productId:'dynamite-menu',quantity:1,price:16.9}];
function select(db,items,rate=0,fee=0) { const subtotal=items.reduce((s,i)=>s+i.price*i.quantity,0);const base={subtotal,deliveryFee:fee,discountRate:rate,discount:Math.round(subtotal*rate*100)/100,total:Math.round((subtotal*(1-rate)+fee)*100)/100};return auto.select(db,items,{method:'pickup'}, {promotion:null,pricing:base},base); }
test('automatic offer requires an explicitly scoped burger and unlimited use; legacy BOGO remains unchanged',()=>{
 for(const changes of [{productId:null},{productId:'dynamite-menu'},{productId:'unknown'},{type:'percent_order'},{oncePerCustomer:true},{usageLimit:10},{automatic:'true'}])assert.throws(()=>database(changes));
 const legacy=merchant.validate({code:'BOGO',type:'bogo_burger',oncePerCustomer:false,enabled:false});assert.equal(legacy.productId,null);assert.equal(legacy.automatic,undefined);
 assert.equal(merchant.discountFor(legacy,[{productId:'dynamite',quantity:1,price:11.9},{productId:'classique',quantity:1,price:9.9}],21.8).products,9.9);
 assert.equal(auto.supported({headers:{'x-bibou-automatic-offers':'1'}}),true);assert.equal(auto.supported({headers:{}}),false);
});
test('one remains full price; two/three/four/five require the customer’s actual quantities',()=>{
 const db=database();for(const count of [1,2,3,4,5]) {const items=cart(count),before=structuredClone(items);const result=select(db,items);
  assert.equal(result.pricing.total,Math.round(((count-Math.floor(count/2))*11.9+16.9)*100)/100);assert.deepEqual(items,before);
  assert.equal(Boolean(result.automatic),count>=2);if(count>=2)assert.equal(result.pricing.promotionDiscount,Math.floor(count/2)*11.9);
 }
});
test('menus, unrelated burgers, supplements and shipping are never gifted',()=>{
 const db=database(),offer=auto.publicOffers(db)[0];
 assert.throws(()=>merchant.discountFor(offer,[{productId:'dynamite',price:11.9,quantity:1},{productId:'classique',price:9.9,quantity:2}],31.7),/deux Dynamite Chicken/);
 assert.equal(select(db,cart(2,2),0,3.99).pricing.total,36.79);
 const split=[{productId:'dynamite',quantity:1,price:14.9},{productId:'dynamite',quantity:1,price:11.9}];assert.equal(select(db,split).pricing.total,14.9);
 assert.equal(select(db,[{productId:'dynamite-menu',quantity:2,price:16.9}]).pricing.total,33.8);
});
test('welcome and Bibou Plus use only the paid remainder, not the free burger',()=>{
 assert.equal(select(database(),[{productId:'dynamite',quantity:2,price:11.9}],.1).pricing.total,10.71);
 assert.equal(select(database(),[{productId:'dynamite',quantity:2,price:11.9}],.05).pricing.total,11.30);
});
test('no expiration, future starts, paused offers and strict opt-in payload',()=>{
 const now=Date.now(),db=database({startsAt:new Date(now+60000).toISOString()});assert.deepEqual(auto.publicOffers(db,now),[]);
 assert.equal(auto.publicOffers(db,now+60000).length,1);assert.equal(auto.publicOffers(db,now+365*86400000).length,1);
 const publicOffer=auto.publicOffers(db,now+60000)[0];assert.equal(publicOffer.endsAt,null);assert.equal(publicOffer.automatic,true);assert.equal(publicOffer.createdAt,undefined);
 db.merchantPromotions[0].enabled=false;assert.deepEqual(auto.publicOffers(db,now+60000),[]);
});
test('a better explicit promotion is retained; two product promotions never stack',()=>{
 const db=database(),items=[{productId:'dynamite',quantity:2,price:11.9}];
 const base={subtotal:23.8,deliveryFee:0,discountRate:0,total:23.8};const promotion={code:'ANOTHER',id:'explicit'};
 assert.equal(auto.select(db,items,{method:'pickup'},{promotion,pricing:{...base,total:5}},base).promotion,promotion);
 assert.equal(auto.select(db,items,{method:'pickup'},{promotion,pricing:{...base,total:11.9}},base).promotion,promotion);
 assert.equal(auto.select(db,items,{method:'pickup'},{promotion,pricing:{...base,total:20}},base).pricing.total,11.9);
});
