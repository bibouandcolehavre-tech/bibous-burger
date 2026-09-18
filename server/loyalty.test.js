const test = require("node:test");
const assert = require("node:assert/strict");
const { grantLoyaltyForOrder, revokeLoyaltyForOrder } = require("./loyalty");

test("double les points d'une commande Bibou Plus", () => {
  const customer = { points: 100, weeklyOrders: 0, loyaltyWeekStart: "2026-09-14" };
  const order = { loyaltyBasePoints: 15 };
  const value = new Date("2026-09-18T12:00:00.000Z");

  const result = grantLoyaltyForOrder(customer, order, value, { bibouPlus: true });

  assert.equal(result.pointsAdded, 30);
  assert.equal(customer.points, 130);
  assert.equal(order.loyaltyBibouPlusMultiplier, 2);
  assert.equal(revokeLoyaltyForOrder(customer, order, value), true);
  assert.equal(customer.points, 100);
});

test("applique le barème burger puis menu avec le multiplicateur hebdomadaire", () => {
  const customer = { points: 0, weeklyOrders: 0, loyaltyWeekStart: "2026-09-14" };
  const value = new Date("2026-09-18T12:00:00.000Z");

  const burger = { loyaltyBasePoints: 10 };
  assert.equal(grantLoyaltyForOrder(customer, burger, value).pointsAdded, 10);

  const menu = { loyaltyBasePoints: 15 };
  assert.equal(grantLoyaltyForOrder(customer, menu, value).pointsAdded, 40);
  assert.equal(customer.weeklyProgramPoints, 50);
  assert.equal(customer.points, 50);
});

test("recalcule correctement la semaine si une ancienne commande est annulée", () => {
  const customer = { points: 0, weeklyOrders: 0, loyaltyWeekStart: "2026-09-14" };
  const value = new Date("2026-09-18T12:00:00.000Z");
  const firstBurger = { loyaltyBasePoints: 10 };
  const menu = { loyaltyBasePoints: 15 };
  const secondBurger = { loyaltyBasePoints: 10 };

  grantLoyaltyForOrder(customer, firstBurger, value);
  grantLoyaltyForOrder(customer, menu, value);
  grantLoyaltyForOrder(customer, secondBurger, value);
  assert.equal(customer.points, 105);

  assert.equal(revokeLoyaltyForOrder(customer, menu, value), true);
  assert.equal(customer.weeklyOrders, 2);
  assert.equal(customer.weeklyProgramPoints, 40);
  assert.equal(customer.points, 40);
});

test("ne donne aucun point à un produit explicitement hors barème", () => {
  const customer = { points: 0, weeklyOrders: 0, loyaltyWeekStart: "2026-09-14" };
  const order = { loyaltyBasePoints: 0 };
  const value = new Date("2026-09-18T12:00:00.000Z");

  assert.equal(grantLoyaltyForOrder(customer, order, value).pointsAdded, 0);
  assert.equal(customer.points, 0);
});
