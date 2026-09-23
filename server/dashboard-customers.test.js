const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PRESTIGES, listDashboardCustomers, dashboardCustomerDetail } = require("./dashboard-customers");
const { anonymizeCustomerAccount } = require("./account-deletion");
const now = new Date("2026-09-18T12:00:00Z");
const paid = (id, customerId, status = "delivered", total = 16.90) => ({ id, customerId, number: Number(id.replace(/\D/g, "")) || 1, subtotal: total, discount: 0, deliveryFee: 0, total, status, comment: "Sans oignons", items: [{ productId: "taurus", name: "Gros Lard", quantity: 1, price: total, options: [{ groupId: "salad", label: "Roquette", price: 0 }] }], payment: { status: "PAID", paidAt: now.toISOString(), checkoutUrl: "SECRET-PAYMENT" }, createdAt: now.toISOString(), method: "delivery" });
function fixture() {
  const a = { id: "a", name: "Hélène", phone: "+33601020304", points: 400, referralCode: "BIBOU-TEST", loyaltyWeekStart: "2026-09-14", weeklyOrders: 2, weeklyProgramPoints: 40, bibouPlusExpiresAt: "2026-09-20T12:00:00Z", address: "SECRET-ADDRESS" };
  const b = { id: "b", name: "Arnaud", phone: "+33600000001", points: 0, referredByCustomerId: "a", referralRewardGrantedAt: now.toISOString(), referralRewardOrderId: "order-1" };
  const c = { id: "c", name: "Sans commande", points: 200, referredByCustomerId: "a" };
  return { customers: [a, b, c], orders: [{ ...paid("order-1", "b"), referralRewardGrantedAt: now.toISOString(), referralSponsorCustomerId: "a" }, paid("order-2", "a"), paid("order-3", "a", "cancelled"), { ...paid("order-4", "a"), payment: { status: "PENDING" } }], rewardClaims: [{ customerId: "a", rewardId: "fries", status: "used", code: "USED" }, { customerId: "a", rewardId: "drink", status: "active", code: "REWARD-TEST" }] };
}

test("clients : statistiques exactes, uniquement commandes payées non annulées, aucun effet de bord", () => {
  const db = fixture();
  const before = JSON.stringify(db);
  const list = listDashboardCustomers(db, {}, now);
  assert.deepEqual(list.summary, { customers: 3, bibouPlus: 1, points: 600, validatedReferrals: 1 });
  assert.equal(list.customers[0].id, "a");
  assert.deepEqual(list.customers[0].orders, { count: 1, amount: 16.9, lastPaidAt: now.toISOString() });
  assert.deepEqual(list.customers[0].referrals, { invited: 2, validated: 1, pending: 1 });
  assert.equal(list.customers[0].weekly.multiplier, 2);
  assert.equal(JSON.stringify(db), before);
  assert.equal(JSON.stringify(list).includes("SECRET"), false);
});

test("clients : recherche avec accents, téléphone français, code, filtres et pagination bornée", () => {
  const db = fixture();
  for (const query of ["helene", "HELÈNE", "06 01 02 03 04", "+33 6 01 02 03 04", "0033601020304", "bibou-test"]) assert.equal(listDashboardCustomers(db, { query }, now).customers[0]?.id, "a", query);
  assert.equal(listDashboardCustomers(db, { query: "inconnu" }, now).total, 0);
  assert.deepEqual(listDashboardCustomers(db, { filter: "plus" }, now).customers.map((c) => c.id), ["a"]);
  assert.deepEqual(listDashboardCustomers(db, { filter: "sponsors" }, now).customers.map((c) => c.id), ["a"]);
  assert.equal(listDashboardCustomers(db, { offset: 99, limit: 1 }, now).offset, 2);
  assert.equal(listDashboardCustomers(db, { offset: -4, limit: 999 }, now).limit, 50);
  assert.equal(listDashboardCustomers(db, { offset: "no", limit: "no" }, now).offset, 0);
});

test("clients : paliers cohérents avec l’application et récompenses déjà réclamées", () => {
  const app = fs.readFileSync(path.join(__dirname, "../App.js"), "utf8");
  const clientLevels = vm.runInNewContext(app.match(/const PRESTIGE_LEVELS = (\[[\s\S]*?\]);/)[1]);
  assert.equal(JSON.stringify(PRESTIGES), JSON.stringify(clientLevels.map(({ level, points, name, metal }) => ({ level, points, name, metal }))));
  for (const [points, level] of [[0, 0], [199, 0], [200, 1], [400, 2], [700, 3], [1500, 4], [4999, 4], [5000, 5]]) {
    const db = fixture(); db.customers[0].points = points;
    const detail = dashboardCustomerDetail(db, "a", now);
    assert.equal(detail.customer.prestige?.level || 0, level);
    assert.equal(detail.rewards[0].status, "used");
    assert.equal(detail.rewards[0].code, null);
    assert.equal(detail.rewards[1].status, "active");
    assert.equal(detail.rewards[1].code, "REWARD-TEST");
  }
  const detail = dashboardCustomerDetail(fixture(), "a", now);
  assert.equal(detail.rewards[2].remainingPoints, 300);
  assert.equal(detail.recentOrders.length, 2);
  assert.ok(detail.recentOrders.some((order) => order.status === "cancelled"));
  assert.equal(detail.recentOrders[0].items[0].options[0].label, "Roquette");
  assert.equal(detail.recentOrders[0].comment, "Sans oignons");
  assert.equal(detail.favoriteProducts[0].name, "Menu · Gros Lard");
  assert.equal(detail.favoriteProducts[0].quantity, 1);
  assert.equal(JSON.stringify(detail).includes("SECRET"), false);
  assert.equal(dashboardCustomerDetail(fixture(), "missing", now), null);
});

test("clients : semaine expirée et abonnement expiré sans effacer les points", () => {
  const db = fixture();
  const later = new Date("2026-09-21T12:00:00Z");
  const detail = dashboardCustomerDetail(db, "a", later);
  assert.equal(detail.customer.points, 400);
  assert.deepEqual(detail.customer.weekly, { orders: 0, multiplier: 1, points: 0 });
  assert.equal(detail.customer.bibouPlus.active, false);
  assert.equal(db.customers[0].weeklyOrders, 2);
  assert.equal(db.customers[0].points, 400);
});

test("clients : parrainage annulé, impayé ou bonus révoqué non validé", () => {
  for (const change of [(o) => { o.status = "cancelled"; }, (o) => { o.payment.status = "PENDING"; }, (o) => { o.referralRewardRevokedAt = now.toISOString(); }, (o) => { o.referralSponsorCustomerId = "other"; }]) {
    const db = fixture(); change(db.orders[0]);
    assert.equal(listDashboardCustomers(db, {}, now).summary.validatedReferrals, 0);
    assert.equal(dashboardCustomerDetail(db, "a", now).customer.referrals.pending, 2);
  }
});

test("clients : comptes supprimés absents et historique payé conservé sans limite arbitraire", () => {
  const db = fixture();
  db.orders.push(...Array.from({ length: 15 }, (_, i) => paid(`order-${i + 10}`, "a")));
  assert.equal(dashboardCustomerDetail(db, "a", now).recentOrders.length, 17);
  anonymizeCustomerAccount(db, db.customers[1], now);
  assert.equal(listDashboardCustomers(db, {}, now).summary.customers, 2);
  assert.equal(listDashboardCustomers(db, {}, now).summary.validatedReferrals, 0);
  assert.equal(dashboardCustomerDetail(db, "b", now), null);
});
