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
