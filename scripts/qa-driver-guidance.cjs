'use strict';
// Disposable local accounts/orders. GPS launches are intercepted before any
// external network request; this verifies handoff URLs, NOT phone navigation.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const {spawn} = require('node:child_process'), {once} = require('node:events'), assert = require('node:assert/strict');
const {chromium, webkit} = require('/Users/nowar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const K = require('../server/krokly-drivers'), {parisDateKey} = require('../server/availability');
const nativeRoot = '/Users/nowar/.codex/visualizations/2026/09/17/01a0aea1-8728-7ac3-b9dc-ad71a581c085/krokli-driver-native';
async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'krokli-guidance-qa-'));
  const db = {customers:[],orders:[],reservations:[]}, driver = K.createDriver(db,{username:'qa-guidance',name:'Livreur fictif'});
  for (const number of [1,2,3,4]) {
    const order = {id:`fictional-${number}`,number,method:'delivery',payment:{status:'PAID'},status:'ready',serviceDate:parisDateKey(new Date()),slot:'19:00',customerName:'Client fictif',customerPhone:'0600000000',deliveryAddress:{address:'1 rue Fictive & angle #2',postalCode:'76600',city:'Le Havre'},distanceKm:1.2,total:13.99,deliveryFee:3.99,items:[{name:'Burger fictif',quantity:1,price:10}],createdAt:new Date().toISOString()};
    db.orders.push(order); K.assign(db,order.id,driver.driver.id);
  }
  const file = path.join(dir,'data.json'); await fs.writeFile(file,JSON.stringify(db),{mode:0o600});
  const child = spawn(process.execPath,['server/server.js'],{cwd:path.resolve(__dirname,'..'),env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',DATA_FILE_PATH:file,SESSION_SECRET:'guidance-local-only',RESTAURANT_DASHBOARD_PASSWORD:'local-only'},stdio:['ignore','pipe','pipe']});
  let browser, webServer;
  const results = [], stamp = new Date().toISOString().replace(/[:.]/g,'-'), out = path.resolve(__dirname,'../work/driver-guidance',stamp);
  await fs.mkdir(out,{recursive:true});
  try {
    let logs=''; const base = await new Promise((resolve,reject)=>{child.stdout.on('data',b=>{logs+=b;const m=logs.match(/http:\/\/localhost:\d+/);if(m)resolve(m[0]);});child.once('error',reject);child.once('exit',()=>reject(Error('Local API stopped')));});
    const exported = path.join(nativeRoot,'guidance-web-export');
    webServer = http.createServer(async(req,res)=>{try{const p=decodeURIComponent(new URL(req.url,'http://local').pathname), f=path.resolve(exported,p==='/'?'index.html':'.'+p);if(!f.startsWith(exported+path.sep))throw Error();const bytes=await fs.readFile(f);res.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
    await new Promise(resolve=>webServer.listen(0,'127.0.0.1',resolve)); const nativeBase=`http://127.0.0.1:${webServer.address().port}`;
    let index=0;
    for (const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]) {
      browser = await engine.launch({headless:true,...(engineName==='chromium'?{channel:'chrome'}:{})});
      for (const native of [false,true]) {
        const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},locale:'fr-FR'}),page=await context.newPage(),errors=[],launches=[];
        const row={browser:engineName,interface:native?'native-web-export':'web-pwa',checks:[]}; results.push(row);
        const check=(name,condition)=>{assert.ok(condition,name);row.checks.push(name);}; page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(12000);
        await context.route('**/*',async r=>{
          const u=new URL(r.request().url());
          if(u.origin===base||u.origin===nativeBase)return r.continue();
          if(native&&u.origin==='https://bibous-burger.onrender.com'&&u.pathname.startsWith('/api/')){const response=await r.fetch({url:base+u.pathname});return r.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});}
          if(['https://www.google.com','https://maps.apple.com','https://waze.com'].includes(u.origin)) { launches.push({url:u.href,referer:r.request().headers().referer||null}); return r.fulfill({contentType:'text/html',body:'<title>GPS handoff intercepted locally</title>'}); }
          return r.abort();
        });
        try {
          await page.goto(native?nativeBase:base+'/driver/');
          check('map preview removed from the application',await page.getByText(/aperçu carte|sans guidage vocal/i).count()===0);
          if(!native)check('map runtime is not loaded or displayed',await page.locator('#navigation-panel,#guidance-preview,script[src*="leaflet"],script[src*="navigation.js"]').count()===0);
          // In the web rendering of React Native, intercept Linking.openURL
          // at its browser boundary. This is NOT a signed iOS/Android test.
          if(native)await page.evaluate(()=>{window.__gpsLaunches=[];window.open=url=>{window.__gpsLaunches.push(url);return null;};});
          if(native){await page.getByTestId('live-username').fill('qa-guidance');await page.getByTestId('live-password').fill(driver.password);await page.getByTestId('live-login').click();await page.getByText('Bonjour Livreur fictif',{exact:true}).waitFor();}
          else{await page.locator('#username').fill('qa-guidance');await page.locator('#password').fill(driver.password);await page.locator('#login-form button[type=submit]').click();await page.locator('#workspace').waitFor({state:'visible'});}
          const number=++index;
          const card=native?page.getByText(new RegExp(`^COMMANDE #${number} ·`)).locator('..'):page.locator('.order').filter({has:page.getByText(`COMMANDE #${number}`,{exact:true})});
          check('no navigation to unaccepted customer',await card.getByRole('button',{name:/Démarrer le GPS/}).count()===0);
          await card.getByRole('button',{name:native?'Accepter la course':'Accepter',exact:true}).click();
          const nav=()=>native?card.getByRole('button',{name:'Démarrer le GPS',exact:true}):page.locator(`[data-navigate-order="fictional-${number}"]`);
          await nav().waitFor(); await nav().click();
          if(native){await page.getByRole('radio',{name:/Google Maps/}).click();}else await page.locator('#guidance-provider').getByRole('button',{name:'Google Maps',exact:true}).click();
          const launch=native?page.getByTestId('live-gps-launch'):page.locator('#guidance-launch');
          if(native){await launch.click();await page.waitForFunction(()=>window.__gpsLaunches.length===1);launches.push({url:await page.evaluate(()=>window.__gpsLaunches[0]),browserBoundaryIntercepted:true});}
          else{const popupEvent=page.waitForEvent('popup');await launch.click();const popup=await popupEvent;await popup.waitForLoadState('domcontentloaded');await popup.close();}
          check('restaurant GPS opens before pickup',launches.length===1&&new URL(launches[0].url).searchParams.get('destination')==='153 Quai Georges V, 76600 Le Havre');
          check('Google requests navigation rather than simple preview',new URL(launches[0].url).searchParams.get('dir_action')==='navigate'&&new URL(launches[0].url).searchParams.get('travelmode')==='driving');
          if(!native)check('GPS does not receive a referrer',launches[0].referer===null);
          await page.getByRole('button',{name:'Retour aux courses',exact:true}).click();
          await card.getByRole('button',{name:native?'J’ai récupéré le repas':"J'ai récupéré le repas",exact:true}).click();
          if(native)await page.getByRole('button',{name:'Confirmer',exact:true}).click();
          await nav().click();
          if(native){await page.getByRole('radio',{name:/Plans Apple/,exact:false}).click();}else await page.locator('#guidance-provider').getByRole('button',{name:'Plans Apple',exact:true}).click();
          if(native){await launch.click();await page.waitForFunction(()=>window.__gpsLaunches.length===2);launches.push({url:await page.evaluate(()=>window.__gpsLaunches[1]),browserBoundaryIntercepted:true});}
          else{launches.push({url:await launch.getAttribute('href'),linkInspectedOnly:true});}
          check('pickup switches GPS to complete customer address',new URL(launches.at(-1).url).searchParams.get('daddr')==='1 rue Fictive & angle #2, 76600 Le Havre');
          const stored=JSON.parse(await fs.readFile(file,'utf8'));
          check('GPS handoff never confirms delivery',stored.orders.find(o=>o.id===`fictional-${number}`).kroklyDriver.status==='picked_up');
          if(native)check('foreground-only GPS is never described as continuing in background',await page.getByTestId('live-gps-background-status').innerText().then(t=>/peut suspendre|n’est pas actif/.test(t)));
          else {
            await page.locator('#guidance-provider').getByRole('button',{name:'Waze',exact:true}).click();const url=new URL(await launch.getAttribute('href'));check('Waze also receives current destination',url.searchParams.get('q')==='1 rue Fictive & angle #2, 76600 Le Havre'&&url.searchParams.get('navigate')==='yes');
            await context.setOffline(true);await page.waitForFunction(()=>document.querySelector('#guidance-launch').getAttribute('aria-disabled')==='true');check('offline handoff is disabled',await launch.getAttribute('href')===null);await context.setOffline(false);await page.waitForFunction(()=>document.querySelector('#guidance-launch').getAttribute('aria-disabled')==='false');
            await page.locator('#guidance-close').click();await page.locator('#metro-trip').click();check('METRO opens without GPS sharing or IGN calculation',new URL(await launch.getAttribute('href')).searchParams.get('ll')==='49.489123,0.149494');
            await page.locator('#guidance-provider').getByRole('button',{name:'Google Maps',exact:true}).click();await page.reload();await page.locator('#metro-trip').click();check('GPS preference survives reopening',await page.locator('[data-guidance-provider="google"]').getAttribute('aria-pressed')==='true');
          }
          check('no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
          if(!native)await page.locator('#guidance-panel').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}));
          await page.screenshot({path:path.join(out,`${engineName}-${native?'native-ui':'pwa'}.png`),fullPage:false});
          if(native){await page.getByRole('button',{name:'Retour aux courses',exact:true}).click();await page.getByRole('button',{name:'Me déconnecter',exact:true}).click();}
          else{await page.locator('#logout').click();check('logout clears destination and launch URL',await launch.getAttribute('href')===null&&await page.locator('#guidance-address').innerText()==='');}
          check('no JavaScript page error',errors.length===0);row.passed=true;row.launches=launches.length;
        } catch(e) {row.passed=false;row.error=e.message;await page.screenshot({path:path.join(out,`${engineName}-${native?'native':'web'}-failure.png`)}).catch(()=>{});throw e;}
        finally {await context.close();}
      }
      await browser.close();browser=null;
    }
  } finally {
    if(browser)await browser.close();if(webServer)await new Promise(resolve=>webServer.close(resolve));child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});
    const report=path.join(out,'report.json');await fs.writeFile(report,JSON.stringify({at:new Date().toISOString(),localOnly:true,physicalPhone:false,actualVoiceGuidanceTested:false,externalNetworkRequests:0,results},null,2),{flag:'wx'});console.log(JSON.stringify({report,results}));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
