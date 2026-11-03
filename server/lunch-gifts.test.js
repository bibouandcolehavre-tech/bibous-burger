const test = require('node:test'), assert = require('node:assert/strict');
const gifts = require('./lunch-gifts'), stock = require('./quantity-stock');
const { grantLoyaltyForOrder } = require('./loyalty');
const { defaultContest, contestRanking } = require('./referral-contest');
const { customerWheelState, spinWheel, defaultWheel } = require('./wheel');
const { CONTEST_WHEEL_BONUS_RULES } = require('./contest-wheel-points');
const printer = require('../restaurant-dashboard/epson-print');
const now = new Date('2026-11-03T11:05:00Z'), secret = 'fictional-lunch-only';
const customer = i => ({ id: 'c'+i, name:'Client fictif '+i, phone:'+336000000'+String(i).padStart(2,'0'), points:150 });
const order = (i, extra={}) => ({ id:'o'+i, number:i, customerId:'c'+i, customerName:'Client fictif', status:'awaiting_payment',
  createdAt:'2026-11-03T10:55:00Z', serviceDate:'2026-11-03', slot:'12:30', method:'pickup', subtotal:16.9, discount:0, deliveryFee:0,total:16.9,
  loyaltyBasePoints:15, wheelEurosPerTurn:15, items:[{productId:'taurus',name:'Taurus',quantity:1,price:16.9,options:[]}],
  payment:{status:'PAID',provider:'sumup',paidAt:now.toISOString()}, ...extra });
const fixture = () => ({customers:Array.from({length:8},(_,i)=>customer(i+1)), orders:[],reservations:[]});
const options = {now, secret, randomInt:()=>0};
test('five distinct paid customers, retry idempotency, duplicate phone, next day and no retroactive awards',()=>{
  const db=fixture();
  for(let i=1;i<=6;i++){const o=order(i);db.orders.push(o);assert.equal(Boolean(gifts.award(db,o,db.customers[i-1],options)),i<=5);}
  assert.equal(gifts.state(db,now).status,'exhausted');assert.equal(gifts.state(db,now).awarded,5);
  assert.equal(gifts.award(db,db.orders[0],db.customers[0],options).rank,1);
  const second=order(7,{customerId:'c1'});assert.equal(gifts.award(db,second,db.customers[0],options),null);
  const fresh=fixture(),o=order(1);fresh.orders.push(o);gifts.award(fresh,o,fresh.customers[0],options);
  assert.equal(gifts.award(fresh,order(2),{...fresh.customers[1],phone:'0600000001'},options),null);
  const tomorrow=new Date('2026-11-04T11:05:00Z'),next=order(7,{customerId:'c1',createdAt:'2026-11-04T10:00:00Z',serviceDate:'2026-11-04',payment:{provider:'sumup',status:'PAID',paidAt:tomorrow.toISOString()}});
  assert.equal(gifts.award(fresh,next,fresh.customers[0],{...options,now:tomorrow}).rank,1);
  assert.equal(gifts.award(fresh,order(8,{status:'confirmed'}),fresh.customers[7],options),null);
});
test('strict Paris dates, lunch slots, real online payments and historical order exclusion',()=>{
  for(const extra of [{slot:'19:00'},{slot:'14:00'},{serviceDate:'2026-11-04'},{createdAt:'2026-11-02T12:00:00Z'},
    {payment:{provider:'promotion',status:'PAID',paidAt:now.toISOString()}},{payment:{provider:'cash',status:'PAID',paidAt:now.toISOString()}},
    {payment:{provider:'sumup',status:'PENDING'}},{status:'cancelled'},{reviewMode:true},{isTest:true},{externalSource:'uber'},
    {kioskSessionId:'fake'},{kioskGuest:true},{kioskImmediate:true},{subtotal:0,total:0},{refund:{status:'due',amount:1}}]){
    const db=fixture();assert.equal(gifts.award(db,order(1,extra),db.customers[0],options),null,JSON.stringify(extra));
  }
  for(const date of ['2026-11-02T11:05:00Z','2026-11-10T11:05:00Z','2026-11-03T13:00:00Z'])assert.equal(gifts.eligible(order(1),customer(1),new Date(date)),false);
  assert.equal(gifts.eligible(order(1),{...customer(1),reviewMode:true},now),false);
});
test('gift stock debited once; paid amounts, delivery fees, basket and discounts stay exact',()=>{
  const db=fixture(),o=order(1,{method:'delivery',deliveryFee:2.5,total:19.4});db.orders.push(o);
  stock.setQuantity(db,'frites-maison',{quantity:2,revision:0},now);
  const original=structuredClone(o);const gift=gifts.award(db,o,db.customers[0],options);
  assert.equal(gift.productId,'frites-maison');assert.equal(stock.available(db,'frites-maison'),1);
  gifts.award(db,o,db.customers[0],options);assert.equal(stock.available(db,'frites-maison'),1);
  delete o.lunchGift;assert.deepEqual(o,original);
});
test('manual/quantity outages select only available physical gifts; complete outage retains a concrete gift choice',()=>{
  const db=fixture();stock.setQuantity(db,'frites-maison',{quantity:0,revision:0},now);
  const o=order(1);const g=gifts.award(db,o,db.customers[0],{...options,flags:{'tenders-xl-3':false}});
  assert.ok(g.productId.startsWith('drink-'));assert.equal(g.status,'attached');
  const pending=order(2);db.orders.push(pending);gifts.award(db,pending,db.customers[1],{...options,flags:null});
  assert.equal(pending.lunchGift.status,'choice_required');assert.equal(db.customers[1].points,150);
  gifts.resolve(db,pending,{productId:'tenders-xl-3'},{},now);assert.equal(pending.lunchGift.status,'attached');
  assert.equal(gifts.resolve(db,pending,{productId:'tenders-xl-3'},{},now).productId,'tenders-xl-3');
  assert.throws(()=>gifts.resolve(db,pending,{productId:'frites-maison'},{},now),/déjà/);
});
test('loyalty, purchase ranking and wheel ranking all cumulate with the physical gift, exactly once',()=>{
  const db=fixture(),c=db.customers[0],o=order(1);db.orders.push(o);
  db.wheel={...defaultWheel(),rewardsVersion:2,allSpinsWin:true};
  const contest={...defaultContest(),status:'published',startDate:'2026-11-01',endDate:'2026-11-09',rules:CONTEST_WHEEL_BONUS_RULES,wheelPointsInRanking:true,
    entries:[{customerId:c.id,alias:'Fictif',phoneHash:'test',joinedAt:'2026-11-01T10:00:00Z',acceptedRevision:1,shareEvents:[]}]};db.referralContest=contest;
  gifts.award(db,o,c,options);o.status='confirmed';
  const points=grantLoyaltyForOrder(c,o,now).pointsAdded;assert.equal(points,15);assert.equal(c.points,165);
  assert.equal(customerWheelState(db,c.id,now).available,1,'Gift consumes no wheel turn');
  const spin=spinWheel(db,c.id,{now,orderId:o.id,requestId:'fictional-lunch-spin',randomInt:()=>0});
  assert.equal(spin.spin.pointsAdded,20);assert.equal(c.points,185);assert.ok(o.lunchGift);
  const ranked=contestRanking(db,contest,now).find(r=>r.customerId===c.id);
  assert.equal(ranked.purchasePoints,16);assert.equal(ranked.wheelPoints,20);assert.equal(ranked.score,36);
  assert.equal(grantLoyaltyForOrder(c,o,now).pointsAdded,0);
  assert.equal(spinWheel(db,c.id,{now,orderId:o.id,requestId:'fictional-lunch-spin',randomInt:()=>99}).replayed,true);
  assert.equal(c.points,185);assert.equal(gifts.state(db,now).awarded,1);
});
test('cancelled/refunded awards do not reopen the daily budget; public views reveal no identity or phone hash',()=>{
  const db=fixture(),o=order(1);db.orders.push(o);gifts.award(db,o,db.customers[0],options);o.status='cancelled';o.refund={status:'recorded',amount:16.9};
  assert.equal(gifts.state(db,now).remaining,4);
  const publicData=JSON.stringify(gifts.state(db,now));for(const privateText of ['identityDigest','c1','0600000001','o1'])assert.ok(!publicData.includes(privateText));
  const before=JSON.stringify(db);gifts.state(db,now);gifts.news(db,now,[]);gifts.page(db,now);assert.equal(JSON.stringify(db),before);
});
test('tickets visibly include the exact extra gift while monetary amounts remain unchanged',()=>{
  const db=fixture(),o=order(1);db.orders.push(o);gifts.award(db,o,db.customers[0],options);o.status='confirmed';
  const xml=printer.preparationEnvelope(o);assert.match(xml,/CADEAU MIDI - OFFERT/);assert.match(xml,/frites maison offerte/);
  assert.equal((xml.match(/CADEAU MIDI - OFFERT/g)||[]).length,1);
  const receipt=printer.orderReceiptEnvelope(o);assert.match(receipt,/CADEAU MIDI - OFFERT/);assert.match(receipt,/16,90/);
  assert.doesNotMatch(printer.preparationEnvelope({...o,status:'cancelled'}),/CADEAU MIDI/);
});

test('the offer never advertises a closed lunch service or opens restaurant hours',()=>{
  const db=fixture();const before=JSON.stringify(db);
  const saturday=new Date('2026-11-07T10:00:00Z');assert.equal(gifts.state(db,saturday).status,'closed');
  assert.ok(!gifts.news(db,saturday,[]).some(i=>i.id==='lunch-gifts'));assert.equal(JSON.stringify(db),before);
  const slots=Object.fromEntries(Array.from({length:8},(_,i)=>[String(12+Math.floor(i/4)).padStart(2,'0')+':'+String((i%4)*15).padStart(2,'0'),false]));
  db.serviceSchedule={dates:{'2026-11-03':{services:{pickup:slots,delivery:slots},slotMinutesByMethod:{pickup:15,delivery:15}}}};
  assert.equal(gifts.state(db,now).status,'closed');
});

test('discount holds reserve one place, expire before opening SumUp and survive an uncertain provider result', () => {
  const db = fixture();
  const startDate = '2026-11-03';
  const draft = i => order(i, { payment: undefined, customerPhone: db.customers[i - 1].phone });
  const pricing = { subtotal: 35, discount: 2, deliveryFee: 4, total: 37 };
  const reserve = (o, at) => gifts.reserveDiscount(db, o, db.customers[Number(o.id.slice(1)) - 1], pricing,
    { ...options, now: at, startDate });
  const abandoned = draft(1);
  assert.deepEqual(reserve(abandoned, now), { ...pricing, discount: 7, total: 32 });
  db.orders.push(abandoned);
  const next = draft(2);
  assert.equal(reserve(next, now), pricing);
  const retryTime = new Date(+now + 5 * 60000);
  assert.equal(reserve(next, retryTime).total, 32);
  db.orders.push(next);
  next.payment = { provider: 'sumup', checkoutReference: 'uncertain-test', status: 'PENDING' };
  assert.equal(reserve(draft(3), new Date(+retryTime + 10 * 60000)), pricing);
  for (let i = 3; i <= 7; i++) {
    const paid = order(i);
    db.orders.push(paid);
    assert.equal(Boolean(gifts.award(db, paid, db.customers[i - 1], options)), i < 7);
  }
  next.payment.status = 'PAID';
  gifts.recordPaidDiscount(db, next, db.customers[1], secret, retryTime);
  gifts.recordPaidDiscount(db, next, db.customers[1], secret, retryTime);
  assert.equal(gifts.state(db, now).awarded, 5);
  assert.equal(gifts.award(db, next, db.customers[1], options), null);
});
