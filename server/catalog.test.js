const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAndPriceOrderItems } = require("./catalog");

const requiredSelections = [
  { groupId: "protein", id: "viande" },
  { groupId: "salad", id: "roquette" },
  { groupId: "sauces", id: "mayo" }
];

test("prices a menu and supplements from the server catalog", () => {
  const result = validateAndPriceOrderItems([{ productId: "taurus", quantity: 1, price: 0.01, selections: [...requiredSelections, { groupId: "drink", id: "coca" }, { groupId: "extras", id: "second-steak" }] }]);
  assert.equal(result.subtotal, 19.9);
  assert.equal(result.items[0].price, 19.9);
  assert.equal(result.items[0].name, "Le Taurus");
});

test("rejects an unknown product, invalid option and missing required choice", () => {
  assert.throws(() => validateAndPriceOrderItems([{ productId: "fake", quantity: 1, selections: requiredSelections }]), /n’existe plus/);
  assert.throws(() => validateAndPriceOrderItems([{ productId: "classique", quantity: 1, selections: [...requiredSelections, { groupId: "extras", id: "fake" }] }]), /option/);
  assert.throws(() => validateAndPriceOrderItems([{ productId: "classique", quantity: 1, selections: [] }]), /choix requis/);
});

test("rejects unavailable products and incompatible exclusive choices", () => {
  assert.throws(() => validateAndPriceOrderItems([{ productId: "atlas-menu", quantity: 1, selections: requiredSelections }]), /indisponible/);
  assert.throws(() => validateAndPriceOrderItems([{ productId: "classique", quantity: 1, selections: [requiredSelections[0], { groupId: "salad", id: "roquette" }, { groupId: "salad", id: "sans-crudites" }, requiredSelections[2]] }]), /incompatibles/);
});

test("prices simple snacks and drinks from the server catalog", () => {
  const result = validateAndPriceOrderItems([
    { productId: "frites-maison", quantity: 1, price: 0.01, selections: [] },
    { productId: "drink-coca", quantity: 2, price: 0.01, selections: [] }
  ]);
  assert.equal(result.subtotal, 7.5);
  assert.equal(result.items[0].price, 3.9);
  assert.equal(result.items[1].price, 1.8);
});

test("requires and prices both drinks in the Duo menu", () => {
  assert.throws(() => validateAndPriceOrderItems([{ productId: "menu-duo-tenders", quantity: 1, selections: [] }]), /choix requis/);
  const result = validateAndPriceOrderItems([{ productId: "menu-duo-tenders", quantity: 1, selections: [
    { groupId: "duo-drink-one", id: "coca" },
    { groupId: "duo-drink-two", id: "oasis-tropical" }
  ] }]);
  assert.equal(result.subtotal, 19.9);
  assert.equal(result.items[0].options.length, 2);
});
