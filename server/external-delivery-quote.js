'use strict';
const crypto = require('node:crypto');
const {DELIVERY_FEE_CENTS, DELIVERY_MAX_KM} = require('../delivery-pricing');
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
function address(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Indiquez une adresse complète.');
  const result={};
  for(const [key,max] of [['address',180],['postalCode',5],['city',80]]) {
    if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>max||/[\x00-\x1f\x7f<>]/.test(input[key]))fail('Indiquez une adresse complète et lisible.');
    result[key]=input[key].trim().replace(/\s+/g,' ');
  }
  if(result.address.length<5||!/^\d{5}$/.test(result.postalCode))fail('Adresse ou code postal à vérifier.');return result;
}
const addressHash=input=>crypto.createHash('sha256').update(JSON.stringify(address(input))).digest('hex');
const signature=(payload,secret)=>{if(typeof secret!=='string'||secret.length<32)fail('Calcul de course momentanément indisponible.',503);return crypto.createHmac('sha256',secret).update('external-delivery-quote-v1:'+payload).digest('base64url');};
function sign(input,result,secret,now=Date.now()) {
  const fee=Math.round(result.deliveryFee*100);
  if(result.deliveryFee===null||!DELIVERY_FEE_CENTS.includes(fee)||typeof result.distanceKm!=='number'||!Number.isFinite(result.distanceKm)||result.distanceKm<0||result.distanceKm>DELIVERY_MAX_KM)fail('Adresse hors de la zone de livraison actuelle (7 km par la route).',422);
  const quote={version:1,addressHash:addressHash(input),distanceKm:result.distanceKm,driverPayCents:fee,currency:'EUR',issuedAt:now,expiresAt:now+10*60000};
  const payload=Buffer.from(JSON.stringify(quote)).toString('base64url');
  return {distanceKm:quote.distanceKm,driverPayCents:fee,currency:'EUR',expiresAt:new Date(quote.expiresAt).toISOString(),quoteToken:`${payload}.${signature(payload,secret)}`};
}
function verify(input,token,secret,now=Date.now()) {
  if(typeof token!=='string'||token.length>1200)fail('Calculez les frais du livreur avant de créer la course.');
  const [payload,sig,...extra]=token.split('.');if(extra.length||!/^[A-Za-z0-9_-]+$/.test(payload||'')||!/^[A-Za-z0-9_-]{43}$/.test(sig||''))fail('Calcul de course invalide.');
  const expected=signature(payload,secret);if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))fail('Le calcul de course ne peut pas être vérifié.');
  let quote;try{quote=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{fail('Calcul de course invalide.');}
  if(quote.version!==1||quote.addressHash!==addressHash(input)||!Number.isSafeInteger(quote.issuedAt)||!Number.isSafeInteger(quote.expiresAt)||quote.expiresAt<=now||quote.issuedAt>now+5000||quote.expiresAt-quote.issuedAt!==600000||!DELIVERY_FEE_CENTS.includes(quote.driverPayCents)||typeof quote.distanceKm!=='number'||!Number.isFinite(quote.distanceKm)||quote.distanceKm<0||quote.distanceKm>DELIVERY_MAX_KM)fail('Adresse modifiée ou calcul expiré : recalculez les frais.',409);
  return {currency:'EUR',policyVersion:'krokli-external-road-v1',distanceKm:quote.distanceKm,driverPayCents:quote.driverPayCents,deliveryFeeCents:null,quotedAt:new Date(quote.issuedAt).toISOString()};
}
module.exports={address,sign,verify};
