const crypto = require('node:crypto');
const { parisDateKey } = require('./availability');
const webPush = require('./krokly-web-push');

const OFFER_MS = 5 * 60 * 1000;
const SESSION_MS = 12 * 60 * 60 * 1000;
const ACTIVE = new Set(['offered', 'accepted', 'picked_up', 'issue']);

function fail(message, statusCode = 409) {
  throw Object.assign(new Error(message), { statusCode });
}

function equal(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function cleanUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) fail('Identifiant : 3 à 32 lettres, chiffres, points, tirets ou tirets bas.', 400);
  return username;
}

function publicDriver(driver) {
  return { id: driver.id, username: driver.username, name: driver.name, active: driver.active, createdAt: driver.createdAt };
}

function drivers(db) {
  return (db.kroklyDrivers || []).map(publicDriver);
}

function createDriver(db, input, now = Date.now()) {
  const username = cleanUsername(input?.username);
  const name = String(input?.name || '').trim();
  if (name.length < 2 || name.length > 60) fail('Indiquez le nom du livreur (2 à 60 caractères).', 400);
  db.kroklyDrivers ||= [];
  if (db.kroklyDrivers.length >= 20) fail('Limite de comptes livreurs atteinte pour ce pilote.');
  if (db.kroklyDrivers.some(driver => driver.username === username)) fail('Cet identifiant existe déjà.');
  const password = crypto.randomBytes(18).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const driver = {
    id: crypto.randomUUID(), username, name, salt, passwordHash: hashPassword(password, salt),
    active: true, authVersion: 1, createdAt: new Date(now).toISOString()
  };
  db.kroklyDrivers.push(driver);
  return { driver: publicDriver(driver), password };
}

function resetPassword(db, id) {
  const driver = (db.kroklyDrivers || []).find(item => item.id === id);
  if (!driver) fail('Livreur introuvable.', 404);
  const password = crypto.randomBytes(18).toString('base64url');
  driver.salt = crypto.randomBytes(16).toString('hex');
  driver.passwordHash = hashPassword(password, driver.salt);
  driver.authVersion += 1;
  driver.active = true;
  webPush.revokeDriver(db, id);
  return { driver: publicDriver(driver), password };
}

function setActive(db, id, active) {
  const driver = (db.kroklyDrivers || []).find(item => item.id === id);
  if (!driver) fail('Livreur introuvable.', 404);
  if (typeof active !== 'boolean') fail('État du compte invalide.', 400);
  driver.active = active;
  driver.authVersion += 1;
  if (!active) webPush.revokeDriver(db, id);
  return publicDriver(driver);
}

function sessionFor(db, usernameInput, password, secret, now = Date.now()) {
  const username = String(usernameInput || '').trim().toLowerCase();
  const driver = (db.kroklyDrivers || []).find(item => item.username === username);
  // Run the same expensive hash for unknown usernames to reduce enumeration.
  const salt = driver?.salt || '0'.repeat(32);
  const expected = driver?.passwordHash || '0'.repeat(128);
  if (typeof password !== 'string' || password.length > 128) fail('Identifiant ou mot de passe incorrect.', 401);
  // Courier passwords are generated base64url strings, so surrounding whitespace
  // can only come from copying/pasting. Preserve every actual password character.
  const found = hashPassword(password.trim(), salt);
  if (!driver?.active || !equal(expected, found)) fail('Identifiant ou mot de passe incorrect.', 401);
  const payload = Buffer.from(JSON.stringify({ id: driver.id, v: driver.authVersion, exp: now + SESSION_MS })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, driver: publicDriver(driver) };
}

function authenticate(db, token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
  if (!equal(expected, parts[1])) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= now) return null;
    const driver = (db.kroklyDrivers || []).find(item => item.id === payload.id && item.authVersion === payload.v && item.active);
    return driver || null;
  } catch { return null; }
}

function uberActive(order) {
  const u = order?.uberDirect;
  return Boolean(u && ['sending', 'uncertain', 'created'].includes(u.phase) && !['canceled', 'returned', 'delivered'].includes(u.status));
}

function eligible(order, now = Date.now()) {
  return Boolean(order?.method === 'delivery' && order.payment?.status === 'PAID' && order.status === 'ready' && order.serviceDate === parisDateKey(new Date(now)) && order.amendment?.status !== 'pending' && !uberActive(order) && !ACTIVE.has(order.kroklyDriver?.status));
}

function expireOffers(db, now = Date.now()) {
  let changed = false;
  for (const order of db.orders || []) {
    if (order.kroklyDriver?.status === 'offered' && Date.parse(order.kroklyDriver.expiresAt) <= now) {
      order.kroklyDriver.status = 'expired';
      order.kroklyDriver.updatedAt = new Date(now).toISOString();
      changed = true;
    }
  }
  return changed;
}

function assign(db, orderId, driverId, now = Date.now()) {
  const order = (db.orders || []).find(item => item.id === orderId);
  const driver = (db.kroklyDrivers || []).find(item => item.id === driverId && item.active);
  if (!driver) fail('Livreur actif introuvable.', 404);
  if (!eligible(order, now)) fail('Commande hors service du jour, non prête, non payée, déjà attribuée ou confiée à Uber.');
  order.kroklyDriver = {
    driverId, status: 'offered', offeredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + OFFER_MS).toISOString(), updatedAt: new Date(now).toISOString()
  };
  return order.kroklyDriver;
}

function transition(db, orderId, driverId, action, now = Date.now()) {
  const order = (db.orders || []).find(item => item.id === orderId);
  if (!order || order.kroklyDriver?.driverId !== driverId) fail('Course non attribuée à ce livreur.', 404);
  if (order.method !== 'delivery' || order.payment?.status !== 'PAID' || order.status === 'cancelled' || uberActive(order)) fail('Cette course n’est plus disponible.');
  const current = order.kroklyDriver.status;
  const next = {
    offered: { accept: 'accepted', decline: 'declined' },
    accepted: { pickup: 'picked_up' },
    picked_up: { deliver: 'delivered' }
  }[current]?.[action];
  if (!next) fail('Cette étape n’est pas disponible pour cette course.');
  if (current === 'offered' && Date.parse(order.kroklyDriver.expiresAt) <= now) fail('Cette proposition a expiré.');
  if (action === 'pickup' && order.status !== 'ready') fail('Le restaurant doit d’abord marquer la commande prête.');
  if (action === 'deliver' && order.status !== 'out_for_delivery') fail('Le départ en livraison doit être confirmé avant la remise.');
  order.kroklyDriver.status = next;
  order.kroklyDriver.updatedAt = new Date(now).toISOString();
  if (action === 'pickup') order.status = 'out_for_delivery';
  if (action === 'deliver') order.status = 'delivered';
  if (['pickup', 'deliver'].includes(action)) order.updatedAt = new Date(now).toISOString();
  return order;
}

function project(order) {
  const accepted = ['accepted', 'picked_up', 'delivered'].includes(order.kroklyDriver.status);
  return {
    id: order.id, number: order.number, status: order.kroklyDriver.status,
    restaurant: "Bibou's Burgers", pickupAddress: '153 Quai Georges V, 76600 Le Havre',
    distanceKm: order.distanceKm || null, slot: order.slot, serviceDate: order.serviceDate,
    deliveryCity: order.deliveryAddress?.city || null,
    expiresAt: order.kroklyDriver.expiresAt,
    ...(accepted ? {
      customerName: order.customerName, customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress, comment: order.comment || ''
    } : {})
  };
}

function assigned(db, driverId) {
  return (db.orders || []).filter(order => order.kroklyDriver?.driverId === driverId && ACTIVE.has(order.kroklyDriver.status) && order.status !== 'cancelled').map(project);
}

function dispatchState(db, now = Date.now()) {
  return {
    drivers: drivers(db).map(driver => ({ ...driver, pushDevices: (db.kroklyPushSubscriptions || []).filter(item => item.driverId === driver.id).length })),
    orders: (db.orders || [])
      .filter(order => order.method === 'delivery' && order.payment?.status === 'PAID' && order.serviceDate === parisDateKey(new Date(now)) && ['ready', 'out_for_delivery'].includes(order.status))
      .map(order => ({ id: order.id, number: order.number, status: order.status, serviceDate: order.serviceDate, slot: order.slot, eligible: eligible(order, now), assignment: order.kroklyDriver || null }))
  };
}

module.exports = { drivers, createDriver, resetPassword, setActive, sessionFor, authenticate, uberActive, eligible, expireOffers, assign, transition, assigned, dispatchState, OFFER_MS };
