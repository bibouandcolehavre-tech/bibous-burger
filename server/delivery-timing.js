'use strict';
const {preparationMinutes}=require('../service-policy');
const {parisDateKey,serviceSlotInstant}=require('./availability');
const learning=require('./timing-learning');
const MINUTE=60_000, CAPACITY=2, VERSION='bibou-delivery-timing-v1';
const timestamp=value=>Number.isFinite(Date.parse(value))?Date.parse(value):null;
const travelSeconds=order=>Number.isSafeInteger(order?.deliveryTravelSeconds)&&order.deliveryTravelSeconds>=0&&order.deliveryTravelSeconds<=7200?order.deliveryTravelSeconds:null;
const acceptedAt=order=>timestamp(order?.kitchenAcceptedAt)||timestamp(order?.krokliPreparation?.acceptedAt);
const readyAt=order=>timestamp(order?.kitchenReadyAt)||timestamp(order?.kroklyDriver?.pickedUpAt);
function workload(order,learned) {
  try { return learning.kitchenMinutes(order.subtotal,learned); } catch { return null; }
}
function notBefore(order,accepted,learned) {
  const slot=serviceSlotInstant(order.serviceDate,String(order.slot||'').slice(0,5));
  const prep=workload(order,learned),travel=order.method==='delivery'?learning.roadSeconds(travelSeconds(order),learned):0;
  return slot&&prep!==null?Math.max(accepted,slot.getTime()-prep*MINUTE-(travel??0)*1000):accepted;
}
// Two kitchen lanes, shared by paid pickup and delivery orders. This is a
// forecast, not a claim that staff have physically started a particular meal.
// Actual Ready/pickup events release capacity early; unconfirmed overdue work
// stays in the load instead of disappearing because a timer ran out.
function kitchenForecast(database,target,now=Date.now()) {
  const learned=learning.model(database,now);
  const date=target.serviceDate||parisDateKey(new Date(now));
  const jobs=(database.orders||[]).filter(o=>o.serviceDate===date&&o.payment?.status==='PAID'&&!o.reviewMode&&o.amendment?.status!=='pending'&&
    ['preparing','ready','out_for_delivery','delivered','cancelled'].includes(o.status)&&acceptedAt(o)!==null&&workload(o,learned)!==null);
  if(!jobs.includes(target))jobs.push(target);
  const startOf=o=>acceptedAt(o)??now;
  const compare=(a,b)=>{
    const an=notBefore(a,startOf(a),learned),bn=notBefore(b,startOf(b),learned);
    return Math.max(an,now)-Math.max(bn,now)||startOf(a)-startOf(b)||String(a.id||'').localeCompare(String(b.id||''));
  };
  jobs.sort(compare);
  const lanes=Array.from({length:CAPACITY},()=>({end:-Infinity,uncertain:false}));
  for(const o of jobs) {
    const accepted=startOf(o),prep=workload(o,learned);
    if(prep===null)continue;
    lanes.sort((a,b)=>a.end-b.end);
    const lane=lanes[0],start=Math.max(accepted,notBefore(o,accepted,learned),lane.end);
    const cancelled=o.status==='cancelled'?timestamp(o.updatedAt):null;
    if(o.status==='cancelled'&&(cancelled===null||cancelled<=start))continue;
    const confirmed=readyAt(o)??cancelled;
    let end=confirmed??start+prep*MINUTE;
    const overdue=confirmed===null&&end<now;
    if(overdue)end=now;
    const blocked=lane.uncertain;
    if(o===target)return {readyAt:end,startAt:start,preparationMinutes:prep,queueMinutes:Math.max(0,Math.ceil((start-Math.max(accepted,notBefore(o,accepted,learned)))/MINUTE)),overdue,queueUncertain:blocked};
    lane.end=end;lane.uncertain=confirmed===null&&(overdue||blocked);
  }
  return null;
}
function customerTiming(database,order,now=Date.now()) {
  if(order?.method!=='delivery'||order.payment?.status!=='PAID'||order.reviewMode||
    !['confirmed','preparing','ready','out_for_delivery'].includes(order.status))return null;
  const base={version:VERSION,computedAt:new Date(now).toISOString(),stage:order.status,estimate:true};
  const travel=learning.roadSeconds(travelSeconds(order),learning.model(database,now));
  if(travel===null)return {...base,available:false,reason:'travel-unavailable'};
  const pickedUp=timestamp(order.kroklyDriver?.pickedUpAt)||(order.status==='out_for_delivery'?timestamp(order.updatedAt):null);
  if(pickedUp!==null) {
    const end=pickedUp+travel*1000;
    if(end<=now)return {...base,available:false,reason:'journey-update-needed'};
    return {...base,available:true,remainingMinutes:Math.max(1,Math.ceil((end-now)/MINUTE)),preparationMinutes:0,queueMinutes:0,travelMinutes:Math.ceil(travel/60)};
  }
  const forecast=kitchenForecast(database,order,now);
  if(!forecast)return {...base,available:false,reason:'kitchen-unavailable'};
  if(forecast.overdue||forecast.queueUncertain)return {...base,available:false,reason:'kitchen-update-needed'};
  if(order.status==='ready'&&!['accepted','picked_up'].includes(order.kroklyDriver?.status))return {...base,available:false,reason:'waiting-for-driver'};
  const end=Math.max(now,forecast.readyAt)+travel*1000;
  return {...base,available:true,remainingMinutes:Math.max(1,Math.ceil((end-now)/MINUTE)),preparationMinutes:forecast.preparationMinutes,queueMinutes:forecast.queueMinutes,travelMinutes:Math.ceil(travel/60)};
}
module.exports={VERSION,CAPACITY,travelSeconds,acceptedAt,readyAt,notBefore,kitchenForecast,customerTiming};
