'use strict';
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
const eligible=o=>Boolean(o?.method==='delivery'&&o.status==='delivered'&&o.payment?.status==='PAID'&&o.kroklyDriver?.status==='delivered'&&o.kroklyDriver.driverId&&!o.reviewMode&&!o.testMode&&!o.isTest);
function view(db,order){const r=(db.driverFeedback||[]).find(r=>r.orderId===order.id&&r.customerId===order.customerId);return{orderId:order.id,eligible:eligible(order),feedback:r?{stars:r.stars,comment:r.comment,createdAt:r.createdAt}:null,tips:{enabled:false,reason:'Les pourboires ne sont pas encore activés.'}};}
function save(db,order,input,now=new Date()){
  if(!eligible(order))fail('Tu pourras noter le livreur après la livraison.',409);
  if(!input||Object.keys(input).some(k=>!['stars','comment'].includes(k))||!Number.isInteger(input.stars)||input.stars<1||input.stars>5||(input.comment!==undefined&&typeof input.comment!=='string')||(input.comment||'').length>500)fail('Choisis une note de 1 à 5 et un commentaire de 500 caractères maximum.');
  const comment=(input.comment||'').trim();const previous=(db.driverFeedback||[]).find(r=>r.orderId===order.id);
  if(previous){if(previous.customerId===order.customerId&&previous.stars===input.stars&&previous.comment===comment)return view(db,order);fail('Cette livraison a déjà été notée.',409);}
  db.driverFeedback ||= [];db.driverFeedback.push({orderId:order.id,customerId:order.customerId,driverId:order.kroklyDriver.driverId,stars:input.stars,comment,createdAt:now.toISOString()});return view(db,order);
}
function removeCustomer(db,id){if(db.driverFeedback)db.driverFeedback=db.driverFeedback.filter(r=>r.customerId!==id);}
module.exports={eligible,view,save,removeCustomer};
