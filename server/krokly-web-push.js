const crypto = require('node:crypto');

const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']);
const MAX_SUBSCRIPTIONS_PER_DRIVER = 3;
const MAX_JOBS = 500;

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function configFromEnv(env) {
  const configured = String(env.KROKLY_VAPID_PRIVATE_KEY || '').trim();
  const sessionSecret = String(env.SESSION_SECRET || '');
  // A distinct key is derived from the already-persistent random session secret
  // when no dedicated VAPID secret has been provisioned. Never derive from the
  // server's ephemeral fallback or from the restaurant's human password.
  const secret = configured || (Buffer.byteLength(sessionSecret) >= 32
    ? Buffer.from(crypto.hkdfSync('sha256', Buffer.from(sessionSecret), Buffer.from('krokly-vapid-salt-v1'), Buffer.from('bibou-courier-web-push-v1'), 32)).toString('base64url')
    : '');
  const subject = String(env.KROKLY_VAPID_SUBJECT || 'mailto:contact@bibousburgers.com').trim();
  if (!secret) return { enabled: false, publicKey: null };
  const privateBytes = Buffer.from(secret, 'base64url');
  if (privateBytes.length !== 32 || privateBytes.toString('base64url') !== secret) throw new Error('Clé VAPID Krokly invalide.');
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject) && !/^https:\/\//.test(subject)) throw new Error('Contact VAPID Krokly invalide.');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateBytes);
  const publicBytes = ecdh.getPublicKey(undefined, 'uncompressed');
  const privateKey = crypto.createPrivateKey({ key: {
    kty: 'EC', crv: 'P-256', d: secret,
    x: publicBytes.subarray(1, 33).toString('base64url'),
    y: publicBytes.subarray(33, 65).toString('base64url')
  }, format: 'jwk' });
  return { enabled: true, publicKey: publicBytes.toString('base64url'), privateKey, subject };
}

function validEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash &&
      (PUSH_HOSTS.has(url.hostname) || url.hostname.endsWith('.push.apple.com') || url.hostname.endsWith('.notify.windows.com'));
  } catch { return false; }
}

function subscriptions(db) { return db.kroklyPushSubscriptions ||= []; }
function jobs(db) { return db.kroklyPushJobs ||= []; }

function register(db, driverId, endpoint, now = Date.now()) {
  if (!validEndpoint(endpoint)) fail('Abonnement de notification non reconnu.');
  const list = subscriptions(db);
  // One browser subscription must never continue receiving another driver's offers.
  db.kroklyPushSubscriptions = list.filter(item => item.endpoint !== endpoint);
  const mine = db.kroklyPushSubscriptions.filter(item => item.driverId === driverId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  while (mine.length >= MAX_SUBSCRIPTIONS_PER_DRIVER) {
    const oldest = mine.shift();
    db.kroklyPushSubscriptions = db.kroklyPushSubscriptions.filter(item => item.id !== oldest.id);
  }
  db.kroklyPushSubscriptions.push({ id: crypto.randomUUID(), driverId, endpoint, createdAt: new Date(now).toISOString() });
  return { subscribed: true, devices: db.kroklyPushSubscriptions.filter(item => item.driverId === driverId).length };
}

function unregister(db, driverId, endpoint) {
  db.kroklyPushSubscriptions = subscriptions(db).filter(item => !(item.driverId === driverId && item.endpoint === endpoint));
  return { subscribed: false };
}

function revokeDriver(db, driverId) {
  db.kroklyPushSubscriptions = subscriptions(db).filter(item => item.driverId !== driverId);
  db.kroklyPushJobs = jobs(db).filter(item => item.driverId !== driverId);
}

function queue(db, driverId, orderId, availableAt = Date.now(), expiresAt = availableAt + 120000) {
  const active = subscriptions(db).filter(item => item.driverId === driverId);
  const pending = jobs(db);
  for (const subscription of active) {
    pending.push({ id: crypto.randomUUID(), subscriptionId: subscription.id, driverId, orderId,
      status: 'pending', attempts: 0, availableAt, expiresAt });
  }
  if (pending.length > MAX_JOBS) db.kroklyPushJobs = pending.slice(-MAX_JOBS);
  return active.length;
}

function queueTest(db, driverId, now = Date.now()) {
  const driver = (db.kroklyDrivers || []).find(item => item.id === driverId && item.active);
  if (!driver) fail('Compte livreur indisponible.', 401);
  if (driver.lastPushTestAt && now - Date.parse(driver.lastPushTestAt) < 5 * 60000) fail('Attends cinq minutes avant un nouvel essai.', 429);
  if (!subscriptions(db).some(item => item.driverId === driverId)) fail('Active d’abord les notifications sur ce téléphone.', 409);
  driver.lastPushTestAt = new Date(now).toISOString();
  queue(db, driverId, null, now + 15000, now + 120000);
  return { scheduled: true, delaySeconds: 15 };
}

function claim(db, now = Date.now(), limit = 5) {
  const selected = [];
  for (const job of jobs(db)) {
    if (selected.length >= limit) break;
    if (job.status !== 'pending' || job.availableAt > now) continue;
    const driver = (db.kroklyDrivers || []).find(item => item.id === job.driverId && item.active);
    const subscription = subscriptions(db).find(item => item.id === job.subscriptionId && item.driverId === job.driverId);
    const order = job.orderId && (db.orders || []).find(item => item.id === job.orderId);
    const validOrder = !job.orderId || (order?.kroklyDriver?.driverId === job.driverId && order.kroklyDriver.status === 'offered' && Date.parse(order.kroklyDriver.expiresAt) > now);
    if (!driver || !subscription || !validOrder || job.expiresAt <= now) { job.status = 'discarded'; continue; }
    job.attempts += 1;
    job.availableAt = now + 20000; // Crash recovery: retry only after this lease.
    selected.push({ id: job.id, endpoint: subscription.endpoint });
  }
  return selected;
}

function settle(db, id, outcome, now = Date.now()) {
  const job = jobs(db).find(item => item.id === id);
  if (!job || job.status !== 'pending') return;
  if (outcome.ok) job.status = 'sent';
  else if ([404, 410].includes(outcome.status)) {
    job.status = 'invalid';
    db.kroklyPushSubscriptions = subscriptions(db).filter(item => item.id !== job.subscriptionId);
  } else if (job.attempts >= 3 || job.expiresAt <= now) job.status = 'failed';
  else job.availableAt = now + Math.min(30000 * job.attempts, 60000);
  db.kroklyPushJobs = jobs(db).filter(item => item.status === 'pending' || (item.status === 'failed' && now - item.expiresAt < 3600000));
}

function vapidToken(config, endpoint, now = Date.now()) {
  const origin = new URL(endpoint).origin;
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ aud: origin, exp: Math.floor(now / 1000) + 3600, sub: config.subject })).toString('base64url');
  const body = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(body), { key: config.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${body}.${signature}`;
}

async function send(config, endpoint, fetchImpl = fetch) {
  if (!config.enabled || !validEndpoint(endpoint)) return { ok: false, status: 400 };
  try {
    const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `vapid t=${vapidToken(config, endpoint)}, k=${config.publicKey}`, TTL: '120', Urgency: 'high' } });
    return { ok: response.status === 201 || response.status === 202, status: response.status };
  } catch { return { ok: false, status: 0 }; }
}

module.exports = { configFromEnv, validEndpoint, register, unregister, revokeDriver, queue, queueTest, claim, settle, vapidToken, send };
