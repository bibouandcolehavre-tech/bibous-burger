const test = require('node:test'), assert = require('node:assert/strict');
const stb = require('./stb-tickets'), wheel = require('./wheel');
const at = value => new Date('2026-11-01T' + value + 'Z');
const target = { id:'stb-home-20261106-orleans', opponent:'Orléans LBA', startAt:'2026-11-06T19:00:00.000Z', opensAt:'2026-10-21T22:00:00.000Z', confirmed:true };
function fixture() {
  const db = { customers:[{id:'c1'},{id:'c2'}], orders:[], wheelSpins:[] };
  stb.configure(db,{enabled:true,rules:'Premier lot : STB Le Havre–Orléans LBA.\nSi le lot n’a pas été gagné à la clôture, rattrapage avant 20 h.',matches:[target]});
  return db;
}
function order(n,time='18:01:00.000',patch={}) {return {id:'order-'+n,number:n,customerId:n===1?'c1':'c2',method:'pickup',status:'confirmed',subtotal:9.9,discount:0,total:9.9,createdAt:at('17:59:00').toISOString(),payment:{provider:'sumup',status:'PAID',paidAt:at(time).toISOString()},...patch};}
test('first paid STB order: exact 19:00 Paris boundary, no wheel or additional minimum',()=>{
 const db=fixture();db.orders.push(order(1,'17:59:59.999'));
 assert.equal(stb.awardFirstPaidOrder(db,at('17:59:59.999')),null);
 assert.equal(stb.awardFirstPaidOrder(db,at('18:00:00')),null);
 db.orders.push(order(2,'18:00:00.000'));
 const won=stb.awardFirstPaidOrder(db,at('18:00:00'));assert.equal(won.orderNumber,2);assert.equal(won.quantity,2);assert.equal(won.source,'first_paid_order');assert.equal(won.fulfillment,'awaiting_delivery');assert.equal(db.wheelSpins.length,0);
});
test('first paid STB order: paid order wins ahead of order creation and later confirmations; replay never duplicates',()=>{
 const db=fixture();db.orders.push(order(1,'18:02:00'),order(2,'18:01:00'));
 const won=stb.awardFirstPaidOrder(db,at('18:03:00'));assert.equal(won.orderNumber,2);
 assert.equal(stb.awardFirstPaidOrder(db,at('18:04:00')),null);
 assert.equal(stb.reconcile(db,()=>false,at('18:04:00')),true); // publish rules only
 assert.equal(stb.reconcile(db,()=>false,at('18:05:00')),false);
 assert.equal(db.stbTickets.awards.length,1);assert.equal(db.stbTickets.awards[0].fulfillment,'awaiting_delivery');
});
test('first paid STB order: reject unpaid, failed, gifted, review, test and fully refunded orders',()=>{
 const examples=[{status:'awaiting_payment'},{status:'cancelled'},{isTest:true},{isReview:true},{reviewMode:true},{id:'review-order-1'},{payment:{provider:'sumup',status:'FAILED',paidAt:at('18:01:00').toISOString()}},{payment:{provider:'promotion',status:'PAID',paidAt:at('18:01:00').toISOString()}},{payment:{provider:'isolated-review-simulation',status:'PAID',paidAt:at('18:01:00').toISOString()}},{total:0},{subtotal:0},{refund:{status:'due'}},{refund:{status:'recorded',amount:9.9}},{customerId:'deleted'}];
 for(const patch of examples){const db=fixture();db.orders.push(order(1,'18:01:00',patch));assert.equal(stb.awardFirstPaidOrder(db,at('18:03:00')),null,JSON.stringify(patch));assert.equal(db.stbTickets.awards.length,0);}
 const db=fixture();db.customers[0].reviewMode=true;db.orders.push(order(1));assert.equal(stb.awardFirstPaidOrder(db,at('18:03:00')),null);
});
test('first paid STB order: verified kiosk terminal, guest and collected cash may win; cash merely due cannot',()=>{
 const stamp=at('18:01:00').toISOString();
 for(const payment of [{channel:'sumup_terminal',status:'PAID',transactionId:'fixture',verifiedAt:stamp,paidAt:stamp},{provider:'cash',status:'PAID',collectedBy:'restaurant',collectedAt:stamp,paidAt:stamp}]){
  const db=fixture();db.orders.push(order(1,'18:01:00',{customerId:'guest-session',kioskGuest:true,kioskCash:payment.provider==='cash',payment}));assert.equal(stb.awardFirstPaidOrder(db,at('18:03:00')).orderNumber,1);
 }
 for(const payment of [{provider:'cash',status:'PAID',paidAt:stamp},{channel:'sumup_terminal',status:'PAID',paidAt:stamp},{provider:'cash',status:'CASH_DUE',paidAt:stamp}]){const db=fixture();db.orders.push(order(1,'18:01:00',{kioskCash:true,payment}));assert.equal(stb.awardFirstPaidOrder(db,at('18:03:00')),null);}
});
test('first paid STB order: never move an existing winner or delivered tickets',()=>{
 const db=fixture();db.stbTickets.entries.push({matchId:target.id,customerId:'c2',spinId:'old-spin'});const old=stb.spinAward(db,target,'c2','old-spin',at('17:00:00'));db.orders.push(order(1));
 assert.equal(stb.awardFirstPaidOrder(db,at('18:03:00')),null);assert.equal(db.stbTickets.awards.length,1);assert.equal(db.stbTickets.awards[0].id,old.id);
});
test('first paid STB order: cancellation before delivery revokes once and selects the next valid purchase within deadline',()=>{
 const db=fixture();db.orders.push(order(1),order(2,'18:02:00'));stb.awardFirstPaidOrder(db,at('18:03:00'));db.orders[0].status='cancelled';
 stb.reconcile(db,()=>false,at('18:04:00'));assert.deepEqual(db.stbTickets.awards.map(a=>a.fulfillment),['revoked','awaiting_delivery']);assert.equal(db.stbTickets.awards[1].orderNumber,2);
 stb.reconcile(db,()=>false,at('18:05:00'));assert.equal(db.stbTickets.awards.length,2);
});
test('first paid STB order: delivered award is flagged for review after reversal and cannot grant a second lot',()=>{
 const db=fixture();db.orders.push(order(1),order(2,'18:02:00'));const a=stb.awardFirstPaidOrder(db,at('18:03:00'));stb.fulfill(db,a.id,{confirmation:'DEUX PLACES REMISES'},at('18:04:00'));db.orders[0].status='cancelled';
 stb.reconcile(db,()=>false,at('18:05:00'));assert.equal(a.needsReview,true);assert.equal(a.fulfillment,'delivered');assert.equal(db.stbTickets.awards.length,1);
});
test('first paid STB order: original 19:55 fallback retains all existing eligible participants if no new order wins',()=>{
 const db=fixture();db.stbTickets.entries=[{matchId:target.id,customerId:'c1',spinId:'historical-real-spin'}];const before=structuredClone(db.stbTickets.entries);
 stb.reconcile(db,()=>true,at('18:54:59'));assert.equal(db.stbTickets.awards.length,0);
 stb.reconcile(db,()=>true,at('18:55:00'),()=>0);assert.equal(db.stbTickets.awards[0].source,'catch_up_draw');assert.deepEqual(db.stbTickets.entries,before);
});
test('first paid STB order: remains restricted to Nov 1, paid before 19:55, cutoff and exact Orléans match',()=>{
 for(const [paid,now] of [['18:55:00','18:56:00'],['18:01:00','19:00:00.001'],['18:04:00','18:03:00']]){const db=fixture();db.orders.push(order(1,paid));assert.equal(stb.awardFirstPaidOrder(db,at(now)),null);}
 const db=fixture();db.stbTickets.matches[0]={...target,id:'different-match'};db.orders.push(order(1));assert.equal(stb.awardFirstPaidOrder(db,at('18:03:00')),null);
 const inactive=fixture();inactive.stbTickets.enabled=false;inactive.orders.push(order(1));assert.equal(stb.awardFirstPaidOrder(inactive,at('18:03:00')),null);
});
test('first paid STB order: public rule migration is idempotent, other dates, entries, points and wheel odds intact',()=>{
 const db=fixture();db.wheel=wheel.defaultWheel();db.stbTickets.entries=[{matchId:target.id,spinId:'old'}];const before=structuredClone({matches:db.stbTickets.matches,entries:db.stbTickets.entries,wheel:db.wheel,customers:db.customers});
 assert.equal(stb.reconcile(db,()=>false,at('17:00:00')),true);assert.equal(db.stbTickets.rules.split(stb.FIRST_ORDER_RULE).length,2);assert.equal(stb.reconcile(db,()=>false,at('17:01:00')),false);
 assert.deepEqual({matches:db.stbTickets.matches,entries:db.stbTickets.entries,wheel:db.wheel,customers:db.customers},before);assert.equal(stb.drawAt(target),Date.parse('2026-11-01T18:55:00Z'));assert.equal(stb.cutoff(target),Date.parse('2026-11-01T19:00:00Z'));
});
test('first paid STB order: payment finalization invokes attribution before guest loyalty early return',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'server.js'),'utf8');const start=source.indexOf('const finalizePaidOrder =');const end=source.indexOf('const customer = database.customers.find',start);
 assert(source.slice(start,end).includes('stbTickets.awardFirstPaidOrder(database, new Date(now))'));
});
