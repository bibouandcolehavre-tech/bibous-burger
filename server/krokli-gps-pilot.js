const crypto = require('node:crypto');

// Voluntary sharing. RAM-only positions: no history, backup or status gate.
const POSITION_TTL_MS = 90_000;
const SESSION_MS = 30 * 60_000;
const CONSENT_VERSION = 'bibou-foreground-gps-v1';
const NATIVE_CONSENT_VERSION = 'bibou-native-gps-pilot-v1';
const CONTINUOUS_CONSENTS = ['bibou-foreground-gps-until-stop-v2', 'bibou-native-gps-until-stop-v2'];
const CUSTOMER_CONSENTS = ['bibou-foreground-gps-customer-v3', 'bibou-native-gps-customer-v3'];
function fail(message, statusCode = 400) { throw Object.assign(Error(message), { statusCode }); }
function createGpsPilot({ clock = Date.now } = {}) {
  const sessions = new Map();
  function clean(db) {
    const now = clock();
    for (const [id, session] of sessions) {
      const driver = (db.kroklyDrivers || []).find(d => d.id === id && d.active && d.authVersion === session.authVersion);
      if (!driver || session.expiresAt <= now || (!session.continuous && session.leaseUntil <= now)) sessions.delete(id);
      else if (session.leaseUntil <= now) session.position = null;
    }
  }
  function current(db, driverId, input) {
    clean(db);
    const session = sessions.get(driverId);
    if (!session || session.id !== input?.sessionId) fail('Essai GPS arrêté ou expiré. Relance-le si tu le souhaites.', 409);
    return session;
  }
  function start(db, driver, input) {
    clean(db);
    if (![CONSENT_VERSION, NATIVE_CONSENT_VERSION, ...CONTINUOUS_CONSENTS,...CUSTOMER_CONSENTS].includes(input?.consentVersion)) fail('Lis les informations puis confirme le partage GPS.');
    const customerTracking=CUSTOMER_CONSENTS.includes(input.consentVersion);
    if(customerTracking&&input.customerTracking!==true)fail('Confirme séparément le suivi client pendant la livraison.');
    const now = clock();
    const continuous = customerTracking||CONTINUOUS_CONSENTS.includes(input.consentVersion);
    const session = { id: crypto.randomUUID(), authVersion: driver.authVersion, continuous,customerTracking, mode: input.consentVersion.includes('native') ? 'native-pilot' : 'foreground-pilot', expiresAt: continuous ? Infinity : now + SESSION_MS, leaseUntil: now + POSITION_TTL_MS, position: null };
    sessions.set(driver.id, session);
    return { sessionId: session.id, expiresAt: continuous ? null : new Date(session.expiresAt).toISOString(), ...(continuous ? { sharingMode: 'until-stopped' } : {}),...(customerTracking?{customerTracking:true}:{}), positionTtlSeconds: POSITION_TTL_MS / 1000 };
  }
  function update(db, driverId, input) {
    const session = current(db, driverId, input);
    const p = input?.position, now = clock();
    if (!p || typeof p !== 'object' || Array.isArray(p) ||
      !Number.isFinite(p.latitude) || p.latitude < -90 || p.latitude > 90 ||
      !Number.isFinite(p.longitude) || p.longitude < -180 || p.longitude > 180 ||
      !Number.isFinite(p.accuracy) || p.accuracy < 0 || p.accuracy > 100 ||
      !Number.isFinite(p.timestamp) || p.timestamp > now + 5000 || now - p.timestamp > 30_000 || p.mocked === true) {
      fail('Position absente, trop ancienne ou imprécise. Les livraisons restent disponibles.');
    }
    if (session.position && p.timestamp <= session.position.timestamp) fail('Une position plus récente est déjà disponible.', 409);
    session.position = { latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy, timestamp: p.timestamp, receivedAt: now };
    session.leaseUntil = now + POSITION_TTL_MS;
    return { receivedAt: new Date(now).toISOString(), expiresAt: Number.isFinite(session.expiresAt) ? new Date(session.expiresAt).toISOString() : null };
  }
  function stop(db, driverId, input) {
    clean(db);
    // An old page cannot stop a newer session on another device.
    if (sessions.get(driverId)?.id === input?.sessionId) sessions.delete(driverId);
    return { stopped: true };
  }
  function locations(db) {
    clean(db);
    return [...sessions].flatMap(([driverId, session]) => session.position ? [{
      driverId, ...session.position, receivedAt: new Date(session.position.receivedAt).toISOString(),
      expiresAt: new Date(Math.min(session.expiresAt, session.position.receivedAt + POSITION_TTL_MS)).toISOString(),
      source: session.mode, verifiedArrival: false
    }] : []);
  }
  function customerLocation(db,order) {
    clean(db);
    const assignment=order?.kroklyDriver,driverId=assignment?.driverId,session=sessions.get(driverId);
    if(order?.payment?.status!=='PAID'||order.reviewMode||order.status!=='out_for_delivery'||assignment?.status!=='picked_up'||
      !session?.customerTracking||!session.position)return null;
    // No position while serving another customer or a multi-stop tour whose
    // selective sharing has not yet been implemented.
    const active=(db.orders||[]).filter(o=>o.status==='out_for_delivery'&&o.kroklyDriver?.status==='picked_up'&&o.kroklyDriver.driverId===driverId);
    if(active.length!==1||active[0].id!==order.id)return null;
    const p=session.position,age=clock()-p.timestamp;
    if(age<0||age>=30_000)return null;
    return {latitude:p.latitude,longitude:p.longitude,accuracy:p.accuracy,ageSeconds:Math.floor(age/1000),validForMs:Math.max(0,30_000-age)};
  }
  // Expire memory independently of dashboard reads; do not retain old GPS fixes.
  const timer = setInterval(() => {
    const now = clock();
    for (const [id, s] of sessions) {
      if (s.expiresAt <= now || (!s.continuous && s.leaseUntil <= now)) sessions.delete(id);
      else if (s.leaseUntil <= now) s.position = null;
    }
  }, 5000);
  timer.unref();
  return { start, update, stop, locations, customerLocation, close: () => { clearInterval(timer); sessions.clear(); } };
}
module.exports = { createGpsPilot, POSITION_TTL_MS, SESSION_MS, CONSENT_VERSION, NATIVE_CONSENT_VERSION };
