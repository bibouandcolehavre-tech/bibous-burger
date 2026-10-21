const test=require('node:test'),assert=require('node:assert/strict');
const T=require('./delivery-timing'),L=require('./timing-learning'),C=require('../delivery-tracking-client');
const now=Date.parse('2026-10-16T17:00:00Z'),iso=ms=>new Date(ms).toISOString();
const order=(id,extra={})=>({id,serviceDate:'2026-10-16',slot:'19:00',method:'delivery',status:'preparing',payment:{status:'PAID'},subtotal:20,items:[{productId:'classique',quantity:1}],kitchenAcceptedAt:iso(now),deliveryTravelSeconds:480,...extra});
const preview=(db,o,at)=>T.customerTiming(db,o,at,{preview:true});
test('customer delay adds Google road time to preparation; never treats the kitchen band as a total',()=>{
  const o=order('a'),db={orders:[o]},s=preview(db,o,now);
  assert.equal(s.remainingMinutes,23);assert.equal(s.preparationMinutes,15);assert.equal(s.travelMinutes,8);assert.equal(s.queueMinutes,0);
  assert.equal(preview(db,o,now+5*60000).remainingMinutes,18);
});
test('two meals prepare in parallel; third waits, and early Ready shortens its remaining delay',()=>{
  const a=order('a'),b=order('b'),c=order('c'),db={orders:[a,b,c]};
  assert.equal(preview(db,a,now).remainingMinutes,23);
  assert.equal(preview(db,b,now).remainingMinutes,23);
  assert.equal(preview(db,c,now).remainingMinutes,38);
  a.status='ready';a.kitchenReadyAt=iso(now+5*60000);
  assert.equal(preview(db,c,now+5*60000).remainingMinutes,23);
  b.status='cancelled';b.updatedAt=iso(now+5*60000);assert.equal(preview(db,c,now+5*60000).remainingMinutes,23);
});
test('future delivery arrival slot subtracts the road leg for kitchen scheduling, rather than adding it twice',()=>{
  const o=order('a',{slot:'21:00'}),db={orders:[o]},f=T.kitchenForecast(db,o,now);
  assert.equal(iso(f.readyAt),'2026-10-16T18:52:00.000Z');
  assert.equal(preview(db,o,now).remainingMinutes,120);
});
test('accepted courier waiting for pickup never promises five minutes, even twenty-five minutes later',()=>{
  const o=order('waiting',{status:'ready',kitchenReadyAt:iso(now+15*60000),deliveryTravelSeconds:300,kroklyDriver:{driverId:'d1',status:'accepted'}}),db={orders:[o]};
  for(const minutes of [15,20,40]) {
    const timing=T.customerTiming(db,o,now+minutes*60000);
    assert.equal(timing.available,false);assert.equal(timing.reason,'waiting-for-driver');assert.equal(timing.remainingMinutes,undefined);
    assert.doesNotMatch(C.delayLabel(timing),/\b5 min/);
  }
});
test('preparing and unaccepted orders do not turn a conditional kitchen forecast into an arrival countdown',()=>{
  for(const status of ['confirmed','preparing']) {
    const o=order('cooking',{status,kroklyDriver:{status:'accepted'},deliveryTravelSeconds:300}),db={orders:[o]};
    const timing=T.customerTiming(db,o,now+14*60000);
    assert.equal(timing.available,false);assert.equal(timing.remainingMinutes,undefined);
    assert.equal(preview(db,o,now+14*60000).remainingMinutes,6);
  }
});
test('physical departure starts one countdown; unknown, future and overdue departure never reset it',()=>{
  const o=order('departed',{status:'out_for_delivery',deliveryTravelSeconds:300,kroklyDriver:{driverId:'d1',status:'picked_up',pickedUpAt:iso(now+15*60000)}}),db={orders:[o]};
  assert.equal(T.customerTiming(db,o,now+15*60000).remainingMinutes,5);
  assert.equal(T.customerTiming(db,o,now+17*60000).remainingMinutes,3);
  assert.equal(T.customerTiming(db,o,now+40*60000).reason,'journey-update-needed');
  assert.equal(T.customerTiming(db,o,now+14*60000).available,false);
  delete o.kroklyDriver.pickedUpAt;assert.equal(T.customerTiming(db,o,now+17*60000).available,false);
  o.updatedAt=iso(now+15*60000);assert.equal(T.customerTiming(db,o,now+17*60000).remainingMinutes,3);
});
test('grouped Bibou or imported Uber work never pretends each stop is a direct route from the restaurant',()=>{
  const o=order('a',{status:'out_for_delivery',kroklyDriver:{driverId:'d1',status:'picked_up',pickedUpAt:iso(now)}});
  for(const collection of ['orders','externalDeliveries']) {
    const db={orders:[o],externalDeliveries:[]};
    const other=order('b',{status:'out_for_delivery',kroklyDriver:{driverId:'d1',status:'picked_up',pickedUpAt:iso(now)}});
    db[collection].push(other);
    assert.equal(T.customerTiming(db,o,now+60000).available,false);
    other.status='delivered';assert.equal(T.customerTiming(db,o,now+60000).remainingMinutes,7);
  }
});
test('missing route, unknown late meal, no courier and overdue journey never invent a reliable countdown',()=>{
  const o=order('a'),db={orders:[o]};
  o.deliveryTravelSeconds=null;assert.equal(T.customerTiming(db,o,now).available,false);
  o.deliveryTravelSeconds=480;assert.equal(T.customerTiming(db,o,now+16*60000).reason,'kitchen-update-needed');
  o.status='ready';o.kitchenReadyAt=iso(now+10*60000);assert.equal(T.customerTiming(db,o,now+10*60000).reason,'waiting-for-driver');
  o.status='out_for_delivery';o.kroklyDriver={pickedUpAt:iso(now+11*60000)};
  assert.equal(T.customerTiming(db,o,now+12*60000).remainingMinutes,7);
  assert.equal(T.customerTiming(db,o,now+20*60000).reason,'journey-update-needed');
  o.status='delivered';assert.equal(T.customerTiming(db,o,now+20*60000),null);
});
test('learning requires five unqueued, unchanged, explicit kitchen Ready measurements; pickup alone is not cooking evidence',()=>{
  const db={orders:[]};
  for(let i=0;i<5;i++) {const o=order('learn'+i);o.kitchenObservation={version:1,signature:L.signature(o),queueMinutes:0,baseMinutes:15};o.kitchenReadyAt=iso(now+20*60000);db.orders.push(o);}
  const at=now+60*60000;
  assert.equal(L.model({orders:db.orders.slice(0,4)},at).preparation[15].value,15);
  assert.equal(L.model(db,at).preparation[15].value,20);
  db.orders[0].items[0].quantity++;assert.equal(L.model(db,at).preparation[15].learned,false);
  db.orders[0].items[0].quantity--;db.orders[0].kitchenObservation.queueMinutes=5;assert.equal(L.model(db,at).preparation[15].learned,false);
  db.orders[0].kitchenObservation.queueMinutes=0;delete db.orders[0].kitchenReadyAt;db.orders[0].kroklyDriver={pickedUpAt:iso(now+20*60000)};assert.equal(L.model(db,at).preparation[15].learned,false);
});
test('learning road duration uses completed pickup-to-delivery legs, a rolling median and bounded correction',()=>{
  const rows=Array.from({length:5},(_,i)=>order('road'+i,{status:'delivered',deliveryTravelSeconds:600,kroklyDriver:{pickedUpAt:iso(now),deliveredAt:iso(now+12*60000)}}));
  assert.equal(L.model({orders:rows},now+3600000).travel.value,1.2);
  rows.push(order('outlier',{status:'delivered',deliveryTravelSeconds:600,kroklyDriver:{pickedUpAt:iso(now),deliveredAt:iso(now+25*60000)}}));
  assert.equal(L.model({orders:rows},now+3600000).travel.value,1.2);
  rows[0].reviewMode=true;rows[1].payment.status='FAILED';assert.equal(L.model({orders:rows},now+3600000).travel.learned,false);
});
test('customer map uses bounded tiles and a recent own-course position, never credentials or contacts in map requests',()=>{
  const p={latitude:49.49,longitude:0.12,accuracy:10,validForMs:30000},map=C.mapTiles(p);
  assert.ok(map.tiles.length>0&&map.tiles.length<=9);
  for(const tile of map.tiles){const u=new URL(tile.url);assert.equal(u.origin,'https://data.geopf.fr');assert.equal(u.searchParams.has('token'),false);}
  assert.equal(C.validPosition({...p,validForMs:0}),false);assert.equal(C.validPosition({...p,latitude:91}),false);
  assert.equal(C.delayLabel({available:true,remainingMinutes:23}),'Livraison dans environ 23 min');
  assert.doesNotMatch(C.delayLabel({available:false,reason:'kitchen-update-needed'}),/\d{2}:\d{2}/);
});
