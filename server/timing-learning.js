'use strict';
const crypto=require('node:crypto');
const {preparationMinutes}=require('../service-policy');
const MIN_SAMPLES=5,MAX_SAMPLES=50,WINDOW_MS=30*86400_000;
const signature=o=>crypto.createHash('sha256').update(JSON.stringify({subtotal:o.subtotal,items:o.items,method:o.method})).digest('hex');
const time=v=>Number.isFinite(Date.parse(v))?Date.parse(v):null;
const median=values=>{const a=[...values].sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function model(database,now=Date.now()) {
  const preparation={15:[],30:[],35:[]},travel=[];
  for(const o of database.orders||[]) {
    if(o.reviewMode||o.payment?.status!=='PAID'||['cancelled','awaiting_customer'].includes(o.status)||o.amendment?.status==='pending')continue;
    const evidence=o.kitchenObservation,ready=time(o.kitchenReadyAt),accepted=time(o.kitchenAcceptedAt);
    // Only an explicit kitchen Ready signal on an unchanged, unqueued basket
    // can teach cooking time. Courier pickup includes waiting, so is excluded.
    if(evidence?.version===1&&evidence.signature===signature(o)&&evidence.queueMinutes===0&&accepted!==null&&ready!==null&&
      ready<=now&&ready>=now-WINDOW_MS&&preparation[evidence.baseMinutes]) {
      const minutes=(ready-accepted)/60_000;
      if(minutes>=3&&minutes<=120)preparation[evidence.baseMinutes].push({at:ready,value:minutes});
    }
    const picked=time(o.kroklyDriver?.pickedUpAt),delivered=time(o.kroklyDriver?.deliveredAt);
    if(o.status==='delivered'&&picked!==null&&delivered!==null&&delivered<=now&&delivered>=now-WINDOW_MS&&
      Number.isSafeInteger(o.deliveryTravelSeconds)&&o.deliveryTravelSeconds>=60&&o.deliveryTravelSeconds<=7200) {
      const seconds=(delivered-picked)/1000,ratio=seconds/o.deliveryTravelSeconds;
      if(seconds>=60&&seconds<=7200&&ratio>=0.5&&ratio<=3)travel.push({at:delivered,value:ratio});
    }
  }
  const summarize=(samples,initial,min,max)=>{
    const values=samples.sort((a,b)=>b.at-a.at).slice(0,MAX_SAMPLES).map(s=>s.value);
    return {samples:values.length,learned:values.length>=MIN_SAMPLES,value:values.length>=MIN_SAMPLES?clamp(median(values),min,max):initial};
  };
  return {version:'bibou-timing-learning-v1',minimumSamples:MIN_SAMPLES,windowDays:30,
    preparation:Object.fromEntries(Object.entries(preparation).map(([base,samples])=>[base,summarize(samples,Number(base),Math.ceil(Number(base)*0.8),Math.ceil(Number(base)*1.5))])),
    travel:summarize(travel,1,0.8,1.5)};
}
function kitchenMinutes(subtotal,learned) {const base=preparationMinutes(subtotal);return Math.ceil(learned?.preparation?.[base]?.value??base);}
function roadSeconds(seconds,learned) {return Number.isSafeInteger(seconds)&&seconds>=0&&seconds<=7200?Math.ceil(seconds*(learned?.travel?.value??1)):null;}
function observeAcceptance(database,order,queueMinutes,now=Date.now()) {
  if(order.reviewMode||order.payment?.status!=='PAID'||order.status!=='preparing'||order.kitchenAcceptedAt)return false;
  order.kitchenAcceptedAt=new Date(now).toISOString();
  order.kitchenObservation={version:1,signature:signature(order),queueMinutes,baseMinutes:preparationMinutes(order.subtotal)};
  return true;
}
module.exports={MIN_SAMPLES,MAX_SAMPLES,signature,median,model,kitchenMinutes,roadSeconds,observeAcceptance};
