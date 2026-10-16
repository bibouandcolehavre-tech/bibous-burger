const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./referral-contest'),B=require('./contest-referral-bonus');
const joined=new Date('2026-10-16T10:00:00Z'),amended=new Date('2026-10-17T07:00:00Z');
const person=(id,old=false)=>({id,phone:'+336000000'+String(id).padStart(2,'0'),verifiedPhone:'+336000000'+String(id).padStart(2,'0'),phoneVerifiedAt:joined.toISOString(),firstPhoneVerifiedAt:old?'2026-01-01T00:00:00Z':joined.toISOString(),createdAt:old?'2026-01-01T00:00:00Z':joined.toISOString(),referralCode:'BIBOU-'+id,points:100});
function fixture(){return {customers:[person('1',true),person('2'),person('3'),person('4'),person('5',true)],orders:[],referralContest:{...C.defaultContest(),status:'published',revision:3,startDate:'2026-10-15',startTime:'11:00',endDate:'2026-12-31',rules:'Règlement initial fictif.',entries:[]}};}
const input=(rev=3,code='')=>({contestId:'bibou-launch',revision:rev,acceptRules:true,confirmAdult:true,confirmRegion:true,sponsorCode:code});
const publish=(db,now=amended)=>C.publishReferralBonus(db,{contestId:'bibou-launch',revision:3,confirmation:'PUBLIER 20 POINTS CHACUN'},now);
function enrolled(){const db=fixture();C.joinContest(db,db.customers[0],input(),'fixture-secret',joined);C.joinContest(db,db.customers[1],input(3,'BIBOU-1'),'fixture-secret',joined);return db;}
test('No bonus or rule change merely by deploying or reading; old scoring preserved',()=>{const db=enrolled(),before=JSON.stringify(db);assert.equal(C.customerContest(db,db.customers[0],joined).participation.score,20);assert.equal(C.customerContest(db,db.customers[1],joined).participation.score,0);assert.equal(C.publicContest(db,joined).scoring.pointsPerVerifiedInvitee,undefined);assert.equal(JSON.stringify(db),before);});
test('Explicit amendment adds 20 to prior eligible invitee once, preserves sponsor, dates, prizes, loyalty and original rules',()=>{
  const db=enrolled(),previous=structuredClone(db.referralContest);const result=publish(db);assert.equal(result.changed,true);assert.equal(result.draft.revision,4);
  for(const key of ['id','startDate','startTime','endDate','firstPrize','secondPrize','thirdPrize','entries'])assert.deepEqual(db.referralContest[key],previous[key]);
  assert.equal(db.referralContest.ruleAmendments[0].previousRules,previous.rules);assert.match(C.publicContest(db,amended).rules,/AVENANT — PARRAINAGE : 20 POINTS CHACUN/);assert.equal(C.publicContest(db,amended).scoring.pointsPerVerifiedInvitee,20);
  const a=C.customerContest(db,db.customers[0],amended),b=C.customerContest(db,db.customers[1],amended);assert.equal(a.participation.score,20);assert.equal(b.participation.score,20);assert.equal(b.participation.inviteePoints,20);assert.equal(b.participation.purchasePoints,0);assert.equal(b.participation.referrals,0);assert.deepEqual(db.customers.map(c=>c.points),[100,100,100,100,100]);
  const saved=JSON.stringify(db);assert.equal(publish(db).changed,false);for(let i=0;i<4;i++)assert.equal(C.customerContest(db,db.customers[1],amended).participation.score,20);assert.equal(JSON.stringify(db),saved);
});
test('Old invitee bonus is reached at amendment publication, not backdated; future invitee at actual join',()=>{
  const db=enrolled();publish(db);assert.equal(C.dashboardContest(db,amended).ranking.find(r=>r.customerId==='2').reachedAt,amended.toISOString());
  assert.equal(C.customerContest(db,db.customers[1],new Date(amended-1)).participation.inviteePoints,0);
  const later=new Date('2026-10-17T09:00:00Z');C.joinContest(db,db.customers[2],input(4,'BIBOU-1'),'fixture-secret',later);assert.equal(C.dashboardContest(db,later).ranking.find(r=>r.customerId==='3').reachedAt,later.toISOString());
});
test('Several eligible friends on same Paris day all reward sponsor and each receive exactly 20',()=>{
  const db=enrolled();publish(db);for(const index of [2,3])C.joinContest(db,db.customers[index],input(4,'BIBOU-1'),'fixture-secret',amended);
  assert.equal(C.customerContest(db,db.customers[0],amended).participation.referrals,3);assert.equal(C.customerContest(db,db.customers[0],amended).participation.score,60);
  for(const index of [1,2,3]){assert.equal(C.customerContest(db,db.customers[index],amended).participation.score,20);assert.equal(C.joinContest(db,db.customers[index],input(4,'BIBOU-1'),'fixture-secret',amended).changed,false);}
});
test('Ten valid invitees on the same day give the sponsor 200 points, without a daily referral cap',()=>{
  for(const amendedRules of [false,true]){
    const db=fixture();
    C.joinContest(db,db.customers[0],input(),'fixture-secret',joined);
    if(amendedRules)publish(db);
    const revision=amendedRules?4:3;
    const invitees=Array.from({length:10},(_,index)=>person(String(index+10)));
    db.customers.push(...invitees);
    for(const invitee of invitees)C.joinContest(db,invitee,input(revision,'BIBOU-1'),'fixture-secret',amended);
    const sponsor=C.customerContest(db,db.customers[0],amended).participation;
    assert.equal(sponsor.referrals,10);
    assert.equal(sponsor.score,200);
    for(const invitee of invitees){
      const state=C.customerContest(db,invitee,amended).participation;
      assert.equal(state.score,amendedRules?20:0);
      assert.equal(C.joinContest(db,invitee,input(revision,'BIBOU-1'),'fixture-secret',amended).changed,false);
    }
    assert.equal(C.customerContest(db,db.customers[0],amended).participation.score,200);
  }
});
test('Old accounts, self-referral, no-sponsor registrations and withdrawn/recreated accounts never manufacture invitee points',()=>{
  const db=enrolled();publish(db);C.joinContest(db,db.customers[4],input(4,'BIBOU-1'),'fixture-secret',amended);C.joinContest(db,db.customers[2],input(4),'fixture-secret',amended);
  assert.equal(C.customerContest(db,db.customers[4],amended).participation.inviteePoints,0);assert.equal(C.customerContest(db,db.customers[2],amended).participation.inviteePoints,0);
  assert.throws(()=>C.joinContest(db,db.customers[3],input(4,'BIBOU-4'),'fixture-secret',amended));
  C.withdrawContest(db,db.customers[1],amended);const recreated={...db.customers[1],id:'recreated'};db.customers.push(recreated);assert.throws(()=>C.joinContest(db,recreated,input(4,'BIBOU-1'),'fixture-secret',amended),/déjà participé/);assert.equal(C.customerContest(db,db.customers[0],amended).participation.referrals,0);
});
test('Replays, stale confirmation, arbitrary score/date changes and closed/draft contests cannot mutate settings',()=>{
  for(const bad of [{contestId:'bibou-launch',revision:2,confirmation:'PUBLIER 20 POINTS CHACUN'},{contestId:'other',revision:3,confirmation:'PUBLIER 20 POINTS CHACUN'},{contestId:'bibou-launch',revision:3,confirmation:'oui'},{contestId:'bibou-launch',revision:3,confirmation:'PUBLIER 20 POINTS CHACUN',points:999}]){const db=enrolled(),before=JSON.stringify(db);assert.throws(()=>C.publishReferralBonus(db,bad,amended));assert.equal(JSON.stringify(db),before);}
  const db=enrolled();assert.throws(()=>publish(db,new Date('2027-01-01T00:00:00Z')),/cours/);db.referralContest.status='draft';assert.throws(()=>publish(db),/cours/);
});
test('Daily share and invitee bonuses remain separate and no contact/private data is added to public leaderboard',()=>{const db=enrolled();publish(db);C.recordShareAction(db,db.customers[1],{contestId:'bibou-launch',revision:4},amended);C.recordShareAction(db,db.customers[1],{contestId:'bibou-launch',revision:4},amended);const state=C.customerContest(db,db.customers[1],amended);assert.equal(state.participation.sharePoints,1);assert.equal(state.participation.inviteePoints,20);assert.equal(state.participation.score,21);const publicRows=JSON.stringify(state.leaderboard);assert.equal(publicRows.includes('phone'),false);assert.equal(publicRows.includes('customerId'),false);assert.equal(B.enabled(db.referralContest),true);});
