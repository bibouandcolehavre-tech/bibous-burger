const test = require("node:test");
const assert = require("node:assert/strict");
const { applySupportCredits } = require("./support-credits");

test("crédite une seule fois le compte support précisément identifié", () => {
  const database = { customers: [{ id: "target", name: "Maëva Exemple", phone: "+33600008684", points: 0 }, { id: "other", name: "Maëva Autre", phone: "+33600001234", points: 8 }] };
  assert.equal(applySupportCredits(database, new Date("2026-09-23T15:00:00Z")), true);
  assert.equal(database.customers[0].points, 15);
  assert.equal(database.customers[1].points, 8);
  assert.equal(database.loyaltyAdjustments.length, 1);
  assert.equal(applySupportCredits(database), false);
  assert.equal(database.customers[0].points, 15);
});
