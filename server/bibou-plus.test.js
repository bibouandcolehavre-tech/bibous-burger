const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BIBOU_PLUS_DURATION_MS,
  activateBibouPlus,
  bibouPlusOrderPricing,
  bibouPlusStatus,
  ensureBibouPlusStore,
} = require("./bibou-plus");

test("initialise le registre Bibou Plus sans toucher aux autres données", () => {
  const database = { customers: [], orders: [] };
  assert.equal(ensureBibouPlusStore(database), true);
  assert.deepEqual(database.bibouPlusPurchases, []);
  assert.equal(database.nextBibouPlusNumber, 1);
  assert.equal(ensureBibouPlusStore(database), false);
});

test("offre la livraison et applique exactement 5 % de remise", () => {
  assert.deepEqual(bibouPlusOrderPricing({ subtotal: 16.9, deliveryFee: 4.99, active: true }), {
    subtotal: 16.9,
    discountRate: 0.05,
    discount: 0.85,
    standardDeliveryFee: 4.99,
    deliveryFee: 0,
    total: 16.05,
  });
});

test("conserve le tarif normal sans Bibou Plus", () => {
  assert.deepEqual(bibouPlusOrderPricing({ subtotal: 16.9, deliveryFee: 4.99, active: false }), {
    subtotal: 16.9,
    discountRate: 0,
    discount: 0,
    standardDeliveryFee: 4.99,
    deliveryFee: 4.99,
    total: 21.89,
  });
});

test("préfère les 10 % de bienvenue aux 5 % Bibou Plus", () => {
  const pricing = bibouPlusOrderPricing({ subtotal: 16.9, deliveryFee: 5.99, active: true, discountRate: 0.1 });
  assert.equal(pricing.discount, 1.69);
  assert.equal(pricing.deliveryFee, 0);
  assert.equal(pricing.total, 15.21);
});

test("active trente jours et prolonge une période encore valable", () => {
  const now = new Date("2026-09-18T08:00:00.000Z");
  const customer = {};
  const firstPurchase = { payment: { status: "PAID" } };
  assert.equal(activateBibouPlus(customer, firstPurchase, now), true);
  assert.equal(new Date(customer.bibouPlusExpiresAt).getTime(), now.getTime() + BIBOU_PLUS_DURATION_MS);
  assert.equal(bibouPlusStatus(customer, now).active, true);
  assert.equal(activateBibouPlus(customer, firstPurchase, now), false);

  const secondPurchase = { payment: { status: "PAID" } };
  const previousExpiry = new Date(customer.bibouPlusExpiresAt).getTime();
  assert.equal(activateBibouPlus(customer, secondPurchase, now), true);
  assert.equal(new Date(customer.bibouPlusExpiresAt).getTime(), previousExpiry + BIBOU_PLUS_DURATION_MS);
});
