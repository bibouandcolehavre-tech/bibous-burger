const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const alerts = require("../restaurant-dashboard/alerts");
const { listDashboardCustomers, dashboardCustomerDetail } = require("./dashboard-customers");
const db = { customers: [{ id: "safe", name: '<img src=x onerror="bad()">', phone: "+33600000000", referralCode: "<script>bad()</script>", points: 199 }], orders: [] };
const result = (data, status = 200) => ({ status, ok: status === 200, json: async () => data });
async function harness() {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, { textContent: "", innerHTML: "", value: "", hidden: false, disabled: false, handlers: {}, classList: { toggle() {}, add() {}, remove() {} }, focus() { this.focused = true; }, setAttribute() {}, addEventListener(event, fn) { this.handlers[event] = fn; } });
    return elements.get(selector);
  };
  const context = vm.createContext({
    BibouAlerts: alerts, console, AbortController,
    document: { title: "", querySelector: element, querySelectorAll: () => [], addEventListener() {} }, navigator: { onLine: true },
    window: { location: { hostname: "localhost" }, setInterval() {}, setTimeout() {}, addEventListener() {} },
    sessionStorage: { getItem: () => "test-only", setItem() {}, removeItem() {} }, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 1, clearTimeout() {}, fetch: async () => result({ orders: [], reservations: [], claims: [] })
  });
  const run = (code) => vm.runInContext(code, context);
  run(fs.readFileSync(path.join(__dirname, "../restaurant-dashboard/app.js"), "utf8"));
  await run("refreshFeeds()");
  run('currentView = "customers"');
  return { context, run, element };
}

test("interface clients : contenu échappé, premier palier à 200, détail et recherche sans modification", async () => {
  const h = await harness();
  h.context.fetch = async () => result(listDashboardCustomers(db));
  await h.run("loadCustomers()");
  assert.match(h.element("#customer-list").innerHTML, /&lt;img/);
  assert.equal(h.element("#customer-list").innerHTML.includes("<img"), false);
  h.context.fetch = async () => result(dashboardCustomerDetail(db, "safe"));
  await h.run('loadCustomerDetail("safe", true)');
  assert.match(h.element("#customer-detail").innerHTML, /Encore 1 points/);
  assert.match(h.element("#customer-detail").innerHTML, /&lt;script&gt;/);
  assert.equal(h.element("#customer-detail").innerHTML.includes("<script>"), false);
  assert.equal(h.element("#customer-detail-title").focused, true);
  h.element("#customer-search").value = "autre";
  h.run("searchCustomers()");
  assert.match(h.element("#customer-detail").innerHTML, /Sélectionnez/);
});

test("interface clients : historique complet ouvrable, calcul et préférence produit", async () => {
  const h = await harness();
  const detailed = { customers: [{ ...db.customers[0], points: 15 }], orders: [{ id: "paid-1", number: 71, customerId: "safe", status: "delivered", method: "delivery", serviceDate: "2026-09-18", slot: "19:30", items: [{ productId: "taurus", name: "Gros Lard", quantity: 1, price: 16.9, options: [{ groupId: "sides", label: "Portion de frites maison ajoutée", price: 3.9 }] }], subtotal: 20.8, discount: 2.08, discountLabel: "Cadeau de bienvenue", discountRate: 0.1, standardDeliveryFee: 4.99, deliveryFee: 4.99, total: 23.71, loyaltyPointsAdded: 15, payment: { status: "PAID", paidAt: "2026-09-18T18:00:00Z" }, createdAt: "2026-09-18T18:00:00Z" }] };
  h.context.fetch = async () => result(dashboardCustomerDetail(detailed, "safe"));
  await h.run('loadCustomerDetail("safe")');
  const html = h.element("#customer-detail").innerHTML;
  assert.match(html, /Produits préférés/);
  assert.match(html, /Menu · Gros Lard/);
  assert.match(html, /<details class="customer-history-order">/);
  assert.match(html, /Portion de frites maison ajoutée/);
  assert.match(html, /Cadeau de bienvenue · −10 %/);
  assert.match(html, /Total débité par SumUp/);
  assert.match(html, /23,71 €/);
  assert.match(html, /\+ 15 points de fidélité/);
});

test("interface clients : réponse tardive ignorée après changement de recherche ou de session", async () => {
  const h = await harness();
  let resolve;
  h.context.fetch = () => new Promise((r) => { resolve = r; });
  const pending = h.run("loadCustomers()");
  h.run("searchCustomers()");
  resolve(result(listDashboardCustomers(db)));
  await pending;
  assert.equal(h.element("#customer-list").innerHTML, "");
  const detail = h.run('loadCustomerDetail("safe", true)');
  h.run('showLogin("Session terminée")');
  resolve(result(dashboardCustomerDetail(db, "safe")));
  await detail;
  assert.equal(h.element("#customer-detail").innerHTML.includes("199"), false);
  assert.equal(h.element("#customer-search").value, "");
  assert.equal(h.element("#customer-total").textContent, "—");
});

test("interface clients : erreurs réseau visibles, compte disparu et accès expiré", async () => {
  const h = await harness();
  h.context.fetch = async () => result({}, 503);
  await h.run("loadCustomers()");
  assert.match(h.element("#customer-feedback").textContent, /anciennes/);
  h.context.fetch = async () => result({}, 404);
  await h.run('loadCustomerDetail("safe")');
  assert.match(h.element("#customer-detail").innerHTML, /n’existe plus/);
  h.context.fetch = async () => result({}, 401);
  await h.run("loadCustomers()");
  assert.equal(h.element("#dashboard-app").hidden, true);
  assert.match(h.element("#login-error").textContent, /session a expiré/);
});


test("commandes : coordonnées échappées, choix verticaux et anciennes commandes explicites", async () => {
  const h = await harness();
  h.context.fixtureOrder = { id: 'order-test', number: 1, customerName: 'Test', customerPhone: '+33600000000', deliveryAddress: { address: '<img src=x onerror=bad()>', postalCode: '76600', city: 'Le Havre' }, comment: '<script>Sans oignons</script>', method: 'delivery', createdAt: new Date().toISOString(), status: 'confirmed', subtotal: 10, discount: 0, standardDeliveryFee: 0, deliveryFee: 0, total: 10, items: [{ name: 'Burger', quantity: 1, price: 10, options: [{ groupId: 'protein', label: 'Bœuf', price: 0 }, { groupId: 'salad', label: 'Roquette', price: 0 }, { groupId: 'salad', label: 'Tomate', price: 0 }, { groupId: 'sauces', label: '<script>bad()</script>', price: 0 }] }] };
  h.run('orders = [orderFromApi(fixtureOrder)]; renderOrders()');
  const html = h.element('#orders-list').innerHTML;
  assert.match(html, /Téléphone : \+33600000000/);
  assert.match(html, /76600 Le Havre/);
  assert.match(html, /&lt;img/);
  assert.match(html, /Crudités<\/div><ul[^>]*><li><span>Roquette<\/span><\/li><li><span>Tomate<\/span><\/li>/);
  assert.match(html, /Sauces<\/div><ul[^>]*><li><span>&lt;script&gt;/);
  assert.match(html, /<strong class="order-product-name">Burger<\/strong>/);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<img'), false);
  assert.match(html, /Total débité par SumUp/);
  assert.match(html, /Commentaire client/);
  assert.match(html, /&lt;script&gt;Sans oignons/);
  h.run('delete fixtureOrder.deliveryAddress; delete fixtureOrder.customerPhone; orders = [orderFromApi(fixtureOrder)]; renderOrders()');
  assert.match(h.element('#orders-list').innerHTML, /Adresse non enregistrée/);
  h.run('fixtureOrder.method = "pickup"; orders = [orderFromApi(fixtureOrder)]; renderOrders()');
  assert.equal(h.element('#orders-list').innerHTML.includes('Adresse de livraison'), false);
});

test("commandes : les commandes terminées ont un onglet et un détail ouvrable", async () => {
  const h = await harness();
  h.context.completedOrder = { id: "order-249", number: 249, customerName: "Alexandre", customerPhone: "+33600000000", method: "delivery", serviceDate: "2026-09-22", slot: "20:00", createdAt: "2026-09-22T18:00:00Z", status: "delivered", subtotal: 20.8, discount: 2.08, discountLabel: "Cadeau de bienvenue", discountRate: 0.1, standardDeliveryFee: 4.99, deliveryFee: 4.99, total: 23.71, items: [{ productId: "gros-lard-menu", name: "Le gros lard", quantity: 1, price: 20.8, options: [{ groupId: "drink", label: "Coca 33 cl", price: 0 }] }] };
  h.run("orders = [orderFromApi(completedOrder)]; filter = 'all'; renderOrders(); refreshMetrics()");
  assert.equal(h.element("#orders-list").innerHTML.includes("#249"), false);
  assert.equal(h.element("#completed-filter-count").textContent, 1);
  h.run("filter = 'Terminée'; renderOrders()");
  const html = h.element("#orders-list").innerHTML;
  assert.match(html, /<details class="order-card completed-order">/);
  assert.match(html, /#249 · Alexandre/);
  assert.match(html, /Ouvrir la commande/);
  assert.match(html, /Menu · Le gros lard/);
  assert.match(html, /Coca 33 cl/);
  assert.match(html, /23,71 €/);
  assert.equal(html.includes("data-action"), false);
});

test('panier en attente : préparation absente et remboursement dû visible même après annulation', async () => {
  const h = await harness();
  h.context.fixtureOrder = {id:'amendment-test',number:91,customerName:'Fictif',createdAt:new Date().toISOString(),status:'awaiting_customer',method:'pickup',total:3.6,items:[],amendment:{revision:1,status:'pending',expiresAt:new Date(Date.now()+600000).toISOString(),proposal:{reason:'<script>Indisponible</script>',items:[],total:1.8,refundAmount:1.8}}};
  h.run('orders = [orderFromApi(fixtureOrder)]; renderOrders()');
  let html = h.element('#orders-list').innerHTML;
  assert.match(html,/Préparation bloquée/);assert.match(html,/Réviser la proposition/);assert.match(html,/&lt;script&gt;/);
  assert.equal(html.includes('data-action="Acceptée"'),false);
  h.context.fixtureOrder.status='cancelled';h.context.fixtureOrder.amendment.status='refused';h.context.fixtureOrder.refund={amount:3.6,status:'due'};
  h.run('orders = [orderFromApi(fixtureOrder)]; renderOrders()');html=h.element('#orders-list').innerHTML;
  assert.match(html,/À rembourser dans SumUp/);assert.match(html,/Enregistrer un remboursement déjà effectué/);
});

test('commande offerte : code visible en service et dans la fiche client, aucun faux débit SumUp', async () => {
  const h = await harness();
  const gift = { id: 'gift-test', number: 92, customerId: 'safe', customerName: 'Test', createdAt: new Date().toISOString(), status: 'confirmed', method: 'delivery', subtotal: 20, discount: 20, discountRate: 1, discountLabel: 'Code promo CHORUS', standardDeliveryFee: 5.99, deliveryFee: 0, total: 0, items: [], payment: { status: 'PAID', provider: 'promotion', amount: 0 }, promotion: { code: 'CHORUS', discountPercent: 100, freeDelivery: true } };
  h.context.fixtureOrder = gift;
  h.run('orders = [orderFromApi(fixtureOrder)]; renderOrders()');
  const serviceHtml = h.element('#orders-list').innerHTML;
  h.context.fetch = async () => result(dashboardCustomerDetail({ ...db, orders: [gift] }, 'safe'));
  await h.run('loadCustomerDetail("safe")');
  for (const html of [serviceHtml, h.element('#customer-detail').innerHTML]) {
    assert.match(html, /Code promo CHORUS/);
    assert.match(html, /Commande offerte · aucun débit bancaire/);
    assert.match(html, /Livraison offerte par code promo/);
    assert.equal(html.includes('Total débité par SumUp'), false);
    assert.equal(html.includes('Économie livraison Bibou +'), false);
  }
});
