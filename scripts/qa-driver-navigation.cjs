'use strict';
// Browser QA against a disposable local Bibou database. No production account,
// real location, customer order or outbound map request is used by this script.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events');
const {chromium,webkit}=require('/Users/nowar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'krokli-navigation-qa-')),file=path.join(dir,'data.json');
  await fs.writeFile(file,JSON.stringify({customers:[],orders:[],reservations:[]}));
  const child=spawn(process.execPath,['server/server.js'],{cwd:path.resolve(__dirname,'..'),env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',DATA_FILE_PATH:file,SESSION_SECRET:'f'.repeat(64),RESTAURANT_DASHBOARD_PASSWORD:'local-qa-only'},stdio:['ignore','pipe','pipe']});
  let browser;
  try{
    let log='';const base=await new Promise((resolve,reject)=>{child.stdout.on('data',b=>{log+=b;const m=log.match(/http:\/\/localhost:\d+/);if(m)resolve(m[0]);});child.once('error',reject);child.once('exit',()=>reject(Error('Local server stopped')));});
    const post=async(route,body,token)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});assert.ok(r.ok);return r.json();};
    const owner=await post('/api/dashboard/auth/login',{password:'local-qa-only'}),driver=await post('/api/dashboard/krokly-drivers',{username:'qa-navigation',name:'Conducteur local'},owner.token);
    const results=[];
    for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
      browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:49.49,longitude:0.11,accuracy:10}});
      // This installed WebKit test runner emits injected timestamps in
      // microseconds (observed 1792136600838000 vs Date.now 1792136601403).
      // Normalize only the test sensor, never weaken production GPS checks.
      if(name==='webkit')await context.addInitScript(()=>{const watch=navigator.geolocation.watchPosition.bind(navigator.geolocation);navigator.geolocation.watchPosition=(ok,fail,options)=>watch(fix=>ok({coords:fix.coords,timestamp:fix.timestamp>1e14?fix.timestamp/1000:fix.timestamp}),fail,options);});
      const page=await context.newPage(),errors=[],csp=[],remote=[];let routeCalls=0;
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Content Security|violat|CSP/i.test(m.text()))csp.push(m.text());});
      await context.route('**/*',async r=>{
        const u=new URL(r.request().url());if(u.origin===base)return r.continue();
        remote.push(u.origin+u.pathname);
        if(u.origin==='https://data.geopf.fr'&&u.pathname==='/navigation/itineraire'){
          routeCalls++;return r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{profile:'car',distanceUnit:'meter',timeUnit:'second',distance:3000,duration:600,geometry:{type:'LineString',coordinates:[[0.11,49.49],[0.13,49.49],[0.149494,49.489123]]},portions:[{steps:[{geometry:{coordinates:[[0.11,49.49],[0.13,49.49]]},instruction:{type:'depart'},attributes:{name:{nom_1_droite:'Rue de test'}}},{geometry:{coordinates:[[0.13,49.49],[0.149494,49.489123]]},instruction:{type:'turn',modifier:'right'},attributes:{name:{nom_1_droite:'Rue de test 2'}}}]}]}});
        }
        if(u.origin==='https://data.geopf.fr'&&u.pathname==='/wmts')return r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64')});
        return r.abort();
      });
      await page.goto(base+'/driver/');await page.locator('#username').fill('qa-navigation');await page.locator('#password').fill(driver.password);await page.locator('#login-form button[type=submit]').click();await page.locator('#workspace').waitFor({state:'visible'});
      await page.locator('#metro-trip').click();await page.locator('#guidance-preview').click();await page.locator('#nav-calculate').click();assert.match(await page.locator('#nav-status').innerText(),/Confirme/);assert.equal(routeCalls,0);
      await page.locator('#gps-consent').check();await page.locator('#gps-start').click();try{await page.waitForFunction(()=>document.querySelector('#gps-status').textContent.includes('Position reçue'),null,{timeout:10000});}catch(e){console.log(JSON.stringify({browser:name,gpsStatus:await page.locator('#gps-status').innerText(),errors,csp}));throw e;}
      await page.locator('#nav-consent').check();await page.locator('#nav-calculate').click();try{await page.waitForFunction(()=>document.querySelector('#nav-summary').textContent.includes('3,0 km'),null,{timeout:10000});}catch(e){console.log(JSON.stringify({browser:name,navStatus:await page.locator('#nav-status').innerText(),errors,csp,routeCalls}));throw e;}
      assert.equal(routeCalls,1);assert.equal(context.pages().length,1);assert.match(await page.locator('#nav-status').innerText(),/GPS reçu/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await context.setGeolocation({latitude:49.50,longitude:0.11,accuracy:10});await page.waitForFunction(()=>document.querySelector('#nav-status').textContent.includes('en dehors du tracé'));
      await page.locator('#gps-stop').click();assert.equal(await page.locator('#navigation-panel').isVisible(),false);
      await page.locator('#logout').click();assert.equal(await page.locator('#workspace').isVisible(),false);
      assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);assert.ok(remote.every(u=>u.startsWith('https://data.geopf.fr/')));
      results.push({browser:name,passed:true,mapStayedInsideApp:true,explicitConsent:true,offRouteDetected:true,stopClearsMap:true,logoutClearsWorkspace:true,noHorizontalOverflow:true,noPageErrors:true,noCspErrors:true,realNetworkRequests:0,realPhoneGps:false,testSensorTimestampNormalized:name==='webkit'});
      await browser.close();browser=null;
    }
    const output=path.resolve(__dirname,'../work/driver-navigation'),stamp=new Date().toISOString().replace(/[:.]/g,'-');await fs.mkdir(output,{recursive:true});const report=path.join(output,`browser-${stamp}.json`);await fs.writeFile(report,JSON.stringify({at:new Date().toISOString(),localOnly:true,results},null,2),{flag:'wx'});console.log(JSON.stringify({report,results}));
  }finally{if(browser)await browser.close();child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
