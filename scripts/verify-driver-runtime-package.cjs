'use strict';
// A clean copy of the tracked Docker runtime payload, not a Docker/Linux build.
// No local .env, production DB, bank key, untracked draft or credentials copied.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync,spawn}=require('node:child_process'),{once}=require('node:events');
const root=path.resolve(__dirname,'..');
const nativeOption=process.argv.indexOf('--native-source');
const nativeArgument=nativeOption>=0?process.argv[nativeOption+1]:null;
if(nativeOption>=0&&(!nativeArgument||nativeArgument.startsWith('--'))){console.error('--native-source requires an explicit source directory.');process.exit(2);}
const nativeRoot=nativeArgument?path.resolve(nativeArgument):null;
async function sourceHash(directory,files){const hash=crypto.createHash('sha256');for(const file of [...new Set(files)].sort()){hash.update(file+'\0');hash.update(await fs.readFile(path.join(directory,file)));hash.update('\0');}return hash.digest('hex');}
async function main(){
  const startedAt=new Date().toISOString(),stamp=startedAt.replace(/[:.]/g,'-'),directory=await fs.mkdtemp(path.join(os.tmpdir(),'krokli-runtime-package-')),runtime=path.join(directory,'app');await fs.mkdir(runtime);let child;
  const proof={startedAt,scope:'clean-tracked-runtime-package-on-host-not-a-docker-linux-image',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtime:process.version,platform:process.platform,localOnly:true,productionRequests:0,realPayments:0,realGps:false,nativeClientContractChecked:Boolean(nativeRoot),checks:{},copiedFiles:[]};
  let auditedFiles,nativeFiles,childErrors='';const fixtureSecrets=[];
  try{
    const docker=await fs.readFile(path.join(root,'Dockerfile'),'utf8'),patterns=(await fs.readFile(path.join(root,'.dockerignore'),'utf8')).split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
    const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
    const ignored=file=>patterns.some(p=>path.matchesGlob(file,p)||file.split('/').some((s,i)=>path.matchesGlob(file.split('/').slice(0,i+1).join('/'),p))||!p.includes('/')&&file.split('/').some(s=>path.matchesGlob(s,p)));
    const rows=docker.split(/\r?\n/),stage=rows.findIndex(s=>/^FROM node:22-alpine\s*$/.test(s));assert.ok(stage>0);
    for(const line of rows.slice(stage+1).filter(s=>s.startsWith('COPY ')&&!s.startsWith('COPY --'))){const m=/^COPY (\S+) (\S+)$/.exec(line);assert.ok(m,'Only audited COPY syntax is supported');const[,source,destination]=m;assert.ok(!source.startsWith('/')&&!source.includes('..'));
      const files=tracked.filter(f=>(f===source||f.startsWith(source+'/'))&&!ignored(f));assert.ok(files.length,`Missing tracked COPY source ${source}`);
      for(const file of files){const suffix=file===source?'':file.slice(source.length+1),target=path.join(runtime,destination,suffix);assert.ok(target.startsWith(runtime+path.sep));await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(root,file),target);proof.copiedFiles.push(file);}
    }
    assert.ok(!proof.copiedFiles.some(f=>/\.env|data\.json|\.p8$|\.p12$|\.keystore$|service.account.*\.json|^server\/krokli-native\.js$|^server\/krokli-native-core\//.test(f)));proof.checks.onlyTrackedAuditedPayload=true;
    auditedFiles=[...proof.copiedFiles,'Dockerfile','.dockerignore','scripts/verify-driver-runtime-package.cjs'];proof.sourcePayloadSha256=await sourceHash(root,auditedFiles);
    if(nativeRoot){nativeFiles=['src/bibou-api-service.cjs','src/driver-settlement-contract.cjs','src/driver-account-contract.cjs'];proof.nativeContractSha256=await sourceHash(nativeRoot,nativeFiles);}
    assert.match(docker,/COPY --from=statement-dependencies \/app\/server\/pdf\/node_modules/);assert.match(docker,/npm ci --omit=dev --ignore-scripts/);
    const log=execFileSync('npm',['ci','--offline','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(runtime,'server/pdf'),encoding:'utf8',timeout:60000,maxBuffer:200000,env:{...process.env,NO_COLOR:'1'}});proof.checks.cleanPdfDependencyInstall=log.includes('packages');
    const data=path.join(directory,'fixture.json'),envFile=path.join(directory,'.env'),key=crypto.randomBytes(32).toString('hex'),password=crypto.randomBytes(16).toString('hex');
    fixtureSecrets.push(key,password);
    const K=require(path.join(runtime,'server/krokly-drivers')),db={customers:[{id:'fixture-customer',firstName:'Exemple'}],orders:[],reservations:[]};const created=K.createDriver(db,{username:'package-test',name:'Livreur fictif'});
    db.orders.push({id:'fixture-delivery',number:1,customerId:'fixture-customer',method:'delivery',status:'delivered',payment:{status:'PAID'},deliveryFee:0,standardDeliveryFee:4.99,bibouPlusApplied:true,kroklyDriver:{driverId:created.driver.id,status:'delivered',deliveredAt:new Date().toISOString()}});
    require(path.join(runtime,'server/krokli-driver-account')).recordCompletion(db.orders[0]);await fs.writeFile(data,JSON.stringify(db),{flag:'wx'});
    await fs.writeFile(envFile,`DRIVER_BANK_DATA_KEY=${key}\n`,{flag:'wx',mode:0o600});
    child=spawn(process.execPath,[path.join(runtime,'server/server.js')],{cwd:directory,env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',LISTEN_HOST:'127.0.0.1',DATA_FILE_PATH:data,SESSION_SECRET:crypto.randomBytes(32).toString('hex'),RESTAURANT_DASHBOARD_PASSWORD:password},stdio:['ignore','pipe','pipe']});
    child.stderr.on('data',value=>{childErrors=(childErrors+String(value)).slice(-4000);});
    let output='';const base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Package startup timed out')),12000);child.stdout.on('data',v=>{output+=v;const m=output.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(`http://127.0.0.1:${m[1]}`);}});child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);reject(Error(`Package exited before listening (${code})`));});});
    async function get(route,token,body){return fetch(base+route,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
    assert.equal((await get('/api/health')).status,200);const caps=await(await get('/api/krokly-driver/capabilities')).json();assert.equal(caps.driverAccount.weeklyPdf,true);assert.equal(caps.driverAccount.settlementsEnabled,true);assert.equal(caps.driverAccount.tipsEnabled,false);proof.checks.envFileBankConfigurationLoaded=true;
    const session=await(await get('/api/krokly-driver/login',null,{username:'package-test',password:created.password})).json();assert.ok(session.token);
    const report=await(await get('/api/krokly-driver/account',session.token)).json();assert.equal(report.summary.completedCount,1);assert.equal(report.history[0].bibouPlusDeliveryCovered,true);assert.equal(report.history[0].deliveryFeeCents,0);assert.equal(report.history[0].driverPayCents,499);proof.checks.driverAccount=true;
    // Dependency resolution/font data verified independently; no output PDF is
    // authored or delivered by this packaging check.
    const renderer=require(path.join(runtime,'server/pdf/driver-statement'));assert.equal(typeof renderer.renderStatement,'function');proof.checks.pdfRuntimeLoadsWithoutRepositoryDependencies=true;
    assert.equal((await get('/api/krokly-driver/statement')).status,401);const s=await(await get('/api/krokly-driver/settlements',session.token)).json();assert.equal(s.enabled,true);assert.equal(s.automaticTransfer,false);proof.checks.authAndMaskedSettlements=true;
    if(nativeRoot){
      const {createBibouService}=require(path.join(nativeRoot,'src/bibou-api-service.cjs'));
      const api=createBibouService({baseUrl:base,allowLoopbackForTests:true});
      const login=await api.login('package-test',created.password);assert.ok(login.token);
      const account=await api.account(login.token);assert.equal(account.history[0].bibouPlusDeliveryCovered,true);assert.equal(account.summary.totalEntitlementCents,499);
      await api.saveBank(login.token,{holder:'Titulaire de test',iban:'FR1420041010050500013M02606',bic:'PSSTFRPPXXX'});
      const saved=await api.settlements(login.token);assert.equal(saved.bank.registered,true);assert.equal(saved.availableCents,499);assert.equal(JSON.stringify(saved).includes('FR1420041010050500013M02606'),false);
      const requested=await api.requestPayment(login.token);assert.equal(requested.amountCents,499);assert.equal(requested.status,'pending');assert.equal((await api.settlements(login.token)).availableCents,0);
      assert.equal(JSON.stringify(JSON.parse(await fs.readFile(data,'utf8'))).includes('FR1420041010050500013M02606'),false);proof.checks.nativeClientToPackagedServerFinancialFlow=true;
    }
    assert.equal((await get('/driver/')).status,200);proof.checks.driverWebAssets=true;proof.checks.noProductionEnvironmentInherited=true;
    assert.equal(await sourceHash(root,auditedFiles),proof.sourcePayloadSha256);if(nativeRoot)assert.equal(await sourceHash(nativeRoot,nativeFiles),proof.nativeContractSha256);proof.checks.sourceUnchangedDuringChecks=true;proof.passed=Object.values(proof.checks).every(Boolean);
  }catch(e){proof.passed=false;proof.failure=e.message;if(childErrors){let diagnostic=childErrors;for(const secret of fixtureSecrets)diagnostic=diagnostic.split(secret).join('[fixture-secret-redacted]');proof.localStartupDiagnostic=diagnostic.replace(/\b[a-f0-9]{32,}\b/gi,'[redacted]').slice(0,2000);}}
  finally{if(child&&child.exitCode===null){child.kill();await once(child,'exit');}await fs.rm(directory,{recursive:true,force:true});}
  proof.completedAt=new Date().toISOString();const dir=path.join(root,'work/driver-account-20261016');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,`runtime-package-${stamp}.json`);await fs.writeFile(file,JSON.stringify(proof,null,2),{flag:'wx'});console.log(JSON.stringify({report:file,passed:proof.passed,checks:proof.checks,failure:proof.failure,dockerImageBuilt:false}));if(!proof.passed)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
