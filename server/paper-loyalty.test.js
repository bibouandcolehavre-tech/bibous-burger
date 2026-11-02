const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const paper=require('./paper-loyalty'),wallet=require('./wallet/core');
const {updateRewardClaimStatus}=require('./rewards'),{anonymizeCustomerAccount}=require('./account-deletion');
const now=new Date('2026-11-02T20:00:00Z');
function fixture(){const a={id:'a',name:'Camille Test',firstName:'Camille',phone:'+33600000001',phoneVerifiedAt:'2026-01-01',points:345,weeklyOrders:2},b={...a,id:'b',name:'Alex Test'};return {customers:[a,b],orders:[{id:'preserved',customerId:'a',payment:{status:'PAID'},status:'delivered'}],reservations:[]};}
const transfer=(stamps,reference='PC-TEST-001')=>({requestId:crypto.randomUUID(),stamps,cardReference:reference});
const stamp=(stamps=1,reference='TICKET-1')=>({requestId:crypto.randomUUID(),stamps,ticketReference:reference,ticketDate:'2026-11-02'});
test('partial migration preserves paper value, points and purchases; same request and reference cannot duplicate it',()=>{
 const db=fixture(),a=db.customers[0],body=transfer(6),orders=structuredClone(db.orders);
 assert.equal(paper.customerState(db,a),null);paper.credit(db,a,body,'transfer',now);assert.equal(paper.customerState(db,a).stamps,6);assert.equal(a.points,345);assert.equal(a.weeklyOrders,2);assert.deepEqual(db.orders,orders);
 const saved=JSON.stringify(db);assert.equal(paper.credit(db,a,body,'transfer',now).replayed,true);assert.equal(JSON.stringify(db),saved);
 assert.throws(()=>paper.credit(db,a,{...body,stamps:7},'transfer',now),{statusCode:409});
 assert.throws(()=>paper.credit(db,db.customers[1],transfer(6),'transfer',now),{statusCode:409});
 assert.equal(db.rewardClaims,undefined);
});
test('completing the remaining stamps creates exactly one unique burger gift and closes the old card',()=>{
 const db=fixture(),a=db.customers[0];paper.credit(db,a,transfer(6),'transfer',now);
 const body=stamp(4);paper.credit(db,a,body,'stamp',now);paper.credit(db,a,body,'stamp',now);
 assert.equal(paper.customerState(db,a).stamps,0);assert.equal(db.rewardClaims.length,1);assert.equal(db.rewardClaims[0].source,'paper-card');assert.equal(db.rewardClaims[0].requiredPoints,0);assert.match(db.rewardClaims[0].rewardTitle,/burger offert/);assert.equal(a.points,345);
 assert.throws(()=>paper.credit(db,a,stamp(1,'TICKET-2'),'stamp',now),{statusCode:409});
 const claim=db.rewardClaims[0];updateRewardClaimStatus(db,claim.id,'used');updateRewardClaimStatus(db,claim.id,'used');assert.equal(paper.walletState(db,a).availableBurgers,0);
 const operation=db.paperLoyaltyTransfers.at(-1);assert.throws(()=>paper.cancel(db,a,operation.id,{reason:'Erreur de saisie'}),{statusCode:409});
});
test('several physically distinct old cards preserve all stamps and produce one burger per ten',()=>{
 const db=fixture(),a=db.customers[0];paper.credit(db,a,transfer(6),'transfer',now);paper.credit(db,a,transfer(10,'PC-TEST-002'),'transfer',now);paper.credit(db,a,transfer(4,'PC-TEST-003'),'transfer',now);
 assert.equal(a.paperLoyalty.stamps,0);assert.equal(a.paperLoyalty.importedCards,3);assert.equal(a.paperLoyalty.transferredStamps,20);assert.equal(db.rewardClaims.length,2);assert.equal(new Set(db.rewardClaims.map(c=>c.code)).size,2);
});
test('a receipt cannot credit two accounts, even with different request IDs',()=>{
 const db=fixture(),[a,b]=db.customers;paper.credit(db,a,transfer(6),'transfer',now);paper.credit(db,b,transfer(6,'PC-OTHER-1'),'transfer',now);paper.credit(db,a,stamp(),'stamp',now);
 assert.throws(()=>paper.credit(db,b,stamp(),'stamp',now),{statusCode:409});
});
test('invalid stamp counts, unverified accounts, impossible/future dates and excessive completion are refused without writes',()=>{
 for(const count of [0,11,1.5,'6',null]){const db=fixture();assert.throws(()=>paper.credit(db,db.customers[0],transfer(count),'transfer',now));assert.equal(db.paperLoyaltyTransfers,undefined);}
 const db=fixture(),a=db.customers[0];delete a.phoneVerifiedAt;assert.throws(()=>paper.credit(db,a,transfer(6),'transfer',now));a.phoneVerifiedAt='2026-01-01';paper.credit(db,a,transfer(6),'transfer',now);
 for(const date of ['2026-11-03','2026-02-30','no'])assert.throws(()=>paper.credit(db,a,{...stamp(),ticketDate:date},'stamp',now));
 assert.throws(()=>paper.credit(db,a,stamp(5),'stamp',now));assert.equal(a.paperLoyalty.stamps,6);
});
test('correcting only the last unused operation restores the old balance and cancels its gift; retry never awards again',()=>{
 const db=fixture(),a=db.customers[0];const first=paper.credit(db,a,transfer(6),'transfer',now);const body=stamp(4);const second=paper.credit(db,a,body,'stamp',now);
 assert.throws(()=>paper.cancel(db,a,first.operation.id,{reason:'Erreur de saisie'}),{statusCode:409});
 paper.cancel(db,a,second.operation.id,{reason:'Mauvais nombre de tampons'},now);assert.equal(a.paperLoyalty.stamps,6);assert.equal(db.rewardClaims[0].status,'cancelled');
 paper.credit(db,a,body,'stamp',now);assert.equal(a.paperLoyalty.stamps,6);assert.equal(db.rewardClaims.length,1);
 paper.cancel(db,a,first.operation.id,{reason:'Erreur de saisie'},now);assert.equal(a.paperLoyalty,undefined);
});
test('Wallet follows paper balance and used gifts without changing points or leaking staff records; deletion removes card history',()=>{
 const db=fixture(),a=db.customers[0];wallet.ensureMembership(db,a);const serial=a.clubWallet.serial,initial=a.clubWallet.revision;paper.credit(db,a,transfer(6),'transfer',now);wallet.reconcile(db);
 assert.ok(a.clubWallet.revision>initial);assert.equal(wallet.findPass(db,serial).paperCard.stamps,6);
 paper.credit(db,a,stamp(4),'stamp',now);wallet.reconcile(db);assert.equal(wallet.findPass(db,serial).paperCard.availableBurgers,1);const revision=a.clubWallet.revision;
 updateRewardClaimStatus(db,db.rewardClaims[0].id,'used');wallet.reconcile(db);assert.ok(a.clubWallet.revision>revision);
 const pass=JSON.stringify(wallet.findPass(db,serial));assert.ok(!pass.includes('PC-TEST'));assert.ok(!pass.includes('TICKET-1'));assert.ok(!pass.includes('BIBOU-P-'));
 anonymizeCustomerAccount(db,a,now);assert.equal(db.paperLoyaltyTransfers.length,0);assert.equal(wallet.findPass(db,serial).voided,true);assert.equal(db.rewardClaims[0].customerId,null);
});
