const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const preset=require('../restaurant-dashboard/contest-launch-20261015.json');
test('HTTP règles : mêmes clarifications sans authentification sur les trois supports, dates et calcul conservés', {timeout:20000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-rule-clarification-')),file=path.join(dir,'fixture.json');
  await fs.writeFile(file,JSON.stringify({customers:[],orders:[],referralContest:{id:'bibou-launch',...preset,status:'published',revision:3,entries:[]}}));
  const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{cwd:dir,env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',DATA_FILE_PATH:file,RESTAURANT_DASHBOARD_PASSWORD:'fictional-password',SESSION_SECRET:'fictional-secret'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{let output='',errors='';child.stdout.on('data',d=>{output+=d;const m=output.match(/http:\/\/localhost:\d+/);if(m)resolve(m[0]+'/api');});child.stderr.on('data',d=>errors+=d);child.on('error',reject);child.on('exit',()=>reject(Error(errors)));});
  let first;
  for(const platform of ['ios','android','web']){
    const response=await fetch(base+'/contest?contestApi=2',{headers:platform==='web'?{Origin:'https://fixture.invalid'}:{'X-Bibou-Platform':platform}}),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.revision,3);assert.equal(body.startDate,'2026-10-15');assert.equal(body.startTime,'11:00');assert.equal(body.endDate,'2026-12-31');
    assert.deepEqual(body.scoring,{pointsPerEuro:1,pointsPerVerifiedReferral:20,pointsPerDailyShareAction:1,pointsPerAwardedWheelPoint:1});
    assert.match(body.rules,/Conditions d’utilisation des lots du classement uniquement/);assert.match(body.rules,/pas les menus bonus Instagram/);
    assert.match(body.rules,/menus offerts sont sans suppléments payants/);assert.match(body.rules,/avant son inscription mais après l’ouverture/);
    if(first)assert.deepEqual(body,first);else first=body;
  }
  assert.equal((await fetch(base+'/dashboard/contest')).status,401);
  assert.equal((await fetch(base+'/dashboard/contest/prizes')).status,401);
  const saved=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(saved.referralContest.revision,3);assert.equal(saved.referralContest.entries.length,0);assert.equal(saved.referralContest.rules,preset.rules);
  assert.equal(saved.orders.length,0);assert.equal(saved.contestPrizes,undefined);assert.equal(saved.instagramContestPrizes,undefined);
});
