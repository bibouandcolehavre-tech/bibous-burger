'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {createCustomerSession}=require('./customer-session'),{parisDateKey}=require('./availability');
test('automatic Dynamite: catalogue, real isolated order and checkout price agree; old clients and orders untouched',{timeout:20000},async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-auto-dynamite-')),file=path.join(folder,'data.json'),providerFile=path.join(folder,'sumup.json');
 const customer={id:'automatic-fictional-client',name:'Client Test',phone:'+33600000000',points:0,welcomeReward:{status:'used'}};
 await fs.writeFile(file,JSON.stringify({customers:[customer],orders:[],nextOrderNumber:1}));await fs.writeFile(providerFile,JSON.stringify({checkouts:{}}));
 const child=spawn(process.execPath,['--require',path.join(__dirname,'test-fixtures/sumup-provider.cjs'),path.join(__dirname,'server.js')],{
  cwd:folder,env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',DATA_FILE_PATH:file,FAKE_SUMUP_FILE:providerFile,
   RESTAURANT_DASHBOARD_PASSWORD:'dashboard-test',SESSION_SECRET:'auto-test-secret',SUMUP_API_KEY:'FAKE',SUMUP_MERCHANT_CODE:'TEST',SUMUP_RETURN_URL:'https://example.invalid/return',SUMUP_REDIRECT_URL:'https://example.invalid/app'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(folder,{recursive:true,force:true});});
 const base=await new Promise((resolve,reject)=>{let output='',error='';child.stderr.on('data',v=>error+=v);child.stdout.on('data',v=>{output+=v;const match=output.match(/http:\/\/localhost:\d+/);if(match)resolve(match[0]+'/api');});child.on('exit',()=>reject(Error(error)));child.on('error',reject);});
 const token=createCustomerSession(customer.id,'auto-test-secret');
 const request=async(route,method='GET',body,auth=token,automatic=true)=>{const res=await fetch(base+route,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json',...(automatic?{'X-Bibou-Automatic-Offers':'1'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:res.status,data:await res.json(),headers:res.headers};};
 const admin=(await request('/dashboard/auth/login','POST',{password:'dashboard-test'},'')).data.token;
 const offer={code:'DYNAMITEDUO',type:'bogo_burger',productId:'dynamite',automatic:true,minimum:0,startsAt:null,endsAt:null,usageLimit:null,oncePerCustomer:false,enabled:true,combineWelcome:true,message:'Ajoute 2 Dynamite seuls pour avoir le deuxième offert.',confirmActivation:true};
 assert.equal((await request('/dashboard/promotions','POST',offer,'')).status,401);
 assert.equal((await request('/dashboard/promotions','POST',offer,admin)).status,200);
 assert.equal((await request('/catalog')).data.automaticPromotions,undefined);
 const catalog=(await request('/catalog?automaticOffers=1')).data;assert.equal(catalog.automaticPromotions.length,1);
 assert.equal(catalog.products.find(p=>p.id==='dynamite').automaticOffer.automatic,true);
 assert.equal(catalog.products.find(p=>p.id==='dynamite-menu').automaticOffer,null);
 const selections=[{groupId:'protein',id:'viande'},{groupId:'salad',id:'roquette'},{groupId:'sauces',id:'fixed-dynamite'}];
 const input=(count,id,expectedTotalCents)=>({customerId:customer.id,method:'pickup',serviceDate:parisDateKey(new Date(Date.now()+86400000)),slot:'19:00',requestId:id,items:[{productId:'dynamite',quantity:count,selections}],...(expectedTotalCents===undefined?{}:{expectedTotalCents})});
 const one=await request('/orders','POST',input(1,'auto-dynamite-one-0001',1190));assert.equal(one.status,201,JSON.stringify(one.data));assert.equal(one.data.order.total,11.9);assert.equal(one.data.order.promotion,undefined);
 const two=await request('/orders','POST',input(2,'auto-dynamite-two-0002',1190));assert.equal(two.status,201,JSON.stringify(two.data));assert.equal(two.data.order.subtotal,23.8);assert.equal(two.data.order.promotionDiscount,11.9);assert.equal(two.data.order.total,11.9);assert.equal(two.data.order.items[0].quantity,2);assert.equal(two.data.order.promotion.automatic,true);
 assert.equal((await request('/orders','POST',input(2,'auto-dynamite-two-0002',1190))).data.reused,true);
 const checkout=await request('/payments/sumup-checkout','POST',{orderId:two.data.order.id});assert.equal(checkout.status,201,JSON.stringify(checkout.data));
 const fake=JSON.parse(await fs.readFile(providerFile,'utf8'));assert.equal(fake.checkouts[checkout.data.checkoutId].amount,11.9);
 const legacy=await request('/orders','POST',input(2,'auto-dynamite-old-0003'),token,false);assert.equal(legacy.status,201);assert.equal(legacy.data.order.total,23.8);assert.equal(legacy.data.order.promotion,undefined);
 for(const count of [3,4]) { const result=await request('/orders','POST',input(count,`auto-dynamite-${count}-0004`,2380));assert.equal(result.status,201,JSON.stringify(result.data));assert.equal(result.data.order.total,23.8);assert.equal(result.data.order.items[0].quantity,count); }
 const extra=input(2,'auto-dynamite-extra-0005',1390);extra.items[0].selections=[...selections,{groupId:'extras',id:'cheddar'}];assert.equal((await request('/orders','POST',extra)).data.order.total,13.9);
 const before=(JSON.parse(await fs.readFile(file))).orders.length;
 for(const amount of [1,2380,-1,11.9]){const result=await request('/orders','POST',input(2,'auto-dynamite-price-0006-'+String(amount).replace('.','-'),amount));assert.equal(result.status,amount<0||!Number.isInteger(amount)?400:409,JSON.stringify(result.data));}
 assert.equal((JSON.parse(await fs.readFile(file))).orders.length,before);
 assert.equal((await request('/dashboard/promotions','POST',{...offer,code:'OTHER10',type:'percent_order',percent:10,automatic:false,productId:null},admin)).status,200);
 const entered={...input(2,'auto-dynamite-coupon-0007',1190),promoCode:'OTHER10'};const better=await request('/orders','POST',entered);assert.equal(better.status,201,JSON.stringify(better.data));assert.equal(better.data.order.promotion.code,'DYNAMITEDUO');assert.equal(better.data.order.total,11.9);
 const current=(await request('/dashboard/promotions','GET',undefined,admin)).data.promotions.find(p=>p.code==='DYNAMITEDUO');
 assert.equal((await request('/dashboard/promotions','PATCH',{...current,enabled:false},admin)).status,200);
 assert.deepEqual((await request('/catalog?automaticOffers=1')).data.automaticPromotions,[]);
 assert.equal((await request('/orders','POST',input(2,'auto-dynamite-paused-0008',1190))).status,409);
 assert.equal((await request('/orders','POST',input(2,'auto-dynamite-paused-0009',2380))).data.order.total,23.8);
 const preflight=await fetch(base+'/orders',{method:'OPTIONS'});assert.match(preflight.headers.get('access-control-allow-headers'),/X-Bibou-Automatic-Offers/);
});
