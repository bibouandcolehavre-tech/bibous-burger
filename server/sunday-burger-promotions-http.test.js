const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {createCustomerSession}=require('./customer-session');
const promos=require('./merchant-promotions');
const {previewPromotion}=require('../promo-client');
test('dimanche HTTP : codes sur Android/web, bienvenue, livraison, exclusions et aucun fournisseur réel', {timeout:20000}, async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-sunday-promo-'));
  const file=path.join(dir,'data.json'),providerFile=path.join(dir,'sumup.json');
  const customer={id:'fictional-regular',name:'Client Fictif',phone:'+33600000000',points:0,
    address:'1 rue fictive',postalCode:'76600',city:'Le Havre',welcomeReward:{status:'used'}};
  const newcomer={...customer,id:'fictional-new',phone:'+33600000001',welcomeReward:{status:'available'}};
  const db={customers:[customer,newcomer],orders:[],nextOrderNumber:1,merchantPromotions:[]};
  for(const [code,productId] of [['DYNAMITE10','dynamite'],['GROSLARD10','gros-lard']])
    promos.save(db,{code,productId,type:'percent_burger',percent:10,minimum:0,
      startsAt:'2026-10-10T22:00:00.000Z',endsAt:'2026-10-11T19:00:00.000Z',usageLimit:null,
      oncePerCustomer:false,enabled:true,confirmActivation:true,combineWelcome:true,message:'Offre test',
      serviceConditions:{serviceDate:'2026-10-11',startSlot:'19:00',endSlot:'21:00',onlineOnly:true}},new Date('2026-10-11T12:00:00Z'));
  await fs.writeFile(file,JSON.stringify(db));await fs.writeFile(providerFile,JSON.stringify({checkouts:{}}));
  const deviceSecret='fictional-kiosk-token-for-tests-only-123456789';
  const child=spawn(process.execPath,['--require',path.join(__dirname,'test-fixtures/sunday-promo-clock.cjs'),
    '--require',path.join(__dirname,'test-fixtures/sumup-provider.cjs'),path.join(__dirname,'server.js')],{
    cwd:dir,env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',LISTEN_HOST:'127.0.0.1',DATA_FILE_PATH:file,
      SESSION_SECRET:'fictional-secret',FAKE_SUNDAY_PROMO_CLOCK:'true',FAKE_SUMUP_FILE:providerFile,
      GOOGLE_MAPS_API_KEY:'FAKE',SUMUP_API_KEY:'FAKE',SUMUP_MERCHANT_CODE:'TEST',
      SUMUP_RETURN_URL:'https://example.invalid/return',SUMUP_REDIRECT_URL:'https://example.invalid/app',
      KIOSK_TERMINAL_ENABLED:'true',KIOSK_TERMINAL_DEVICE_SECRET:deviceSecret},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{let output='',errors='';child.stderr.on('data',data=>errors+=data);child.stdout.on('data',data=>{output+=data;const m=output.match(/http:\/\/localhost:(\d+)/);if(m)resolve(`http://127.0.0.1:${m[1]}/api`);});child.once('error',reject);child.once('exit',code=>reject(Error(`${code}: ${errors}`)));});
  const token=id=>createCustomerSession(id,'fictional-secret',{now:Date.parse('2026-10-11T12:00:00Z')});
  const request=async(route,body,id=customer.id,headers={})=>{const response=await fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token(id)}`,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()};};
  const item=(productId,quantity)=>({productId,quantity,selections:[{groupId:'protein',id:'viande'},{groupId:'salad',id:'roquette'},{groupId:'sauces',id:productId==='dynamite'?'fixed-dynamite':'mayo'}]});
  const context={method:'pickup',serviceDate:'2026-10-11',slot:'19:00',slotGrid:20};
  const items=[item('dynamite',2),item('gros-lard',2)];
  const input={...context,items,customerId:customer.id,promoCode:'DYNAMITE10',requestId:'attempt-fictional-sunday-0001'};
  for(const code of ['DYNAMITE10','GROSLARD10']){
    const preview=await request('/promotions/validate',{...context,items,code});
    assert.equal(preview.status,200,JSON.stringify(preview.data));
    assert.equal(preview.data.promotion.previewProductDiscount,2.38);
    assert.equal(previewPromotion({deliveryFee:0,discountRate:0},47.6,preview.data.promotion,'pickup').total,45.22);
    assert.equal((await request('/promotions/validate',{method:'pickup',items,code})).status,200,'ancien Android sans créneau dans l’aperçu');
  }
  const created=await request('/orders',input);
  assert.equal(created.status,201,JSON.stringify(created.data));
  assert.equal(created.data.order.total,45.22);assert.equal(created.data.order.promotionDiscount,2.38);
  assert.equal(created.data.order.payment,undefined);
  const replay=await request('/orders',input);assert.equal(replay.status,200);assert.equal(replay.data.order.id,created.data.order.id);
  const welcome=await request('/orders',{...input,items:[item('dynamite',1)],customerId:newcomer.id,requestId:'attempt-fictional-sunday-0002'},newcomer.id);
  assert.equal(welcome.status,201,JSON.stringify(welcome.data));assert.equal(welcome.data.order.total,9.64);
  assert.equal(welcome.data.order.welcomeRewardApplied,true);
  const delivered=await request('/orders',{...input,promoCode:'GROSLARD10',method:'delivery',slot:'20:00',items:[item('gros-lard',2)],requestId:'attempt-fictional-sunday-0003'});
  assert.equal(delivered.status,201,JSON.stringify(delivered.data));assert.equal(delivered.data.order.total,25.41);assert.equal(delivered.data.order.deliveryFee,3.99);
  const paid=await request('/payments/sumup-checkout',{orderId:welcome.data.order.id},newcomer.id);
  assert.equal(paid.status,201,JSON.stringify(paid.data));
  const fakeProvider=JSON.parse(await fs.readFile(providerFile,'utf8'));
  assert.equal(fakeProvider.checkouts[paid.data.checkoutId].amount,9.64,'le fournisseur fictif reçoit exactement le prix annoncé');
  for(const patch of [{serviceDate:'2026-10-12'},{slot:'18:40'},{slot:'21:00'},{slot:'22:00'},
    {tableReservation:{guests:2,note:''}},{dineIn:true},{kioskService:'takeaway'},
    {promoCode:['DYNAMITE10','GROSLARD10']},{promoCode:'DYNAMITE10 GROSLARD10'}]){
    const rejected=await request('/orders',{...input,...patch,requestId:'attempt-fictional-sunday-rejected'});
    assert.equal(rejected.status,patch.kioskService ? 403 : 400,JSON.stringify(rejected.data));
  }
  const kioskHeaders={'x-bibou-kiosk-token':deviceSecret};
  const kioskPreview=await request('/promotions/validate',{...context,items,code:'DYNAMITE10',isKiosk:false},customer.id,kioskHeaders);
  assert.equal(kioskPreview.status,400);assert.match(kioskPreview.data.error,/hors borne/);
  const kioskOrder=await request('/orders',{...input,isKiosk:false,requestId:'attempt-fictional-sunday-kiosk'},customer.id,kioskHeaders);
  assert.equal(kioskOrder.status,400);assert.match(kioskOrder.data.error,/hors borne/);
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(saved.orders.length,3);assert.equal(saved.customers[1].welcomeReward.status,'available');
  const news=await request('/news');assert.match(news.data.items[0].subtitle,/DYNAMITE10 ou GROSLARD10/);
});
