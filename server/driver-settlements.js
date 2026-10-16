'use strict';
const crypto=require('node:crypto');
const A=require('./krokli-driver-account');
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
const configured=key=>typeof key==='string'&&/^[a-f0-9]{64}$/i.test(key);
function keyBytes(key){if(!configured(key))fail('La protection des coordonnées bancaires doit être configurée par le restaurant.',503);return Buffer.from(key,'hex');}
function iban(value){const s=typeof value==='string'?value.replace(/\s/g,'').toUpperCase():'';if(!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s))fail('IBAN invalide.');let r=0;for(const ch of s.slice(4)+s.slice(0,4)){for(const d of /[A-Z]/.test(ch)?String(ch.charCodeAt(0)-55):ch)r=(r*10+Number(d))%97;}if(r!==1)fail('La clé de contrôle de l’IBAN est invalide.');return s;}
function encrypt(driverId,value,key){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',keyBytes(key),iv);cipher.setAAD(Buffer.from(driverId));const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),body:body.toString('base64')};}
function decrypt(driverId,value,key){try{const decipher=crypto.createDecipheriv('aes-256-gcm',keyBytes(key),Buffer.from(value.iv,'base64'));decipher.setAAD(Buffer.from(driverId));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.body,'base64')),decipher.final()]).toString('utf8'));}catch{fail('Les coordonnées bancaires ne peuvent pas être déchiffrées. Aucun paiement automatique n’est effectué.',503);}}
function saveBank(db,driver,input,key,now=new Date()){
  keyBytes(key);
  if(!input||Object.keys(input).some(k=>!['holder','iban','bic'].includes(k))||typeof input.holder!=='string'||input.holder.trim().length<2||input.holder.length>100||/[\x00-\x1f]/.test(input.holder))fail('Indique le titulaire du compte.');
  const account=iban(input.iban),bic=String(input.bic||'').replace(/\s/g,'').toUpperCase();if(bic&&!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic))fail('BIC invalide.');
  db.driverBankProfiles ||= [];const old=db.driverBankProfiles.find(p=>p.driverId===driver.id),profile={driverId:driver.id,revision:(old?.revision||0)+1,holder:input.holder.trim(),last4:account.slice(-4),country:account.slice(0,2),encrypted:encrypt(driver.id,{holder:input.holder.trim(),iban:account,bic},key),updatedAt:now.toISOString()};
  if(old)Object.assign(old,profile);else db.driverBankProfiles.push(profile);return bankView(db,driver);
}
function bankView(db,driver){const p=(db.driverBankProfiles||[]).find(p=>p.driverId===driver.id);return p?{registered:true,holder:p.holder,maskedIban:`${p.country} •••• ${p.last4}`,revision:p.revision,updatedAt:p.updatedAt}:{registered:false};}
function earnings(db,driver,before=null){
  const cutoff=before||'9999-99-99',reserved=new Set((db.driverPaymentRequests||[]).filter(r=>r.driverId===driver.id&&r.status!=='rejected').flatMap(r=>r.lines.map(l=>l.key))),lines=[];
  for(const o of db.orders||[]){if(!A.completed(o,driver.id)||!A.deliveryAt(o)||A.dateKey(A.deliveryAt(o))>=cutoff)continue;const q=o.kroklyDriver.completedFinancials||o.kroklyDriver.financials||A.quote(o);if(Number.isSafeInteger(q.driverPayCents)&&[399,499,599].includes(q.driverPayCents)&&!reserved.has(`fee:${o.id}`))lines.push({key:`fee:${o.id}`,orderId:o.id,kind:'delivery',amountCents:q.driverPayCents});}
  // Tips can arrive after a delivery fee has already been requested/paid.
  const seen=new Set();for(const t of db.driverTipPayments||[]){const paidDay=A.dateKey(t.paidAt);if(t.driverId!==driver.id||t.state!=='PAID'||t.providerVerified!==true||t.reconciliationHold===true||!t.providerTransactionId||seen.has(t.providerTransactionId)||!paidDay||paidDay>=cutoff||!Number.isSafeInteger(t.amountCents)||!Number.isSafeInteger(t.refundedCents||0)||(t.refundedCents||0)<0)continue;seen.add(t.providerTransactionId);const net=t.amountCents-(t.refundedCents||0);if(Number.isSafeInteger(net)&&net>0&&net<=5000&&!reserved.has(`tip:${t.providerTransactionId}`))lines.push({key:`tip:${t.providerTransactionId}`,orderId:t.orderId,kind:'tip',amountCents:net});}
  return lines;
}
function requestView(r){return {id:r.id,status:r.status,source:r.source,amountCents:r.amountCents,deliveryCents:r.lines.filter(l=>l.kind==='delivery').reduce((n,l)=>n+l.amountCents,0),tipCents:r.lines.filter(l=>l.kind==='tip').reduce((n,l)=>n+l.amountCents,0),createdAt:r.createdAt,paidRecordedAt:r.paidRecordedAt||null,bankEnding:r.bankLast4};}
function state(db,driver,key){const lines=earnings(db,driver);return {enabled:configured(key),bank:bankView(db,driver),availableCents:lines.reduce((n,l)=>n+l.amountCents,0),requests:(db.driverPaymentRequests||[]).filter(r=>r.driverId===driver.id).map(requestView).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),automaticDay:'monday',automaticTransfer:false};}
function request(db,driver,key,{source='manual',before=null}={},now=new Date()){
  keyBytes(key);const bank=(db.driverBankProfiles||[]).find(p=>p.driverId===driver.id);if(!bank)fail('Enregistre ton RIB avant de demander un règlement.',409);decrypt(driver.id,bank.encrypted,key);
  const lines=earnings(db,driver,before);if(!lines.length)fail('Aucun gain non encore réclamé à demander.',409);
  const r={id:crypto.randomUUID(),driverId:driver.id,source,status:'pending',createdAt:now.toISOString(),amountCents:lines.reduce((n,l)=>n+l.amountCents,0),lines,bankRevision:bank.revision,bankLast4:bank.last4,encryptedBank:bank.encrypted};db.driverPaymentRequests ||= [];db.driverPaymentRequests.push(r);return requestView(r);
}
function weekly(db,key,now=new Date()){
  if(!configured(key))return false;const monday=A.weekFor(now.toISOString()).startDate;let changed=false;
  for(const driver of db.kroklyDrivers||[]){if(!driver.active||!(db.driverBankProfiles||[]).some(p=>p.driverId===driver.id))continue;try{request(db,driver,key,{source:'weekly',before:monday},now);changed=true;}catch(e){if(e.statusCode!==409)throw e;}}
  // On first wake after Monday, only previous-week unclaimed earnings are used.
  return changed;
}
function managerState(db){return {automaticTransfer:false,requests:(db.driverPaymentRequests||[]).map(r=>({...requestView(r),driverId:r.driverId,driverName:(db.kroklyDrivers||[]).find(d=>d.id===r.driverId)?.name||'Livreur'})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};}
function validateRequest(db,r){for(const line of r.lines.filter(l=>l.kind==='tip')){const tip=(db.driverTipPayments||[]).find(t=>`tip:${t.providerTransactionId}`===line.key&&t.driverId===r.driverId);if(!tip||tip.reconciliationHold||tip.state!=='PAID'||tip.providerVerified!==true||tip.amountCents-(tip.refundedCents||0)!==line.amountCents)fail('Un pourboire de cette demande a changé. Annulez cette demande pour recalculer les gains avant tout virement.',409);}}
function requestBank(db,id,key){const r=(db.driverPaymentRequests||[]).find(r=>r.id===id);if(!r)fail('Demande introuvable.',404);if(r.status==='pending')validateRequest(db,r);return decrypt(r.driverId,r.encryptedBank,key);}
function markPaid(db,id,input,now=new Date()){
  const r=(db.driverPaymentRequests||[]).find(r=>r.id===id);if(!r)fail('Demande introuvable.',404);if(input?.confirmPaid!==true||typeof input.reference!=='string'||!input.reference.trim()||input.reference.length>100)fail('Confirme le virement déjà effectué et indique sa référence.');
  if(r.status==='paid')return requestView(r);if(r.status!=='pending')fail('Cette demande ne peut plus être réglée.',409);
  validateRequest(db,r);
  r.status='paid';r.paidRecordedAt=now.toISOString();r.paymentReference=input.reference.trim();return requestView(r);
}
function reject(db,id,input){const r=(db.driverPaymentRequests||[]).find(r=>r.id===id);if(!r)fail('Demande introuvable.',404);if(input?.confirm!==true||r.status!=='pending')fail('Seule une demande en attente et non payée peut être annulée.',409);r.status='rejected';return requestView(r);}
module.exports={configured,iban,saveBank,bankView,state,request,weekly,managerState,requestBank,markPaid,reject,earnings};
