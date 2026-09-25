const crypto = require('node:crypto');
const { serviceSlotInstant, parisDateKey } = require('./availability');
const fail = (message, statusCode=409) => { throw Object.assign(new Error(message),{statusCode}); };
const configFromEnv = env => ({enabled:env.UBER_DIRECT_ENABLED==='true',mode:env.UBER_DIRECT_MODE || 'test',customerId:env.UBER_DIRECT_CUSTOMER_ID || '',clientId:env.UBER_DIRECT_CLIENT_ID || '',clientSecret:env.UBER_DIRECT_CLIENT_SECRET || '',signingKey:env.UBER_DIRECT_WEBHOOK_SECRET || '',pickupPhone:env.UBER_DIRECT_PICKUP_PHONE || '+33278088498'});
const configured = c => c.enabled && ['test','live'].includes(c.mode) && c.customerId && c.clientId && c.clientSecret && c.signingKey;
const fingerprint = order => crypto.createHash('sha256').update(JSON.stringify([order.items,order.total,order.customerId,order.customerName,order.customerPhone,order.deliveryAddress,order.serviceDate,order.slot,order.amendment?.revision])).digest('hex');
const phone = value => {const d=String(value||'').replace(/\D/g,'');return /^0\d{9}$/.test(d)?'+33'+d.slice(1):/^33\d{9}$/.test(d)?'+'+d:null;};
const address = ({address,postalCode,city}) => JSON.stringify({street_address:[address],city,zip_code:postalCode,country:'FR'});
const safeTracking = value => {try{const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && ['uber.com','ubereats.com'].some(h=>u.hostname===h || u.hostname.endsWith('.'+h))?u.href:null;}catch{return null;}};
function assertEligible(order,now=Date.now()) {
 if(order.method!=='delivery' || order.payment?.status!=='PAID' || !['preparing','ready'].includes(order.status) || order.amendment?.status==='pending') fail('Acceptez d’abord la commande en livraison et faites revalider tout changement de panier.');
 if(!order.customerId || !order.customerName || !phone(order.customerPhone) || !order.deliveryAddress?.address || !order.deliveryAddress.postalCode || !order.deliveryAddress.city) fail('Nom, téléphone et adresse complète du destinataire requis.');
 const slot=serviceSlotInstant(order.serviceDate,order.slot?.slice(0,5),'delivery');
 if(!slot || parisDateKey(new Date(now))!==order.serviceDate || slot.getTime()>now+90*60000 || slot.getTime()<now-30*60000) fail('Demandez le coursier le jour du service, entre 90 minutes avant et 30 minutes après le début du créneau.');
 if(order.uberDirect && !['quoted','failed'].includes(order.uberDirect.phase)) fail('Une demande Uber existe déjà. Consultez ou actualisez son suivi.');
}
function quoteInput(order,minutes,config,now=Date.now()) {
 assertEligible(order,now);
 if(![0,10,20,30].includes(minutes))fail('Choisissez un délai de préparation de 0, 10, 20 ou 30 minutes.',400);
 return {pickup_address:address({address:'153 Quai George V',postalCode:'76600',city:'Le Havre'}),dropoff_address:address(order.deliveryAddress),...(minutes?{pickup_ready_dt:new Date(now+minutes*60000).toISOString()}:{})};
}
function saveQuote(order,quote,payload,minutes,now=Date.now()) {
 if(typeof quote.id!=='string' || !Number.isInteger(quote.fee) || quote.fee<0 || String(quote.currency).toLowerCase()!=='eur' || !Number.isFinite(Date.parse(quote.expires)) || Date.parse(quote.expires)<=now) fail('Le devis Uber est incomplet ou expiré. Aucun coursier demandé.',502);
 order.uberDirect={phase:'quoted',quote:{id:quote.id,fee:quote.fee,currency:'EUR',expires:quote.expires,pickupEta:quote.pickup_eta || null,dropoffEta:quote.dropoff_eta || null},payload,minutes,fingerprint:fingerprint(order),quotedAt:new Date(now).toISOString()};
 return order.uberDirect;
}
function reserve(order,input,config,now=Date.now()) {
 assertEligible(order,now);
 const u=order.uberDirect;
 if(u?.phase!=='quoted' || input.confirm!==true || input.quoteId!==u.quote.id || input.fee!==u.quote.fee || Date.parse(u.quote.expires)<=now || u.fingerprint!==fingerprint(order))fail('Le devis a changé ou expiré. Recalculez-le avant de confirmer.');
 if(u.payload.pickup_ready_dt && Date.parse(u.payload.pickup_ready_dt)<now)fail('L’heure de préparation est passée. Recalculez le devis.');
 const slot=serviceSlotInstant(order.serviceDate,order.slot?.slice(0,5),'delivery').getTime();
 const eta=Date.parse(u.quote.dropoffEta);
 if((!Number.isFinite(eta) || eta<slot || eta>slot+30*60000) && input.acknowledgeTiming!==true)fail('L’estimation diffère du créneau client ou est indisponible. Prévenez le client puis confirmez cet écart.');
 const attemptId=crypto.randomUUID(),externalId=`bibou-${order.id}-${attemptId}`;
 Object.assign(u,{phase:'sending',attemptId,externalId,requestedAt:new Date(now).toISOString(),mode:config.mode});
 return {...u.payload,quote_id:u.quote.id,pickup_name:"Bibou’s Burgers",pickup_phone_number:config.pickupPhone,dropoff_name:order.customerName,dropoff_phone_number:phone(order.customerPhone),manifest_items:order.items.map(i=>({name:i.name,quantity:i.quantity,size:'small',price:Math.round(i.price*100)})),manifest_reference:`Commande ${order.number}`,manifest_total_value:Math.round(order.subtotal*100),external_id:externalId,undeliverable_action:'return'};
}
function applyDelivery(order,data,config,eventAt) {
 const u=order.uberDirect;
 if(!u || typeof data.id!=='string' || !data.id.startsWith('del_') || (u.deliveryId && u.deliveryId!==data.id) || (data.external_id!==u.externalId) || data.live_mode!==(config.mode==='live'))fail('La livraison Uber ne correspond pas à cette commande.',409);
 const timestamp=Date.parse(data.updated || eventAt || data.created);
 if(!Number.isFinite(timestamp))fail('Mise à jour Uber sans date valide.',502);
 if(u.providerUpdatedAt && timestamp<Date.parse(u.providerUpdatedAt))return false;
 const statuses=['pending','pickup','pickup_complete','dropoff','delivered','canceled','returned'];
 if(!statuses.includes(data.status))return false;
 if(['delivered','returned'].includes(u.status) && data.status!==u.status)return false;
 if(u.status==='canceled' && !['canceled','returned'].includes(data.status))return false;
 const rank={pending:0,pickup:1,pickup_complete:2,dropoff:3,delivered:4,canceled:5,returned:6};
 if(rank[data.status]<rank[u.status])return false;
 Object.assign(u,{phase:'created',deliveryId:data.id,status:data.status,providerUpdatedAt:new Date(timestamp).toISOString(),trackingUrl:safeTracking(data.tracking_url),pickupEta:data.pickup_eta || null,dropoffEta:data.dropoff_eta || null,checkedAt:new Date().toISOString()});
 delete u.payload;
 if(order.status!=='cancelled') {
  if(['pickup_complete','dropoff'].includes(data.status) && order.status!=='delivered')order.status='out_for_delivery';
  if(data.status==='delivered')order.status='delivered';
 }
 return true;
}
function verifyWebhook(raw,signature,key) {if(!key || !/^[a-f0-9]{64}$/i.test(signature||''))return false;return crypto.timingSafeEqual(crypto.createHmac('sha256',key).update(raw).digest(),Buffer.from(signature,'hex'));}
function publicDelivery(order) {const u=order.uberDirect;if(!u || u.phase!=='created')return null;return {status:u.status,trackingUrl:safeTracking(u.trackingUrl),pickupEta:u.pickupEta,dropoffEta:u.dropoffEta};}
function createClient(config,fetchImpl=fetch) {
 let cached=null;
 async function token(){
  if(!configured(config))fail('Uber Direct n’est pas encore connecté. Configuration serveur nécessaire.',503);
  if(cached?.expires>Date.now())return cached.value;
  const r=await fetchImpl('https://auth.uber.com/oauth/v2/token',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'client_credentials',scope:'eats.deliveries'})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok || typeof d.access_token!=='string')fail('Connexion Uber indisponible. Vérifiez les accès API.',503);
  cached={value:d.access_token,expires:Date.now()+Math.max(0,(Number(d.expires_in)||0)-60)*1000};return cached.value;
 }
 async function call(route,body){
  const bearer=await token();
  let r;try{r=await fetchImpl(`https://api.uber.com/v1/customers/${encodeURIComponent(config.customerId)}/${route}`,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}catch{throw Object.assign(new Error('Réponse Uber non reçue. Vérifiez Uber Direct avant toute nouvelle demande.'),{statusCode:502,uncertain:true});}
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(`Uber a refusé ou n’a pas confirmé la demande (HTTP ${r.status}). Consultez votre compte Uber Direct.`),{statusCode:502,uncertain:r.status>=500 || r.status===409});
  if(!data)throw Object.assign(new Error('Réponse Uber illisible. Vérifiez Uber Direct.'),{statusCode:502,uncertain:true});
  return data;
 }
 return {quote:body=>call('delivery_quotes',body),create:body=>call('deliveries',body),get:id=>call('deliveries/'+encodeURIComponent(id))};
}
module.exports={configFromEnv,configured,createClient,fingerprint,assertEligible,quoteInput,saveQuote,reserve,applyDelivery,verifyWebhook,publicDelivery,safeTracking};
