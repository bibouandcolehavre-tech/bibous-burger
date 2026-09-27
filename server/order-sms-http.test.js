const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {createCustomerSession}=require('./customer-session');
const {parisDateKey}=require('./availability');

test('Staff SMS HTTP: payment verification and gifted orders alert both staff, not unpaid/review/history/subscriptions',{timeout:25000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-order-sms-http-'));
  const dbFile=path.join(dir,'data.json'),providerFile=path.join(dir,'provider.json'),smsFile=path.join(dir,'sms.jsonl');
  const customer={id:'customer-test',name:'Client fictif',firstName:'Client',lastName:'Fictif',phone:'+33699999999',address:'Adresse fictive',postalCode:'76600',city:'Le Havre',points:0};
  await fs.writeFile(dbFile,JSON.stringify({customers:[customer],orders:[{id:'order-90',number:90,status:'confirmed',payment:{status:'PAID'}}],nextOrderNumber:91}));
  await fs.writeFile(providerFile,JSON.stringify({checkouts:{}}));
  const child=spawn(process.execPath,['--require',path.join(__dirname,'test-fixtures/sumup-provider.cjs'),path.join(__dirname,'server.js')],{
    cwd:dir,env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',DATA_FILE_PATH:dbFile,FAKE_SUMUP_FILE:providerFile,FAKE_ORDER_SMS_FILE:smsFile,
      SESSION_SECRET:'fake-session',RESTAURANT_DASHBOARD_PASSWORD:'fake-password',GOOGLE_MAPS_API_KEY:'fake',SUMUP_API_KEY:'fake',SUMUP_MERCHANT_CODE:'TEST',SUMUP_RETURN_URL:'https://example.invalid/return',SUMUP_REDIRECT_URL:'https://example.invalid/app',
      RESTAURANT_ORDER_SMS_ENABLED:'true',RESTAURANT_ORDER_SMS_RECIPIENTS:'0600000000,0700000000',KEYYO_CALL_SMS_ENABLED:'false',KEYYO_LINE:'0212345678',KEYYO_SIP_PASSWORD:'fake',KEYYO_WEBHOOK_SECRET:'w'.repeat(43),KEYYO_SMS_PRIVACY_KEY:'p'.repeat(43)},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});});
  let logs='';
  const base=await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{logs+=d;const m=logs.match(/http:\/\/localhost:\d+/);if(m)resolve(m[0]+'/api');});child.stderr.on('data',d=>logs+=d);child.on('error',reject);child.on('exit',c=>reject(Error(c+logs)));});
  const token=createCustomerSession(customer.id,'fake-session');
  async function request(route,body,auth=token,method=body?'POST':'GET') {
    const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:response.status===204?{}:await response.json()};
  }
  const admin=(await request('/dashboard/auth/login',{password:'fake-password'},'')).data.token;
  const db=async()=>JSON.parse(await fs.readFile(dbFile,'utf8'));
  assert.equal((await request('/dashboard/order-sms',null,'')).status,401);
  assert.equal((await request('/dashboard/order-sms',null,token)).status,401);
  assert.equal((await request('/dashboard/order-sms',null,'review.fake')).status,401);
  assert.deepEqual((await request('/dashboard/order-sms',null,admin)).data,{enabled:true,configured:true,recipientCount:2,counts:{},queueErrors:0});
  const serviceDate=parisDateKey(new Date(Date.now()+86400000));
  const cart=(method,promoCode)=>({customerId:customer.id,method,serviceDate,slot:method==='delivery'?'19:00 – 19:30':'19:00',promoCode,items:[{productId:'classique',quantity:1,selections:[{groupId:'protein',id:'viande'},{groupId:'salad',id:'roquette'},{groupId:'sauces',id:'mayo'}]}]});
  const pending=await request('/orders',cart('pickup'));assert.equal(pending.status,201,JSON.stringify(pending.data));
  const payment=await request('/payments/sumup-checkout',{orderId:pending.data.order.id});assert.equal(payment.status,201);
  const callback=()=>request('/payments/sumup-return',{id:payment.data.checkoutId,event_type:'CHECKOUT_STATUS_CHANGED',status:'PAID'},'');
  await callback(); assert.equal((await db()).restaurantOrderSms,undefined); // Forged webhook status is ignored.
  const provider=JSON.parse(await fs.readFile(providerFile,'utf8'));provider.checkouts[payment.data.checkoutId].status='PAID';await fs.writeFile(providerFile,JSON.stringify(provider));
  await Promise.all([callback(),callback(),request('/payments/sumup-checkout/'+pending.data.order.id)]);
  assert.equal((await db()).restaurantOrderSms.jobs.length,2);
  const gifted=await request('/orders',cart('delivery','CHORUS'));assert.equal(gifted.status,201,JSON.stringify(gifted.data));
  assert.equal(gifted.data.order.total,0);assert.equal((await db()).restaurantOrderSms.jobs.length,4);
  const subscription=await request('/bibou-plus/checkout',{});assert.equal(subscription.status,201);
  const state=JSON.parse(await fs.readFile(providerFile,'utf8'));state.checkouts[subscription.data.purchase.payment.checkoutId].status='PAID';await fs.writeFile(providerFile,JSON.stringify(state));
  await request('/payments/sumup-return',{id:subscription.data.purchase.payment.checkoutId,event_type:'CHECKOUT_STATUS_CHANGED'},'');
  assert.equal((await db()).restaurantOrderSms.jobs.length,4);
  for(let i=0;i<60;i++) {if((await request('/dashboard/order-sms',null,admin)).data.counts.accepted===4)break;await new Promise(r=>setTimeout(r,200));}
  assert.equal((await request('/dashboard/order-sms',null,admin)).data.counts.accepted,4);
  const sent=(await fs.readFile(smsFile,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(sent.length,4);assert.equal(sent.filter(s=>s.recipient==='33600000000').length,2);assert.equal(sent.filter(s=>s.recipient==='33700000000').length,2);
  assert.ok(sent.some(s=>s.message.includes('Retrait'))&&sent.some(s=>s.message.includes('Livraison')));
  assert.ok(sent.every(s=>s.message.length<=160&&!s.message.includes('Client fictif')&&!s.message.includes('Adresse fictive')));
  assert.doesNotMatch(logs,/33600000000|33700000000/);
});
