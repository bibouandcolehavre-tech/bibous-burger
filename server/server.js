const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

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
const seedDatabasePath = path.join(__dirname, "data.json");
const databasePath = process.env.DATA_FILE_PATH || seedDatabasePath;
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
const googlePlaceId = process.env.GOOGLE_PLACE_ID || "ChIJY7WCDKSOcUgRyRRQzkp0rLs";
const googlePlaceSearchQuery = "Bibou's Burgers, 153 Quai Georges V, 76600 Le Havre, France";
const restaurantAddress = "153 Quai Georges V, 76600 Le Havre, France";
const smsAttempts = new Map();
const sessions = new Map();
const dashboardSessions = new Map();
let googleReviewsCache = { value: null, expiresAt: 0 };

const fetchGooglePlaceDetails = (placeId) => fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
  headers: { "X-Goog-Api-Key": googleMapsApiKey, "X-Goog-FieldMask": "displayName,rating,userRatingCount,reviews" }
});

const findGooglePlaceId = async () => {
  const searchResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleMapsApiKey, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({ textQuery: googlePlaceSearchQuery })
  });
  if (!searchResponse.ok) return null;
  const result = await searchResponse.json();
  return result.places?.[0]?.id || null;
};

const ensureDatabase = async () => {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  try { await fs.access(databasePath); } catch { await fs.copyFile(seedDatabasePath, databasePath); }
};
const readDatabase = async () => { await ensureDatabase(); return JSON.parse(await fs.readFile(databasePath, "utf8")); };
const writeDatabase = async (database) => { await ensureDatabase(); return fs.writeFile(databasePath, `${JSON.stringify(database, null, 2)}\n`); };
const send = (response, status, payload) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
  response.end(JSON.stringify(payload));
};

const readBody = (request) => new Promise((resolve, reject) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) reject(new Error("Payload too large"));
  });
  request.on("end", () => {
    try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); }
  });
  request.on("error", reject);
});

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
const createSession = (customerId) => {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { customerId, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  return token;
};
const authenticatedCustomer = (request, database) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
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
  const response = await fetch("https://api.sumup.com/v0.1/me", { headers: { "Authorization": `Bearer ${sumupApiKey}` } });
  if (!response.ok) return null;
  const merchant = await response.json();
  return merchant.merchant_code || merchant.merchant?.merchant_code || merchant.merchant_profile?.merchant_code || merchant.merchant?.merchant_profile?.merchant_code || null;
};

const paidOrders = (database) => database.orders.filter((order) => order.payment?.status === "PAID");
const finalizePaidOrder = (order, database) => {
  if (order.payment?.status !== "PAID") return null;

  const now = new Date().toISOString();
  order.payment.paidAt ||= now;
  if (order.status === "awaiting_payment") {
    order.status = "confirmed";
    order.updatedAt = now;
  }

  const customer = database.customers.find((item) => item.id === order.customerId);
  if (!customer) return null;
  if (order.loyaltyGrantedAt) return { customer, pointsAdded: order.loyaltyPointsAdded || 0 };

  customer.weeklyOrders += 1;
  const pointsAdded = 20 * Math.min(customer.weeklyOrders, 3);
  customer.points += pointsAdded;
  order.loyaltyGrantedAt = now;
  order.loyaltyPointsAdded = pointsAdded;
  return { customer, pointsAdded };
};

const revokeLoyaltyForCancelledOrder = (order, database) => {
  if (order.status !== "cancelled" || !order.loyaltyGrantedAt || order.loyaltyRevokedAt) return false;
  const customer = database.customers.find((item) => item.id === order.customerId);
  if (customer) {
    customer.points = Math.max(0, customer.points - Number(order.loyaltyPointsAdded || 0));
    customer.weeklyOrders = Math.max(0, customer.weeklyOrders - 1);
  }
  order.loyaltyRevokedAt = new Date().toISOString();
  return true;
};
const reconcileCancelledLoyalty = (database) => database.orders.reduce((changed, order) => revokeLoyaltyForCancelledOrder(order, database) || changed, false);

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") return send(response, 200, { ok: true, service: "Bibou's Burgers API" });

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
        reviews: (place.reviews || []).slice(0, 5).map((review) => ({ author: review.authorAttribution?.displayName || "Client Google", rating: review.rating, text: review.text?.text || "", publishedAt: review.publishTime || null }))
      };
      googleReviewsCache = { value: payload, expiresAt: Date.now() + 1000 * 60 * 60 * 6 };
      return send(response, 200, payload);
    }

    if (request.method === "POST" && url.pathname === "/api/delivery-quote") {
      const input = await readBody(request);
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
      const { password } = await readBody(request);
      if (!restaurantDashboardPassword) return send(response, 503, { error: "L’accès restaurant n’est pas encore configuré." });
      if (!passwordsMatch(password, restaurantDashboardPassword)) return send(response, 401, { error: "Mot de passe incorrect." });
      const token = crypto.randomBytes(32).toString("base64url");
      dashboardSessions.set(token, { expiresAt: Date.now() + 1000 * 60 * 60 * 12 });
      return send(response, 200, { token });
    }

    const database = await readDatabase();

    if (request.method === "POST" && url.pathname === "/api/auth/sms/start") {
      const { phone } = await readBody(request);
      const normalizedPhone = normalizeFrenchPhone(phone);
      if (!normalizedPhone) return send(response, 400, { error: "Saisissez un numéro français commençant par 06 ou 07." });
      if (!twilioConfigured()) return send(response, 503, { error: "La connexion par SMS n’est pas encore activée." });
      const attempt = smsAttempts.get(normalizedPhone) || { count: 0, startedAt: Date.now() };
      if (Date.now() - attempt.startedAt > 15 * 60 * 1000) { attempt.count = 0; attempt.startedAt = Date.now(); }
      if (attempt.count >= 3) return send(response, 429, { error: "Trop de tentatives. Réessayez dans quelques minutes." });
      attempt.count += 1;
      smsAttempts.set(normalizedPhone, attempt);
      const { response: twilioResponse, payload } = await verifyWithTwilio("Verifications", { To: normalizedPhone, Channel: "sms" });
      if (!twilioResponse.ok) return send(response, 502, { error: payload.message || "Le SMS n’a pas pu être envoyé." });
      return send(response, 200, { ok: true, phone: normalizedPhone });
    }

    if (request.method === "POST" && url.pathname === "/api/auth/sms/check") {
      const { phone, code } = await readBody(request);
      const normalizedPhone = normalizeFrenchPhone(phone);
      if (!normalizedPhone || !/^\d{4,10}$/.test(String(code || ""))) return send(response, 400, { error: "Le numéro ou le code est invalide." });
      if (!twilioConfigured()) return send(response, 503, { error: "La connexion par SMS n’est pas encore activée." });
      const { response: twilioResponse, payload } = await verifyWithTwilio("VerificationCheck", { To: normalizedPhone, Code: String(code) });
      if (!twilioResponse.ok || payload.status !== "approved") return send(response, 401, { error: "Le code est incorrect ou a expiré." });
      let customer = database.customers.find((item) => normalizeFrenchPhone(item.phone) === normalizedPhone);
      if (!customer) {
        customer = { id: `customer-${database.nextCustomerId++}`, name: "", phone: normalizedPhone, address: "", postalCode: "", city: "Le Havre", points: 0, weeklyOrders: 0, createdAt: new Date().toISOString() };
        database.customers.push(customer);
        await writeDatabase(database);
      }
      return send(response, 200, { token: createSession(customer.id), customer });
    }

    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const customer = authenticatedCustomer(request, database);
      return customer ? send(response, 200, { customer }) : send(response, 401, { error: "Session expirée." });
    }

    if (request.method === "GET" && url.pathname === "/api/customer/orders") {
      const customer = authenticatedCustomer(request, database);
      if (!customer) return send(response, 401, { error: "Session expirée." });
      return send(response, 200, { orders: paidOrders(database).filter((order) => order.customerId === customer.id) });
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
      return send(response, 200, {
        activeOrders: activeOrders.length,
        newOrders: activeOrders.filter((order) => order.status === "confirmed").length,
        readyOrders: activeOrders.filter((order) => order.status === "ready").length,
        serviceRevenue: confirmedOrders.filter((order) => order.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((sum, order) => sum + order.total, 0)
      });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/orders") {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      if (reconcileCancelledLoyalty(database)) await writeDatabase(database);
      return send(response, 200, { orders: paidOrders(database) });
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/dashboard/orders/")) {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      const input = await readBody(request);
      const order = database.orders.find((item) => item.id === url.pathname.split("/").pop());
      if (!order) return send(response, 404, { error: "Commande introuvable" });
      if (order.payment?.status !== "PAID") return send(response, 409, { error: "Le paiement doit être confirmé avant de traiter la commande." });
      if (!allowedStatuses.includes(input.status)) return send(response, 400, { error: "Statut invalide" });
      order.status = input.status;
      order.updatedAt = new Date().toISOString();
      revokeLoyaltyForCancelledOrder(order, database);
      await writeDatabase(database);
      return send(response, 200, { order });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/customers/")) {
      const customer = database.customers.find((item) => item.id === url.pathname.split("/").pop());
      return customer ? send(response, 200, { customer }) : send(response, 404, { error: "Client introuvable" });
    }

    if (request.method === "POST" && url.pathname === "/api/customers") {
      const input = await readBody(request);
      if (!input.name || !input.phone) return send(response, 400, { error: "Le nom et le téléphone sont requis." });
      const customer = { id: `customer-${database.nextCustomerId++}`, name: input.name.trim(), phone: input.phone.trim(), address: input.address?.trim() || "", postalCode: input.postalCode?.trim() || "", city: input.city?.trim() || "Le Havre", points: 0, weeklyOrders: 0, createdAt: new Date().toISOString() };
      database.customers.push(customer);
      await writeDatabase(database);
      return send(response, 201, { customer });
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/customers/")) {
      const input = await readBody(request);
      const customer = database.customers.find((item) => item.id === url.pathname.split("/").pop());
      if (!customer) return send(response, 404, { error: "Client introuvable" });
      ["name", "phone", "address", "postalCode", "city"].forEach((field) => {
        if (typeof input[field] === "string") customer[field] = input[field].trim();
      });
      await writeDatabase(database);
      return send(response, 200, { customer });
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      const input = await readBody(request);
      const customer = database.customers.find((item) => item.id === input.customerId);
      if (!customer || !Array.isArray(input.items) || !input.items.length || !["delivery", "pickup"].includes(input.method) || !input.slot) return send(response, 400, { error: "Informations de commande incomplètes." });
      const subtotal = input.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
      let distanceKm = 0;
      let deliveryFee = 0;
      if (input.method === "delivery") {
        try {
          const quote = await calculateDeliveryQuote(customer);
          distanceKm = quote.distanceKm;
          deliveryFee = quote.deliveryFee;
        } catch (error) {
          return send(response, 422, { error: error.message || "Impossible de calculer la livraison." });
        }
      }
      if (input.method === "delivery" && deliveryFee === null) return send(response, 400, { error: "L’adresse est hors de la zone de livraison de 5 km." });
      const order = { id: `order-${database.nextOrderNumber}`, number: database.nextOrderNumber++, customerId: customer.id, customerName: customer.name, items: input.items.map((item) => ({ name: String(item.name), quantity: Number(item.quantity || 1), price: Number(item.price || 0) })), subtotal, deliveryFee, total: subtotal + deliveryFee, method: input.method, slot: input.slot, status: "awaiting_payment", createdAt: new Date().toISOString() };
      database.orders.unshift(order);
      await writeDatabase(database);
      return send(response, 201, { order });
    }

    if (request.method === "POST" && url.pathname === "/api/payments/sumup-checkout") {
      const input = await readBody(request);
      const order = database.orders.find((item) => item.id === input.orderId);
      if (!order) return send(response, 404, { error: "Commande introuvable" });
      const merchantCode = await getSumUpMerchantCode();
      if (!sumupApiKey || !merchantCode || !sumupReturnUrl || !sumupRedirectUrl) return send(response, 503, { error: "SumUp n’est pas encore configuré sur le serveur." });

      const checkoutReference = `bibous-${order.number}-${Date.now()}`;
      const sumupResponse = await fetch("https://api.sumup.com/v0.1/checkouts", {
        method: "POST",
        headers: { "Authorization": `Bearer ${sumupApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ checkout_reference: checkoutReference, amount: order.total, currency: "EUR", merchant_code: merchantCode, description: `Commande Bibou's Burgers #${order.number}`, return_url: sumupReturnUrl, redirect_url: sumupRedirectUrl, hosted_checkout: { enabled: true } })
      });
      if (!sumupResponse.ok) {
        console.error("SumUp checkout creation failed", sumupResponse.status);
        return send(response, 502, { error: "SumUp n’a pas pu créer le paiement." });
      }
      const checkout = await sumupResponse.json();
      order.payment = { provider: "sumup", checkoutId: checkout.id, checkoutReference, status: checkout.status || "pending", createdAt: new Date().toISOString() };
      const confirmation = finalizePaidOrder(order, database);
      await writeDatabase(database);
      return send(response, 201, { checkoutId: checkout.id, checkoutUrl: checkout.hosted_checkout_url || null, customer: confirmation?.customer || null, pointsAdded: confirmation?.pointsAdded || 0 });
    }

    if (["GET", "POST"].includes(request.method) && url.pathname === "/api/payments/sumup-return") {
      const notification = request.method === "POST" ? await readBody(request) : Object.fromEntries(url.searchParams);
      const checkoutId = notification.checkout_id || notification.checkoutId || notification.id;
      const order = database.orders.find((item) => item.payment?.checkoutId === checkoutId);
      if (order && sumupApiKey) {
        const sumupResponse = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkoutId}`, { headers: { "Authorization": `Bearer ${sumupApiKey}` } });
        if (sumupResponse.ok) {
          const checkout = await sumupResponse.json();
          order.payment.status = checkout.status || order.payment.status;
          order.payment.updatedAt = new Date().toISOString();
          if (checkout.status === "PAID") order.payment.paidAt = new Date().toISOString();
          finalizePaidOrder(order, database);
          await writeDatabase(database);
        }
      }
      return send(response, 200, { ok: true });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/payments/sumup-checkout/")) {
      const order = database.orders.find((item) => item.id === url.pathname.split("/").pop());
      if (!order?.payment?.checkoutId) return send(response, 404, { error: "Paiement introuvable" });
      let confirmation = null;
      if (sumupApiKey) {
        const sumupResponse = await fetch(`https://api.sumup.com/v0.1/checkouts/${order.payment.checkoutId}`, { headers: { "Authorization": `Bearer ${sumupApiKey}` } });
        if (sumupResponse.ok) {
          const checkout = await sumupResponse.json();
          order.payment.status = checkout.status || order.payment.status;
          order.payment.updatedAt = new Date().toISOString();
          if (checkout.status === "PAID") order.payment.paidAt = new Date().toISOString();
          confirmation = finalizePaidOrder(order, database);
          await writeDatabase(database);
        }
      }
      return send(response, 200, { order, payment: order.payment, customer: confirmation?.customer || null, pointsAdded: confirmation?.pointsAdded || 0 });
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/orders/")) {
      if (!authenticatedDashboard(request)) return send(response, 401, { error: "Accès restaurant requis." });
      const input = await readBody(request);
      const order = database.orders.find((item) => item.id === url.pathname.split("/").pop());
      if (!order) return send(response, 404, { error: "Commande introuvable" });
      if (order.payment?.status !== "PAID") return send(response, 409, { error: "Le paiement doit être confirmé avant de traiter la commande." });
      if (!allowedStatuses.includes(input.status)) return send(response, 400, { error: "Statut invalide" });
      order.status = input.status;
      order.updatedAt = new Date().toISOString();
      revokeLoyaltyForCancelledOrder(order, database);
      await writeDatabase(database);
      return send(response, 200, { order });
    }

    return send(response, 404, { error: "Route introuvable" });
  } catch (error) {
    console.error(error);
    return send(response, error.message === "Invalid JSON" ? 400 : 500, { error: "Une erreur serveur est survenue." });
  }
});

server.listen(port, () => console.log(`Bibou's Burgers API démarrée sur http://localhost:${port}`));
