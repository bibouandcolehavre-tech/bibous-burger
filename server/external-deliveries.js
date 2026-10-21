'use strict';
// Operational courier tasks only, never orders/payments/customers/loyalty entries.
const crypto = require('node:crypto');
const {parisDateKey} = require('./availability');
const quotes = require('./external-delivery-quote');
const OFFER_MS = 5 * 60 * 1000;
const ACTIVE = new Set(['offered', 'accepted', 'picked_up']);
const fail = (message, statusCode=400) => { throw Object.assign(Error(message), {statusCode}); };
const list = db => Array.isArray(db.externalDeliveries) ? db.externalDeliveries : [];
const isExternal = id => typeof id === 'string' && /^external-[0-9a-f-]{36}$/.test(id);
const get = (db, id) => list(db).find(item => item.id === id);
const clean = (value, max, name, required=false) => {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f<>]/.test(value)) fail(`${name} à vérifier.`);
  const text=value.trim(); if (required && !text) fail(`${name} obligatoire.`); return text;
};
function create(db, input, now=Date.now(), {quoteSecret}={}) {
  const keys = ['requestId','photoFingerprint','reference','customerName','phone','phoneExtension','address','postalCode','city','notes','amountCents','confirmed','ownCourierConfirmed','phoneUnavailableConfirmed','quoteToken'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key=>!keys.includes(key))) fail('Informations de course invalides.');
  if (input.confirmed!==true || input.ownCourierConfirmed!==true) fail('Vérifiez les coordonnées et confirmez que votre livreur prend cette livraison en charge.');
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) fail('Identifiant d’import invalide.');
  if (input.photoFingerprint!==undefined && (typeof input.photoFingerprint!=='string' || !/^[a-f0-9]{64}$/.test(input.photoFingerprint))) fail('Empreinte de photo invalide.');
  const record = {
    reference: clean(input.reference,40,'Référence Uber'), customerName:clean(input.customerName,80,'Prénom') || 'Client Uber',
    phone:clean(input.phone,24,'Téléphone').replace(/[ .\-]/g,''), phoneExtension:clean(input.phoneExtension,10,'Code téléphonique'),
    deliveryAddress:{address:clean(input.address,180,'Adresse',true),postalCode:clean(input.postalCode,5,'Code postal',true),city:clean(input.city,80,'Ville',true)},
    notes:clean(input.notes,400,'Instructions'), amountCents:input.amountCents===undefined?null:input.amountCents,
    photoFingerprint:input.photoFingerprint || null, phoneUnavailableConfirmed:input.phoneUnavailableConfirmed===true
  };
  if (!/^\d{5}$/.test(record.deliveryAddress.postalCode) || record.deliveryAddress.address.length<5) fail('Adresse de livraison incomplète.');
  if (record.phone && !/^(?:\+\d{8,15}|0\d{9})$/.test(record.phone)) fail('Téléphone à vérifier ; ne recopiez pas le code Uber dans le numéro.');
  if (!record.phone && !record.phoneUnavailableConfirmed) fail('Ajoutez le téléphone ou confirmez son absence.');
  if (record.phoneExtension && (!record.phone || !/^\d{3,10}$/.test(record.phoneExtension))) fail('Code téléphonique à vérifier.');
  if (record.amountCents!==null && (!Number.isSafeInteger(record.amountCents)||record.amountCents<0||record.amountCents>1000000)) fail('Montant informatif invalide.');
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
  const prior=list(db).find(item=>item.requestId===input.requestId);
  if(prior){if(prior.fingerprint!==fingerprint)fail('Cet import a déjà été utilisé avec d’autres informations.',409);return {delivery:managerView(prior),created:false};}
  const financials=quotes.verify(record.deliveryAddress,input.quoteToken,quoteSecret,now);
  const date=parisDateKey(new Date(now));
  if(list(db).some(item=>item.serviceDate===date && item.status!=='cancelled' && ((record.reference&&item.reference.toUpperCase()===record.reference.toUpperCase()) || (record.photoFingerprint&&item.photoFingerprint===record.photoFingerprint) || (!record.reference&&item.fingerprint===fingerprint&&!['delivered','cancelled'].includes(item.status)))))fail('Cette commande est déjà importée. Vérifiez les courses existantes ; ajoutez une référence distincte si ce sont deux commandes différentes.',409);
  if(list(db).filter(item=>item.serviceDate===date).length>=300)fail('Limite d’imports du jour atteinte.',429);
  const delivery={...record,id:`external-${crypto.randomUUID()}`,number:(Number.isSafeInteger(db.nextExternalDeliveryNumber)?db.nextExternalDeliveryNumber:1),
    source:'uber_eats',requestId:input.requestId,fingerprint,serviceDate:date,slot:new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(now),
    financials,status:'preparing',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString()};
  db.externalDeliveries=[...list(db),delivery];db.nextExternalDeliveryNumber=delivery.number+1;
  return {delivery:managerView(delivery),created:true};
}
function expireOffers(db,now=Date.now()) {
  let changed=false;
  for(const item of list(db))if(item.kroklyDriver?.status==='offered'&&Date.parse(item.kroklyDriver.expiresAt)<=now){item.kroklyDriver.status='expired';item.kroklyDriver.updatedAt=new Date(now).toISOString();changed=true;}
  return changed;
}
function managerView(item,now=Date.now()) {
  return {id:item.id,number:item.number,source:item.source,reference:item.reference,customerName:item.customerName,deliveryAddress:item.deliveryAddress,
    phone:item.phone,phoneExtension:item.phoneExtension,notes:item.notes,amountCents:item.amountCents,driverPayCents:item.financials?.driverPayCents??null,distanceKm:item.financials?.distanceKm??null,status:item.status,serviceDate:item.serviceDate,slot:item.slot,
    eligible:item.status==='ready'&&item.serviceDate===parisDateKey(new Date(now))&&!ACTIVE.has(item.kroklyDriver?.status),assignment:item.kroklyDriver||null};
}
function dispatchState(db,now=Date.now()) {return list(db).filter(item=>item.serviceDate===parisDateKey(new Date(now))&&!['delivered','cancelled'].includes(item.status)).map(item=>managerView(item,now));}
function markReady(db,id,now=Date.now()) {
  const item=get(db,id);if(!item)fail('Course externe introuvable.',404);
  if(item.status!=='preparing'||item.serviceDate!==parisDateKey(new Date(now)))fail('Cette course ne peut plus être marquée prête.',409);
  item.status='ready';item.updatedAt=new Date(now).toISOString();return managerView(item,now);
}
function cancel(db,id,now=Date.now()) {
  const item=get(db,id);if(!item)fail('Course externe introuvable.',404);
  if(!['preparing','ready'].includes(item.status)||['accepted','picked_up'].includes(item.kroklyDriver?.status))fail('Course déjà prise en charge : contactez le livreur.',409);
  item.status='cancelled';item.updatedAt=new Date(now).toISOString();if(item.kroklyDriver)item.kroklyDriver.status='cancelled';scrubContacts(item);return managerView(item,now);
}
function assign(db,id,driverId,now=Date.now()) {
  const item=get(db,id);if(!item)fail('Course externe introuvable.',404);
  if(!(db.kroklyDrivers||[]).some(d=>d.id===driverId&&d.active))fail('Livreur actif introuvable.',404);
  if(!managerView(item,now).eligible)fail('Repas non prêt, course déjà attribuée ou hors service du jour.',409);
  item.kroklyDriver={driverId,source:'external-manual',financials:{...item.financials},status:'offered',offeredAt:new Date(now).toISOString(),expiresAt:new Date(now+OFFER_MS).toISOString(),updatedAt:new Date(now).toISOString()};
  return item.kroklyDriver;
}
function current(item) {
  return item&&ACTIVE.has(item.kroklyDriver?.status)&&(['offered','accepted'].includes(item.kroklyDriver.status)?item.status==='ready':item.status==='out_for_delivery');
}
function transition(db,id,driverId,action,now=Date.now()) {
  const item=get(db,id);if(!item||item.kroklyDriver?.driverId!==driverId)fail('Course non attribuée à ce livreur.',404);
  if(!current(item))fail('Cette course n’est plus disponible.',409);
  const stage=item.kroklyDriver.status;
  const next={offered:{accept:'accepted',decline:'declined'},accepted:{pickup:'picked_up'},picked_up:{deliver:'delivered'}}[stage]?.[action];
  if(!next||(stage==='offered'&&Date.parse(item.kroklyDriver.expiresAt)<=now))fail('Cette étape n’est plus disponible.',409);
  item.kroklyDriver.status=next;item.kroklyDriver.updatedAt=new Date(now).toISOString();item.updatedAt=new Date(now).toISOString();
  if(action==='pickup')item.status='out_for_delivery';
  if(action==='deliver'){item.status='delivered';item.kroklyDriver.deliveredAt=new Date(now).toISOString();item.kroklyDriver.completedFinancials={...item.kroklyDriver.financials};scrubContacts(item);}
  return item;
}
function assigned(db,driverId) {
  return list(db).filter(item=>item.kroklyDriver?.driverId===driverId&&current(item)).map(item=>{
    const accepted=['accepted','picked_up'].includes(item.kroklyDriver.status);
    const info=[`Commande Uber${item.reference?' '+item.reference:''} · Paiement géré dans Uber : ne rien encaisser.`,
      item.amountCents!==null?`Montant Uber informatif : ${(item.amountCents/100).toFixed(2).replace('.',',')} €.`:'',
      item.phoneExtension?`Code téléphonique Uber : ${item.phoneExtension}.`:'',!item.phone?'Téléphone non fourni : contactez le restaurant si nécessaire.':'',item.notes].filter(Boolean).join(' ');
    return {id:item.id,number:item.number,source:'uber_eats',reference:item.reference,status:item.kroklyDriver.status,restaurant:"Bibou's Burgers · Uber",
      pickupAddress:'153 Quai Georges V, 76600 Le Havre',deliveryCity:item.deliveryAddress.city,slot:item.slot,serviceDate:item.serviceDate,distanceKm:item.financials.distanceKm,courierPay:item.kroklyDriver.financials.driverPayCents/100,preparation:null,expiresAt:item.kroklyDriver.expiresAt,
      ...(accepted?{customerName:item.customerName,customerPhone:item.phone,deliveryAddress:item.deliveryAddress,comment:info}: {})};
  });
}
function offerValid(item,driverId,now=Date.now()) {return !!(item&&item.status==='ready'&&item.serviceDate===parisDateKey(new Date(now))&&item.kroklyDriver?.driverId===driverId&&item.kroklyDriver.status==='offered'&&Date.parse(item.kroklyDriver.expiresAt)>now);}
function scrubContacts(item){item.customerName='Client Uber';item.phone='';item.phoneExtension='';item.notes='';item.deliveryAddress={address:'',postalCode:'',city:''};item.contactsDeletedAt=new Date().toISOString();}
function ledgerOrders(db){return list(db).filter(item=>item.status==='delivered'&&item.kroklyDriver?.status==='delivered'&&item.kroklyDriver.completedFinancials).map(item=>({id:item.id,number:item.number,method:'delivery',status:'delivered',externalSource:'uber_eats',kroklyDriver:item.kroklyDriver}));}
module.exports={create,list,get,isExternal,expireOffers,dispatchState,managerView,markReady,cancel,assign,transition,assigned,offerValid,ledgerOrders};
