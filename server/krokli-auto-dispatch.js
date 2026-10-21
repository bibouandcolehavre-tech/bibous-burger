'use strict';
const crypto = require('node:crypto');
const P = require('./krokli-preparation');
const K = require('./krokly-drivers');
const externalDeliveries = require('./external-deliveries');

const MAX_SESSION_MS = 12 * 3600_000;
// Public BAN housenumber match (2026-10-16): 153 Quai George V, 76600 Le Havre,
// id 76351_3475_00153. Used for proximity only, never a road travel-time claim.
const PICKUP = { latitude:49.490809, longitude:0.118444 };
function proximity(position,now) {
  if(!position||![position.latitude,position.longitude,position.accuracy,position.timestamp].every(Number.isFinite)||
    Math.abs(position.latitude)>90||Math.abs(position.longitude)>180||position.accuracy<0||position.accuracy>100||position.mocked===true||
    position.timestamp>now+5000||position.timestamp<now-90000||Date.parse(position.receivedAt)>now||Date.parse(position.receivedAt)<now-90000||
    !Number.isFinite(Date.parse(position.receivedAt))||!Number.isFinite(Date.parse(position.expiresAt))||Date.parse(position.expiresAt)<=now)return Infinity;
  const radians=x=>x*Math.PI/180,a=radians(position.latitude-PICKUP.latitude),b=radians(position.longitude-PICKUP.longitude);
  const h=Math.sin(a/2)**2+Math.cos(radians(PICKUP.latitude))*Math.cos(radians(position.latitude))*Math.sin(b/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
function fail(message, statusCode = 400) { throw Object.assign(Error(message), { statusCode }); }
function available(driver, now = Date.now()) {
  const a = driver?.krokliAvailability;
  return Boolean(driver?.active === true && a?.available === true && a.authVersion === driver.authVersion &&
    Number.isSafeInteger(a.expiresAt) && a.expiresAt > now && Number.isFinite(Date.parse(a.since)));
}
function availabilityView(driver, now = Date.now()) {
  return { available: available(driver, now), revision: driver?.krokliAvailability?.revision || 0, expiresAt: available(driver, now) ? new Date(driver.krokliAvailability.expiresAt).toISOString() : null };
}
function setAvailability(db, driver, input, sessionExpiresAt, now = Date.now()) {
  if (!driver?.active || !(db.kroklyDrivers || []).includes(driver)) fail('Compte livreur à vérifier.', 401);
  if (!input || Object.keys(input).some(k => !['available','revision'].includes(k)) || typeof input.available !== 'boolean') fail('Disponibilité invalide.');
  if (!Number.isSafeInteger(sessionExpiresAt) || sessionExpiresAt <= now || sessionExpiresAt > now + MAX_SESSION_MS) fail('Session livreur à vérifier.', 401);
  const revision = driver.krokliAvailability?.revision || 0;
  if (driver.krokliAvailability?.expiresAt > sessionExpiresAt) {
    if (input.available) fail('Une connexion plus récente a changé la disponibilité. Actualise.',409);
    return availabilityView(driver,now); // Old logout cannot switch off a newer login.
  }
  if (input.available && input.revision !== revision) fail('La disponibilité a changé. Actualise avant de réessayer.',409);
  const wasAvailable = available(driver, now);
  driver.krokliAvailability = { available: input.available, revision: revision + 1, authVersion: driver.authVersion, expiresAt: sessionExpiresAt,
    since: input.available && wasAvailable ? driver.krokliAvailability.since : new Date(now).toISOString() };
  return availabilityView(driver, now);
}
function configure(db, input, now = Date.now()) {
  if (!input || Object.keys(input).some(k => k !== 'enabled') || typeof input.enabled !== 'boolean') fail('Réglage de répartition invalide.');
  const previous = P.settings(db);
  if (previous.enabled === input.enabled) return previous;
  // Each activation covers NEW acceptances only, never old awaiting jobs.
  db.krokliDispatchSettings = { enabled: input.enabled, activationId: crypto.randomUUID(), changedAt: new Date(now).toISOString() };
  return P.settings(db);
}
function busy(db, driverId, now) {
  return (db.orders || []).concat(externalDeliveries.list(db)).some(o => o.status !== 'cancelled' && o.status !== 'delivered' &&
    o.kroklyDriver?.driverId === driverId && (['accepted','picked_up','issue'].includes(o.kroklyDriver.status) ||
      o.kroklyDriver.status === 'offered' && Date.parse(o.kroklyDriver.expiresAt) > now));
}
function tick(db, { now = Date.now(), queueOffer = () => {}, locations = [] } = {}) {
  const result = { changed: false, offers: [] }, config = P.settings(db);
  if (!config.enabled) return result;
  if (K.expireOffers(db, now)) result.changed = true;
  const setState = (p, next) => { if (p.state !== next) { p.state = next; result.changed = true; } };
  for (const o of db.orders || []) {
    const a = o.kroklyDriver, p = o.krokliPreparation;
    if (a?.source === 'automatic' && a.status === 'offered' &&
      (!P.kitchenOrder(o) || !available((db.kroklyDrivers || []).find(d=>d.id===a.driverId),now))) {
      a.status = 'expired'; a.updatedAt = new Date(now).toISOString(); result.changed = true;
    }
    if (!p || p.activationId !== config.activationId || p.state === 'manual') continue;
    if(P.refreshPlan(db,o,now))result.changed=true;
    if (!P.validPlan(o)) { setState(p,'invalidated'); continue; }
    if (!P.kitchenOrder(o)) { setState(p,'suspended'); continue; }
    if (!P.due(o,now)) continue;
    if (a && ['accepted','picked_up','issue'].includes(a.status)) { setState(p,'assigned'); continue; }
    if (a?.status === 'offered' && Date.parse(a.expiresAt) > now) { setState(p,'offered'); continue; }
    // Rank only already-consented, fresh GPS positions. Unknown positions
    // never become a fake zero-distance courier; fallback is fair rotation.
    const candidates = (db.kroklyDrivers || []).filter(d => available(d,now) && !busy(db,d.id,now) && !p.attemptedDriverIds.includes(d.id));
    const distance = new Map(candidates.map(d=>[d.id,proximity(locations.find(p=>p.driverId===d.id),now)]));
    candidates.sort((a,b)=>{
      const da=distance.get(a.id),dbb=distance.get(b.id);
      if(da!==dbb)return da<dbb?-1:1;
      return (a.krokliLastAutomaticOfferAt || 0)-(b.krokliLastAutomaticOfferAt || 0) || Date.parse(a.krokliAvailability.since)-Date.parse(b.krokliAvailability.since) || a.id.localeCompare(b.id);
    });
    const driver = candidates[0];
    if (!driver) { setState(p,'waiting_for_driver'); continue; }
    const assignment = K.assign(db,o.id,driver.id,now,{source:'automatic'});
    assignment.source = 'automatic'; assignment.selection = Number.isFinite(distance.get(driver.id))?'fresh-gps-proximity':'available-rotation';
    p.attemptedDriverIds.push(driver.id); setState(p,'offered');
    driver.krokliLastAutomaticOfferAt = now;
    // Queueing happens under the caller's DB transaction. Provider I/O must
    // remain in the existing notification workers, after the persisted offer.
    queueOffer(o,driver,assignment); result.changed = true;
    result.offers.push({orderId:o.id,driverId:driver.id});
  }
  return result;
}
module.exports = { PICKUP, proximity, available, availabilityView, setAvailability, configure, busy, tick };
