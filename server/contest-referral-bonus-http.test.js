const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {defaultContest}=require('./referral-contest'),{createCustomerSession}=require('./customer-session');
test('Referral amendment HTTP: owner-only, no read activation, stale protection, one retroactive bonus and cross-platform totals',{timeout:20000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-referral-amendment-')),file=path.join(dir,'data.json');
  const at='2026-10-16T10:00:00Z';
  const customers=['sponsor','invitee'].map((id,index)=>({id,name:'Fictif',phone:'+3360000000'+index,verifiedPhone:'+3360000000'+index,phoneVerifiedAt:at,firstPhoneVerifiedAt:at,createdAt:at,referralCode:'BIBOU-'+id.toUpperCase(),points:100,loyaltyWeekStart:'2026-11-09',weeklyOrders:0,weeklyWeightedBasePoints:0,weeklyProgramPoints:0}));
  await fs.writeFile(file,JSON.stringify({customers,orders:[],bibouPlusPurchases:[],nextBibouPlusNumber:1,rewardClaims:[],nextRewardClaimNumber:1,loyaltyAdjustments:[],referralContest:{...defaultContest(),status:'published',revision:3,startDate:'2026-10-15',startTime:'11:00',endDate:'2026-12-31',rules:'Règlement fictif.',entries:customers.map((c,index)=>({customerId:c.id,alias:'Fictif '+index,joinedAt:at,newCustomer:true,sponsorId:index?'sponsor':null,shareEvents:[]}))}}));
  const child=spawn(process.execPath,['--require',path.join(__dirname,'test-fixtures/contest-prize-clock.cjs'),path.join(__dirname,'server.js')],{cwd:dir,env:{PATH:process.env.PATH,NODE_ENV:'test',FAKE_CONTEST_PRIZE_CLOCK:'true',PORT:'0',LISTEN_HOST:'127.0.0.1',DATA_FILE_PATH:file,RESTAURANT_DASHBOARD_PASSWORD:'fixture-owner',SESSION_SECRET:'fixture-secret'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{let text='',error='';child.stdout.on('data',c=>{text+=c;const m=text.match(/http:\/\/localhost:\d+/);if(m)resolve(m[0]+'/api');});child.stderr.on('data',c=>error+=c);child.on('error',reject);child.on('exit',()=>reject(Error(error)));});
  const request=(route,token='',body,method=body?'POST':'GET',platform='web')=>fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Bibou-Platform':platform},...(body?{body:JSON.stringify(body)}:{})});
  const input={contestId:'bibou-launch',revision:3,confirmation:'PUBLIER 20 POINTS CHACUN'};
  const before=await fs.readFile(file,'utf8');
  assert.equal((await request('/dashboard/contest/referral-bonus','',input)).status,401);
  assert.equal((await request('/dashboard/contest/referral-bonus',createCustomerSession('sponsor','fixture-secret'),input)).status,401);
  assert.equal((await(await request('/contest?contestApi=2')).json()).scoring.pointsPerVerifiedInvitee,undefined);
  assert.equal(await fs.readFile(file,'utf8'),before);
  const admin=(await(await request('/dashboard/auth/login','',{password:'fixture-owner'})).json()).token;
  assert.equal((await request('/dashboard/contest/referral-bonus',admin,undefined,'GET')).status,405);
  assert.equal((await request('/dashboard/contest/referral-bonus',admin,{...input,revision:2})).status,409);
  assert.equal(await fs.readFile(file,'utf8'),before);
  const published=await request('/dashboard/contest/referral-bonus',admin,input);assert.equal(published.status,200);assert.equal((await published.json()).changed,true);
  const saved=await fs.readFile(file,'utf8');
  assert.equal((await(await request('/dashboard/contest/referral-bonus',admin,input)).json()).changed,false);
  for(const platform of ['ios','android','web'])for(const id of ['sponsor','invitee']){
    const state=await(await request('/customer/contest?contestApi=2',createCustomerSession(id,'fixture-secret'),undefined,'GET',platform)).json();
    assert.equal(state.participation.score,20);assert.equal(state.contest.revision,4);assert.equal(state.contest.scoring.pointsPerVerifiedInvitee,20);
    assert.equal(state.participation.inviteePoints,id==='invitee'?20:0);
  }
  assert.equal(await fs.readFile(file,'utf8'),saved);
  const stored=JSON.parse(saved);assert.deepEqual(stored.customers.map(c=>c.points),[100,100]);assert.equal(stored.orders.length,0);assert.equal(stored.referralContest.ruleAmendments.length,1);
});
