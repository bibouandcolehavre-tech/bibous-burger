const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createProductStockStore } = require("./product-stock");
const { availabilityCatalog, assertStoredOrderAvailable, validateAndPriceOrderItems } = require("./catalog");
const { applyProductStock, availableOptionGroups, cartStockProblem } = require("../stock-client");

const selections = [{ groupId: "protein", id: "viande" }, { groupId: "salad", id: "roquette" }, { groupId: "sauces", id: "mayo" }];
const item = (productId, options = selections) => ({ productId, quantity: 1, selections: options });

test("le restaurant peut rouvrir une rupture initiale sans changer le prix", () => {
  assert.equal(availabilityCatalog().products.find((p) => p.id === "atlas-menu").available, false);
  const atlasSelections = [selections[0], selections[1], { groupId: "sauces", id: "fixed-atlas" }];
  assert.equal(validateAndPriceOrderItems([item("atlas-menu", atlasSelections)], { "atlas-menu": true }).subtotal, 18.9);
  assert.throws(() => validateAndPriceOrderItems([item("classique")], { classique: false }), /indisponible/);
  assert.throws(() => validateAndPriceOrderItems([item("__proto__")]), /n’existe plus/);
});

test("une boisson en rupture est bloquée seule, en menu et dans les deux choix Duo", () => {
  const stock = { "drink-coca": false, "drink-lipton-peche": false };
  assert.throws(() => validateAndPriceOrderItems([item("drink-coca", [])], stock), /indisponible/);
  for (const drinkId of ["coca", "lipton", "lipton-peche"]) assert.throws(() => validateAndPriceOrderItems([item("taurus", [...selections, { groupId: "drink", id: drinkId }])], stock), /plus disponible/);
  for (const groupId of ["duo-drink-one", "duo-drink-two"]) {
    assert.throws(() => assertStoredOrderAvailable([{ productId: "menu-duo-tenders", options: [{ groupId, id: "coca" }] }], stock), /plus disponible/);
  }
  assert.equal(availabilityCatalog(stock).options["drink:coca"], false);
  assert.equal(availabilityCatalog(stock).options["drink:perrier"], true);
});

test("les accompagnements en rupture bloquent leurs options et les menus qui les incluent", () => {
  const stock = { "frites-maison": false, "frites-cheddar-bacon": false, "tenders-xl-3": false };
  assert.throws(() => validateAndPriceOrderItems([item("taurus")], stock), /Frites maison/);
  for (const id of ["frites", "frites-cheddar", "tenders"]) assert.throws(() => validateAndPriceOrderItems([item("classique", [...selections, { groupId: "sides", id }])], stock), /plus disponible/);
  assert.equal(availabilityCatalog(stock).products.find((p) => p.id === "menu-duo-tenders").available, false);
  assert.equal(availabilityCatalog(stock).products.find((p) => p.id === "taurus").enabled, true);
  assert.equal(validateAndPriceOrderItems([item("classique")], stock).subtotal, 9.9);
  assert.equal(availabilityCatalog({ "tenders-xl-3": false }).products.find((p) => p.id === "menu-duo-tenders").available, false);
});

test("un panier déjà créé est revérifié avant son paiement", () => {
  const cart = validateAndPriceOrderItems([item("taurus", [...selections, { groupId: "drink", id: "coca" }])]);
  assert.doesNotThrow(() => assertStoredOrderAvailable(cart.items, {}));
  assert.throws(() => assertStoredOrderAvailable(cart.items, { taurus: false }), /indisponible/);
  assert.throws(() => assertStoredOrderAvailable(cart.items, { "drink-coca": false }), /plus disponible/);
});

test("les disponibilités persistent après redémarrage et les changements concurrents ne se perdent pas", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bibou-stock-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "stock.json");
  const store = createProductStockStore(file);
  assert.deepEqual(await store.read(), {});
  await Promise.all([store.update("taurus", false), store.update("drink-coca", false), store.update("atlas-menu", true)]);
  assert.deepEqual(await createProductStockStore(file).read(), { taurus: false, "drink-coca": false, "atlas-menu": true });
  await assert.rejects(store.update("__proto__", false), /invalide/);
  await assert.rejects(store.update("taurus", "false"), /invalide/);
  await store.update("taurus", true);
  assert.equal((await store.read()).taurus, true);
  assert.deepEqual(await fs.readdir(directory), ["stock.json"]);
});

test("un fichier de disponibilité endommagé ne rouvre pas les produits en silence", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bibou-stock-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "stock.json");
  await fs.writeFile(file, "{broken");
  const store = createProductStockStore(file);
  await assert.rejects(store.read());
  await assert.rejects(store.update("taurus", true));
  assert.equal(await fs.readFile(file, "utf8"), "{broken");
});

test("le client actualise les cartes, les options et le panier sans les modifier", () => {
  const product = { id: "taurus", name: "Taurus" };
  const cart = [{ product, selections: [{ groupId: "drink", id: "coca" }] }];
  const catalog = availabilityCatalog({ taurus: false, "drink-coca": false });
  assert.equal(applyProductStock(product, catalog).soldOut, true);
  assert.equal(product.soldOut, undefined);
  assert.match(cartStockProblem(cart, catalog), /indisponible/);
  assert.match(cartStockProblem(cart, availabilityCatalog({ "drink-coca": false })), /option/);
  assert.equal(cartStockProblem(cart, availabilityCatalog()), "");
  assert.equal(availableOptionGroups([{ id: "drink", options: [{ id: "coca" }] }], catalog)[0].options[0].soldOut, true);
  assert.equal(applyProductStock({ id: "atlas-menu", soldOut: true }, availabilityCatalog({ "atlas-menu": true })).soldOut, false);
});
