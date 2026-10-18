'use strict';
// Owner-only field exercise. One RAM-only fixture shared by two scoped logins.
// No production DB/disk, printer, SMS, notification worker or payment provider.
const crypto = require('node:crypto');
const { createGpsPilot } = require('./krokli-gps-pilot');
const { createAuthRateLimiter } = require('./auth-rate-limit');
const { parisDateKey } = require('./availability');
const feedback = require('./driver-feedback');
const tips = require('./driver-tips');

const USERNAME = 'essai-prive-krokli';
const DRIVER_PREFIX = 'krokli-field.';
const CUSTOMER_PREFIX = 'review.field.';
const SESSION_MS = 4 * 3600000;
// Public street corners and a publicly listed landmark near the destination.
// Never commit the owner's home address or any real customer's coordinates.
const STOPS = Object.freeze([
  { label: 'A', address: 'Rue Jean Baptiste Eyriès, angle rue Casimir Delavigne', postalCode: '76600', city: 'Le Havre' },
  { label: 'B', address: 'Rue Casimir Delavigne, angle rue de Tourville', postalCode: '76600', city: 'Le Havre' },
  { label: 'C', address: "Résidence Le Blason, 9 rue Dumé d’Aplemont", postalCode: '76600', city: 'Le Havre' },
]);
const fail = (message, statusCode = 400) => { throw Object.assign(Error(message), { statusCode }); };
const clone = value => structuredClone(value);
const digest = value => crypto.createHash('sha256').update(value).digest();
const isDriverToken = token => typeof token === 'string' && token.startsWith(DRIVER_PREFIX);
const isCustomerToken = token => typeof token === 'string' && token.startsWith(CUSTOMER_PREFIX);
const isLogin = input => String(input?.username || '').trim().toLowerCase() === USERNAME;
const isCustomerCode = value => typeof value === 'string' && value.trim().startsWith('essai-');

function createFieldTest({ enabled = false, accessHash = '', expiresAt = '', clock = Date.now } = {}) {
  const deadline = Date.parse(expiresAt), sessions = new Map();
  const limiter = createAuthRateLimiter({ limit: 30, windowMs: 15 * 60000, now: clock });
  const requests = createAuthRateLimiter({ limit: 300, windowMs: 60000, now: clock });
  let exercise = null;
  const configured = enabled === true && /^[a-f0-9]{64}$/.test(accessHash) && Number.isSafeInteger(deadline);
  function sweep() {
    if (exercise && (exercise.expiresAt <= clock() || deadline <= clock())) {
      exercise.gps.close(); exercise = null; sessions.clear();
    }
    for (const [token, s] of sessions) if (s.expiresAt <= clock()) sessions.delete(token);
  }
  function fixture() {
    const now = clock(), until = Math.min(now + SESSION_MS, deadline);
    const customer = { id: `field-customer-${crypto.randomUUID()}`, name: 'TEST — courses A / B / C', firstName: 'TEST', lastName: 'Livraison',
      phone: '+33600000000', address: '153 Quai George V', postalCode: '76600', city: 'Le Havre', points: 0, weeklyOrders: 0, reviewMode: true, fieldTest: true };
    const driver = { id: `field-driver-${crypto.randomUUID()}`, username: USERNAME, name: 'TEST GPS — aucun repas ni gain réel', active: true, authVersion: 1 };
    const db = { customers: [customer], kroklyDrivers: [driver], driverFeedback: [], driverTipPayments: [], orders: STOPS.map((stop, i) => ({
      id: `field-order-${crypto.randomUUID()}`, number: 99001 + i, fieldLabel: stop.label,
      customerId: customer.id, customerName: `TEST ${stop.label} — ne rien préparer`, customerPhone: '',
      deliveryAddress: { address: stop.address, postalCode: stop.postalCode, city: stop.city },
      comment: `ESSAI PRIVÉ ${stop.label} · Aucun repas, client, paiement ou gain réel. Arrêt sur la voie publique uniquement si cela est sûr.`,
      method: 'delivery', serviceDate: parisDateKey(new Date(now)), slot: 'TEST', status: 'ready',
      items: [{ productId: 'classique', name: `TEST ${stop.label} — burger fictif, ne pas préparer`, quantity: 1, unitPrice: 0, total: 0, options: [] }],
      subtotal: 0, discount: 0, deliveryFee: 0, total: 0, reviewMode: true, testMode: true, fieldTest: true,
      payment: { status: 'PAID', provider: 'isolated-field-simulation', paidAt: new Date(now).toISOString() },
      createdAt: new Date(now + i).toISOString(),
      kroklyDriver: { driverId: driver.id, status: 'offered', offeredAt: new Date(now).toISOString(), expiresAt: new Date(until).toISOString() },
    })) };
    return { customer, driver, db, expiresAt: until, available: false, revision: 0, gps: createGpsPilot({ clock }) };
  }
  function login(role, code) {
    sweep();
    if (!limiter.consume('field-login').allowed) fail('Trop de tentatives. Réessaie dans 15 minutes.', 429);
    const valid = typeof code === 'string' && /^essai-[A-Za-z0-9_-]{32}$/.test(code.trim()) &&
      crypto.timingSafeEqual(digest(code.trim()), Buffer.from(configured ? accessHash : '0'.repeat(64), 'hex'));
    if (!configured || deadline <= clock() || !valid) fail('Accès de test incorrect, arrêté ou expiré.', 401);
    if (sessions.size >= 20) fail('Trop de connexions de test. Réessaie plus tard.', 429);
    exercise ||= fixture();
    const prefix = role === 'driver' ? DRIVER_PREFIX : CUSTOMER_PREFIX;
    const token = prefix + crypto.randomBytes(32).toString('base64url');
    sessions.set(token, { role, expiresAt: exercise.expiresAt });
    return role === 'driver' ? { token, driver: clone(exercise.driver), fieldTest: true }
      : { token, customer: clone(exercise.customer), reviewMode: true, fieldTest: true };
  }
  function session(token, role) {
    sweep();
    const s = sessions.get(token);
    if (!s || s.role !== role || !exercise) fail('Session d’essai expirée. Reconnecte-toi avec ton accès de test.', 401);
    if (!requests.consume(token).allowed) fail('Trop de requêtes de test.', 429);
    return exercise;
  }
  function active(s) { return s.db.orders.find(o => !['delivered', 'cancelled'].includes(o.status)); }
  function driverView(s) {
    const order = active(s), stage = order?.kroklyDriver.status;
    return { driver: clone(s.driver), fieldTest: true,
      availability: { available: s.available, revision: s.revision, expiresAt: s.available ? new Date(s.expiresAt).toISOString() : null },
      orders: order ? [{ id: order.id, number: order.number, status: stage, restaurant: "Bibou’s Burgers — TEST", pickupAddress: '153 Quai George V, 76600 Le Havre',
        distanceKm: null, courierPay: 0, orderTotal: 0, slot: `TEST ${order.fieldLabel}`, serviceDate: order.serviceDate,
        expiresAt: new Date(s.expiresAt).toISOString(), deliveryCity: 'Le Havre', fieldTest: true,
        ...(['accepted', 'picked_up'].includes(stage) ? { customerName: order.customerName, customerPhone: '', deliveryAddress: clone(order.deliveryAddress), comment: order.comment } : {}) }] : [],
      push: { enabled: false, devices: 0 } };
  }
  async function handleDriver(token, pathname, method, input = {}) {
    const s = session(token, 'driver');
    if (pathname === '/api/krokly-driver/state' && method === 'GET') return driverView(s);
    if (pathname === '/api/krokly-driver/availability' && method === 'POST') {
      if (!input || typeof input.available !== 'boolean' || Object.keys(input).some(k => !['available', 'revision'].includes(k)) ||
        input.available && input.revision !== s.revision) fail('Disponibilité de test à actualiser.', 409);
      s.available = input.available; s.revision++;
      // Going offline closes GPS even if a separate stop request was lost.
      if (!s.available) { s.gps.close(); s.gps = createGpsPilot({ clock }); }
      return { availability: driverView(s).availability, fieldTest: true };
    }
    const gpsAction = /^\/api\/krokly-driver\/gps\/(start|position|stop)$/.exec(pathname);
    if (gpsAction && method === 'POST') {
      const result = gpsAction[1] === 'start' ? s.gps.start(s.db, s.driver, input)
        : gpsAction[1] === 'stop' ? s.gps.stop(s.db, s.driver.id, input) : s.gps.update(s.db, s.driver.id, input);
      return { ...result, fieldTest: true };
    }
    if (pathname === '/api/krokly-driver/native-push/unregister' && method === 'POST') return { removed: true, fieldTest: true };
    if (pathname === '/api/krokly-driver/native-push/register' && method === 'POST')
      fail('Essai GPS uniquement : aucune alerte distante envoyée. Consulte les courses dans l’application.', 403);
    const match = /^\/api\/krokly-driver\/orders\/([^/]+)\/(accept|decline|pickup|deliver)$/.exec(pathname);
    if (match && method === 'POST') {
      const order = active(s);
      if (!order || order.id !== match[1]) fail('Effectue les courses de test dans l’ordre A, B, C.', 409);
      const action = match[2], stage = order.kroklyDriver.status;
      const next = { offered: { accept: 'accepted', decline: 'declined' }, accepted: { pickup: 'picked_up' }, picked_up: { deliver: 'delivered' } }[stage]?.[action];
      if (!next) fail('Cette étape de test n’est pas disponible.', 409);
      order.kroklyDriver.status = next; order.updatedAt = new Date(clock()).toISOString();
      if (action === 'decline') order.status = 'cancelled';
      if (action === 'pickup') { order.status = 'out_for_delivery'; order.kroklyDriver.pickedUpAt = order.updatedAt; }
      if (action === 'deliver') { order.status = 'delivered'; order.kroklyDriver.deliveredAt = order.updatedAt; }
      // No completion ledger, kitchen state, customer push or payout job.
      return driverView(s);
    }
    fail('Essai privé : seuls les courses et le GPS sont disponibles. Aucun règlement réel.', 403);
  }
  // Narrow eligibility adapters exist ONLY within this isolated RAM fixture.
  const shadow = order => ({ ...order, reviewMode: false, testMode: false });
  async function handleCustomer(token, route, method, readBody) {
    const s = session(token, 'customer'), { db, customer } = s;
    if (route === '/auth/me' && method === 'GET') return { customer: clone(customer), reviewMode: true, fieldTest: true };
    if (route === '/customer/orders' && method === 'GET') return { orders: clone(db.orders), reviewMode: true, fieldTest: true };
    if (route === '/health' && method === 'GET') return { ok: true, reviewMode: true, fieldTest: true, capabilities: {} };
    if (route === '/catalog' && method === 'GET') return { products: [], reviewMode: true, fieldTest: true };
    if (['/customer/reservations', '/customer/rewards'].includes(route) && method === 'GET')
      return route.endsWith('reservations') ? { reservations: [] } : { claims: [] };
    if (route === '/field/stop' && method === 'POST') {
      s.gps.close(); exercise = null; sessions.clear(); return { stopped: true, fieldTest: true };
    }
    const match = /^\/customer\/orders\/([^/]+)\/(delivery-tracking|delivery-feedback|tip)$/.exec(route);
    if (!match) fail('Essai de livraison uniquement : achats, SMS et commandes réelles sont bloqués.', 403);
    const order = db.orders.find(o => o.id === match[1] && o.customerId === customer.id);
    if (!order) fail('Commande de test introuvable.', 404);
    const pretend = shadow(order), date = new Date(clock());
    const tipView = () => ({ ...tips.view(tips.forOrder(db, pretend), feedback.eligible(pretend)), reviewMode: true, fieldTest: true, simulated: true });
    if (match[2] === 'delivery-tracking' && method === 'GET') {
      // No fabricated path. Only a fresh phone GPS fix, with explicit consent,
      // for the one current course. Before pickup/after delivery: no location.
      const gpsDb = { ...db, orders: db.orders.map(shadow) };
      return { protocol: 'bibou-customer-delivery-v1', status: order.status, fieldTest: true,
        timing: { available: false, reason: 'journey-update-needed' }, position: s.gps.customerLocation(gpsDb, pretend) };
    }
    if (match[2] === 'delivery-feedback' && ['GET', 'POST'].includes(method)) {
      const result = method === 'POST' ? feedback.save(db, pretend, await readBody(), date) : feedback.view(db, pretend);
      return { ...clone(result), tips: tipView(), reviewMode: true, fieldTest: true };
    }
    if (match[2] === 'tip' && ['GET', 'POST'].includes(method)) {
      if (method === 'POST') {
        const tip = tips.create(db, pretend, await readBody(), date);
        tip.state = 'PAID'; tip.paidAt = date.toISOString(); tip.reviewMode = true; tip.fieldTest = true;
        // providerVerified stays FALSE; no checkout, card or credited earnings.
      }
      return tipView();
    }
    fail('Action de test indisponible.', 405);
  }
  const timer = setInterval(sweep, 5000); timer.unref();
  return { isLogin, isCustomerCode, isDriverToken, isCustomerToken,
    loginDriver(input) { if (!isLogin(input)) fail('Accès de test incorrect.', 401); return login('driver', input.password); },
    loginCustomer(input) { return login('customer', input?.accessCode); }, handleDriver, handleCustomer,
    close() { clearInterval(timer); exercise?.gps.close(); exercise = null; sessions.clear(); } };
}
module.exports = { createFieldTest, USERNAME, DRIVER_PREFIX, CUSTOMER_PREFIX, SESSION_MS, STOPS };
