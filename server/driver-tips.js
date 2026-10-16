'use strict';
const crypto=require('node:crypto');
const feedback=require('./driver-feedback');
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
function forOrder(db,order){return (db.driverTipPayments||[]).findLast(t=>t.orderId===order.id&&t.customerId===order.customerId)||null;}
function create(db,order,input,now=new Date()){
  if(!feedback.eligible(order))fail('Le pourboire est disponible après une livraison Krokli terminée.',409);
  if(!input||Object.keys(input).some(k=>!['amountCents','requestId'].includes(k))||!Number.isSafeInteger(input.amountCents)||input.amountCents<50||input.amountCents>5000||!/^[-a-f0-9]{36}$/i.test(input.requestId||''))fail('Choisis un pourboire entre 0,50 € et 50 €.');
  db.driverTipPayments ||= [];
  const replay=db.driverTipPayments.find(t=>t.requestId===input.requestId&&t.customerId===order.customerId);
  if(replay){if(replay.orderId!==order.id||replay.amountCents!==input.amountCents)fail('Cette tentative correspond à un autre pourboire.',409);return replay;}
  const old=forOrder(db,order);
  if(old&&['PENDING','PAID'].includes(old.state)){if(old.amountCents!==input.amountCents)fail('Un pourboire existe déjà pour cette livraison. Vérifie son paiement avant de réessayer.',409);return old;}
  const tip={id:crypto.randomUUID(),kind:'driver-tip',orderId:order.id,number:order.number,customerId:order.customerId,driverId:order.kroklyDriver.driverId,requestId:input.requestId,amountCents:input.amountCents,amount:input.amountCents/100,state:'PENDING',providerVerified:false,createdAt:now.toISOString()};
  db.driverTipPayments.push(tip);return tip;
}
function finalizeVerified(tip){
  if(!tip.payment)return;
  if(tip.payment.status==='PAID'){
    if(!tip.payment.checkoutId||!tip.payment.merchantCode)fail('Paiement du pourboire à vérifier.',409);
    tip.state='PAID';tip.providerVerified=true;tip.providerTransactionId=`sumup:${tip.payment.checkoutId}`;tip.paidAt=tip.payment.paidAt;tip.refundedCents ||= 0;
  }else if(tip.state!=='PAID'&&['FAILED','EXPIRED'].includes(tip.payment.status))tip.state=tip.payment.status;
}
function reconcileVerifiedCheckout(tip,checkout){
  if(checkout.id!==tip.payment?.checkoutId)fail('Pourboire à vérifier.',409);
  for(const tx of checkout.transactions||[]){
    const reversed=tx.status==='REFUNDED'||tx.simple_status==='CHARGEBACK'||(tx.events||tx.transaction_events||[]).some(e=>e.type==='CHARGE_BACK');
    if(!reversed)continue;
    const refunded=typeof tx.refunded_amount==='number'?Math.round(tx.refunded_amount*100):null;
    if(tx.amount!==tip.amount||tx.currency!=='EUR'||refunded===null||!Number.isSafeInteger(refunded)||Math.abs(tx.refunded_amount*100-refunded)>.00001||refunded<=0||refunded>tip.amountCents)tip.reconciliationHold=true;
    else{tip.refundedCents=Math.max(tip.refundedCents||0,refunded);tip.reconciliationHold=false;}
  }
}
function view(tip,enabled){return {enabled:enabled===true,minimumCents:50,maximumCents:5000,...(tip?{id:tip.id,amountCents:tip.amountCents,status:tip.state,refundedCents:tip.refundedCents||0,reviewRequired:tip.reconciliationHold===true,checkoutUrl:tip.state==='PENDING'?tip.payment?.checkoutUrl||null:null}:{}),creditedOnlyAfterVerifiedPayment:true};}
module.exports={create,forOrder,finalizeVerified,reconcileVerifiedCheckout,view};
