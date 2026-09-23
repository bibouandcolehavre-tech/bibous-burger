const crypto = require('node:crypto');
const { parisDateKey } = require('./availability');
const { queueCrmNotification } = require('./push-notifications');
const { orderProductInsights } = require('./order-insights');

const DAY = 86400000;
const TYPES = ['inactive', 'birthday', 'large_order', 'frequency', 'spend'];
const fail = (text, statusCode = 400) => { throw Object.assign(new Error(text), { statusCode }); };
const money = n => Math.round((Number(n) || 0) * 100) / 100;
const paid = o => o.payment?.status === 'PAID' && o.status !== 'cancelled';
const paidAt = o => Date.parse(o.payment?.paidAt || o.createdAt);
const iso = n => new Date(n).toISOString();
const defaults = () => ({ revision: 0, enabled: false, cooldownDays: 7, dailyLimit: 100, startHour: 10, endHour: 20,
  rules: TYPES.map((type, i) => ({ id: type, type, enabled: false,
    title: ['On vous attend chez Bibou', 'Joyeux anniversaire', 'Pour les grandes faims', 'Merci pour votre fidélité', 'Un privilège pour vous'][i],
    inactiveDays: 45, lookbackDays: 30, minOrders: null, minAmount: null,
    discountPercent: null, minSubtotal: 0, validityDays: 14, channel: 'in_app' })) });
const config = db => db.crm?.settings || defaults();
const store = db => db.crm ||= { settings: defaults(), offers: [], lastRunAt: null };
const optedIn = c => c.crmPreferences?.personalizedOffers === true;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} : de ${min} à ${max}.`);
  return value;
}
function amount(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000 || money(value) !== value) fail(`${label} : montant entre 0 et 10 000 €, avec deux décimales maximum.`);
  return value;
}
function validateSettings(input) {
  if (!plain(input) || Object.keys(input).some(k => !['revision','enabled','cooldownDays','dailyLimit','startHour','endHour','rules'].includes(k))) fail('Paramètres CRM invalides.');
  integer(input.revision, 0, Number.MAX_SAFE_INTEGER, 'Version');
  if (typeof input.enabled !== 'boolean') fail('Activation invalide.');
  integer(input.cooldownDays, 1, 365, 'Délai entre deux offres par client');
  integer(input.dailyLimit, 1, 1000, 'Maximum d’offres par jour');
  integer(input.startHour, 0, 23, 'Heure de début'); integer(input.endHour, 1, 24, 'Heure de fin');
  if (input.startHour >= input.endHour) fail('La fin doit être après le début.');
  if (!Array.isArray(input.rules) || input.rules.length !== TYPES.length) fail('Les cinq règles sont requises.');
  const allowed = Object.keys(defaults().rules[0]);
  input.rules.forEach((r, index) => {
    if (!plain(r) || r.id !== TYPES[index] || r.type !== r.id || Object.keys(r).some(k => !allowed.includes(k))) fail('Règle CRM invalide.');
    if (typeof r.enabled !== 'boolean' || !['in_app','in_app_push'].includes(r.channel)) fail('Activation ou canal invalide.');
    if (typeof r.title !== 'string' || !r.title.trim() || r.title.length > 65 || /[\u0000-\u001f]/.test(r.title)) fail('Titre : 1 à 65 caractères.');
    integer(r.inactiveDays, 1, 730, 'Jours sans commande'); integer(r.lookbackDays, 1, 365, 'Période d’activité');
    integer(r.validityDays, 1, 90, 'Validité du bon'); amount(r.minSubtotal, 'Minimum de produits');
    if (r.minOrders !== null) integer(r.minOrders, 1, 1000, 'Nombre de commandes');
    if (r.minAmount !== null) amount(r.minAmount, 'Seuil de dépenses');
    if (r.discountPercent !== null) integer(r.discountPercent, 1, 50, 'Réduction en %');
    if (r.enabled && (!r.discountPercent || (r.type === 'frequency' && !r.minOrders) || (['large_order','spend'].includes(r.type) && !(r.minAmount > 0)))) fail('Avant d’activer une règle, choisissez sa remise et son seuil commercial.');
  });
  return JSON.parse(JSON.stringify(input));
}
function saveSettings(db, input, now = Date.now()) {
  if (!plain(input)) fail('Paramètres invalides.');
  const { confirmActivation, ...fields } = input;
  const next = validateSettings(fields), previous = config(db);
  if (next.revision !== previous.revision) fail('Ces réglages ont changé dans un autre onglet. Rechargez-les.', 409);
  if (next.enabled && !next.rules.some(r => r.enabled)) fail('Choisissez au moins une règle à activer.');
  // Every edit of a running program requires a fresh, explicit confirmation.
  if (next.enabled && confirmActivation !== true) fail('Confirmez l’activation des offres automatiques.', 409);
  next.revision++; store(db).settings = next;
  store(db).updatedAt = iso(now);
  if (!next.enabled) (db.pushNotifications?.jobs || []).filter(j => j.crmOfferId && j.status === 'queued').forEach(j => { j.status = 'cancelled'; });
  return next;
}
function updateCustomerPreferences(db, customer, input, now = Date.now()) {
  if (!plain(input) || Object.keys(input).some(k => !['personalizedOffers','birthday'].includes(k)) || typeof input.personalizedOffers !== 'boolean') fail('Préférences invalides.');
  if (typeof input.birthday !== 'string') fail('Anniversaire invalide : mois et jour requis.');
  const birthday = input.birthday;
  const parsedBirthday = Date.parse(`2000-${birthday}T12:00:00Z`);
  if (birthday && (typeof birthday !== 'string' || !/^\d{2}-\d{2}$/.test(birthday) || !Number.isFinite(parsedBirthday) || iso(parsedBirthday).slice(5,10) !== birthday)) fail('Anniversaire invalide : mois et jour requis.');
  const previous = customer.crmPreferences || {};
  customer.crmPreferences = { ...previous, personalizedOffers: input.personalizedOffers, birthday, updatedAt: iso(now), consentVersion: 1 };
  if (input.personalizedOffers !== (previous.personalizedOffers === true)) customer.crmPreferences[input.personalizedOffers?'acceptedAt':'revokedAt'] = iso(now);
  if (!input.personalizedOffers) (db.pushNotifications?.jobs || []).filter(j => j.customerId === customer.id && j.crmOfferId && j.status === 'queued').forEach(j => { j.status = 'cancelled'; });
}
function customerOrders(db, customer, now) {
  return (db.orders || []).filter(o => o.customerId === customer.id && paid(o) && Number.isFinite(paidAt(o)) && paidAt(o) <= now).sort((a,b) => paidAt(b) - paidAt(a));
}
function trigger(rule, customer, orders, now) {
  const last = orders[0], recent = orders.filter(o => paidAt(o) >= now - rule.lookbackDays * DAY);
  if (rule.type === 'inactive') return last && paidAt(last) <= now - rule.inactiveDays * DAY ? `inactive:${last.id}` : null;
  if (rule.type === 'birthday') {
    const day = parisDateKey(new Date(now)), next = new Date(`${day}T12:00:00Z`); next.setUTCDate(next.getUTCDate()+1);
    const tomorrow = next.toISOString().slice(0,10);
    return customer.crmPreferences?.birthday === tomorrow.slice(5) ? `birthday:${tomorrow.slice(0,4)}` : null;
  }
  if (rule.type === 'large_order') { const order = recent.find(o => rule.minAmount > 0 && Number(o.subtotal) >= rule.minAmount); return order ? `large_order:${order.id}` : null; }
  if (rule.type === 'frequency') return rule.minOrders > 0 && recent.length >= rule.minOrders ? `frequency:${last.id}` : null;
  if (rule.type === 'spend') return rule.minAmount > 0 && recent.reduce((n,o) => n + Math.max(0, Number(o.subtotal) || 0), 0) >= rule.minAmount ? `spend:${last.id}` : null;
  return null;
}
function eligibility(db, settings, rule, now) {
  const offers = db.crm?.offers || [], results = { matched: 0, noConsent: 0, cooldown: 0, alreadyOffered: 0, eligible: [] };
  for (const c of db.customers || []) {
    const orders = customerOrders(db, c, now);
    const key = trigger(rule, c, orders, now); if (!key) continue;
    results.matched++;
    if (!optedIn(c)) { results.noConsent++; continue; }
    if (offers.some(o => o.customerId === c.id && o.eventKey === key)) { results.alreadyOffered++; continue; }
    if (offers.some(o => o.customerId === c.id && o.createdAt > now - settings.cooldownDays * DAY)) { results.cooldown++; continue; }
    results.eligible.push({ customerId: c.id, name: c.name || 'Client Bibou', eventKey: key, favoriteProduct: orderProductInsights(orders)[0]?.name || null });
  }
  return results;
}
function preview(db, settings = config(db), now = Date.now()) {
  const checked = validateSettings(settings);
  return checked.rules.map(r => { const result = eligibility(db, checked, r, now); return { id:r.id, matched:result.matched, noConsent:result.noConsent, cooldown:result.cooldown, alreadyOffered:result.alreadyOffered, eligible:result.eligible.length, sample:result.eligible.slice(0,10).map(c => ({ name:c.name, favoriteProduct:c.favoriteProduct })), configured:!!r.discountPercent && (r.type !== 'frequency' || !!r.minOrders) && (!['large_order','spend'].includes(r.type) || r.minAmount > 0) }; });
}
function evaluate(db, pushConfig, now = Date.now()) {
  const settings = config(db);
  if (!settings.enabled) return 0;
  const s = store(db); s.lastRunAt = iso(now);
  const hour = Number(new Intl.DateTimeFormat('fr-FR', { timeZone:'Europe/Paris', hour:'2-digit', hourCycle:'h23' }).formatToParts(new Date(now)).find(p=>p.type==='hour').value);
  if (hour < settings.startHour || hour >= settings.endHour) return 0;
  const today = parisDateKey(new Date(now));
  let quota = settings.dailyLimit - s.offers.filter(o => parisDateKey(new Date(o.createdAt)) === today).length, created = 0;
  for (const rule of settings.rules.filter(r => r.enabled)) {
    if (quota <= 0) break;
    const targets = eligibility(db, settings, rule, now).eligible;
    for (const target of targets) {
      if (quota <= 0) break;
      const offer = { id:crypto.randomUUID(), ruleId:rule.id, customerId:target.customerId, eventKey:target.eventKey, title:rule.title,
        discountPercent:rule.discountPercent, minSubtotal:rule.minSubtotal, createdAt:now, expiresAt:now + rule.validityDays * DAY };
      s.offers.push(offer); quota--; created++;
      if (rule.channel === 'in_app_push') queueCrmNotification(db, offer, pushConfig, now);
    }
  }
  return created;
}
function offerStatus(db, offer, now) {
  const orders = (db.orders || []).filter(o => o.crmOfferId === offer.id);
  // A paid coupon is never reissued automatically, even after a cancellation/refund.
  if (orders.some(o => o.payment?.status === 'PAID')) return 'used';
  if (offer.expiresAt <= now) return 'expired';
  if (orders.some(o => o.status === 'awaiting_payment' && !['FAILED','EXPIRED'].includes(o.payment?.status) && (Date.parse(o.createdAt) + 15*60000 > now || o.payment?.checkoutId || o.payment?.status === 'CREATING'))) return 'reserved';
  return 'available';
}
function customerState(db, c, now = Date.now()) {
  return { preferences:{ personalizedOffers:optedIn(c), birthday:c.crmPreferences?.birthday || '' }, offers:(db.crm?.offers || []).filter(o => o.customerId === c.id && o.expiresAt > now).map(o => ({ id:o.id, title:o.title, discountPercent:o.discountPercent, minSubtotal:o.minSubtotal, expiresAt:o.expiresAt, status:offerStatus(db,o,now) })) };
}
function bestOffer(db, c, subtotal, baseRate, now = Date.now()) {
  return customerState(db,c,now).offers.filter(o => o.status === 'available' && subtotal >= o.minSubtotal && o.discountPercent / 100 > baseRate).sort((a,b) => b.discountPercent - a.discountPercent || a.expiresAt - b.expiresAt)[0] || null;
}
function statistics(db, days = 30, now = Date.now()) {
  const since = now - days * DAY, customers = db.customers || [], valid = (db.orders || []).filter(o => paid(o) && paidAt(o) >= since && paidAt(o) <= now);
  const byCustomer = new Map(); valid.forEach(o => { if(o.customerId && customers.some(c => c.id === o.customerId)) byCustomer.set(o.customerId,(byCustomer.get(o.customerId)||0)+1); });
  const offers = (db.crm?.offers || []).filter(o => o.createdAt >= since && o.createdAt <= now);
  const offerIds = new Set(offers.map(o => o.id)), attributed = valid.filter(o => offerIds.has(o.crmOfferId));
  const metrics = ids => { const selected = attributed.filter(o => ids.has(o.crmOfferId)); return { used:new Set(selected.map(o => o.crmOfferId)).size, orders:selected.length, revenue:money(selected.reduce((n,o)=>n+Number(o.total||0),0)), discounts:money(selected.reduce((n,o)=>n+Number(o.discount||0),0)) }; };
  const issuedMetrics = metrics(offerIds);
  return { days, customers:customers.length, newCustomers:customers.filter(c => Date.parse(c.createdAt)>=since && Date.parse(c.createdAt)<=now).length, buyers:byCustomer.size, repeatBuyers:[...byCustomer.values()].filter(n=>n>=2).length,
    orders:valid.length, revenue:money(valid.reduce((n,o)=>n+Number(o.total||0),0)), averageBasket:valid.length?money(valid.reduce((n,o)=>n+Number(o.total||0),0)/valid.length):null,
    consenting:customers.filter(optedIn).length, birthdays:customers.filter(c=>c.crmPreferences?.birthday).length, neverOrdered:customers.filter(c=>!customerOrders(db,c,now).length).length,
    inactive45:customers.filter(c=>{const o=customerOrders(db,c,now)[0];return o && paidAt(o)<=now-45*DAY;}).length,
    popularProducts:orderProductInsights(valid).slice(0,5),
    offers:offers.length, used:issuedMetrics.used, discounts:issuedMetrics.discounts, attributedOrders:issuedMetrics.orders, attributedRevenue:issuedMetrics.revenue, conversion:offers.length?Math.round(issuedMetrics.used/offers.length*1000)/10:null,
    rules:config(db).rules.map(r=>{const own=offers.filter(o=>o.ruleId===r.id);return {id:r.id,title:r.title,issued:own.length,...metrics(new Set(own.map(o=>o.id)))};}) };
}
function dashboard(db, pushConfig, days = 30, now = Date.now()) {
  if (![7,30,90,365].includes(days)) fail('Période invalide.');
  return { settings:config(db), generatedAt:iso(now), lastRunAt:db.crm?.lastRunAt || null, previews:preview(db,config(db),now), statistics:statistics(db,days,now),
    channels:{ inApp:true, push:pushConfig.enabled && pushConfig.platforms.length>0, sms:false, email:false },
    recentOffers:(db.crm?.offers || []).slice(-30).reverse().map(o=>({id:o.id, title:o.title, customerName:(db.customers||[]).find(c=>c.id===o.customerId)?.name || 'Compte supprimé', createdAt:o.createdAt, expiresAt:o.expiresAt, status:offerStatus(db,o,now), discountPercent:o.discountPercent})),
    pushLast7Days:Object.fromEntries(['queued','accepted','provider_ok','failed','uncertain','cancelled'].map(status=>[status,(db.pushNotifications?.jobs||[]).filter(j=>j.crmOfferId && j.status===status && j.createdAt>now-7*DAY).length])) };
}
function deleteCustomer(db, customerId) { if(db.crm) db.crm.offers = db.crm.offers.filter(o=>o.customerId!==customerId); }

module.exports = { defaults, saveSettings, validateSettings, updateCustomerPreferences, preview, evaluate, customerState, bestOffer, statistics, dashboard, deleteCustomer };
