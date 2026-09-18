const test = require("node:test");
const assert = require("node:assert/strict");
const { claimReward, ensureRewardStore, rewardClaimsForCustomer, updateRewardClaimStatus } = require("./rewards");

const databaseWith = (customer) => ({ customers: [customer], rewardClaims: [], nextRewardClaimNumber: 1 });

test("initialise le registre des récompenses sans toucher aux points", () => {
  const database = {};
  assert.equal(ensureRewardStore(database), true);
  assert.deepEqual(database.rewardClaims, []);
  assert.equal(database.nextRewardClaimNumber, 1);
});

test("réclame un palier sans retirer les points cumulés", () => {
  const customer = { id: "customer-1", name: "Camille", points: 400 };
  const database = databaseWith(customer);
  const claim = claimReward(database, customer, "drink", new Date("2026-09-18T12:00:00.000Z"));

  assert.equal(customer.points, 400);
  assert.equal(claim.status, "active");
  assert.equal(claim.requiredPoints, 400);
  assert.match(claim.code, /^BIBOU-[A-F0-9]{6}$/);
  assert.equal(rewardClaimsForCustomer(database, customer.id).length, 1);
});

test("refuse un palier non atteint", () => {
  const customer = { id: "customer-1", points: 199 };
  const database = databaseWith(customer);
  assert.throws(() => claimReward(database, customer, "fries"), /Il faut 200 points/);
  assert.equal(customer.points, 199);
});

test("une récompense ne peut être réclamée qu'une seule fois", () => {
  const customer = { id: "customer-1", points: 5000 };
  const database = databaseWith(customer);
  claimReward(database, customer, "fries");
  assert.throws(() => claimReward(database, customer, "fries"), (error) => error.statusCode === 409);
});

test("le restaurant marque le code comme utilisé une seule fois", () => {
  const customer = { id: "customer-1", points: 700 };
  const database = databaseWith(customer);
  const claim = claimReward(database, customer, "discount-5");
  const used = updateRewardClaimStatus(database, claim.id, "used", new Date("2026-09-18T13:00:00.000Z"));
  assert.equal(used.status, "used");
  assert.equal(used.usedAt, "2026-09-18T13:00:00.000Z");
  assert.throws(() => updateRewardClaimStatus(database, claim.id, "cancelled"), (error) => error.statusCode === 409);
  assert.equal(customer.points, 700);
});
