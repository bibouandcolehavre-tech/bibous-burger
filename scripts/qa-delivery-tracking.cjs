'use strict';
// Disposable local accounts, order, GPS samples and tokens only. No production
// writes, payment/push providers or real driver location are used.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {chromium,webkit}=require('/Users/nowar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const K=require('../server/krokly-drivers'),{parisDateKey}=require('../server/availability'),{createCustomerSession}=require('../server/customer-session');
const root=path.resolve(__dirname,'..'),exported=process.env.KROKLI_CUSTOMER_QA_EXPORT||path.join(root,'work/delivery-tracking-web-20261016');
async function main(){
 const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(root,'work/delivery-tracking',stamp),dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-tracking-qa-'));await fs.mkdir(out,{recursive:true});
 const now=Date.now(),secret='local-map-fixture-only',customer={id:'qa-map',name:'Client fictif',firstName:'Client',lastName:'Fictif',phone:'+33600000000',points:0,weeklyOrders:0};
 const db={customers:[customer],orders:[],reservations:[],nextOrderNumber:901};
 const d=K.createDriver(db,{username:'map-fixture',name:'Livreur fictif'});
 const o={id:'map-fixture',number:900,customerId:customer.id,customerName:customer.name,customerPhone:customer.phone,status:'ready',method:'delivery',serviceDate:parisDateKey(new Date(now)),slot:'00:00',payment:{status:'PAID'},subtotal:20,total:23.99,deliveryFee:3.99,deliveryTravelSeconds:480,distanceKm:1.2,items:[{name:'Burger fictif',productId:'classique',quantity:1,price:20}],deliveryAddress:{address:'Adresse fictive',postalCode:'76600',city:'Le Havre'},createdAt:new Date(now).toISOString(),kitchenAcceptedAt:new Date(now-20*60000).toISOString(),kitchenReadyAt:new Date(now-60000).toISOString()};
 db.orders.push(o);K.assign(db,o.id,d.driver.id,now);K.transition(db,o.id,d.driver.id,'accept',now);K.transition(db,o.id,d.driver.id,'pickup',now);
 const file=path.join(dir,'data.json');await fs.writeFile(file,JSON.stringify(db),{mode:0o600});
 const child=spawn(process.execPath,['--require',path.join(root,'server/test-fixtures/driver-no-external.cjs'),path.join(root,'server/server.js')],{cwd:dir,env:{PATH:process.env.PATH,PORT:'0',NODE_ENV:'test',DATA_FILE_PATH:file,SESSION_SECRET:secret,RESTAURANT_DASHBOARD_PASSWORD:'local-fixture'},stdio:['ignore','pipe','pipe']});
 let browser,server;const results=[];
 try {
  child.stderr.resume();let logs='';const backend=await new Promise((resolve,reject)=>{child.stdout.on('data',c=>{logs+=c;const m=logs.match(/http:\/\/localhost:\d+/);if(m)resolve(m[0]);});child.once('error',reject);child.once('exit',()=>reject(Error('Local fixture stopped')));});
  const post=async(route,token,body)=>{const r=await fetch(backend+'/api/'+route,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
  const login=await post('krokly-driver/login','',{username:'map-fixture',password:d.password});
  const grant=await post('krokly-driver/gps/start',login.token,{consentVersion:'bibou-native-gps-customer-v3',customerTracking:true});
  const fix=longitude=>post('krokly-driver/gps/position',login.token,{sessionId:grant.sessionId,position:{latitude:49.49,longitude,accuracy:10,timestamp:Date.now()}});
  server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');let f=path.resolve(exported,u.pathname==='/'?'index.html':'.'+decodeURIComponent(u.pathname));if(!f.startsWith(exported+path.sep))throw Error('Path');const bytes=await fs.readFile(f);res.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.png')?'image/png':'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  for(const [name,engine]of [['chrome',chromium],['webkit',webkit]]){
   browser=await engine.launch({headless:true,...(name==='chrome'?{channel:'chrome'}:{})});
   const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},locale:'fr-FR'});
   await context.addInitScript(token=>{if(!sessionStorage.getItem('qa-session-seeded')){localStorage.setItem('bibousCustomerSession',token);sessionStorage.setItem('qa-session-seeded','1');}},createCustomerSession(customer.id,secret));
   let failTracking=false,failAuth=true,shortGpsLifetime=false,mapReads=0;const errors=[],row={browser:name,checks:[]};results.push(row);const check=(label,condition)=>{assert.ok(condition,label);row.checks.push(label);};
   await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();
    if(u.hostname==='data.geopf.fr'){mapReads++;return route.continue();}
    if(u.hostname==='bibous-burger.onrender.com'&&u.pathname.startsWith('/api/')){
     if(failAuth&&u.pathname==='/api/auth/me')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Temporary local fixture outage"}'});
     if(failTracking&&u.pathname.endsWith('/delivery-tracking'))return route.abort();
     const r=await route.fetch({url:backend+u.pathname+u.search});
     if(shortGpsLifetime&&u.pathname.endsWith('/delivery-tracking')){const data=await r.json();if(data.position)data.position.validForMs=500;return route.fulfill({response:r,json:data,headers:{...r.headers(),'access-control-allow-origin':'*'}});}
     return route.fulfill({response:r,headers:{...r.headers(),'access-control-allow-origin':'*'}});
    }
    return route.abort();});
   const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await fix(0.12);
   await page.goto(origin,{waitUntil:'networkidle'});
   await page.getByText('Ta connexion est conservée',{exact:true}).waitFor();check('temporary auth outage preserves saved login',Boolean(await page.evaluate(()=>localStorage.getItem('bibousCustomerSession'))));
   check('temporary auth outage offers recovery, not an SMS form',await page.getByRole('button',{name:'Réessayer ma connexion'}).count()===1&&await page.locator('input[type="tel"]').count()===0);
   await page.getByRole('button',{name:'Voir la carte sans me déconnecter'}).click();
   await page.getByText('Mon compte',{exact:true}).last().click();
   await page.getByText('Ta connexion est conservée',{exact:true}).waitFor();check('opening account offline does not request a phone number',await page.locator('input[type="tel"]').count()===0);
   failAuth=false;await page.getByRole('button',{name:'Réessayer ma connexion'}).click();await page.getByText('Mes commandes',{exact:true}).first().waitFor();check('network recovery restores account without an SMS',true);
   await page.reload({waitUntil:'networkidle'});
   const continueButton=page.getByRole('button',{name:/Continuer/}).first();if(await continueButton.count())await continueButton.click();
   await page.getByText('Entrer dans l’application',{exact:true}).click();
   await page.getByText('Mon compte',{exact:true}).last().click();await page.getByText('Mes commandes',{exact:true}).first().waitFor();check('reopening restores the saved account',await page.locator('input[type="tel"]').count()===0);
   await page.getByText('Mes commandes',{exact:true}).first().click();
   const card=page.getByTestId('delivery-live-tracking');await card.waitFor();await card.getByText(/Livraison dans environ \d+ min/).waitFor();
   await page.getByLabel('Carte : dernière position récente de ton livreur').waitFor();check('own-course live position shown',true);
   check('departure message is visible',await card.getByTestId('delivery-departure-banner').getByText('Le petit Bibou arrive avec votre commande !',{exact:true}).count()===1);
   const marker=card.getByTestId('delivery-moving-courier');await marker.waitFor();
   check('Bibou has exact logo layers on helmet and bag',await card.getByTestId('bibou-courier-logo-bag').count()===1&&await card.getByTestId('bibou-courier-logo-helmet').count()===1);
   const before=await marker.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
   await fix(0.1208);await page.waitForFunction(({start})=>{const el=document.querySelector('[data-testid="delivery-moving-courier"]');return el&&new DOMMatrixReadOnly(getComputedStyle(el).transform).m41>start+3;},{start:before});
   check('a new server GPS coordinate moves Bibou across the map',true);
   await page.waitForTimeout(800);const resting=await marker.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);await page.waitForTimeout(1300);
   check('Bibou does not invent continued motion without a new coordinate',Math.abs(await marker.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)-resting)<.5);
   check('delay shown in minutes, not clock time',/Livraison dans environ \d+ min/.test(await card.innerText()));
   check('no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await card.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${name}-customer-map.png`),fullPage:false});
   await card.getByRole('button',{name:'Agrandir la carte'}).click();check('map zoom available',true);
   await card.getByRole('button',{name:'Recentrer sur le livreur'}).click();check('courier recenter available',true);
   failTracking=true;await card.getByText(/Connexion interrompue/).waitFor();check('network failure removes live marker',await page.getByLabel('Carte : dernière position récente de ton livreur').count()===0);
   failTracking=false;await fix(0.121);await page.getByLabel('Carte : dernière position récente de ton livreur').waitFor();check('fresh position resumes after connection recovery',true);
   shortGpsLifetime=true;await card.getByTestId('bibou-courier-marker').waitFor({state:'hidden'});check('expired GPS disappears even while the network still works',true);
   shortGpsLifetime=false;await fix(0.1212);await card.getByTestId('bibou-courier-marker').waitFor();check('a fresh coordinate restores Bibou after expiry',true);
   check('no JavaScript error',errors.length===0);row.mapTileRequests=mapReads;
   await page.getByText('Mon compte',{exact:true}).last().click();await page.getByRole('button',{name:'Me déconnecter',exact:true}).click();
   await page.waitForFunction(()=>!localStorage.getItem('bibousCustomerSession'));await page.reload({waitUntil:'networkidle'});check('explicit logout remains effective after reopening',!await page.evaluate(()=>localStorage.getItem('bibousCustomerSession')));row.passed=true;
   await context.close();await browser.close();browser=null;
  }
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});
  const report=path.join(out,'report.json');await fs.writeFile(report,JSON.stringify({at:new Date().toISOString(),localOnly:true,realGps:false,physicalPhone:false,productionWrites:0,results},null,2),{flag:'wx'});console.log(JSON.stringify({report,results}));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
