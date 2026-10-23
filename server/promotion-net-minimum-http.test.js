'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs/promises'), os=require('node:os'), path=require('node:path');
const {spawn}=require('node:child_process'), {once}=require('node:events');
const {createCustomerSession}=require('./customer-session'), {parisDateKey}=require('./availability');
const merchant=require('./merchant-promotions'), {previewPromotion}=require('../promo-client');

test('15 EUR net minimum: installed iOS, Android and web previews and final checkout agree', {timeout:25000}, async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-net-minimum-'));
  const file=path.join(folder,'data.json'), providerFile=path.join(folder,'sumup.json');
  const channels=['ios','android','web'], profiles=['regular','welcome','plus'];
  const customers=channels.flatMap(channel=>profiles.map(profile=>({id:`fictional-${channel}-${profile}`,
    name:'Client Test',phone:'+33600000000',points:0,welcomeReward:{status:profile==='welcome'?'available':'used'},
    ...(profile==='plus'?{bibouPlusExpiresAt:new Date(Date.now()+86400000*30).toISOString()}:{})})));
  const db={customers,orders:[],nextOrderNumber:1};
  merchant.save(db,{code:'DYNAMITEDUO',type:'bogo_burger',productId:'dynamite',minimum:15,minimumAfterDiscounts:true,
    startsAt:null,endsAt:null,usageLimit:null,oncePerCustomer:false,enabled:true,combineWelcome:true,
    message:'Dès 15 € après toutes remises, hors livraison.',confirmActivation:true});
  await fs.writeFile(file,JSON.stringify(db)); await fs.writeFile(providerFile,JSON.stringify({checkouts:{}}));
  const child=spawn(process.execPath,['--require',path.join(__dirname,'test-fixtures/sumup-provider.cjs'),path.join(__dirname,'server.js')],{
    cwd:folder,env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',DATA_FILE_PATH:file,FAKE_SUMUP_FILE:providerFile,
      SESSION_SECRET:'net-minimum-test-only',SUMUP_API_KEY:'FAKE',SUMUP_MERCHANT_CODE:'TEST',
      SUMUP_RETURN_URL:'https://example.invalid/return',SUMUP_REDIRECT_URL:'https://example.invalid/app'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null&&child.signalCode===null)await once(child,'exit');await fs.rm(folder,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{let out='',err='';child.stderr.on('data',s=>err+=s);child.stdout.on('data',s=>{
    out+=s;const match=out.match(/http:\/\/localhost:\d+/);if(match)resolve(match[0]+'/api');});child.on('error',reject);child.on('exit',()=>reject(Error(err)));});
  const selections=[{groupId:'protein',id:'viande'},{groupId:'salad',id:'roquette'},{groupId:'sauces',id:'fixed-dynamite'}];
  const burgers={productId:'dynamite',quantity:2,selections};
  for(const channel of channels) for(const profile of profiles){
    const customer=customers.find(c=>c.id===`fictional-${channel}-${profile}`);
    const token=createCustomerSession(customer.id,'net-minimum-test-only');
    const request=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${token}`,
      'Content-Type':'application/json','X-Bibou-Platform':channel},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
    const tomorrow=parisDateKey(new Date(Date.now()+86400000));
    const orderInput={customerId:customer.id,method:'pickup',serviceDate:tomorrow,slot:'19:00',promoCode:'DYNAMITEDUO'};
    for(const method of ['pickup','delivery']){
      const refused=await request('/promotions/validate',{code:'DYNAMITEDUO',method,items:[burgers],minimumAfterDiscounts:false,discountRate:0});
      assert.equal(refused.status,400,JSON.stringify({channel,profile,...refused}));
      assert.match(refused.data.error,/15,00 €.*après toutes les remises, hors livraison/);
    }
    const before=(JSON.parse(await fs.readFile(file))).orders.length;
    const refusedOrder=await request('/orders',{...orderInput,items:[burgers],requestId:`net-refused-${channel}-${profile}`,
      discountRate:0,promotion:{minimum:0,minimumAfterDiscounts:false},total:15});
    assert.equal(refusedOrder.status,400,JSON.stringify(refusedOrder.data));
    assert.equal((JSON.parse(await fs.readFile(file))).orders.length,before);
    const small=[burgers,{productId:'frites-maison',quantity:1,selections:[]}];
    const smallPreview=await request('/promotions/validate',{code:'DYNAMITEDUO',method:'pickup',items:small});
    assert.equal(smallPreview.status,profile==='welcome'?400:200,JSON.stringify(smallPreview.data));
    const items=[burgers,{productId:'frites-cheddar',quantity:1,selections:[]}];
    const result=await request('/promotions/validate',{code:'DYNAMITEDUO',method:'pickup',items});
    assert.equal(result.status,200,JSON.stringify(result.data));
    assert.equal(result.data.promotion.minimum,15);
    assert.equal(result.data.promotion.minimumAfterDiscounts,true);
    const expected={regular:16.8,welcome:15.12,plus:15.96}[profile];
    const legacy=previewPromotion({discountRate:0,deliveryFee:0,total:28.7},28.7,result.data.promotion,'pickup');
    assert.equal(legacy.total,expected);
    const order=await request('/orders',{...orderInput,items,requestId:`net-accepted-${channel}-${profile}`,expectedTotalCents:Math.round(expected*100)});
    assert.equal(order.status,201,JSON.stringify(order.data));assert.equal(order.data.order.total,expected);
    const checkout=await request('/payments/sumup-checkout',{orderId:order.data.order.id});
    assert.equal(checkout.status,201,JSON.stringify(checkout.data));
    assert.equal(JSON.parse(await fs.readFile(providerFile)).checkouts[checkout.data.checkoutId].amount,expected);
  }
});
