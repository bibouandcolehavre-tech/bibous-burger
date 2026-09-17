const http = require("node:http");
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

const ensureDatabase = async () => {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  try { await fs.access(databasePath); } catch { await fs.copyFile(seedDatabasePath, databasePath); }
};
const readDatabase = async () => { await ensureDatabase(); return JSON.parse(await fs.readFile(databasePath, "utf8")); };
const writeDatabase = async (database) => { await ensureDatabase(); return fs.writeFile(databasePath, `${JSON.stringify(database, null, 2)}\n`); };
const send = (response, status, payload) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
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

const getSumUpMerchantCode = async () => {
  if (sumupMerchantCode) return sumupMerchantCode;
  if (!sumupApiKey) return null;
  const response = await fetch("https://api.sumup.com/v0.1/me", { headers: { "Authorization": `Bearer ${sumupApiKey}` } });
  if (!response.ok) return null;
  const merchant = await response.json();
  return merchant.merchant_code || merchant.merchant?.merchant_code || merchant.merchant_profile?.merchant_code || merchant.merchant?.merchant_profile?.merchant_code || null;
};

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") return send(response, 200, { ok: true, service: "Bibou's Burger API" });

    if (request.method === "GET" && url.pathname === "/api/integrations/sumup/status") {
      const merchantCode = await getSumUpMerchantCode();
      return send(response, 200, { configured: Boolean(sumupApiKey), authenticated: Boolean(merchantCode), checkoutReady: Boolean(sumupApiKey && merchantCode && sumupReturnUrl && sumupRedirectUrl) });
    }

    const database = await readDatabase();

    if (request.method === "GET" && url.pathname === "/api/orders") {
      const status = url.searchParams.get("status");
      const orders = status ? database.orders.filter((order) => order.status === status) : database.orders;
      return send(response, 200, { orders });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard/summary") {
      const activeOrders = database.orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
      return send(response, 200, {
        activeOrders: activeOrders.length,
        newOrders: activeOrders.filter((order) => order.status === "confirmed").length,
        readyOrders: activeOrders.filter((order) => order.status === "ready").length,
        serviceRevenue: database.orders.filter((order) => order.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((sum, order) => sum + order.total, 0)
      });
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
      const distanceKm = Number(input.distanceKm);
      const deliveryFee = input.method === "delivery" ? deliveryFeeForDistance(distanceKm) : 0;
      if (input.method === "delivery" && deliveryFee === null) return send(response, 400, { error: "L’adresse est hors de la zone de livraison de 5 km." });
      const order = { id: `order-${database.nextOrderNumber}`, number: database.nextOrderNumber++, customerId: customer.id, customerName: customer.name, items: input.items.map((item) => ({ name: String(item.name), quantity: Number(item.quantity || 1), price: Number(item.price || 0) })), subtotal, deliveryFee, total: subtotal + deliveryFee, method: input.method, slot: input.slot, status: "confirmed", createdAt: new Date().toISOString() };
      database.orders.unshift(order);
      customer.weeklyOrders += 1;
      const multiplier = Math.min(customer.weeklyOrders, 3);
      customer.points += 20 * multiplier;
      await writeDatabase(database);
      return send(response, 201, { order, customer, pointsAdded: 20 * multiplier });
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
        body: JSON.stringify({ checkout_reference: checkoutReference, amount: order.total, currency: "EUR", merchant_code: merchantCode, description: `Commande Bibou's Burger #${order.number}`, return_url: sumupReturnUrl, redirect_url: sumupRedirectUrl, hosted_checkout: { enabled: true } })
      });
      if (!sumupResponse.ok) {
        console.error("SumUp checkout creation failed", sumupResponse.status);
        return send(response, 502, { error: "SumUp n’a pas pu créer le paiement." });
      }
      const checkout = await sumupResponse.json();
      order.payment = { provider: "sumup", checkoutId: checkout.id, checkoutReference, status: checkout.status || "pending", createdAt: new Date().toISOString() };
      await writeDatabase(database);
      return send(response, 201, { checkoutId: checkout.id, checkoutUrl: checkout.hosted_checkout_url || null });
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
          await writeDatabase(database);
        }
      }
      return send(response, 200, { ok: true });
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/orders/")) {
      const input = await readBody(request);
      const order = database.orders.find((item) => item.id === url.pathname.split("/").pop());
      if (!order) return send(response, 404, { error: "Commande introuvable" });
      if (!allowedStatuses.includes(input.status)) return send(response, 400, { error: "Statut invalide" });
      order.status = input.status;
      order.updatedAt = new Date().toISOString();
      await writeDatabase(database);
      return send(response, 200, { order });
    }

    return send(response, 404, { error: "Route introuvable" });
  } catch (error) {
    console.error(error);
    return send(response, error.message === "Invalid JSON" ? 400 : 500, { error: "Une erreur serveur est survenue." });
  }
});

server.listen(port, () => console.log(`Bibou's Burger API démarrée sur http://localhost:${port}`));
