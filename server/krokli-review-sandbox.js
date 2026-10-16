'use strict';
// The store reviewer never receives a normal driver token or a production DB.
// Each login owns an in-memory fixture. Nothing here calls a payment/push API.
const crypto = require('node:crypto');
const drivers = require('./krokly-drivers');
const account = require('./krokli-driver-account');
const settlements = require('./driver-settlements');
const dispatch = require('./krokli-auto-dispatch');
const nativePush = require('./krokli-native-push');
const { createGpsPilot } = require('./krokli-gps-pilot');
const { parisDateKey } = require('./availability');

const USERNAME = 'store-review-krokli';
const PREFIX = 'krokli-review.';
const SESSION_MS = 12 * 3600000;
const MAX_SESSIONS = 20;
const fail = (message, statusCode = 400) => { throw Object.assign(Error(message), { statusCode }); };
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function same(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function fixture(now, expiresAt) {
  const driver = { id: `review-${crypto.randomUUID()}`, username: USERNAME,
    name: 'Validation boutiques — exemples', active: true, authVersion: 1, reviewMode: true };
  const db = { kroklyDrivers: [driver], orders: [], customers: [], driverTipPayments: [], driverFeedback: [] };
  const make = (number, completed = false, covered = false) => {
    const id = `review-order-${crypto.randomUUID()}`, customerId = `review-customer-${number}`;
    db.customers.push({ id: customerId, firstName: number === 9001 ? 'Camille' : 'Alex' });
    const order = { id, number, customerId, customerName: 'Client exemple',
      // Public landmark; no real customer's address or callable phone number.
      deliveryAddress: { address: 'Gare du Havre, 12 rue Magellan', postalCode: '76600', city: 'Le Havre' },
      comment: 'Course de vérification : aucun repas à récupérer ni à remettre.',
      method: 'delivery', serviceDate: parisDateKey(new Date(now)), slot: '12:00',
      distanceKm: 1.2, standardDeliveryFee: 3.99, deliveryFee: covered ? 0 : 3.99,
      bibouPlusApplied: covered, status: completed ? 'delivered' : 'ready', payment: { status: 'PAID' },
      createdAt: new Date(now).toISOString(), items: [] };
    order.kroklyDriver = { driverId: driver.id, status: completed ? 'delivered' : 'offered',
      financials: account.quote(order), offeredAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(), expiresAt: new Date(expiresAt).toISOString() };
    if (completed) {
      order.kroklyDriver.deliveredAt = new Date(now).toISOString();
      account.recordCompletion(order);
    }
    db.orders.push(order);
    return order;
  };
  make(9001, true); make(9002, true, true); make(9003);
  db.driverFeedback.push({ orderId: db.orders[0].id, customerId: db.orders[0].customerId, driverId: driver.id, stars: 5 });
  // Explicitly sample-only: this ledger is never sent to any provider/DB worker.
  db.driverTipPayments.push({ orderId: db.orders[0].id, driverId: driver.id, state: 'PAID',
    providerVerified: true, providerTransactionId: `sample-${crypto.randomUUID()}`, amountCents: 200,
    paidAt: new Date(now).toISOString() });
  return { db, driver };
}

function createReviewSandbox({ passwordHash = '', clock = Date.now } = {}) {
  const sessions = new Map(), installationOwners = new Map();
  const enabled = /^[a-f0-9]{64}$/.test(passwordHash);
  const isLogin = input => String(input?.username || '').trim().toLowerCase() === USERNAME;
  const isToken = token => typeof token === 'string' && token.startsWith(PREFIX);
  function sweep() {
    const now = clock();
    for (const [token, s] of sessions) if (s.expiresAt <= now) { s.gps.close(); sessions.delete(token); }
    for (const [id, owner] of installationOwners) if (owner.until <= now) installationOwners.delete(id);
  }
  function login(input) {
    sweep();
    const valid = typeof input?.password === 'string' && input.password.length <= 128 &&
      same(digest(input.password.trim()), enabled ? passwordHash : '0'.repeat(64));
    if (!enabled || !isLogin(input) || !valid) fail('Identifiant ou mot de passe incorrect.', 401);
    // Refuse capacity overflow: never invalidate another reviewer's active login.
    if (sessions.size >= MAX_SESSIONS) fail('Trop de sessions de vérification. Réessayez plus tard.', 429);
    const now = clock(), expiresAt = now + SESSION_MS, token = PREFIX + crypto.randomBytes(32).toString('base64url');
    const s = { ...fixture(now, expiresAt), expiresAt, key: crypto.randomBytes(32).toString('hex'), gps: createGpsPilot({ clock }) };
    sessions.set(token, s);
    return { token, driver: { id: s.driver.id, name: s.driver.name, username: USERNAME, reviewMode: true } };
  }
  function session(token) {
    sweep();
    const s = sessions.get(token);
    if (!isToken(token) || !s) fail('Session de vérification expirée. Reconnectez-vous pour réinitialiser les exemples.', 401);
    return s;
  }
  function view(s) {
    return { driver: { id: s.driver.id, name: s.driver.name, username: USERNAME, reviewMode: true },
      reviewMode: true, availability: dispatch.availabilityView(s.driver, clock()),
      orders: drivers.assigned(s.db, s.driver.id), push: { enabled: false, devices: 0 } };
  }
  // An explicit review marker only REDUCES access: it routes even a forgotten
  // installation to an empty fixture after restart, never to the real DB.
  function ownsCleanup(input) { sweep(); return input?.reviewMode === true || installationOwners.has(input?.installationId); }
  function cleanup(input) {
    sweep();
    const owner = installationOwners.get(input?.installationId);
    if (!owner && input?.reviewMode === true) return nativePush.unregister({}, input);
    if (!owner || typeof input?.installationSecret !== 'string' || !same(owner.proof, digest(input.installationSecret))) fail('Preuve de ce téléphone requise.', 403);
    // Keep the tombstone so a repeated/expired logout never falls through to DB.
    for (const s of sessions.values()) nativePush.unregister(s.db, input);
    return { removed: true };
  }
  async function handle(token, pathname, method, input = {}, query = new URLSearchParams()) {
    const s = session(token), date = new Date(clock());
    if (pathname === '/api/krokly-driver/state' && method === 'GET') return { status: 200, data: view(s) };
    if (pathname === '/api/krokly-driver/availability' && method === 'POST')
      return { status: 200, data: { availability: dispatch.setAvailability(s.db, s.driver, input, s.expiresAt, clock()) } };
    if (['/api/krokly-driver/account', '/api/krokly-driver/statement'].includes(pathname) && method === 'GET') {
      if ([...query.keys()].some(k => !['week', 'offset', 'limit'].includes(k))) fail('Paramètres de compte invalides.');
      const week = query.get('week') || undefined;
      if (pathname.endsWith('/statement')) {
        const report = account.statement(s.db, s.driver, week, date);
        const pdf = await require('./pdf/driver-statement').renderStatement(report, { example: true, now: date });
        return { status: 200, pdf, filename: `krokli-exemple-${report.week.startDate}.pdf` };
      }
      return { status: 200, data: account.account(s.db, s.driver, { week, offset: Number(query.get('offset') || 0), limit: Number(query.get('limit') || 50), tipsEnabled: true }, date) };
    }
    if (pathname === '/api/krokly-driver/settlements' && method === 'GET') return { status: 200, data: settlements.state(s.db, s.driver, s.key) };
    if (pathname === '/api/krokly-driver/bank' && method === 'POST') {
      // Do not retain a reviewer's real financial details. Only the documented
      // standard example is allowed, in RAM encrypted with a per-session key.
      if (String(input?.iban || '').replace(/\s/g, '') !== 'FR1420041010050500013M02606' || input?.holder !== 'Compte exemple')
        fail('Vérification boutiques : utilisez uniquement le RIB exemple indiqué dans les instructions.');
      return { status: 200, data: settlements.saveBank(s.db, s.driver, input, s.key, date) };
    }
    if (pathname === '/api/krokly-driver/payment-requests' && method === 'POST') {
      if (input?.confirm !== true || Object.keys(input).some(k => k !== 'confirm')) fail('Confirme la demande des gains disponibles.');
      return { status: 201, data: settlements.request(s.db, s.driver, s.key, {}, date) };
    }
    if (pathname === '/api/krokly-driver/native-push/register' && method === 'POST') {
      const existing = installationOwners.get(input?.installationId);
      if (existing && !same(existing.proof, digest(String(input?.installationSecret || '')))) fail('Preuve de ce téléphone requise.', 403);
      const result = nativePush.register(s.db, s.driver, input, s.expiresAt, clock());
      installationOwners.set(input.installationId, { proof: digest(input.installationSecret), until: s.expiresAt + SESSION_MS });
      // No job is ever queued: no real alerts to reviewers or customers.
      return { status: 200, data: result };
    }
    if (pathname === '/api/krokly-driver/native-push/unregister' && method === 'POST')
      return { status: 200, data: ownsCleanup(input) ? cleanup(input) : nativePush.unregister(s.db, input) };
    const gpsAction = /^\/api\/krokly-driver\/gps\/(start|position|stop)$/.exec(pathname);
    if (gpsAction && method === 'POST') {
      const data = gpsAction[1] === 'start' ? s.gps.start(s.db, s.driver, input) : gpsAction[1] === 'stop' ? s.gps.stop(s.db, s.driver.id, input) : s.gps.update(s.db, s.driver.id, input);
      return { status: 200, data };
    }
    const action = /^\/api\/krokly-driver\/orders\/([^/]+)\/(accept|decline|pickup|deliver)$/.exec(pathname);
    if (action && method === 'POST') {
      drivers.transition(s.db, decodeURIComponent(action[1]), s.driver.id, action[2], clock());
      return { status: 200, data: view(s) };
    }
    // Reserved tokens fail closed for every unknown/manager/production route.
    fail('Action indisponible dans cet accès de vérification isolé.', 403);
  }
  const timer = setInterval(sweep, 60000); timer.unref();
  return { isLogin, isToken, login, handle, ownsCleanup, cleanup,
    close() { clearInterval(timer); for (const s of sessions.values()) s.gps.close(); sessions.clear(); installationOwners.clear(); } };
}
module.exports = { createReviewSandbox, USERNAME, PREFIX, SESSION_MS };
