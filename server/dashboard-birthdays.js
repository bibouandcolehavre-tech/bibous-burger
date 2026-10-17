'use strict';
const crypto = require('node:crypto');
const { parisDateKey } = require('./availability');
const crm = require('./crm');
const { birthdayTrigger } = require('./birthday-policy');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const DAY = 86400000;
function birthdayDashboard(db, now = Date.now()) {
  const today = parisDateKey(new Date(now));
  const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const tomorrow = next.toISOString().slice(0, 10);
  const rule = (db.crm?.settings || crm.defaults()).rules.find(r => r.id === 'birthday');
  const people = date => (db.customers || []).filter(c => c.crmPreferences?.birthday === date.slice(5)).map(c => {
    const raw = (db.crm?.offers || []).filter(o => o.customerId === c.id && o.ruleId === 'birthday' && o.eventKey === `birthday:${date.slice(0,4)}`).sort((a,b) => b.createdAt-a.createdAt)[0];
    const offer = raw ? crm.customerState(db, c, now).offers.find(o => o.id === raw.id) || {id:raw.id,title:raw.title,discountPercent:raw.discountPercent,minSubtotal:raw.minSubtotal,expiresAt:raw.expiresAt,status:'expired'} : null;
    const eligible = birthdayTrigger(c, now) === `birthday:${date.slice(0,4)}`;
    const consent = c.crmPreferences?.personalizedOffers === true;
    const reason = date !== today ? 'Disponible le jour de son anniversaire.' : !consent ? 'Ce client n’a pas accepté les offres personnalisées.' : offer ? 'Une offre a déjà été accordée pour cet anniversaire.' : !eligible ? 'Avantage déjà utilisé ou date renseignée trop récemment.' : '';
    return { id:c.id, name:String(c.name || [c.firstName,c.lastName].filter(Boolean).join(' ') || 'Client Bibou'), date, consent,
      canOffer:!reason, offerReason:reason, offer,
      canPreparePush:date === today && consent && c.pushPreferences?.marketing === true,
      pushReason:date !== today ? 'Le message pourra être préparé le jour de son anniversaire.' : !consent || c.pushPreferences?.marketing !== true ? 'Accord aux offres personnalisées et aux notifications promotionnelles requis.' : '' };
  }).sort((a,b) => a.name.localeCompare(b.name,'fr'));
  return { generatedAt:new Date(now).toISOString(), today, tomorrow, todayCustomers:people(today), tomorrowCustomers:people(tomorrow),
    offerDefaults:{title:rule?.title || 'Joyeux anniversaire',discountPercent:rule?.discountPercent ?? null,minSubtotal:rule?.minSubtotal ?? 0,validityDays:rule?.validityDays ?? 14} };
}
function createBirthdayOffer(db, input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['customerId','birthdayDate','title','discountPercent','minSubtotal','validityDays','confirm'].includes(k))) fail('Offre anniversaire invalide.');
  if (input.confirm !== true) fail('Confirmez l’attribution de cette réduction.',409);
  const state = birthdayDashboard(db,now);
  if (input.birthdayDate !== state.today) fail('Le jour a changé. Actualisez les anniversaires.',409);
  const c = (db.customers || []).find(c => c.id === input.customerId);
  if (!c) fail('Ce compte n’existe plus.',404);
  const target = state.todayCustomers.find(c => c.id === input.customerId);
  if (!target) fail('Ce n’est pas l’anniversaire de ce client aujourd’hui.',409);
  if (!target.consent) fail(target.offerReason,409);
  // Annual identity makes retry/restart/concurrent requests idempotent, including expired/used offers.
  if (target.offer) return {created:false,offer:target.offer};
  if (!target.canOffer) fail(target.offerReason,409);
  const {discountPercent,minSubtotal,validityDays} = input;
  if (!Number.isInteger(discountPercent) || discountPercent<1 || discountPercent>50) fail('Choisissez une réduction de 1 à 50 %.');
  if (typeof minSubtotal !== 'number' || !Number.isFinite(minSubtotal) || minSubtotal<0 || minSubtotal>10000 || Math.round(minSubtotal*100)/100!==minSubtotal) fail('Minimum de commande invalide.');
  if (!Number.isInteger(validityDays) || validityDays<1 || validityDays>90) fail('Validité : de 1 à 90 jours.');
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length>65 || /[\u0000-\u001f]/.test(title)) fail('Titre : de 1 à 65 caractères.');
  db.crm ||= {settings:crm.defaults(),offers:[],lastRunAt:null}; db.crm.offers ||= [];
  const offer = {id:crypto.randomUUID(),customerId:c.id,ruleId:'birthday',eventKey:`birthday:${state.today.slice(0,4)}`,birthdayDate:state.today,title,discountPercent,minSubtotal,createdAt:now,expiresAt:now+validityDays*DAY,createdBy:'restaurant'};
  db.crm.offers.push(offer);
  return {created:true,offer:crm.customerState(db,c,now).offers.find(o=>o.id===offer.id)};
}
module.exports = {birthdayDashboard,createBirthdayOffer};
