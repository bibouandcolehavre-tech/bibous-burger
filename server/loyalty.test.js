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

const advancePickup = (extra = {}) => ({
  method: "pickup", serviceDate: "2026-09-18", slot: "19:00",
  createdAt: "2026-09-18T16:30:00Z", pickupAdvanceBonusApplied: true,
  loyaltyBasePoints: 10, ...extra
});

test("retrait anticipé ×2, cumul Bibou + et semaine, retrait du bonus si annulé", () => {
  const customer = { points: 100, weeklyOrders: 0, loyaltyWeekStart: "2026-09-14" };
  const now = new Date("2026-09-18T17:00:00Z");
  const burger = advancePickup();
  const menu = advancePickup({ loyaltyBasePoints: 15 });
  assert.equal(grantLoyaltyForOrder(customer, burger, now).pointsAdded, 20);
  assert.equal(grantLoyaltyForOrder(customer, menu, now, { bibouPlus: true }).pointsAdded, 140);
  assert.equal(menu.loyaltyWeightedBasePoints, 60);
  assert.equal(customer.points, 260); // existing 100 + (20 + 60) × weekly 2
  assert.equal(grantLoyaltyForOrder(customer, menu, now, { bibouPlus: true }).pointsAdded, 0);
  assert.equal(revokeLoyaltyForOrder(customer, menu, now), true);
  assert.equal(customer.points, 120);
  assert.equal(revokeLoyaltyForOrder(customer, menu, now), false);
  assert.equal(grantLoyaltyForOrder(customer, menu, now).pointsAdded, 0);
});

test("pas de bonus anticipé pour livraison, retard, anciennes commandes ni hors barème", () => {
  const now = new Date("2026-09-18T17:00:00Z");
  for (const overrides of [{ method: "delivery" }, { createdAt: "2026-09-18T16:30:00.001Z" }, { pickupAdvanceBonusApplied: undefined }]) {
    const order = advancePickup(overrides);
    assert.equal(grantLoyaltyForOrder({ points: 0 }, order, now).pointsAdded, 10);
    assert.equal(order.loyaltyPickupMultiplier, 1);
  }
  assert.equal(grantLoyaltyForOrder({ points: 0 }, advancePickup({ loyaltyBasePoints: 0 }), now).pointsAdded, 0);
  assert.equal(grantLoyaltyForOrder({ points: 0 }, advancePickup({ status: "cancelled" }), now).pointsAdded, 0);
});
