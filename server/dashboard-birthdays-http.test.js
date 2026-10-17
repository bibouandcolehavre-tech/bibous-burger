const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {parisDateKey}=require('./availability'),{createCustomerSession}=require('./customer-session');
test('HTTP anniversaires : accès restaurant, GET sans écriture, attribution atomique sans envoi ni activation', {timeout:20000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-birthdays-http-')),file=path.join(dir,'data.json'),date=parisDateKey(new Date());
  const db={customers:[{id:'birthday-a',name:'Client fictif',phone:'PRIVATE-PHONE',address:'PRIVATE-ADDRESS',createdAt:'2025-01-01T12:00:00Z',crmPreferences:{birthday:date.slice(5),personalizedOffers:true}},{id:'birthday-b',name:'Autre client fictif',createdAt:'2025-01-01T12:00:00Z',crmPreferences:{birthday:'01-01',personalizedOffers:false}}],orders:[],nextOrderNumber:1,nextCustomerId:3};
  const before=JSON.stringify(db);await fs.writeFile(file,before);
  const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{cwd:dir,env:{PATH:process.env.PATH,PORT:'0',NODE_ENV:'test',DATA_FILE_PATH:file,SESSION_SECRET:'birthday-test-secret',RESTAURANT_DASHBOARD_PASSWORD:'birthday-test-password'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});});
  let errors='';child.stderr.on('data',d=>errors+=d);
  const base=await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{const match=String(d).match(/http:\/\/localhost:\d+/);if(match)resolve(match[0]+'/api');});child.on('error',reject);child.on('exit',code=>reject(Error(code+errors)));});
  const request=(route,token='',body)=>fetch(base+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const client=createCustomerSession('birthday-a','birthday-test-secret');
  for(const token of ['',client]){assert.equal((await request('/dashboard/birthdays',token)).status,401);assert.equal((await request('/dashboard/birthdays/offer',token,{})).status,401);}
  const admin=(await(await request('/dashboard/auth/login','',{password:'birthday-test-password'})).json()).token;
  const view=await request('/dashboard/birthdays',admin);assert.equal(view.status,200);assert.equal(view.headers.get('cache-control'),'no-store');assert.doesNotMatch(JSON.stringify(await view.json()),/PRIVATE-/);assert.equal(await fs.readFile(file,'utf8'),before);
  const offer={customerId:'birthday-a',birthdayDate:date,title:'Anniversaire de test',discountPercent:15,minSubtotal:0,validityDays:7,confirm:true};
  assert.equal((await request('/dashboard/birthdays/offer',admin,{...offer,confirm:false})).status,409);assert.equal(await fs.readFile(file,'utf8'),before);
  const responses=await Promise.all([request('/dashboard/birthdays/offer',admin,offer),request('/dashboard/birthdays/offer',admin,offer)]);assert.ok(responses.every(r=>r.status===200));const results=await Promise.all(responses.map(r=>r.json()));assert.deepEqual(results.map(r=>r.result.created).sort(),[false,true]);
  const stored=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(stored.crm.offers.length,1);assert.equal(stored.crm.settings.enabled,false);assert.equal(stored.pushNotifications?.jobs?.length||0,0);
  const account=await(await request('/customer/crm',client)).json();assert.equal(account.offers[0].discountPercent,15);assert.equal(account.offers[0].status,'available');
});
