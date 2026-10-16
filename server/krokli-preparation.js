'use strict';

const crypto = require('node:crypto');
const { parisDateKey, serviceSlotInstant } = require('./availability');
const timing = require('./delivery-timing');
const learning = require('./timing-learning');
const {preparationMinutes} = require('../service-policy');

const VERSION = 'krokli-preparation-v1';
const MINUTE = 60_000;
const APPROACH_MINUTES = 5;
// Same kitchen base policy used by the customer app, never a total including
// driving. Road duration is added separately to the customer forecast.
function estimateMinutes(subtotal) {
  if (typeof subtotal !== 'number' || !Number.isFinite(subtotal) || subtotal < 0 || subtotal > 1_000_000) throw Error('Montant du panier à vérifier.');
  return preparationMinutes(subtotal);
}

function uberActive(order) {
  const u = order?.uberDirect;
  return Boolean(u && ['sending', 'uncertain', 'created'].includes(u.phase) && !['canceled', 'returned', 'delivered'].includes(u.status));
}

function fingerprint(order) {
  // No customer identity, contact or position is included in the signature.
  return crypto.createHash('sha256').update(JSON.stringify({
    subtotal: order.subtotal, items: order.items, serviceDate: order.serviceDate,
    slot: order.slot, method: order.method
  })).digest('hex');
}

function kitchenOrder(order) {
  return Boolean(order?.method === 'delivery' && order.payment?.status === 'PAID' &&
    ['preparing', 'ready'].includes(order.status) && !order.reviewMode &&
    order.amendment?.status !== 'pending' && !uberActive(order));
}

function plan(order, { acceptedAt, approachMinutes = APPROACH_MINUTES, activationId, database, now } = {}) {
  if (!kitchenOrder(order) || !Array.isArray(order.items) || !order.items.length) throw Error('Commande payée et acceptée requise.');
  const accepted = Date.parse(acceptedAt);
  if (!Number.isFinite(accepted) || typeof activationId !== 'string' || !activationId || activationId.length > 100 ||
    !Number.isInteger(approachMinutes) || approachMinutes < 0 || approachMinutes > 15) throw Error('Planification de cuisine invalide.');
  const slot = serviceSlotInstant(order.serviceDate, String(order.slot || '').slice(0, 5));
  if (!slot || !Number.isFinite(slot.getTime()) || order.serviceDate < parisDateKey(new Date(accepted))) throw Error('Créneau de livraison à vérifier.');
  const minutes = estimateMinutes(order.subtotal), travel=timing.travelSeconds(order);
  // Future bookings must not call a courier hours/days before their service.
  // Customer slot is an arrival target: subtract road time only to determine
  // the kitchen target for a future booking, not from the cooking workload.
  const forecast=database?timing.kitchenForecast(database,order,now??accepted):null;
  const ready = forecast?.readyAt??Math.max(accepted + minutes * MINUTE, slot.getTime()-(travel??0)*1000);
  const notify = Math.max(accepted, ready - approachMinutes * MINUTE);
  return {
    version: VERSION, activationId, basketFingerprint: fingerprint(order),
    acceptedAt: new Date(accepted).toISOString(), preparationMinutes: forecast?.preparationMinutes??minutes,
    approachMinutes, queueMinutes:forecast?.queueMinutes??0, estimatedReadyAt: new Date(ready).toISOString(),
    notifyAt: new Date(notify).toISOString(), state: 'scheduled', attemptedDriverIds: []
  };
}

function validPlan(order) {
  const p = order?.krokliPreparation;
  if (!p || p.version !== VERSION || p.basketFingerprint !== fingerprint(order) ||
    typeof p.activationId !== 'string' || !p.activationId || !Array.isArray(p.attemptedDriverIds) ||
    p.attemptedDriverIds.length > 20 || p.attemptedDriverIds.some(id => typeof id !== 'string')) return false;
  const accepted = Date.parse(p.acceptedAt), ready = Date.parse(p.estimatedReadyAt), notify = Date.parse(p.notifyAt);
  return Number.isFinite(accepted) && Number.isFinite(ready) && Number.isFinite(notify) &&
    Number.isInteger(p.preparationMinutes) && p.preparationMinutes >= 5 && p.preparationMinutes <= 120 &&
    Number.isInteger(p.approachMinutes) && p.approachMinutes >= 0 && p.approachMinutes <= 15 &&
    accepted <= notify && notify <= ready && ready - notify <= p.approachMinutes * MINUTE;
}

function due(order, now = Date.now()) {
  return Boolean(Number.isFinite(now) && kitchenOrder(order) && validPlan(order) &&
    !['cancelled', 'invalidated'].includes(order.krokliPreparation.state) &&
    order.serviceDate === parisDateKey(new Date(now)) &&
    (order.status === 'ready' || Date.parse(order.krokliPreparation.notifyAt) <= now));
}

function settings(db) {
  const saved = db?.krokliDispatchSettings;
  return { enabled: saved?.enabled === true && typeof saved.activationId === 'string' && Boolean(saved.activationId),
    activationId: saved?.activationId || null, approachMinutes: APPROACH_MINUTES, version: VERSION };
}

function recordAcceptance(db, order, previousStatus, now = Date.now()) {
  if(previousStatus==='confirmed'&&order?.status==='preparing'&&order.payment?.status==='PAID'&&!order.reviewMode) {
    try { const f=timing.kitchenForecast(db,order,now);learning.observeAcceptance(db,order,f?.queueMinutes??0,now); }
    catch { /* Legacy malformed basket must never block restaurant acceptance. */ }
  }
  const config = settings(db);
  if (!config.enabled || previousStatus !== 'confirmed' || order?.status !== 'preparing' || !kitchenOrder(order)) return false;
  try { order.krokliPreparation = plan(order, { acceptedAt: order.kitchenAcceptedAt||new Date(now).toISOString(), activationId: config.activationId, approachMinutes: config.approachMinutes, database:db, now }); }
  catch { order.krokliPreparationWarning = 'Calcul du délai à vérifier. Attribution manuelle conservée.'; return false; }
  delete order.krokliPreparationWarning;
  return true;
}

function recordReady(db, order, previousStatus, now = Date.now()) {
  if(previousStatus!=='ready'&&order?.status==='ready'&&order.payment?.status==='PAID'&&!order.reviewMode)order.kitchenReadyAt=new Date(now).toISOString();
  const config = settings(db);
  // A new restaurant confirmation may advance a timer (or cover an older
  // accepted order). Never backfill a ready backlog or replace a courier.
  if (!config.enabled || previousStatus === 'ready' || order?.status !== 'ready' ||
    !kitchenOrder(order) || order.serviceDate !== parisDateKey(new Date(now)) ||
    ['offered', 'accepted', 'picked_up', 'issue', 'delivered'].includes(order.kroklyDriver?.status) ||
    order.krokliPreparation?.state === 'manual') return false;
  try {
    const existing = validPlan(order) && order.krokliPreparation.activationId === config.activationId;
    const p = existing ? order.krokliPreparation : plan(order, { acceptedAt: new Date(now).toISOString(), activationId: config.activationId });
    p.notifyAt = p.estimatedReadyAt = p.manuallyReadyAt = new Date(now).toISOString();
    p.state = 'scheduled';
    order.krokliPreparation = p;
    delete order.krokliPreparationWarning;
    return true;
  } catch {
    order.krokliPreparationWarning = 'Appel automatique à vérifier. Attribution manuelle conservée.';
    return false;
  }
}

function refreshPlan(db,order,now=Date.now()) {
  const p=order?.krokliPreparation;
  if(!validPlan(order)||order.status!=='preparing'||p.manuallyReadyAt||p.state==='manual'||
    ['offered','accepted','picked_up','issue'].includes(order.kroklyDriver?.status))return false;
  const f=timing.kitchenForecast(db,order,now);if(!f)return false;
  const ready=new Date(f.readyAt).toISOString(),notify=new Date(Math.max(Date.parse(p.acceptedAt),f.readyAt-p.approachMinutes*MINUTE)).toISOString();
  if(ready===p.estimatedReadyAt&&notify===p.notifyAt&&p.queueMinutes===f.queueMinutes)return false;
  p.estimatedReadyAt=ready;p.notifyAt=notify;p.queueMinutes=f.queueMinutes;return true;
}

function view(order, now = Date.now()) {
  const p = order?.krokliPreparation;
  if (!p || !validPlan(order)) return null;
  const blocked = !kitchenOrder(order) || order.serviceDate < parisDateKey(new Date(now));
  return { version: VERSION, acceptedAt: p.acceptedAt, preparationMinutes: p.preparationMinutes,
    approachMinutes: p.approachMinutes, estimatedReadyAt: p.estimatedReadyAt, notifyAt: p.notifyAt,
    ...(p.manuallyReadyAt ? { manuallyReadyAt: p.manuallyReadyAt } : {}),
    state: blocked ? 'suspended' : p.state, due: !blocked && due(order, now), estimateOnly: true };
}

module.exports = { VERSION, APPROACH_MINUTES, estimateMinutes, uberActive, fingerprint, kitchenOrder, plan, validPlan, due, settings, recordAcceptance, recordReady, refreshPlan, view };
