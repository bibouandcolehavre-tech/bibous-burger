'use strict';
// Exact allowlisted projections only. Never return completed-order contacts.
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
const FEES=new Set(require('../delivery-pricing').DELIVERY_FEE_CENTS);
const externalDeliveries=require('./external-deliveries');
function cents(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1000000&&Math.abs(value*100-Math.round(value*100))<.00001?Math.round(value*100):null;}
function dateKey(value){const n=Date.parse(value);if(!Number.isFinite(n))return null;return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(n);}
function shift(key,days){return new Date(Date.parse(`${key}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);}
function weekFor(value){const key=dateKey(value);if(!key)return null;const day=new Date(`${key}T12:00:00Z`).getUTCDay();const startDate=shift(key,-((day+6)%7));return{startDate,endDate:shift(startDate,6),exclusiveEndDate:shift(startDate,7),timezone:'Europe/Paris'};}
function validWeek(key){const time=typeof key==='string'?Date.parse(`${key}T12:00:00Z`):NaN;if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==key||weekFor(`${key}T12:00:00Z`).startDate!==key)fail('Choisis une semaine commençant un lundi.');return key;}
function quote(order){const fee=cents(order.standardDeliveryFee),legacy=cents(order.deliveryFee);return{currency:'EUR',policyVersion:'bibou-distance-per-order-v1',deliveryFeeCents:legacy,driverPayCents:FEES.has(fee)?fee:FEES.has(legacy)?legacy:null};}
function freezeQuote(order){order.kroklyDriver.financials ||= quote(order);return order.kroklyDriver.financials;}
function recordCompletion(order){const assignment=order.kroklyDriver;if(!assignment.completedFinancials)assignment.completedFinancials={...freezeQuote(order),deliveryFeeCents:cents(order.deliveryFee),bibouPlusDeliveryCovered:order.bibouPlusApplied===true&&cents(order.deliveryFee)===0};}
function completed(order,driverId){return Boolean(order?.kroklyDriver?.driverId===driverId&&order.kroklyDriver.status==='delivered'&&(order.kroklyDriver.completedFinancials||order.status==='delivered'&&['PAID','REFUNDED'].includes(order.payment?.status))&&order.method==='delivery'&&!order.reviewMode&&!order.testMode&&!order.isTest);}
function deliveryAt(order){const value=order.kroklyDriver?.deliveredAt||order.kroklyDriver?.updatedAt;return Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;}
function tipsFor(db,order,driverId){
  // Not enabled by this module. Only a future server-verified payment ledger
  // may credit a tip; never trust an order field or a client-selected amount.
  const seen=new Set();let total=0;
  for(const p of db.driverTipPayments||[]){if(p.orderId!==order.id||p.driverId!==driverId||p.state!=='PAID'||p.providerVerified!==true||p.reconciliationHold===true||!p.providerTransactionId||seen.has(p.providerTransactionId)||!Number.isSafeInteger(p.amountCents)||p.amountCents<0||!Number.isSafeInteger(p.refundedCents||0)||(p.refundedCents||0)<0||(p.refundedCents||0)>p.amountCents)continue;seen.add(p.providerTransactionId);total+=p.amountCents-(p.refundedCents||0);}
  if(!Number.isSafeInteger(total))fail('Montant de pourboires à vérifier.',409);return total;
}
function historyRow(db,order){const d=order.kroklyDriver,f=d.completedFinancials||d.financials||quote(order),pay=Number.isSafeInteger(f.driverPayCents)&&FEES.has(f.driverPayCents)?f.driverPayCents:null;const firstName=(db.customers||[]).find(c=>c.id===order.customerId)?.firstName,fee=d.completedFinancials?f.deliveryFeeCents:cents(order.deliveryFee);const covered=fee===0&&(typeof d.completedFinancials?.bibouPlusDeliveryCovered==='boolean'?d.completedFinancials.bibouPlusDeliveryCovered:order.bibouPlusApplied===true);return{orderId:order.id,number:order.number,restaurant:"Bibou's Burgers",firstName:typeof firstName==='string'&&firstName.trim()?firstName.trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,60):'Client',deliveredAt:deliveryAt(order),deliveryFeeCents:fee,bibouPlusDeliveryCovered:covered,driverPayCents:pay,tipCents:tipsFor(db,order,d.driverId),payBasis:d.financials?'accepted-quote':'legacy-standard-fee',paymentStatus:'not-reconciled'};}
function ratingSummary(db,orders,driverId){const allowed=new Map(orders.map(o=>[o.id,o.customerId])),seen=new Set();let sum=0,count=0;for(const r of db.driverFeedback||[]){if(r.driverId!==driverId||!allowed.has(r.orderId)||r.customerId!==allowed.get(r.orderId)||seen.has(r.orderId)||!Number.isInteger(r.stars)||r.stars<1||r.stars>5)continue;seen.add(r.orderId);sum+=r.stars;count++;}return{count,averageStars:count?Math.round(sum/count*100)/100:null};}
function account(db,driver,{week,offset=0,limit=50,tipsEnabled=false}={},now=new Date()){
  if(!driver?.id)fail('Connexion livreur requise.',401);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('Pagination invalide.');
  const current=weekFor(now.toISOString());const start=week?validWeek(week):current.startDate;
  if(start>current.startDate)fail('Cette semaine n’a pas encore commencé.');
  const orders=(db.orders||[]).concat(externalDeliveries.ledgerOrders(db)).filter(o=>completed(o,driver.id));
  const rows=orders.map(o=>historyRow(db,o)).filter(r=>r.deliveredAt).sort((a,b)=>b.deliveredAt.localeCompare(a.deliveredAt)||b.number-a.number||String(a.orderId).localeCompare(String(b.orderId)));
  const weeks=[...new Set([current.startDate,start,...rows.map(r=>weekFor(r.deliveredAt).startDate)])].sort().reverse();
  const selected=rows.filter(r=>weekFor(r.deliveredAt).startDate===start);
  const unknown=selected.filter(r=>r.driverPayCents===null).length;
  const pay=selected.reduce((n,r)=>n+(r.driverPayCents||0),0),tips=selected.reduce((n,r)=>n+r.tipCents,0);
  return{protocol:'krokli-driver-account-v1',driver:{name:driver.name,username:driver.username},week:{...weekFor(`${start}T12:00:00Z`),complete:current.startDate>start},weeks,summary:{completedCount:selected.length,knownDeliveryFeesCents:selected.reduce((n,r)=>n+(r.deliveryFeeCents||0),0),unknownDeliveryFees:selected.filter(r=>r.deliveryFeeCents===null).length,knownDriverPayCents:pay,tipCents:tips,unknownPayCount:unknown,totalEntitlementCents:unknown?null:pay+tips,paidOutVerified:false},ratings:ratingSummary(db,orders,driver.id),history:selected.slice(offset,offset+limit),pagination:{offset,limit,total:selected.length,nextOffset:offset+limit<selected.length?offset+limit:null},tipsEnabled:tipsEnabled===true};
}
function statement(db,driver,week,now=new Date()){
  const initial=account(db,driver,{week,limit:100},now);if(initial.pagination.total>5000)fail('Ce relevé dépasse la taille disponible. Contacte le restaurant.',409);
  const history=[];for(let offset=0;offset<Math.max(1,initial.pagination.total);offset+=100)history.push(...account(db,driver,{week:initial.week.startDate,offset,limit:100},now).history);
  return{...initial,history,pagination:{offset:0,limit:history.length,total:history.length,nextOffset:null}};
}
module.exports={cents,dateKey,weekFor,validWeek,quote,freezeQuote,recordCompletion,completed,deliveryAt,account,statement,tipsFor};
