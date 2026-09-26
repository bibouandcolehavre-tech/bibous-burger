// Store reviewers only. This module has NO production database, disk, SMS,
// payment or push dependency. Every session owns a disposable in-memory store.
const crypto = require('node:crypto');
const { createAuthRateLimiter } = require('./auth-rate-limit');
const { validateAndPriceOrderItems } = require('./catalog');
const { validateRequestId, orderFingerprint } = require('./order-attempt');
const { promotionForCode, applyPromotion } = require('./promo-codes');
const { validateServiceSlot, qualifiesForAdvancePickup } = require('./availability');
const { createReservation } = require('./reservations');
const { claimReward } = require('./rewards');
const { grantLoyaltyForOrder } = require('./loyalty');
const { bibouPlusStatus, bibouPlusOrderPricing, activateBibouPlus } = require('./bibou-plus');
const { grantWelcomeReward, consumeWelcomeReward } = require('./welcome-reward');
const crm = require('./crm');

// Only a SHA-256 verifier is committed; the 192-bit random code is given to Play
// in its private app-access instructions, never embedded in the client bundle.
const ACCESS_HASH = '7807845e7c6f1a69d6c8a2d167117319e1b306dd9b1c20b6cc37db8967dad4c0';
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const boundedText = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function createReviewSandbox({ accessHash = ACCESS_HASH, now = Date.now, enabled = true, maxSessions = 30, ttlMs = 24 * 3600000 } = {}) {
  const sessions = new Map();
  const loginLimiter = createAuthRateLimiter({ limit: 30, windowMs: 15 * 60000, now });
  const requestLimiter = createAuthRateLimiter({ limit: 240, windowMs: 60000, now });
  const snapshot = value => structuredClone(value);
  function cleanup() {
    for (const [token, session] of sessions) if (session.expiresAt <= now()) sessions.delete(token);
  }
  const matches = code => typeof code === 'string' && code.length >= 24 && code.length <= 128 &&
    /^[0-9a-f]{64}$/.test(accessHash) && crypto.timingSafeEqual(crypto.createHash('sha256').update(code).digest(), Buffer.from(accessHash, 'hex'));
  return {
    // Unlike real /api routes, an unknown route NEVER falls through.
    async handle({ method, route, token = '', readBody }) {
      cleanup();
      if (!enabled) throw fail('Accès de vérification indisponible.', 404);
      if (method === 'POST' && route === '/session') {
        if (!loginLimiter.consume('review-login').allowed) throw fail('Trop de tentatives. Réessaie dans 15 minutes.', 429);
        const input = await readBody();
        if (!matches(input.accessCode)) throw fail('Code de vérification invalide.', 401);
        if (sessions.size >= maxSessions) throw fail('Toutes les sessions de test sont utilisées. Réessaie plus tard.', 429);
        const token = `review.${crypto.randomBytes(32).toString('base64url')}`;
        const customer = { id: `review-customer-${crypto.randomUUID()}`, name: 'Équipe de validation', phone: '+33600000000', address: '153 quai Georges V', postalCode: '76600', city: 'Le Havre', points: 1500, weeklyOrders: 0, weeklyProgramPoints: 0, referralCode: 'TEST-NON-UTILISABLE', reviewMode: true };
        grantWelcomeReward(customer, new Date(now()));
        const db = { customers: [customer], orders: [], reservations: [], rewardClaims: [], bibouPlusPurchases: [] };
        sessions.set(token, { expiresAt: now() + ttlMs, customer, db, requests: 0, pushPreferences: { service: false, marketing: false } });
        return { token, customer: snapshot(customer), reviewMode: true };
      }
      const session = sessions.get(token);
      if (!session) throw fail('Session de test expirée. Reconnecte-toi avec le code de vérification.', 401);
      if (!requestLimiter.consume(token).allowed) throw fail('Trop de requêtes de test.', 429);
      const { customer, db } = session;
      const date = new Date(now());
      if (route === '/auth/me' && method === 'GET') return { customer: snapshot(customer), reviewMode: true };
      if (route === '/health' && method === 'GET') return { ok: true, reviewMode: true, capabilities: { paymentRecovery: 1, promoCodes: 1 } };
      if (route === '/promotions/validate' && method === 'POST') {
        const promotion = promotionForCode((await readBody())?.code);
        if (!promotion) throw fail('Saisis un code promo.');
        return { promotion };
      }
      if (route === '/customer/account' && method === 'DELETE') { sessions.delete(token); return { deleted: true }; }
      if (route === '/customer/orders' && method === 'GET') return { orders: snapshot(db.orders) };
      if (route === '/customer/reservations' && method === 'GET') return { reservations: snapshot(db.reservations) };
      if (route === '/customer/rewards' && method === 'GET') return { claims: snapshot(db.rewardClaims) };
      if (route === '/customer/contest' && method === 'GET') return { contest: { status: 'inactive', title: 'Les ambassadeurs Bibou' }, participation: null };
      if (route === '/customer/crm' && ['GET', 'PATCH'].includes(method)) {
        if (method === 'PATCH') crm.updateCustomerPreferences(db, customer, await readBody(), now());
        return snapshot(crm.customerState(db, customer, now()));
      }
      if (route === '/customer/push' && ['GET', 'PATCH'].includes(method)) {
        if (method === 'PATCH') {
          const input = await readBody();
          for (const key of ['service', 'marketing']) if (typeof input[key] === 'boolean') session.pushPreferences[key] = input[key];
        }
        return { preferences: { ...session.pushPreferences }, devices: [], enabledPlatforms: [], reviewMode: true };
      }
      if (route === `/customers/${customer.id}` && method === 'PATCH') {
        const input = await readBody();
        // Never accept customer IDs, phone, points, privileges, or benefit flags.
        for (const key of ['name', 'address', 'postalCode', 'city']) if (typeof input[key] === 'string') customer[key] = boundedText(input[key]);
        return { customer: snapshot(customer) };
      }
      if (route === '/delivery-quote' && method === 'POST') return { distanceKm: 1, deliveryFee: 3.99, withinZone: true, reviewMode: true };
      const claimMatch = /^\/customer\/rewards\/([a-z0-9-]+)\/claim$/.exec(route);
      if (claimMatch && method === 'POST') {
        const claim = claimReward(db, customer, claimMatch[1], date);
        claim.code = `TEST-${claim.number}-NON-VALABLE`;
        return { claim: snapshot(claim), customer: snapshot(customer) };
      }
      if (route === '/reservations' && method === 'POST') {
        if (db.reservations.length >= 50) throw fail('Limite de réservations de test atteinte.', 429);
        const input = await readBody();
        const reservation = createReservation(db, { ...input, customerId: customer.id, phone: customer.phone }, date);
        reservation.id = `review-${reservation.id}`;
        reservation.status = 'confirmed'; // Simulated restaurant acknowledgement.
        reservation.reviewMode = true;
        return { reservation: snapshot(reservation) };
      }
      const attemptMatch = /^\/customer\/payment-attempts\/([^/]+)$/.exec(route);
      if (attemptMatch && method === 'GET') {
        const order = db.orders.find(item => item.requestId === attemptMatch[1]);
        const purchase = db.bibouPlusPurchases.find(item => item.requestId === attemptMatch[1]);
        if (!order && !purchase) throw fail('Tentative de test introuvable.', 404);
        return { kind: order ? 'order' : 'bibou-plus', record: snapshot(order || purchase) };
      }
      if (route === '/orders' && method === 'POST') {
        const input = await readBody();
        if (input.customerId !== customer.id) throw fail('Compte de test incorrect.', 403);
        const requestId = validateRequestId(input.requestId);
        if (!requestId) throw fail('Référence de test requise.');
        const fingerprint = orderFingerprint(input);
        const previous = db.orders.find(item => item.requestId === requestId);
        if (previous) {
          if (previous.requestFingerprint !== fingerprint) throw fail('Cette tentative correspond à une autre commande.', 409);
          return { order: snapshot(previous) };
        }
        if (db.orders.length >= 50) throw fail('Limite de commandes de test atteinte.', 429);
        if (!['delivery', 'pickup'].includes(input.method)) throw fail('Mode de commande invalide.');
        const slotError = validateServiceSlot(input.serviceDate, input.slot, date, input.method);
        if (slotError) throw fail(slotError);
        const priced = validateAndPriceOrderItems(input.items);
        const active = bibouPlusStatus(customer, date).active;
        const promotion = promotionForCode(input.promoCode);
        const welcome = !promotion && customer.welcomeReward?.status === 'available';
        const pricing = applyPromotion(bibouPlusOrderPricing({ subtotal: priced.subtotal, deliveryFee: input.method === 'delivery' ? 3.99 : 0, active, discountRate: welcome ? .1 : active ? .05 : 0 }), promotion);
        const number = db.orders.length + 1;
        const order = { ...pricing, id: `review-order-${number}`, number: `TEST-${number}`, customerId: customer.id, customerName: customer.name, items: priced.items, requestId, requestFingerprint: fingerprint, method: input.method, serviceDate: input.serviceDate, slot: input.slot, comment: boundedText(input.comment, 500), createdAt: date.toISOString(), status: 'awaiting_payment', reviewMode: true, bibouPlusApplied: active, welcomeRewardApplied: welcome, loyaltyBasePoints: priced.items.reduce((sum, item) => sum + ((item.productId.endsWith('-menu') || item.productId === 'taurus') ? 15 : ['atlas','classique','duck','dynamite','hambagu','basilic','montagnes','gros-lard','pork'].includes(item.productId) ? 10 : 0) * item.quantity, 0) };
        order.pickupAdvanceBonusApplied = qualifiesForAdvancePickup(order);
        if (promotion) { order.promotion = promotion; order.discountLabel = `Code promo ${promotion.code}`; }
        db.orders.unshift(order);
        return { order: snapshot(order) };
      }
      if (route === '/payments/sumup-checkout' && method === 'POST') {
        const input = await readBody();
        const order = db.orders.find(item => item.id === input.orderId);
        if (!order) throw fail('Commande de test introuvable.', 404);
        order.payment = { status: 'PAID', provider: 'isolated-review-simulation' };
        order.status = 'confirmed';
        if (!order.promotion) grantLoyaltyForOrder(customer, order, date, { bibouPlus: order.bibouPlusApplied });
        consumeWelcomeReward(customer, order, date);
        return { order: snapshot(order), reviewMode: true };
      }
      if (route === '/bibou-plus/checkout' && method === 'POST') {
        const input = await readBody();
        const requestId = validateRequestId(input.requestId);
        if (!requestId) throw fail('Référence de test requise.');
        let purchase = db.bibouPlusPurchases.find(item => item.requestId === requestId);
        if (!purchase) {
          if (db.bibouPlusPurchases.length >= 50) throw fail('Limite des achats de test atteinte.', 429);
          purchase = { id: `review-plus-${db.bibouPlusPurchases.length + 1}`, customerId: customer.id, requestId, amount: 9.99, createdAt: date.toISOString(), payment: { status: 'PAID', provider: 'isolated-review-simulation' }, reviewMode: true };
          db.bibouPlusPurchases.push(purchase);
          activateBibouPlus(customer, purchase, date);
        }
        return { purchase: snapshot(purchase), customer: snapshot(customer) };
      }
      throw fail('Cette action n’est pas disponible dans l’espace de test isolé.', 404);
    },
  };
}
module.exports = { createReviewSandbox };
