const test = require("node:test");
const assert = require("node:assert/strict");
const {
  consumeWelcomeReward,
  grantWelcomeReward,
  restoreWelcomeReward,
  welcomeRewardAvailable,
} = require("./welcome-reward");

test("offre 10 % une seule fois à la création du compte", () => {
  const customer = { id: "customer-1" };
  const now = new Date("2026-09-18T08:00:00.000Z");
  assert.equal(grantWelcomeReward(customer, now), true);
  assert.equal(grantWelcomeReward(customer, now), false);
  assert.equal(customer.welcomeReward.discountRate, 0.1);
  assert.equal(welcomeRewardAvailable(customer, [], now), true);
});

test("réserve la récompense pendant le paiement puis la consomme", () => {
  const now = new Date("2026-09-18T08:00:00.000Z");
  const customer = { id: "customer-1" };
  grantWelcomeReward(customer, now);
  const order = { id: "order-1", customerId: customer.id, welcomeRewardApplied: true, status: "awaiting_payment", createdAt: now.toISOString() };
  assert.equal(welcomeRewardAvailable(customer, [order], now), false);
  assert.equal(consumeWelcomeReward(customer, order, now), true);
  assert.equal(customer.welcomeReward.status, "used");
});

test("rend les 10 % si la commande associée est annulée", () => {
  const customer = { id: "customer-1" };
  grantWelcomeReward(customer);
  const order = { id: "order-1", welcomeRewardApplied: true };
  consumeWelcomeReward(customer, order);
  assert.equal(restoreWelcomeReward(customer, order), true);
  assert.equal(customer.welcomeReward.status, "available");
});
