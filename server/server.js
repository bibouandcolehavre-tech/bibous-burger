const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { createDatabaseLock } = require("./database-lock");
const { createReviewSandbox } = require('./review-sandbox');
const { createRegistrationStore } = require('./customer-registration');
const { validateIdentity, hasCompleteIdentity, normalizeName } = require('../customer-identity');
const { validateRequestId, orderFingerprint } = require("./order-attempt");
const { promotionForCode, applyPromotion, settlePromotionalOrder } = require('./promo-codes');
const { createBackupStore } = require("./backups");
const { listDashboardCustomers, dashboardCustomerDetail } = require("./dashboard-customers");
const { dashboardNews, publicNews, saveNews } = require('./news');
const { dashboardContest, saveContestDraft, publicContest, customerContest, joinContest, purgeExpiredContestEntries } = require('./referral-contest');
const { applyVerifiedCheckout, assertOrderTransition, paymentError } = require("./sumup-payment");
const { anonymizeCustomerAccount } = require("./account-deletion");
const push = require('./push-notifications');
const crm = require('./crm');
const { BIBOU_PLUS_DISCOUNT_RATE, BIBOU_PLUS_PRICE, activateBibouPlus, bibouPlusOrderPricing, bibouPlusStatus, ensureBibouPlusStore } = require("./bibou-plus");
const { availabilityCatalog, assertStoredOrderAvailable, validateAndPriceOrderItems } = require("./catalog");
const { createProductStockStore } = require("./product-stock");
const { createCustomerSession, readCustomerSession } = require("./customer-session");
const { createSmsAttemptLimiter } = require("./sms-rate-limit");
const { createAuthRateLimiter } = require("./auth-rate-limit");
const { BURGER_POINTS, MENU_POINTS, ensureCurrentLoyaltyWeek, grantLoyaltyForOrder, revokeLoyaltyForOrder } = require("./loyalty");
const { applyReferralCode, ensureAllReferralCodes, ensureReferralCode, grantReferralReward, revokeReferralReward } = require("./referrals");
const { PENDING_RESERVATION_MS, SLOT_CAPACITY, availabilityForDate, remainingDeliveryPlaces, validateServiceDate, validateServiceSlot, qualifiesForAdvancePickup, serviceClosureReason, slotsForDate } = require("./availability");
const { RESERVATION_SLOT_CAPACITY, createReservation, ensureReservationStore, reservationAvailabilityForDate, reservationsForCustomer, updateReservationStatus } = require("./reservations");
const { claimReward, ensureRewardStore, rewardClaimsForCustomer, updateRewardClaimStatus } = require("./rewards");
const { WELCOME_DISCOUNT_RATE, consumeWelcomeReward, grantWelcomeReward, restoreWelcomeReward, welcomeRewardAvailable } = require("./welcome-reward");
const { applySupportCredits } = require("./support-credits");
const serviceSchedule = require("./service-schedule");
const amendments = require("./order-amendments");
const uber = require("./uber-direct");
const keyyo = require('./keyyo-call-sms');
const { amendmentCatalog } = require("./catalog");
const { revenuePeriods } = require("./revenue-periods");
const { removeAuthorizedOwnerTestAccounts } = require("./owner-test-account-cleanup");

const envPath = path.join(process.cwd(), ".env");
if (fsSync.existsSync(envPath)) {
  fsSync.readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf("=");
    if (separator > 0 && !line.trim().startsWith("#")) {
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (key && value && !process.env[key]) process.env[key] = value;
    }
  });
}

const port = Number(process.env.PORT || 3001);
const pushConfig = push.configFromEnv(process.env);
const uberConfig = uber.configFromEnv(process.env);
const uberClient = uber.createClient(uberConfig);
const databasePath = process.env.DATA_FILE_PATH || path.join(__dirname, "data.json");
const keyyoConfig = keyyo.configFromEnv(process.env);
const keyyoSms = keyyo.createCallSms({ config: keyyoConfig, file: path.join(path.dirname(databasePath), 'keyyo-call-sms.json') });
const productStockStore = createProductStockStore(path.join(path.dirname(databasePath), "product-stock.json"));
const allowedStatuses = ["confirmed", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"];
const sumupApiKey = process.env.SUMUP_API_KEY;
const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE;
const sumupReturnUrl = process.env.SUMUP_RETURN_URL;
const sumupRedirectUrl = process.env.SUMUP_REDIRECT_URL;
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const restaurantDashboardPassword = process.env.RESTAURANT_DASHBOARD_PASSWORD;
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
const configuredCustomerSessionSecret = process.env.SESSION_SECRET;
const customerSessionSecret = configuredCustomerSessionSecret || crypto.randomBytes(32).toString("base64url");
const googlePlaceId = process.env.GOOGLE_PLACE_ID || "ChIJY7WCDKSOcUgRyRRQzkp0rLs";
const googlePlaceSearchQuery = "Bibou's Burgers, 153 Quai Georges V, 76600 Le Havre, France";
const restaurantAddress = "153 Quai Georges V, 76600 Le Havre, France";
const menuProductIds = new Set(["taurus", "montagnes-menu", "atlas-menu", "classique-menu", "duck-menu", "dynamite-menu", "gros-lard-menu", "hambagu-menu", "basilic-menu", "pork-menu"]);
const burgerProductIds = new Set(["atlas", "classique", "duck", "dynamite", "hambagu", "basilic", "montagnes", "gros-lard", "pork"]);
const smsAttemptLimiter = createSmsAttemptLimiter();
const registrations = createRegistrationStore();
const dashboardLoginLimiter = createAuthRateLimiter();
const smsCodeLimiter = createAuthRateLimiter({ limit: 8, windowMs: 15 * 60000 });
const dashboardSessions = new Map();
const reviewSandbox = createReviewSandbox({ enabled: process.env.STORE_REVIEW_ENABLED !== 'false' });
const acquireDatabase = createDatabaseLock();
let googleReviewsCache = { value: null, expiresAt: 0 };
let orderCreationQueue = Promise.resolve();

const serializeOrderCreation = async (task) => {
  const previousTask = orderCreationQueue;
  let release;
  orderCreationQueue = new Promise((resolve) => { release = resolve; });
  await previousTask;
  try { return await task(); } finally { release(); }
};

const fetchGooglePlaceDetails = (placeId) => fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=fr`, {
  signal: AbortSignal.timeout(10000),
  headers: { "X-Goog-Api-Key": googleMapsApiKey, "X-Goog-FieldMask": "displayName,rating,userRatingCount,reviews" }
});

const findGooglePlaceId = async () => {
  const searchResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleMapsApiKey, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({ textQuery: googlePlaceSearchQuery })
  });
  if (!searchResponse.ok) return null;
  const result = await searchResponse.json();
  return result.places?.[0]?.id || null;
};

const ensureDatabase = async () => {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  try { await fs.access(databasePath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Never ship or copy a developer's customers into a new deployment.
    await fs.writeFile(databasePath, JSON.stringify({ customers: [], orders: [], reservations: [], nextCustomerId: 1, nextOrderNumber: 1 }), { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  }
};
const readDatabase = async () => { await ensureDatabase(); return JSON.parse(await fs.readFile(databasePath, "utf8")); };
const writeDatabase = async (database) => {
  await ensureDatabase();
  const temporary = `${databasePath}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, databasePath);
  } finally { await fs.unlink(temporary).catch(() => {}); }
};
const backupStore = createBackupStore({
  directory: path.join(path.dirname(databasePath), "backups"),
  capture: async () => {
    const release = await acquireDatabase();
    try {
      // Read existing data only: a missing file must not silently restore seed data.
      const database = JSON.parse(await fs.readFile(databasePath, "utf8"));
      const stock = await productStockStore.read();
      return { database, stock, keyyoCallSms: await keyyoSms.backupState() };
    } finally { release(); }
  }
});
const send = (response, status, payload) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
  response.end(JSON.stringify(payload));
};

const requestBodies = new WeakMap();
const rawRequestBodies = new WeakMap();
const readBody = (request) => {
  if (requestBodies.has(request)) return requestBodies.get(request);
  const result = new Promise((resolve, reject) => {
    let body = "";
    const chunks = [];
    let failed = false;
    const fail = (error) => { failed = true; body = ""; clearTimeout(timeout); reject(error); };
    const timeout = setTimeout(() => fail(Object.assign(new Error("Requête trop lente."), { statusCode: 408 })), 10000);
    request.on("data", (chunk) => {
      if (failed) return;
      chunks.push(Buffer.from(chunk));
      body += chunk;
      if (body.length > 1_000_000) fail(Object.assign(new Error("Requête trop volumineuse."), { statusCode: 413 }));
    });
    request.on("end", () => {
      clearTimeout(timeout);
      if (failed) return;
      const raw = Buffer.concat(chunks); rawRequestBodies.set(request, raw);
      try { resolve(raw.length ? JSON.parse(raw.toString("utf8")) : {}); } catch { reject(new Error("Invalid JSON")); }
    });
    request.on("error", fail);
    request.on("aborted", () => fail(new Error("Request aborted")));
  });
  requestBodies.set(request, result);
  return result;
};

const deliveryFeeForDistance = (distanceKm) => {
  if (distanceKm <= 1.5) return 3.99;
  if (distanceKm <= 3) return 4.99;
  if (distanceKm <= 5) return 5.99;
  return null;
};

const calculateDeliveryQuote = async ({ address, postalCode, city }) => {
  if (!googleMapsApiKey) throw new Error("Le calcul automatique de livraison n’est pas encore disponible.");
  const destination = `${String(address || "").trim()}, ${String(postalCode || "").trim()} ${String(city || "").trim()}, France`;
  const routeResponse = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleMapsApiKey,
      "X-Goog-FieldMask": "routes.distanceMeters"
    },
    body: JSON.stringify({
      origin: { address: restaurantAddress },
      destination: { address: destination },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      languageCode: "fr-FR",
      units: "METRIC"
    })
  });
  if (!routeResponse.ok) {
    const routeError = await routeResponse.json().catch(() => null);
    console.error("Google Routes request failed", routeResponse.status, routeError?.error?.status || "unknown");
    throw new Error("Cette adresse n’a pas pu être localisée.");
  }
  const route = (await routeResponse.json()).routes?.[0];
  const distanceKm = Number(route?.distanceMeters ?? 0) / 1000;
  if (!Number.isFinite(distanceKm)) throw new Error("Cette adresse n’a pas pu être localisée.");
  const roundedDistanceKm = Math.round(distanceKm * 100) / 100;
  return { distanceKm: roundedDistanceKm, deliveryFee: deliveryFeeForDistance(distanceKm) };
};

const normalizeFrenchPhone = (value) => {
  const compact = String(value || "").replace(/[\s.-]/g, "");
  if (/^0[67]\d{8}$/.test(compact)) return `+33${compact.slice(1)}`;
  if (/^\+33[67]\d{8}$/.test(compact)) return compact;
  return null;
};
const twilioConfigured = () => Boolean(twilioAccountSid && twilioAuthToken && twilioVerifyServiceSid);
const createSession = (customerId) => createCustomerSession(customerId, customerSessionSecret);
const authenticatedCustomer = (request, database) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const session = readCustomerSession(token, customerSessionSecret);
  if (!session) return null;
  return database.customers.find((customer) => customer.id === session.customerId) || null;
};
const authenticatedDashboard = (request) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const session = token && dashboardSessions.get(token);
  return Boolean(session && session.expiresAt > Date.now());
};
const passwordsMatch = (candidate, expected) => {
  const candidateBuffer = Buffer.from(String(candidate || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
};
const verifyWithTwilio = async (path, input) => {
  const body = new URLSearchParams(input);
  const credentials = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/${path}`, {
    signal: AbortSignal.timeout(10000),
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
};

const getSumUpMerchantCode = async () => {
  if (sumupMerchantCode) return sumupMerchantCode;
  if (!sumupApiKey) return null;
  const response = await fetch("https://api.sumup.com/v0.1/me", { signal: AbortSignal.timeout(10000), headers: { "Authorization": `Bearer ${sumupApiKey}` } });
  if (!response.ok) return null;
  const merchant = await response.json();
  return merchant.merchant_code || merchant.merchant?.merchant_code || merchant.merchant_profile?.merchant_code || merchant.merchant?.merchant_profile?.merchant_code || null;
};

const paidOrders = (database) => database.orders.filter((order) => order.payment?.status === "PAID");
const loyaltyPointsForItems = (items) => items.reduce((total, item) => total + (menuProductIds.has(item.productId) ? MENU_POINTS : burgerProductIds.has(item.productId) ? BURGER_POINTS : 0) * Math.max(1, Number(item.quantity) || 1), 0);
const finalizePaidOrder = (order, database) => {
  if (order.payment?.status !== "PAID") return null;
  if (order.status === "cancelled") {
    revokeLoyaltyForCancelledOrder(order, database);
    return null;
  }

  const now = new Date().toISOString();
  order.payment.paidAt ||= now;
  if (order.status === "awaiting_payment") {
    order.status = "confirmed";
    order.updatedAt = now;
    push.queueServiceNotification(database, order, 'order', 'awaiting_payment', pushConfig);
  }

  const customer = database.customers.find((item) => item.id === order.customerId);
  if (!customer) return null;
  // A gifted order is fulfilled normally, but is not a paid purchase for loyalty
  // or referral rewards. It must not multiply points on earlier paid orders.
  if (order.payment.provider === 'promotion') return { customer, pointsAdded: 0, referralPointsAdded: 0 };
  const { pointsAdded } = grantLoyaltyForOrder(customer, order, new Date(now), { bibouPlus: Boolean(order.bibouPlusApplied) });
  consumeWelcomeReward(customer, order, new Date(now));
  const referral = grantReferralReward(order, database, new Date(now));
  return { customer, pointsAdded, referralPointsAdded: referral.pointsAdded };
};

const revokeLoyaltyForCancelledOrder = (order, database) => {
  if (order.status !== "cancelled") return false;
  const customer = database.customers.find((item) => item.id === order.customerId);
  const loyaltyChanged = customer ? revokeLoyaltyForOrder(customer, order) : false;
  const welcomeRewardChanged = customer ? restoreWelcomeReward(customer, order) : false;
  const referralChanged = revokeReferralReward(order, database);
  return loyaltyChanged || welcomeRewardChanged || referralChanged;
};
const reconcileCancelledLoyalty = (database) => database.orders.reduce((changed, order) => revokeLoyaltyForCancelledOrder(order, database) || changed, false);
const expireAmendments = (database) => {
  let changed = false;
  for (const order of database.orders) {
    if (order.status === 'awaiting_customer' && order.amendment?.status === 'pending' && Date.parse(order.amendment.expiresAt) <= Date.now()) {
      amendments.cancel(order, 'expired');
      revokeLoyaltyForCancelledOrder(order, database);
      push.queueAmendmentNotification(database, order, pushConfig);
      changed = true;
    }
  }
  return changed;
};
// Preserve weekly order counts and multipliers while reducing points for removed products.
const adjustAmendedLoyalty = (order, database) => {
  const base = loyaltyPointsForItems(order.items), previous = order.loyaltyBasePoints || 0;
  const customer = database.customers.find(c => c.id === order.customerId);
  if (customer && order.loyaltyGrantedAt && !order.loyaltyRevokedAt) {
    const weighted = base * (order.loyaltyBibouPlusMultiplier || 1) * (order.loyaltyPickupMultiplier || 1);
    const delta = weighted - (order.loyaltyWeightedBasePoints ?? previous);
    const historicalCount = database.orders.filter(o => o.customerId === order.customerId && o.loyaltyWeekStart === order.loyaltyWeekStart && o.loyaltyGrantedAt && !o.loyaltyRevokedAt).length;
    const multiplier = Math.min((order.loyaltyWeekStart === customer.loyaltyWeekStart ? customer.weeklyOrders : historicalCount) || 1, 3);
    customer.points = Math.max(0, (customer.points || 0) + delta * multiplier);
    if (order.loyaltyWeekStart === customer.loyaltyWeekStart) {
      customer.weeklyWeightedBasePoints = Math.max(0, (customer.weeklyWeightedBasePoints || 0) + delta);
      customer.weeklyProgramPoints = customer.weeklyWeightedBasePoints * multiplier;
    }
    order.loyaltyWeightedBasePoints = weighted;
    order.loyaltyPointsAdded = Math.max(0, (order.loyaltyPointsAdded || 0) + delta * multiplier);
  }
  order.loyaltyBasePoints = base;
};
const resetExpiredLoyaltyWeeks = (database) => database.customers.reduce((changed, customer) => ensureCurrentLoyaltyWeek(customer) || changed, false);
const finalizePaidBibouPlusPurchase = (purchase, database) => {
  if (purchase?.payment?.status !== "PAID") return null;
  const customer = database.customers.find((item) => item.id === purchase.customerId);
  if (!customer) return null;
  activateBibouPlus(customer, purchase);
  return customer;
};

const sumupRequest = async (route, options = {}) => {
  if (!sumupApiKey) throw paymentError();
  try {
    const response = await fetch(`https://api.sumup.com/v0.1/${route}`, {
      ...options, signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${sumupApiKey}`, "Content-Type": "application/json" }
    });
    if (!response.ok) throw paymentError();
    return await response.json();
  } catch { throw paymentError(); }
};

const refreshPayment = async (record) => {
  const merchantCode = record.payment.merchantCode || await getSumUpMerchantCode();
  let checkout;
  if (record.payment.checkoutId) checkout = await sumupRequest(`checkouts/${encodeURIComponent(record.payment.checkoutId)}`);
  else {
    // Recover a creation whose response was lost, without creating another one.
    const found = await sumupRequest(`checkouts?checkout_reference=${encodeURIComponent(record.payment.checkoutReference)}`);
    if (!Array.isArray(found) || found.length !== 1) throw paymentError();
    checkout = found[0];
  }
  applyVerifiedCheckout(record, checkout, merchantCode);
};

const openPayment = async (record, database, { merchantCode, expiresAt, description, prefix }) => {
  if (record.payment?.checkoutReference) await refreshPayment(record);
  else {
    record.payment = { provider: "sumup", checkoutReference: `${prefix}-${record.number}-${crypto.randomUUID()}`, merchantCode, status: "PENDING", createdAt: new Date().toISOString(), validUntil: expiresAt.toISOString() };
    await writeDatabase(database); // Persist intent before the network call.
    const checkout = await sumupRequest("checkouts", {
      method: "POST",
      body: JSON.stringify({ checkout_reference: record.payment.checkoutReference, amount: record.total ?? record.amount, currency: "EUR", merchant_code: merchantCode, description, return_url: sumupReturnUrl, redirect_url: sumupRedirectUrl, valid_until: expiresAt.toISOString(), hosted_checkout: { enabled: true } })
    });
    applyVerifiedCheckout(record, checkout, merchantCode);
  }
  await writeDatabase(database);
  if (record.payment.status === "EXPIRED") throw Object.assign(new Error("Ce paiement a expiré. Recommence la commande."), { statusCode: 409 });
  if (!record.payment.checkoutUrl && record.payment.status !== "PAID") throw paymentError();
};

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  let url;
  try { url = new URL(request.url, 'http://localhost'); } catch { return send(response, 400, { error: 'Adresse de requête invalide.' }); }
  let releaseDatabase;

  try {
    if (url.pathname.startsWith('/api/review/')) {
      try {
        const payload = await reviewSandbox.handle({ method: request.method, route: url.pathname.slice('/api/review'.length), token: String(request.headers.authorization || '').replace(/^Bearer /, ''), readBody: () => readBody(request) });
        return send(response, 200, payload);
      } catch (error) {
        return send(response, [400, 401, 403, 404, 408, 409, 413, 429].includes(error.statusCode) ? error.statusCode : 400, { error: error.message || 'Action de test impossible.' });
      }
    }
    // Reject sandbox credentials before ANY real route, including public ones.
    if (String(request.headers.authorization || '').startsWith('Bearer review.')) return send(response, 401, { error: 'Une session de test ne peut pas accéder au service réel.' });
    if (url.pathname === '/api/keyyo/call') {
      if (request.method !== 'GET') return send(response, 405, { error: 'Méthode non autorisée.' });
      try { return send(response, 200, await keyyoSms.receive(url.searchParams)); }
      catch (error) { return send(response, error.statusCode || 503, { error: error.statusCode ? error.message : 'Service SMS indisponible.' }); }
    }
    if (url.pathname.startsWith('/s/')) {
      const token = url.pathname.slice(3);
      if (!/^[\w-]{22}$/.test(token)) return send(response, 404, { error: 'Lien invalide.' });
      if (!['GET', 'POST'].includes(request.method)) return send(response, 405, { error: 'Méthode non autorisée.' });
      if (request.method === 'POST') {
        try { await keyyoSms.optOut(token); }
        catch (error) { return send(response, error.statusCode || 503, { error: 'Lien invalide, expiré ou temporairement indisponible.' }); }
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" });
      return response.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>SMS — Bibou’s Burgers</title><body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:1.5rem"><h1>Bibou’s Burgers</h1>${request.method === 'POST' ? '<p>Votre demande est enregistrée. Vous ne recevrez plus nos SMS automatiques après vos appels.</p><p>Cela ne change ni vos commandes ni vos codes de connexion.</p>' : '<p>Ne plus recevoir le lien de commande par SMS après vos appels au restaurant ?</p><form method="post"><button style="padding:1rem;font-size:1rem">Confirmer l’arrêt de ces SMS</button></form><p>Aucun compte ni numéro à saisir. Les codes de connexion ne sont pas concernés.</p>'}</body></html>`);
    }
    if (url.pathname === '/api/dashboard/keyyo-sms' && request.method === 'GET') {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: 'Accès restaurant requis.' });
      return send(response, 200, await keyyoSms.status());
    }
    if (request.method === "GET" && url.pathname === "/api/health") return send(response, 200, { ok: true, service: "Bibou's Burgers API", version: process.env.RENDER_GIT_COMMIT || null, capabilities: { paymentRecovery: 1, promoCodes: 1, quarterHourAppointments: 1, advancePickupLoyalty: 1, customerPush: 1, customerCrm: 1, customerIdentity: 2, serviceSchedule: 1, orderAmendments: 1, uberDirect: 1 } });

    if (url.pathname === "/api/dashboard/backups" || url.pathname.startsWith("/api/dashboard/backups/")) {
      response.setHeader("Cache-Control", "no-store");
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      try {
        if (url.pathname === "/api/dashboard/backups") {
          if (request.method === "POST") { await readBody(request); await backupStore.create(); }
          else if (request.method !== "GET") return send(response, 405, { error: "Méthode non autorisée." });
          return send(response, 200, await backupStore.status());
        }
        if (request.method !== "GET") return send(response, 405, { error: "Méthode non autorisée." });
        const id = decodeURIComponent(url.pathname.slice("/api/dashboard/backups/".length));
        const buffer = await backupStore.download(id);
        response.writeHead(200, { "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="${id}"`, "Content-Length": buffer.length, "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" });
        return response.end(buffer);
      } catch (error) {
        return send(response, error.statusCode === 404 || error.code === "ENOENT" ? 404 : 503, { error: error.statusCode ? error.message : "Sauvegardes indisponibles. Réessayez ou faites vérifier le disque du serveur." });
      }
    }

    if (request.method === "GET" && ["/api/catalog", "/api/dashboard/catalog"].includes(url.pathname)) {
      if (url.pathname.startsWith("/api/dashboard/") && !authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      response.setHeader("Cache-Control", "no-store");
      return send(response, 200, availabilityCatalog(await productStockStore.read()));
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/dashboard/catalog/")) {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      const id = decodeURIComponent(url.pathname.slice("/api/dashboard/catalog/".length));
      const input = await readBody(request);
      releaseDatabase = await acquireDatabase();
      const stock = await productStockStore.update(id, input.available);
      response.setHeader("Cache-Control", "no-store");
      return send(response, 200, availabilityCatalog(stock));
    }

    if (request.method === "GET" && url.pathname === "/api/integrations/sumup/status") {
      const merchantCode = await getSumUpMerchantCode();
      return send(response, 200, { configured: Boolean(sumupApiKey), authenticated: Boolean(merchantCode), checkoutReady: Boolean(sumupApiKey && merchantCode && sumupReturnUrl && sumupRedirectUrl) });
    }

    if (request.method === "GET" && url.pathname === "/api/auth/sms/status") {
      return send(response, 200, { configured: twilioConfigured() });
    }

    if (request.method === "GET" && url.pathname === "/api/google-reviews") {
      if (!googleMapsApiKey) return send(response, 200, { configured: false, reviews: [] });
      if (googleReviewsCache.value && googleReviewsCache.expiresAt > Date.now()) return send(response, 200, googleReviewsCache.value);
      let googleResponse = await fetchGooglePlaceDetails(googlePlaceId);
      if (googleResponse.status === 404 && !process.env.GOOGLE_PLACE_ID) {
        const foundPlaceId = await findGooglePlaceId();
        if (foundPlaceId) googleResponse = await fetchGooglePlaceDetails(foundPlaceId);
      }
      if (!googleResponse.ok) {
        const googleError = await googleResponse.json().catch(() => null);
        console.error("Google Places request failed", googleResponse.status, googleError?.error?.status || "unknown");
        return send(response, 502, { error: "Les avis Google ne sont pas disponibles pour le moment." });
      }
      const place = await googleResponse.json();
      const payload = {
        configured: true,
        placeName: place.displayName?.text || "Bibou’s Burgers",
        rating: place.rating || null,
        reviewCount: place.userRatingCount || null,
        reviews: (place.reviews || []).slice(0, 5).map((review) => ({ author: review.authorAttribution?.displayName || "Client Google", rating: review.rating, text: review.text?.text || review.originalText?.text || "", publishedAt: review.publishTime || null }))
      };
      googleReviewsCache = { value: payload, expiresAt: Date.now() + 1000 * 60 * 60 * 6 };
      return send(response, 200, payload);
    }

    if (request.method === "POST" && url.pathname === "/api/delivery-quote") {
      const input = await readBody(request);
      if (!authenticatedCustomer(request, await readDatabase())) return send(response, 401, { error: "Connecte-toi pour calculer la livraison." });
      if (![input.address, input.postalCode, input.city].every((value) => String(value || "").trim())) return send(response, 400, { error: "Indiquez une adresse complète pour calculer la livraison." });
      try {
        const quote = await calculateDeliveryQuote(input);
        return send(response, 200, { ...quote, withinZone: quote.deliveryFee !== null });
      } catch (error) {
        return send(response, 422, { error: error.message || "Impossible de calculer la livraison." });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/auth/status") {
      return send(response, 200, { configured: Boolean(restaurantDashboardPassword) });
    }

    if (request.method === "POST" && url.pathname === "/api/dashboard/auth/login") {
      // Use the connection peer, not a forgeable forwarded header. Behind a reverse
      // proxy this conservative limit can be shared by restaurant operators.
      const loginKey = request.socket.remoteAddress || 'unknown';
      const limit = dashboardLoginLimiter.consume(loginKey);
      if (!limit.allowed) {
        response.setHeader('Retry-After', String(limit.retryAfterSeconds));
        return send(response, 429, { error: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.', retryAfterSeconds: limit.retryAfterSeconds });
      }
      const { password } = await readBody(request);
      if (!restaurantDashboardPassword) return send(response, 503, { error: "L’accès restaurant n’est pas encore configuré." });
      if (!passwordsMatch(password, restaurantDashboardPassword)) return send(response, 401, { error: "Mot de passe incorrect." });
      dashboardLoginLimiter.reset(loginKey);
      for (const [key, session] of dashboardSessions) if (session.expiresAt <= Date.now()) dashboardSessions.delete(key);
      if (dashboardSessions.size >= 1000) return send(response, 503, { error: 'Trop de sessions actives. Réessayez plus tard.' });
      const token = crypto.randomBytes(32).toString("base64url");
      dashboardSessions.set(token, { expiresAt: Date.now() + 1000 * 60 * 60 * 12 });
      return send(response, 200, { token });
    }

    if (url.pathname === '/api/dashboard/crm' || url.pathname === '/api/dashboard/crm/preview' || url.pathname === '/api/dashboard/settings') {
      if (!authenticatedDashboard(request)) return send(response, 401, { error:'Accès restaurant requis.' });
      const days = Number(url.searchParams.get('days') || 30);
      if (![7,30,90,365].includes(days)) return send(response, 400, {error:'Période invalide.'});
      const input = ['PATCH','POST'].includes(request.method) ? await readBody(request) : null;
      releaseDatabase = await acquireDatabase();
      const database = await readDatabase();
      if (url.pathname.endsWith('/preview') && request.method === 'POST') return send(response, 200, { previews:crm.preview(database,input) });
      if (url.pathname.endsWith('/settings') && request.method === 'PATCH') { crm.saveSettings(database,input); await writeDatabase(database); }
      else if (request.method !== 'GET' || url.pathname.endsWith('/preview')) return send(response, 405, { error:'Action non disponible.' });
      return send(response, 200, crm.dashboard(database,pushConfig,days));
    }

    // This reporting route is read-only, before the legacy read-time migrations.
    if (['/api/news', '/api/contest', '/api/dashboard/news', '/api/dashboard/contest'].includes(url.pathname)) {
      const privateRoute = url.pathname.startsWith('/api/dashboard/');
      if (privateRoute && !authenticatedDashboard(request)) return send(response, 401, { error: 'Connexion restaurant requise.' });
      if (request.method !== 'GET' && !(privateRoute && request.method === 'PATCH')) return send(response, 405, { error: 'Action non disponible.' });
      const input = request.method === 'PATCH' ? await readBody(request) : null;
      releaseDatabase = await acquireDatabase();
      const database = await readDatabase();
      const newsRoute = url.pathname.endsWith('/news');
      if (request.method === 'PATCH') {
        if (newsRoute) saveNews(database, input); else saveContestDraft(database, input);
        await writeDatabase(database);
      }
      return send(response, 200, privateRoute ? (newsRoute ? dashboardNews(database) : dashboardContest(database)) : (newsRoute ? publicNews(database) : publicContest(database)));
    }

    if (url.pathname === "/api/dashboard/customers" || url.pathname.startsWith("/api/dashboard/customers/")) {
      response.setHeader("Cache-Control", "no-store");
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      if (request.method !== "GET") return send(response, 405, { error: "La fiche client est en consultation uniquement." });
      releaseDatabase = await acquireDatabase();
      const database = await readDatabase();
      if (url.pathname === "/api/dashboard/customers") return send(response, 200, listDashboardCustomers(database, { query: url.searchParams.get("q") || "", filter: url.searchParams.get("filter"), offset: url.searchParams.get("offset"), limit: url.searchParams.get("limit") || 25 }));
      const detail = dashboardCustomerDetail(database, decodeURIComponent(url.pathname.slice("/api/dashboard/customers/".length)));
      return detail ? send(response, 200, detail) : send(response, 404, { error: "Ce compte n’existe plus ou est introuvable." });
    }

    if (url.pathname === '/api/dashboard/service-schedule') {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: 'Accès restaurant requis.' });
      if (!["GET", "PATCH"].includes(request.method)) return send(response, 405, { error: 'Action non disponible.' });
      const input = request.method === "PATCH" ? await readBody(request) : null;
      releaseDatabase = await acquireDatabase();
      const database = await readDatabase();
      const date = input?.date || url.searchParams.get('date');
      if (input) { serviceSchedule.save(database, input); await writeDatabase(database); }
      return send(response, 200, serviceSchedule.dashboard(database, date));
    }

    // Uber network calls happen outside the shared order lock. A persisted dispatch reservation
    // prevents duplicate couriers even when a response is lost or the server restarts.
    const uberRoute = url.pathname.match(/^\/api\/dashboard\/orders\/([^/]+)\/uber\/(quote|dispatch|sync)$/);
    if (url.pathname === '/api/dashboard/uber-status' && request.method === 'GET') {
      if (!authenticatedDashboard(request)) return send(response,401,{error:'Accès restaurant requis.'});
      return send(response,200,{configured:Boolean(uber.configured(uberConfig)),mode:uberConfig.mode});
    }
    if (uberRoute && request.method === 'POST') {
      if (!authenticatedDashboard(request)) return send(response,401,{error:'Accès restaurant requis.'});
      if (!uber.configured(uberConfig)) return send(response,503,{error:'Uber Direct n’est pas encore connecté. Les accès serveur et le suivi doivent être configurés.'});
      const [,id,action] = uberRoute, input = await readBody(request);
      const transact = async task => {const release=await acquireDatabase();try{const db=await readDatabase(),order=db.orders.find(o=>o.id===id);if(!order)throw Object.assign(new Error('Commande introuvable.'),{statusCode:404});const result=task(order,db);await writeDatabase(db);return result;}finally{release();}};
      if (action === 'quote') {
        const prepared = await transact(order => ({fingerprint:uber.fingerprint(order),payload:uber.quoteInput(order,input.minutes,uberConfig)}));
        const quote = await uberClient.quote(prepared.payload);
        const state = await transact(order => {uber.assertEligible(order);if(uber.fingerprint(order)!==prepared.fingerprint)throw Object.assign(new Error('La commande a changé. Recalculez le devis.'),{statusCode:409});return uber.saveQuote(order,quote,prepared.payload,input.minutes);});
        return send(response,200,{uber:state,mode:uberConfig.mode});
      }
      if (action === 'dispatch') {
        const payload = await transact(order => uber.reserve(order,input,uberConfig));
        let data;
        try { data = await uberClient.create(payload); }
        catch(error) {
          await transact(order => {if(order.uberDirect?.externalId===payload.external_id && order.uberDirect.phase==='sending')order.uberDirect.phase=error.uncertain?'uncertain':'failed';});
          return send(response,502,{error:error.message});
        }
        try {
          const state = await transact((order,db) => {const previous=order.status;uber.applyDelivery(order,data,uberConfig);push.queueServiceNotification(db,order,'order',previous,pushConfig);return order.uberDirect;});
          return send(response,200,{uber:state});
        } catch {
          await transact(order=>{if(order.uberDirect?.phase==='sending')order.uberDirect.phase='uncertain';});
          return send(response,502,{error:'Uber a répondu mais la livraison reste à vérifier. Ne demandez pas un second coursier ; consultez Uber Direct.'});
        }
      }
      const deliveryId = await transact(order=>{const u=order.uberDirect;if(!u?.externalId)throw Object.assign(new Error('Aucune demande Uber à actualiser.'),{statusCode:409});const value=u.deliveryId || input.deliveryId;if(typeof value!=='string' || !/^del_[A-Za-z0-9_-]{5,100}$/.test(value))throw Object.assign(new Error('Indiquez l’identifiant del_ de la livraison retrouvée dans Uber Direct.'),{statusCode:400});return value;});
      const data = await uberClient.get(deliveryId);
      const state = await transact((order,db)=>{const previous=order.status;uber.applyDelivery(order,data,uberConfig);push.queueServiceNotification(db,order,'order',previous,pushConfig);return order.uberDirect;});
      return send(response,200,{uber:state});
    }
    if (url.pathname === '/api/uber-direct/webhook' && request.method === 'POST') {
      const event = await readBody(request);
      if (!uber.verifyWebhook(rawRequestBodies.get(request),request.headers['x-uber-signature'],uberConfig.signingKey)) return send(response,401,{error:'Signature invalide.'});
      if (event.customer_id !== uberConfig.customerId || event.live_mode !== (uberConfig.mode==='live')) return send(response,400,{error:'Compte ou environnement incorrect.'});
      if (event.kind !== 'event.delivery_status') return send(response,200,{received:true});
      const release = await acquireDatabase();
      try {
        const db = await readDatabase(),order = db.orders.find(o=>o.uberDirect?.externalId && (o.uberDirect.deliveryId===event.delivery_id || o.uberDirect.externalId===event.data?.external_id));
        if(!order)return send(response,200,{received:true});
        const previous=order.status;
        uber.applyDelivery(order,event.data,uberConfig,event.created);
        push.queueServiceNotification(db,order,'order',previous,pushConfig);
        await writeDatabase(db);
      }finally{release();}
      return send(response,200,{received:true});
    }

    // Do not hold the database lock while waiting for a request body.
    if (["POST", "PATCH", "DELETE"].includes(request.method)) await readBody(request);
    releaseDatabase = await acquireDatabase();
    const database = await readDatabase();
    const amendmentsExpired = expireAmendments(database);
    const loyaltyWeekChanged = resetExpiredLoyaltyWeeks(database);
    const referralCodesChanged = ensureAllReferralCodes(database);
    const bibouPlusStoreChanged = ensureBibouPlusStore(database);
    const rewardStoreChanged = ensureRewardStore(database);
    const contestPurged = purgeExpiredContestEntries(database);
    const supportCreditsChanged = applySupportCredits(database);
    if (amendmentsExpired || loyaltyWeekChanged || referralCodesChanged || bibouPlusStoreChanged || rewardStoreChanged || contestPurged || supportCreditsChanged) await writeDatabase(database);

    if (url.pathname === '/api/customer/push' || url.pathname.startsWith('/api/customer/push/')) {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: 'Connecte-toi pour gérer tes notifications.' });
      if (request.method === 'GET' && url.pathname === '/api/customer/push') return send(response, 200, push.customerPushState(database, customer, pushConfig));
      if (request.method === 'PATCH' && url.pathname === '/api/customer/push') push.updatePreferences(database, customer, await readBody(request));
      else if (request.method === 'POST' && url.pathname === '/api/customer/push/devices') push.registerDevice(database, customer, await readBody(request));
      else if (request.method === 'DELETE' && /^\/api\/customer\/push\/devices\/[a-f0-9-]+$/i.test(url.pathname)) push.removeDevice(database, customer, url.pathname.split('/').pop());
      else return send(response, 405, { error: 'Action non disponible.' });
      await writeDatabase(database);
      return send(response, 200, push.customerPushState(database, customer, pushConfig));
    }

    if (url.pathname === '/api/customer/crm') {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error:'Connecte-toi pour gérer tes offres.' });
      if (request.method === 'PATCH') { crm.updateCustomerPreferences(database,customer,await readBody(request)); await writeDatabase(database); }
      else if (request.method !== 'GET') return send(response, 405, { error:'Action non disponible.' });
      return send(response, 200, crm.customerState(database,customer));
    }

    if (url.pathname === '/api/dashboard/push' || url.pathname.startsWith('/api/dashboard/push/')) {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: 'Accès restaurant requis.' });
      if (request.method === 'GET' && url.pathname === '/api/dashboard/push') return send(response, 200, push.dashboardPush(database, pushConfig));
      let campaign;
      if (request.method === 'POST' && url.pathname === '/api/dashboard/push/preview') campaign = push.prepareCampaign(database, await readBody(request), pushConfig);
      else if (request.method === 'POST' && /^\/api\/dashboard\/push\/campaigns\/[a-f0-9-]+\/send$/i.test(url.pathname)) campaign = push.sendCampaign(database, url.pathname.split('/').at(-2), await readBody(request), pushConfig);
      else return send(response, 405, { error: 'Action non disponible.' });
      await writeDatabase(database);
      return send(response, 200, { campaign, ...push.dashboardPush(database, pushConfig) });
    }

    if (url.pathname === '/api/customer/contest' || url.pathname === '/api/customer/contest/join') {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: 'Connecte-toi par SMS pour participer.' });
      if (request.method === 'GET' && url.pathname === '/api/customer/contest') return send(response, 200, customerContest(database, customer));
      if (request.method === 'POST' && url.pathname.endsWith('/join')) {
        const result = joinContest(database, customer, await readBody(request), customerSessionSecret);
        if (result.changed) await writeDatabase(database);
        return send(response, result.changed ? 201 : 200, result);
      }
      return send(response, 405, { error: 'Action non disponible.' });
    }

    if (request.method === "GET" && url.pathname === "/api/availability") {
      const serviceDate = url.searchParams.get("date");
      const method = url.searchParams.get("method") || "delivery";
      if (!["delivery", "pickup"].includes(method)) return send(response, 400, { error: "Mode de commande invalide." });
      const validationError = validateServiceDate(serviceDate);
      if (validationError) return send(response, 400, { error: validationError });
      const slots = availabilityForDate(database, serviceDate, new Date(), method);
      return send(response, 200, { serviceDate, method, capacity: method === "delivery" ? SLOT_CAPACITY : null, slots });
    }

    if (request.method === "GET" && url.pathname === "/api/reservation-availability") {
      const serviceDate = url.searchParams.get("date");
      const validationError = validateServiceDate(serviceDate);
      if (validationError) return send(response, 400, { error: validationError.replace("livraison", "réservation") });
      const slots = reservationAvailabilityForDate(database, serviceDate);
      return send(response, 200, { serviceDate, capacity: RESERVATION_SLOT_CAPACITY, capacityWindowMinutes: 30, slots });
    }

    if (request.method === "POST" && url.pathname === "/api/reservations") {
      const input = await readBody(request);
      try {
        const reservation = await serializeOrderCreation(async () => {
          const latestDatabase = await readDatabase();
          const customer = authenticatedCustomer(request, latestDatabase);
          if (!customer) throw Object.assign(new Error("Connecte-toi par SMS avant de réserver."), { statusCode: 401 });
          const created = createReservation(latestDatabase, { ...input, customerId: customer.id, phone: customer.phone });
          await writeDatabase(latestDatabase);
          return created;
        });
        return send(response, 201, { reservation });
      } catch (error) {
        return send(response, error.statusCode || 400, { error: error.message || "La réservation n’a pas pu être enregistrée." });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/auth/sms/start") {
      const { phone } = await readBody(request);
      const normalizedPhone = normalizeFrenchPhone(phone);
      if (!normalizedPhone) return send(response, 400, { error: "Saisissez un numéro français commençant par 06 ou 07." });
      if (!twilioConfigured()) return send(response, 503, { error: "La connexion par SMS n’est pas encore activée." });
      const rateLimit = smsAttemptLimiter.check(normalizedPhone);
      if (!rateLimit.allowed) {
        const retryAfterMinutes = Math.max(1, Math.ceil(rateLimit.retryAfterSeconds / 60));
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        return send(response, 429, {
          error: `Trop de tentatives. Réessayez dans ${retryAfterMinutes} minute${retryAfterMinutes > 1 ? "s" : ""}.`,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        });
      }
      const { response: twilioResponse, payload } = await verifyWithTwilio("Verifications", {
        To: normalizedPhone,
        Channel: "sms",
        Locale: "fr",
      });
      if (!twilioResponse.ok) return send(response, 502, { error: payload.message || "Le SMS n’a pas pu être envoyé." });
      smsAttemptLimiter.recordSuccess(normalizedPhone);
      return send(response, 200, { ok: true, phone: normalizedPhone });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/sms/check") {
      const { phone, code, registrationVersion } = await readBody(request);
      const normalizedPhone = normalizeFrenchPhone(phone);
      if (!normalizedPhone || !/^\d{4,10}$/.test(String(code || ""))) return send(response, 400, { error: "Le numéro ou le code est invalide." });
      if (!twilioConfigured()) return send(response, 503, { error: "La connexion par SMS n’est pas encore activée." });
      const limit = smsCodeLimiter.consume(normalizedPhone);
      if (!limit.allowed) {
        response.setHeader('Retry-After', String(limit.retryAfterSeconds));
        return send(response, 429, { error: 'Trop de codes essayés. Attends quelques minutes avant de réessayer.', retryAfterSeconds: limit.retryAfterSeconds });
      }
      const { response: twilioResponse, payload } = await verifyWithTwilio("VerificationCheck", { To: normalizedPhone, Code: String(code) });
      if (!twilioResponse.ok || payload.status !== "approved") return send(response, 401, { error: "Le code est incorrect ou a expiré." });
      smsCodeLimiter.reset(normalizedPhone);
      let customer = database.customers.find((item) => normalizeFrenchPhone(item.phone) === normalizedPhone);
      const isNewCustomer = !customer;
      // Android v4 is already in store review: retain its old response contract.
      // Updated clients finish registration before any customer/reward is saved.
      if (!customer && registrationVersion === 2) return send(response, 200, { registrationRequired: true, registrationToken: registrations.issue(normalizedPhone) });
      if (!customer) {
        customer = { id: `customer-${database.nextCustomerId++}`, name: "", phone: normalizedPhone, address: "", postalCode: "", city: "Le Havre", points: 0, weeklyOrders: 0, createdAt: new Date().toISOString() };
        ensureReferralCode(customer, database);
        grantWelcomeReward(customer);
        database.customers.push(customer);
      }
      customer.phone = normalizedPhone;
      customer.verifiedPhone = normalizedPhone;
      customer.phoneVerifiedAt = new Date().toISOString();
      customer.firstPhoneVerifiedAt ||= customer.phoneVerifiedAt;
      await writeDatabase(database);
      return send(response, 200, { token: createSession(customer.id), customer, isNewCustomer });
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/sms/register') {
      const input = await readBody(request);
      if (!input || typeof input !== 'object' || Array.isArray(input)) return send(response, 400, { error: 'Informations d’inscription invalides.' });
      const proof = registrations.read(input.registrationToken);
      if (!proof) return send(response, 401, { error: 'L’inscription a expiré. Recommence la vérification par SMS.' });
      const identity = validateIdentity(input);
      if (identity.error) return send(response, 400, identity);
      let customer = database.customers.find(item => proof.customerId ? item.id === proof.customerId : normalizeFrenchPhone(item.phone) === proof.phone);
      if (proof.customerId && !customer) return send(response, 401, { error: 'Ce compte a été supprimé. Recommence la vérification par SMS.' });
      const isNewCustomer = !customer;
      const now = new Date().toISOString();
      if (!customer) {
        customer = { id: `customer-${database.nextCustomerId++}`, ...identity, phone: proof.phone, address: '', postalCode: '', city: 'Le Havre', points: 0, weeklyOrders: 0, createdAt: now };
        ensureReferralCode(customer, database);
        grantWelcomeReward(customer);
        database.customers.push(customer);
      }
      // A retry/concurrent registration never renames an already completed account.
      if (!hasCompleteIdentity(customer)) Object.assign(customer, identity);
      customer.profileCompletedAt ||= now;
      customer.verifiedPhone = proof.phone;
      customer.phoneVerifiedAt = now;
      customer.firstPhoneVerifiedAt ||= now;
      await writeDatabase(database);
      registrations.complete(input.registrationToken, customer.id);
      return send(response, 200, { token: createSession(customer.id), customer, isNewCustomer });
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const customer = authenticatedCustomer(request, database);
      return customer ? send(response, 200, { customer }) : send(response, 401, { error: "Session expirée." });
    }

    if (request.method === "GET" && url.pathname === "/api/customer/rewards") {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: "Connecte-toi pour consulter tes récompenses." });
      return send(response, 200, { claims: rewardClaimsForCustomer(database, customer.id) });
    }

    const rewardClaimMatch = url.pathname.match(/^\/api\/customer\/rewards\/([^/]+)\/claim$/);
    if (request.method === "POST" && rewardClaimMatch) {
      try {
        const claimed = await serializeOrderCreation(async () => {
          const latestDatabase = await readDatabase();
          const customer = authenticatedCustomer(request, latestDatabase);
          if (!customer) throw Object.assign(new Error("Connecte-toi pour réclamer cette récompense."), { statusCode: 401 });
          const claim = claimReward(latestDatabase, customer, decodeURIComponent(rewardClaimMatch[1]));
          await writeDatabase(latestDatabase);
          return { claim, claims: rewardClaimsForCustomer(latestDatabase, customer.id) };
        });
        return send(response, 201, claimed);
      } catch (error) {
        return send(response, error.statusCode || 400, { error: error.message || "La récompense n’a pas pu être réclamée." });
      }
    }

    if (request.method === "DELETE" && url.pathname === "/api/customer/account") {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: "Reconnecte-toi pour supprimer ton compte." });
      const deletion = anonymizeCustomerAccount(database, customer);
      await writeDatabase(database);
      return send(response, 200, { deleted: true, deletion });
    }

    if (request.method === "GET" && url.pathname === "/api/bibou-plus/status") {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: "Connecte-toi pour consulter Bibou +." });
      return send(response, 200, { bibouPlus: bibouPlusStatus(customer) });
    }

    if (request.method === "POST" && url.pathname === "/api/bibou-plus/checkout") {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: "Connecte-toi pour t’abonner à Bibou +." });
      const requestId = validateRequestId((await readBody(request)).requestId);
      const previous = requestId && database.bibouPlusPurchases.find(item => item.customerId === customer.id && (item.requestId === requestId || item.requestAliases?.includes(requestId)));
      if (previous?.activatedAt) return send(response, 200, { purchase: previous, customer, bibouPlus: bibouPlusStatus(customer) });
      const merchantCode = await getSumUpMerchantCode();
      if (!sumupApiKey || !merchantCode || !sumupReturnUrl || !sumupRedirectUrl) return send(response, 503, { error: "Le paiement Bibou + n’est pas encore disponible." });

      const createdAt = new Date();
      const validUntil = new Date(createdAt.getTime() + 30 * 60 * 1000);
      let purchase = previous || database.bibouPlusPurchases.find(item => item.customerId === customer.id && !item.activatedAt && item.payment?.status !== "EXPIRED" && new Date(item.payment?.validUntil || 0) > createdAt);
      if (!purchase) {
        const number = database.nextBibouPlusNumber++;
        purchase = { id: `bibou-plus-${number}`, number, customerId: customer.id, requestId, amount: BIBOU_PLUS_PRICE, status: "awaiting_payment", createdAt: createdAt.toISOString() };
        database.bibouPlusPurchases.unshift(purchase);
      }
      // Associate this browser's attempt even when reusing a pending checkout from another visit.
      if (requestId && !purchase.requestId) purchase.requestId = requestId;
      if (requestId && purchase.requestId !== requestId && !purchase.requestAliases?.includes(requestId)) {
        purchase.requestAliases ||= [];
        if (purchase.requestAliases.length >= 20) return send(response, 429, { error: "Trop de reprises de ce paiement. Réessaie plus tard." });
        purchase.requestAliases.push(requestId);
      }
      await openPayment(purchase, database, { merchantCode, expiresAt: validUntil, description: "Bibou + · 30 jours", prefix: "bibou-plus" });
      finalizePaidBibouPlusPurchase(purchase, database);
      await writeDatabase(database);
      return send(response, 201, { purchase, customer, bibouPlus: bibouPlusStatus(customer), checkoutUrl: purchase.payment.checkoutUrl || null });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/bibou-plus/checkout/")) {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: "Session expirée." });
      const purchase = database.bibouPlusPurchases.find((item) => item.id === url.pathname.split("/").pop() && item.customerId === customer.id);
      if (!purchase?.payment?.checkoutReference) return send(response, 404, { error: "Paiement Bibou + introuvable." });
      await refreshPayment(purchase);
      finalizePaidBibouPlusPurchase(purchase, database);
      await writeDatabase(database);
      return send(response, 200, { purchase, customer, bibouPlus: bibouPlusStatus(customer) });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/customer/payment-attempts/")) {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: "Reconnecte-toi pour retrouver ton paiement." });
      const requestId = validateRequestId(url.pathname.split("/").pop());
      const order = database.orders.find(item => item.customerId === customer.id && item.requestId === requestId);
      const purchase = database.bibouPlusPurchases.find(item => item.customerId === customer.id && (item.requestId === requestId || item.requestAliases?.includes(requestId)));
      if (!order && !purchase) return send(response, 404, { error: "Aucune commande associée à cette tentative." });
      return send(response, 200, { kind: order ? "order" : "bibou-plus", record: order || purchase });
    }

    if (request.method === 'GET' && url.pathname === '/api/dashboard/amendment-catalog') {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: 'Accès restaurant requis.' });
      return send(response, 200, amendmentCatalog(await productStockStore.read()));
    }
    const amendmentRoute = url.pathname.match(/^\/api\/(dashboard|customer)\/orders\/([^/]+)\/(amendment|amendment-preview|refund)$/);
    if (amendmentRoute && request.method === 'POST') {
      const [, scope, id, action] = amendmentRoute;
      const customer = scope === 'customer' ? authenticatedCustomer(request, database) : null;
      if (scope === 'dashboard' ? !authenticatedDashboard(request) : !customer) return send(response, 401, { error: 'Connexion requise.' });
      const order = database.orders.find(o => o.id === id && (scope === 'dashboard' || o.customerId === customer.id));
      if (!order) return send(response, 404, { error: 'Commande introuvable.' });
      const input = await readBody(request);
      if (scope === 'dashboard') {
        if (action === 'amendment-preview') return send(response, 200, amendments.preview(order, input, await productStockStore.read()));
        if (action === 'refund') amendments.recordRefund(order, input);
        else {
          amendments.propose(order, input, await productStockStore.read());
          order.amendment.notification = push.queueAmendmentNotification(database, order, pushConfig);
        }
      } else {
        if (action !== 'amendment') return send(response, 404, { error: 'Action indisponible.' });
        const changed = amendments.decide(order, input, await productStockStore.read());
        if (changed) {
          if (order.amendment.status === 'accepted') adjustAmendedLoyalty(order, database);
          revokeLoyaltyForCancelledOrder(order, database);
          push.queueAmendmentNotification(database, order, pushConfig);
        }
      }
      await writeDatabase(database);
      return send(response, 200, { order });
    }

    if (request.method === "GET" && url.pathname === "/api/customer/orders") {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: "Session expirée." });
      return send(response, 200, { orders: paidOrders(database).filter((order) => order.customerId === customer.id).map(({uberDirect,...order})=>({...order,uberDelivery:uber.publicDelivery({...order,uberDirect})})) });
    }

    if (request.method === "GET" && url.pathname === "/api/customer/reservations") {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: "Session expirée." });
      const reservations = reservationsForCustomer(database, customer).sort((a, b) => `${b.serviceDate} ${b.slot}`.localeCompare(`${a.serviceDate} ${a.slot}`));
      return send(response, 200, { reservations });
    }

    if (request.method === "GET" && url.pathname === "/api/orders") {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      if (reconcileCancelledLoyalty(database)) await writeDatabase(database);
      const status = url.searchParams.get("status");
      const orders = status ? paidOrders(database).filter((order) => order.status === status) : paidOrders(database);
      return send(response, 200, { orders });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/summary") {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      if (reconcileCancelledLoyalty(database)) await writeDatabase(database);
      const confirmedOrders = paidOrders(database);
      const activeOrders = confirmedOrders.filter((order) => !["delivered", "cancelled"].includes(order.status));
      const revenue = revenuePeriods(confirmedOrders);
      return send(response, 200, {
        activeOrders: activeOrders.length,
        newOrders: activeOrders.filter((order) => order.status === "confirmed").length,
        readyOrders: activeOrders.filter((order) => order.status === "ready").length,
        revenue,
        serviceRevenue: revenue.today
      });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/reward-claims") {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      return send(response, 200, { claims: [...database.rewardClaims].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)) });
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/dashboard/reward-claims/")) {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      const input = await readBody(request);
      try {
        const claim = updateRewardClaimStatus(database, decodeURIComponent(url.pathname.split("/").pop()), input.status);
        if (!claim) return send(response, 404, { error: "Récompense introuvable." });
        await writeDatabase(database);
        return send(response, 200, { claim });
      } catch (error) {
        return send(response, error.statusCode || 400, { error: error.message || "La récompense n’a pas pu être mise à jour." });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/orders") {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      if (reconcileCancelledLoyalty(database)) await writeDatabase(database);
      const orders = paidOrders(database);
      return send(response, 200, { orders, revenue: revenuePeriods(orders) });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/reservations") {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      ensureReservationStore(database);
      const reservations = [...database.reservations].sort((a, b) => `${a.serviceDate} ${a.slot}`.localeCompare(`${b.serviceDate} ${b.slot}`));
      return send(response, 200, { reservations });
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/dashboard/reservations/")) {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      const input = await readBody(request);
      try {
        const previousStatus = database.reservations?.find(item => item.id === url.pathname.split('/').pop())?.status;
        const reservation = updateReservationStatus(database, url.pathname.split("/").pop(), input.status);
        if (!reservation) return send(response, 404, { error: "Réservation introuvable." });
        push.queueServiceNotification(database, reservation, 'reservation', previousStatus, pushConfig);
        await writeDatabase(database);
        return send(response, 200, { reservation });
      } catch (error) {
        return send(response, 400, { error: error.message || "Mise à jour impossible." });
      }
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/dashboard/orders/")) {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      const input = await readBody(request);
      const order = database.orders.find((item) => item.id === url.pathname.split("/").pop());
      if (!order) return send(response, 404, { error: "Commande introuvable" });
      if (order.payment?.status !== "PAID") return send(response, 409, { error: "Le paiement doit être confirmé avant de traiter la commande." });
      if (!allowedStatuses.includes(input.status)) return send(response, 400, { error: "Statut invalide" });
      assertOrderTransition(order, input.status);
      const previousStatus = order.status;
      if (input.status === "cancelled" && order.status !== "cancelled" && order.amendment) amendments.cancel(order, "cancelled");
      order.status = input.status;
      order.updatedAt = new Date().toISOString();
      revokeLoyaltyForCancelledOrder(order, database);
      push.queueServiceNotification(database, order, 'order', previousStatus, pushConfig);
      await writeDatabase(database);
      return send(response, 200, { order });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/customers/")) {
      const customer = authenticatedCustomer(request, database);
      const requestedId = url.pathname.split("/").pop();
      if (!customer || customer.id !== requestedId) return send(response, 401, { error: "Accès au compte requis." });
      return send(response, 200, { customer });
    }

    if (request.method === "POST" && url.pathname === "/api/customers") {
      return send(response, 403, { error: 'Vérifie ton numéro par SMS puis renseigne ton prénom et ton nom pour créer ton compte.' });
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/customers/")) {
      const input = await readBody(request);
      if (!input || typeof input !== 'object' || Array.isArray(input)) return send(response, 400, { error: 'Informations du profil invalides.' });
      const customer = authenticatedCustomer(request, database);
      const requestedId = url.pathname.split("/").pop();
      if (!customer || customer.id !== requestedId) return send(response, 401, { error: "Reconnecte-toi pour modifier tes coordonnées." });
      if (Object.hasOwn(input, 'phone') && normalizeFrenchPhone(input.phone) !== normalizeFrenchPhone(customer.phone)) return send(response, 400, { error: 'Pour utiliser un autre numéro, déconnecte-toi puis vérifie ce numéro par SMS.' });
      const structured = Object.hasOwn(input, 'firstName') || Object.hasOwn(input, 'lastName');
      if (structured) {
        const identity = validateIdentity(input);
        if (identity.error) return send(response, 400, identity);
        Object.assign(customer, identity, { profileCompletedAt: customer.profileCompletedAt || new Date().toISOString() });
      } else if (Object.hasOwn(input, 'name')) {
        const name = normalizeName(input.name);
        if (!name || name.length > 121) return send(response, 400, { error: 'Le nom ne peut pas être vide (121 caractères maximum).' });
        if (hasCompleteIdentity(customer) && name !== customer.name) return send(response, 400, { error: 'Renseigne séparément ton prénom et ton nom pour les modifier.' });
        customer.name = name; // Compatibility with the already submitted Android v4.
      }
      ["address", "postalCode", "city"].forEach((field) => {
        if (typeof input[field] === "string") customer[field] = input[field].trim();
      });
      if (input.sponsorCode) applyReferralCode(database, customer, input.sponsorCode);
      await writeDatabase(database);
      return send(response, 200, { customer });
    }

    if (request.method === 'POST' && url.pathname === '/api/promotions/validate') {
      if (!authenticatedCustomer(request, database)) return send(response, 401, { error: 'Connecte-toi pour utiliser un code promo.' });
      const input = await readBody(request);
      const promotion = promotionForCode(input?.code);
      if (!promotion) return send(response, 400, { error: 'Saisis un code promo.' });
      return send(response, 200, { promotion });
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      const input = await readBody(request);
      const comment = input.comment === undefined ? "" : typeof input.comment === "string" ? input.comment.trim() : null;
      if (comment === null || comment.length > 500) return send(response, 400, { error: "Le commentaire doit contenir au maximum 500 caractères." });
      const customer = database.customers.find((item) => item.id === input.customerId);
      const sessionCustomer = authenticatedCustomer(request, database);
      if (!sessionCustomer || sessionCustomer.id !== customer?.id) return send(response, 401, { error: "Connecte-toi par SMS avant de commander." });
      const requestId = validateRequestId(input.requestId);
      const fingerprint = orderFingerprint(input);
      const previous = requestId && database.orders.find(item => item.customerId === customer.id && item.requestId === requestId);
      if (previous) {
        if (previous.requestFingerprint !== fingerprint) return send(response, 409, { code: "ATTEMPT_CONFLICT", error: "Cette tentative correspond déjà à une autre commande. Vérifie son paiement avant de continuer." });
        return send(response, 200, { order: previous, reused: true });
      }
      const promotion = promotionForCode(input.promoCode);
      if (!customer || !Array.isArray(input.items) || !input.items.length || !["delivery", "pickup"].includes(input.method) || !input.slot || !input.serviceDate) return send(response, 400, { error: "Informations de commande incomplètes." });
      const serviceSlotError = validateServiceSlot(input.serviceDate, input.slot, new Date(), input.method, database);
      if (serviceSlotError) return send(response, 400, { error: serviceSlotError });
      const pricedCart = validateAndPriceOrderItems(input.items, await productStockStore.read());
      const subtotal = pricedCart.subtotal;
      let distanceKm = 0;
      let deliveryFee = 0;
      if (input.method === "delivery") {
        if (![customer.address, customer.postalCode, customer.city].every(value => String(value || "").trim())) return send(response, 400, { error: "Indiquez une adresse complète pour la livraison." });
        try {
          const quote = await calculateDeliveryQuote(customer);
          distanceKm = quote.distanceKm;
          deliveryFee = quote.deliveryFee;
        } catch (error) {
          return send(response, 422, { error: error.message || "Impossible de calculer la livraison." });
        }
      }
      if (input.method === "delivery" && deliveryFee === null) return send(response, 400, { error: "L’adresse est hors de la zone de livraison de 5 km." });
      const order = await serializeOrderCreation(async () => {
        assertStoredOrderAvailable(pricedCart.items, await productStockStore.read());
        const latestDatabase = await readDatabase();
        ensureBibouPlusStore(latestDatabase);
        const latestCustomer = latestDatabase.customers.find((item) => item.id === input.customerId);
        if (!latestCustomer) return null;
        if (input.method === "delivery" && remainingDeliveryPlaces(latestDatabase, input.serviceDate, input.slot).remaining < 1) return false;
        const sessionCustomer = authenticatedCustomer(request, latestDatabase);
        const benefitsAllowed = sessionCustomer?.id === latestCustomer.id;
        const bibouPlusActive = benefitsAllowed && bibouPlusStatus(latestCustomer).active;
        const welcomeRewardApplied = !promotion && benefitsAllowed && welcomeRewardAvailable(latestCustomer, latestDatabase.orders, new Date(), PENDING_RESERVATION_MS);
        const baseRate = welcomeRewardApplied ? WELCOME_DISCOUNT_RATE : bibouPlusActive ? BIBOU_PLUS_DISCOUNT_RATE : 0;
        const crmOffer = !promotion && benefitsAllowed ? crm.bestOffer(latestDatabase,latestCustomer,subtotal,baseRate) : null;
        const discountRate = crmOffer ? crmOffer.discountPercent / 100 : baseRate;
        const pricing = applyPromotion(bibouPlusOrderPricing({ subtotal, deliveryFee, active: bibouPlusActive, discountRate }), promotion);
        const storedItems = pricedCart.items;
        const createdOrder = { id: `order-${latestDatabase.nextOrderNumber}`, number: latestDatabase.nextOrderNumber++, customerId: latestCustomer.id, customerName: latestCustomer.name, customerPhone: customer.phone || "", deliveryAddress: input.method === "delivery" ? { address: customer.address || "", postalCode: customer.postalCode || "", city: customer.city || "" } : null, comment, items: storedItems, subtotal: pricing.subtotal, discount: pricing.discount, discountRate: pricing.discountRate, standardDeliveryFee: pricing.standardDeliveryFee, deliveryFee: pricing.deliveryFee, distanceKm, total: pricing.total, method: input.method, serviceDate: input.serviceDate, slot: input.slot, bibouPlusApplied: bibouPlusActive, welcomeRewardApplied, loyaltyBasePoints: loyaltyPointsForItems(storedItems), status: "awaiting_payment", createdAt: new Date().toISOString() };
        createdOrder.requestId = requestId;
        if (promotion) { createdOrder.promotion = promotion; createdOrder.discountLabel = `Code promo ${promotion.code}`; }
        if (crmOffer) { createdOrder.crmOfferId = crmOffer.id; createdOrder.crmRuleId = latestDatabase.crm.offers.find(o=>o.id===crmOffer.id).ruleId; createdOrder.discountLabel = crmOffer.title; createdOrder.welcomeRewardApplied = false; }
        createdOrder.requestFingerprint = fingerprint;
        const finalSlotError = validateServiceSlot(createdOrder.serviceDate, createdOrder.slot, new Date(createdOrder.createdAt), createdOrder.method, latestDatabase);
        if (finalSlotError) throw Object.assign(new Error(finalSlotError), { statusCode: 400 });
        createdOrder.pickupAdvanceBonusApplied = qualifiesForAdvancePickup(createdOrder);
        latestDatabase.orders.unshift(createdOrder);
        if (settlePromotionalOrder(createdOrder)) finalizePaidOrder(createdOrder, latestDatabase);
        await writeDatabase(latestDatabase);
        return createdOrder;
      });
      if (order === false) return send(response, 409, { error: "Ce créneau de livraison vient d’être réservé deux fois. Choisis-en un autre." });
      if (!order) return send(response, 404, { error: "Client introuvable" });
      return send(response, 201, { order });
    }

    if (request.method === "POST" && url.pathname === "/api/payments/sumup-checkout") {
      const input = await readBody(request);
      const order = database.orders.find((item) => item.id === input.orderId);
      if (!order) return send(response, 404, { error: "Commande introuvable" });
      const customer = authenticatedCustomer(request, database);
      if (!customer || customer.id !== order.customerId) return send(response, 401, { error: "Reconnecte-toi pour payer cette commande." });
      if (order.status === "cancelled") return send(response, 409, { code: "ORDER_CANCELLED", error: "Cette commande est annulée. Aucun nouveau paiement ne sera ouvert." });
      if (order.payment?.status === "PAID") return send(response, 200, { order, payment: order.payment, customer });
      if (order.status !== "awaiting_payment") return send(response, 409, { error: "Cette commande n’est plus en attente de paiement." });
      const closureReason = serviceClosureReason(order.serviceDate, order.slot, order.method, database) || (!slotsForDate(order.serviceDate, order.method, database).includes(order.slot) ? "Ce créneau n’est plus proposé. Choisis un autre horaire." : null);
      if (closureReason) return send(response, 409, { code: "SERVICE_CLOSED", error: closureReason });
      assertStoredOrderAvailable(order.items, await productStockStore.read());
      const checkoutExpiresAt = new Date(new Date(order.createdAt).getTime() + PENDING_RESERVATION_MS);
      if (!Number.isFinite(checkoutExpiresAt.getTime()) || checkoutExpiresAt.getTime() <= Date.now()) {
        return send(response, 409, { code: "ORDER_EXPIRED", error: "La réservation de ce créneau a expiré. Recommence la commande pour choisir un créneau disponible." });
      }
      const merchantCode = await getSumUpMerchantCode();
      if (!sumupApiKey || !merchantCode || !sumupReturnUrl || !sumupRedirectUrl) return send(response, 503, { error: "SumUp n’est pas encore configuré sur le serveur." });

      assertStoredOrderAvailable(order.items, await productStockStore.read());
      await openPayment(order, database, { merchantCode, expiresAt: checkoutExpiresAt, description: `Commande Bibou's Burgers #${order.number}`, prefix: "bibous" });
      const confirmation = finalizePaidOrder(order, database);
      await writeDatabase(database);
      return send(response, 201, { order, payment: order.payment, checkoutId: order.payment.checkoutId, checkoutUrl: order.payment.checkoutUrl || null, customer: confirmation?.customer || null, pointsAdded: confirmation?.pointsAdded || 0, referralPointsAdded: confirmation?.referralPointsAdded || 0 });
    }

    if (["GET", "POST"].includes(request.method) && url.pathname === "/api/payments/sumup-return") {
      const notification = request.method === "POST" ? await readBody(request) : Object.fromEntries(url.searchParams);
      if (notification.event_type && notification.event_type !== "CHECKOUT_STATUS_CHANGED") return send(response, 204, {});
      const checkoutId = notification.checkout_id || notification.checkoutId || notification.id;
      if (typeof checkoutId !== "string" || !checkoutId) return send(response, 400, { error: "Identifiant de paiement requis." });
      let order = database.orders.find((item) => item.payment?.checkoutId === checkoutId);
      let bibouPlusPurchase = database.bibouPlusPurchases.find((item) => item.payment?.checkoutId === checkoutId);
      if (!order && !bibouPlusPurchase) {
        const checkout = await sumupRequest(`checkouts/${encodeURIComponent(checkoutId)}`);
        const matches = item => !item.payment?.checkoutId && item.payment?.checkoutReference && item.payment.checkoutReference === checkout.checkout_reference;
        order = database.orders.find(matches);
        bibouPlusPurchase = database.bibouPlusPurchases.find(matches);
        const record = order || bibouPlusPurchase;
        if (record) applyVerifiedCheckout(record, checkout, record.payment.merchantCode || await getSumUpMerchantCode());
      }
      if (order) {
        await refreshPayment(order);
        finalizePaidOrder(order, database);
        await writeDatabase(database);
      }
      if (bibouPlusPurchase) {
        await refreshPayment(bibouPlusPurchase);
        finalizePaidBibouPlusPurchase(bibouPlusPurchase, database);
        await writeDatabase(database);
      }
      // Unknown IDs can be retried after a checkout creation response is lost.
      if (!order && !bibouPlusPurchase) return send(response, 503, { error: "Paiement pas encore associé." });
      return send(response, 204, {});
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/payments/sumup-checkout/")) {
      const order = database.orders.find((item) => item.id === url.pathname.split("/").pop());
      if (!order?.payment?.checkoutReference) return send(response, 404, { error: "Paiement introuvable" });
      const customer = authenticatedCustomer(request, database);
      if (!customer || customer.id !== order.customerId) return send(response, 401, { error: "Reconnecte-toi pour vérifier ce paiement." });
      await refreshPayment(order);
      const confirmation = finalizePaidOrder(order, database);
      await writeDatabase(database);
      return send(response, 200, { order, payment: order.payment, customer: confirmation?.customer || null, pointsAdded: confirmation?.pointsAdded || 0, referralPointsAdded: confirmation?.referralPointsAdded || 0 });
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/orders/")) {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      const input = await readBody(request);
      const order = database.orders.find((item) => item.id === url.pathname.split("/").pop());
      if (!order) return send(response, 404, { error: "Commande introuvable" });
      if (order.payment?.status !== "PAID") return send(response, 409, { error: "Le paiement doit être confirmé avant de traiter la commande." });
      if (!allowedStatuses.includes(input.status)) return send(response, 400, { error: "Statut invalide" });
      assertOrderTransition(order, input.status);
      const previousStatus = order.status;
      if (input.status === "cancelled" && order.status !== "cancelled" && order.amendment) amendments.cancel(order, "cancelled");
      order.status = input.status;
      order.updatedAt = new Date().toISOString();
      revokeLoyaltyForCancelledOrder(order, database);
      push.queueServiceNotification(database, order, 'order', previousStatus, pushConfig);
      await writeDatabase(database);
      return send(response, 200, { order });
    }

    return send(response, 404, { error: "Route introuvable" });
  } catch (error) {
    console.error(error);
    if ([400, 404, 408, 409, 413, 429, 502, 503].includes(error.statusCode)) return send(response, error.statusCode, { error: error.message });
    return send(response, error.message === "Invalid JSON" ? 400 : 500, { error: "Une erreur serveur est survenue." });
  } finally {
    releaseDatabase?.();
  }
});

let syncingUber = false;
const syncUberDeliveries = async () => {
 if(syncingUber || !uber.configured(uberConfig))return;
 syncingUber=true;
 try {
  const release=await acquireDatabase();let ids;
  try{const db=await readDatabase();ids=db.orders.filter(o=>o.uberDirect?.deliveryId && !['delivered','returned','canceled'].includes(o.uberDirect.status)).map(o=>({id:o.id,deliveryId:o.uberDirect.deliveryId}));}finally{release();}
  for(const entry of ids.slice(0,50)){
   try{
    const data=await uberClient.get(entry.deliveryId),unlock=await acquireDatabase();
    try{const db=await readDatabase(),order=db.orders.find(o=>o.id===entry.id);if(order){const previous=order.status;uber.applyDelivery(order,data,uberConfig);push.queueServiceNotification(db,order,'order',previous,pushConfig);await writeDatabase(db);}}finally{unlock();}
   }catch{/* A missed provider update never changes an order or dispatches another courier. */}
  }
 }finally{syncingUber=false;}
};
const uberTimer=setInterval(()=>void syncUberDeliveries(),60000);uberTimer.unref();server.on('close',()=>clearInterval(uberTimer));

const amendmentTimer = setInterval(async () => {
  const release = await acquireDatabase();
  try { const database = await readDatabase(); if (expireAmendments(database)) await writeDatabase(database); }
  catch { console.error('Expiration des propositions : nouvelle tentative dans 30 secondes.'); }
  finally { release(); }
}, 30000);
amendmentTimer.unref();
server.on('close', () => clearInterval(amendmentTimer));

const stopBackups = backupStore.start({ onError: (message) => console.error(`Sauvegarde : ${message}`), onSuccess: (createdAt) => console.log(`Sauvegarde automatique vérifiée : ${createdAt}`) });
server.on("close", stopBackups);
const pushWorker = push.createPushWorker({ config: pushConfig, transact: async task => {
  const release = await acquireDatabase();
  try {
    const database = await readDatabase();
    const before = JSON.stringify(database.pushNotifications);
    const result = task(database);
    if (JSON.stringify(database.pushNotifications) !== before) await writeDatabase(database);
    return result;
  } finally { release(); }
} });
const tickPush = () => pushWorker.tick().catch(() => console.error('Notifications : traitement indisponible, nouvelle tentative automatique.'));
// No outgoing network request is possible without the explicit server-side activation flags.
const pushTimer = setInterval(tickPush, pushConfig.enabled ? 15000 : 60 * 60000);
pushTimer.unref();
server.once('listening', tickPush);
server.on('close', () => clearInterval(pushTimer));
const maintainContestPrivacy = async () => {
  const release = await acquireDatabase();
  try { const database = await readDatabase(); if (purgeExpiredContestEntries(database)) await writeDatabase(database); }
  catch { console.error('Entretien des données du concours : échec, nouvelle tentative dans une heure.'); }
  finally { release(); }
};
const contestPrivacyTimer = setInterval(maintainContestPrivacy, 60 * 60 * 1000);
contestPrivacyTimer.unref();
server.once('listening', maintainContestPrivacy);
server.on('close', () => clearInterval(contestPrivacyTimer));
const cleanupOwnerTestAccounts = async () => {
  const release = await acquireDatabase();
  try {
    const database = await readDatabase();
    const removed = removeAuthorizedOwnerTestAccounts(database);
    if (removed.length) { await writeDatabase(database); console.log(`${removed.length} compte(s) d’essai du propriétaire supprimé(s) et anonymisé(s).`); }
  } catch { console.error('Suppression ponctuelle des comptes d’essai : échec.'); }
  finally { release(); }
};
server.once('listening', cleanupOwnerTestAccounts);
// Persistent eligibility/deduplication under the same lock as checkout. No network call.
const tickCrm = async () => {
  const release = await acquireDatabase();
  try {
    const database = await readDatabase();
    if (!database.crm?.settings.enabled) return;
    crm.evaluate(database,pushConfig);
    await writeDatabase(database);
  } catch { console.error('CRM : évaluation indisponible, nouvel essai dans 15 minutes.'); }
  finally { release(); }
};
const crmTimer = setInterval(tickCrm, 15*60000);
crmTimer.unref();
server.once('listening', tickCrm);
server.on('close', () => clearInterval(crmTimer));
// Single instance + persistent disk, like the order database. At most one SMS per 1.1s.
if (keyyo.configured(keyyoConfig)) {
  const keyyoWorker = setInterval(() => keyyoSms.tick().catch(() => console.error('Keyyo SMS: traitement indisponible.')), 1100);
  keyyoWorker.unref();
  server.once('close', () => clearInterval(keyyoWorker));
}
server.listen(port, () => console.log(`Bibou's Burgers API démarrée sur http://localhost:${server.address().port}`));
