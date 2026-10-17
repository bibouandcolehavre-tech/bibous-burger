'use strict';
// Actual customer bundle, disposable review backend and fixtures only.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), http = require('node:http'), crypto = require('node:crypto');
const {spawn} = require('node:child_process'), {once} = require('node:events'), assert = require('node:assert/strict');
const {chromium, webkit} = require('/Users/nowar/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), exported = path.resolve(process.env.BIBOU_QA_EXPORT || path.join(root, 'work/bibou-native-112-20261017/export'));
const code = 'local-customer-review-ui-only-test-code', hash = crypto.createHash('sha256').update(code).digest('hex');
async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'), out = path.join(root, 'work/bibou-native-112-20261017', stamp);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-review-ui-')); await fs.mkdir(out, {recursive:true});
  const dataFile = path.join(tmp, 'data.json'), untouched = JSON.stringify({customers:[{id:'unrelated-local-fixture'}], orders:[], reservations:[], krokliNativePush:{devices:[],jobs:[]}});
  await fs.writeFile(dataFile, untouched, {mode:0o600});
  const modulePath = path.join(root, 'server/review-sandbox.js');
  const bootstrap = `const m=require(${JSON.stringify(modulePath)}),original=m.createReviewSandbox;m.createReviewSandbox=o=>original({...o,accessHash:${JSON.stringify(hash)}});require(${JSON.stringify(path.join(root,'server/server.js'))});`;
  const child = spawn(process.execPath, ['--require', path.join(root,'server/test-fixtures/driver-no-external.cjs'), '-e', bootstrap], {cwd:tmp, env:{PATH:process.env.PATH, NODE_ENV:'test', PORT:'0', DATA_FILE_PATH:dataFile, SESSION_SECRET:'local-review-only'}, stdio:['ignore','pipe','pipe']});
  let server, browser, lastPage, logs=''; const results=[];
  try {
    child.stderr.resume();
    const backend = await new Promise((resolve,reject)=>{child.stdout.on('data',v=>{logs+=v;const m=logs.match(/http:\/\/localhost:\d+/);if(m)resolve(m[0]);});child.on('error',reject);child.once('exit',()=>reject(Error('Local reviewer backend exited')));});
    // Public reads initialize empty technical defaults in this disposable
    // fixture. Capture the baseline after that initialization, before review.
    await (await fetch(backend+'/api/news')).json();
    const baseline = await fs.readFile(dataFile,'utf8');
    assert.deepEqual(JSON.parse(baseline).orders, []);
    assert.deepEqual(JSON.parse(baseline).customers, [{id:'unrelated-local-fixture'}]);
    server = http.createServer(async(req,res)=>{try{let f=path.resolve(exported,'.'+new URL(req.url,'http://local').pathname);if(f===exported)f=path.join(f,'index.html');if(!f.startsWith(exported+path.sep))throw Error('Path');const b=await fs.readFile(f);res.writeHead(200,{'Content-Type':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.png')?'image/png':'application/octet-stream'});res.end(b);}catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r)); const origin='http://127.0.0.1:'+server.address().port;
    for (const [name,engine] of [['chrome',chromium],['webkit',webkit]]) {
      browser=await engine.launch({headless:true,...(name==='chrome'?{channel:'chrome'}:{})});
      const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}), errors=[], writes=[], row={browser:name,checks:[]};results.push(row);
      const session=await (await fetch(backend+'/api/review/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessCode:code})})).json();
      assert(session.token?.startsWith('review.'));
      await context.addInitScript(token=>localStorage.setItem('bibousCustomerSession',token),session.token);
      await context.route('**/*',async route=>{
        const r=route.request(),u=new URL(r.url());if(u.origin===origin)return route.continue();
        if(u.hostname==='data.geopf.fr')return route.continue();
        if(u.hostname==='bibous-burger.onrender.com'&&u.pathname.startsWith('/api/')){
          if(r.method()!=='GET'&&r.method()!=='OPTIONS')writes.push(u.pathname);
          if(!u.pathname.startsWith('/api/review/')&&!(r.method()==='GET'&&!r.headers().authorization))throw Error('Reviewer escaped isolated namespace: '+u.pathname);
          const response=await route.fetch({url:backend+u.pathname+u.search});return route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}});
        }
        return route.abort();
      });
      const page=await context.newPage();lastPage=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin,{waitUntil:'networkidle'});
      // The seeded missing-drink example intentionally opens Mes commandes on
      // restore, so the reviewer can resolve the pending customer decision.
      await page.getByTestId('delivery-live-tracking').getByText('MODE DE TEST · trajet et position illustrés, aucune livraison réelle.',{exact:true}).waitFor();row.checks.push('Isolated illustrated tracking visible in the actual customer screen');
      await page.getByTestId('delivery-moving-courier').waitFor();
      await page.getByTestId('delivery-live-tracking').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,name+'-review-map.png')});
      await page.getByRole('button',{name:'Noter ma livraison · #TEST-AVIS',exact:true}).click();
      await page.getByRole('button',{name:'4 étoiles',exact:true}).click();
      await page.getByLabel('Remarque sur la livraison',{exact:true}).fill('Avis fictif de vérification');
      await page.getByRole('button',{name:'Envoyer mon avis',exact:true}).click();
      await page.getByText('Merci ! Ton avis sur la livraison est enregistré.',{exact:true}).waitFor();row.checks.push('Rating and private optional remark saved once in the isolated session');
      await page.getByRole('button',{name:'Simuler le pourboire sans paiement',exact:true}).click();
      await page.getByText('Pourboire fictif enregistré : aucun débit ni gain réel.',{exact:true}).waitFor();row.checks.push('Simulated tip shows no debit and never opens a real checkout');
      assert.equal(await page.getByRole('button',{name:'Simuler le pourboire sans paiement',exact:true}).count(),0);row.checks.push('Paid example cannot trigger a second tip');
      await page.screenshot({path:path.join(out,name+'-review-feedback-tip.png'),fullPage:true});
      assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert(writes.every(p=>/\/delivery-feedback$|\/tip$/.test(p)));row.checks.push('No browser errors, overflow or unrelated writes');row.passed=true;
      await context.close();await browser.close();browser=null;
    }
    assert.equal(await fs.readFile(dataFile,'utf8'),baseline,'Real-style local database remains byte-identical during reviewer actions');
  } finally {
    if(lastPage&&!lastPage.isClosed()&&results.some(r=>!r.passed)){await lastPage.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.log((await lastPage.locator('body').innerText().catch(()=>'' )).slice(0,4000));}
    if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(tmp,{recursive:true,force:true});
    const report={at:new Date().toISOString(),localOnly:true,productionWrites:0,physicalPhone:false,realPayments:false,results};
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({out,...report}));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
