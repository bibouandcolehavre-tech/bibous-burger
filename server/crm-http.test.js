const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {createCustomerSession}=require('./customer-session'),{parisDateKey}=require('./availability'),crm=require('./crm');
test('CRM HTTP: restaurant permissions, consent, private offers, persisted settings and authoritative checkout', {timeout:25000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-crm-http-')),file=path.join(dir,'data.json'),now=Date.now();
  const db={customers:[{id:'c1',name:'Fictif',phone:'+33600000001',points:0,welcomeReward:{status:'used'},crmPreferences:{personalizedOffers:true,birthday:'09-20'}},{id:'c2',name:'Autre fictif',phone:'+33600000002',points:0,welcomeReward:{status:'used'}}],orders:[],nextOrderNumber:1,nextCustomerId:3,
    crm:{settings:crm.defaults(),offers:[{id:'coupon-private',customerId:'c1',ruleId:'inactive',eventKey:'test',title:'Test fictif',discountPercent:20,minSubtotal:0,createdAt:now-1000,expiresAt:now+86400000}]}};
  const original=JSON.stringify(db);await fs.writeFile(file,original);
  const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{cwd:dir,env:{PATH:process.env.PATH,PORT:'0',NODE_ENV:'test',DATA_FILE_PATH:file,SESSION_SECRET:'crm-secret-only',RESTAURANT_DASHBOARD_PASSWORD:'crm-test-only'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});});
  let errors='';child.stderr.on('data',d=>{errors+=d;});
  const base=await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{const match=String(d).match(/http:\/\/localhost:\d+/);if(match)resolve(match[0]+'/api');});child.on('error',reject);child.on('exit',code=>reject(Error(code+errors)));});
  const request=(route,token='',method='GET',body)=>fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const c1=createCustomerSession('c1','crm-secret-only'),c2=createCustomerSession('c2','crm-secret-only');
  for(const token of ['',c1])for(const route of ['/dashboard/crm','/dashboard/settings','/dashboard/crm/preview'])assert.equal((await request(route,token)).status,401);
  const admin=(await(await request('/dashboard/auth/login','','POST',{password:'crm-test-only'})).json()).token;
  const initial=await request('/dashboard/crm',admin);assert.equal(initial.status,200);assert.equal(initial.headers.get('cache-control'),'no-store');assert.equal((await initial.json()).statistics.offers,1);assert.equal(await fs.readFile(file,'utf8'),original,'opening dashboard must not mutate database');
  assert.equal((await request('/dashboard/crm/preview',admin,'POST',crm.defaults())).status,200);assert.equal(await fs.readFile(file,'utf8'),original);
  assert.equal((await request('/dashboard/settings',admin,'PATCH',{...crm.defaults(),enabled:true})).status,400);
  const updated=await request('/dashboard/settings',admin,'PATCH',{...crm.defaults(),cooldownDays:10});assert.equal(updated.status,200);assert.equal((await updated.json()).settings.revision,1);assert.equal((await request('/dashboard/settings',admin,'PATCH',crm.defaults())).status,409);
  assert.equal((await request('/dashboard/crm?days=2',admin)).status,400);
  assert.equal((await request('/customer/crm',admin)).status,401);assert.equal((await(await request('/customer/crm',c1)).json()).offers.length,1);assert.equal((await(await request('/customer/crm',c2)).json()).offers.length,0);
  assert.equal((await request('/customer/crm',c2,'PATCH',{birthday:'02-31',personalizedOffers:true})).status,400);
  assert.equal((await request('/customer/crm',c2,'PATCH',{birthday:'02-29',personalizedOffers:false,customerId:'c1'})).status,400);
  const preferences=await request('/customer/crm',c2,'PATCH',{birthday:'02-29',personalizedOffers:false});assert.equal(preferences.status,200);assert.equal((await preferences.json()).preferences.birthday,'02-29');
  const order={customerId:'c1',requestId:'crm-order-attempt-0001',method:'pickup',serviceDate:parisDateKey(new Date(now+86400000)),slot:'19:00',items:[{productId:'fries',quantity:1,selections:[]}]};
  // Known burger avoids any dependency on display-side prices.
  order.items=[{productId:'classique',quantity:1,selections:[{groupId:'protein',id:'viande'},{groupId:'salad',id:'roquette'},{groupId:'sauces',id:'mayo'}]}];
  const firstResponse=await request('/orders',c1,'POST',{...order,discountRate:.99,total:.01,crmOfferId:'forged'});assert.equal(firstResponse.status,201,JSON.stringify(await firstResponse.clone().json()));const first=(await firstResponse.json()).order;assert.equal(first.crmOfferId,'coupon-private');assert.equal(first.discountRate,.2);assert.equal(first.total,Math.round(first.subtotal*.8*100)/100);assert.equal(first.welcomeRewardApplied,false);
  const duplicate=(await(await request('/orders',c1,'POST',order)).json()).order;assert.equal(duplicate.id,first.id);
  const next=(await(await request('/orders',c1,'POST',{...order,requestId:'crm-order-attempt-0002'})).json()).order;assert.equal(next.crmOfferId,undefined);assert.equal(next.discountRate,0);
  const forged=(await(await request('/orders',c2,'POST',{...order,customerId:'c2',requestId:'crm-order-attempt-0003',crmOfferId:'coupon-private',discountRate:.5})).json()).order;assert.equal(forged.crmOfferId,undefined);assert.equal(forged.discountRate,0);
  const after=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(after.crm.settings.enabled,false);assert.equal(after.crm.offers.length,1);assert.equal(after.pushNotifications?.jobs?.length||0,0);
});
