const test = require("node:test");
const assert = require("node:assert/strict");
const { PRODUCT_CATALOG, availabilityCatalog, validateAndPriceOrderItems } = require("./catalog");
const { PROTEINS, initialBurger, priceCents, selectionEntries } = require('../custom-burger-preview');

const requiredSelections = [
  { groupId: "protein", id: "viande" },
  { groupId: "salad", id: "roquette" },
  { groupId: "sauces", id: "mayo" }
];
const menuDrink = { groupId: "drink", id: "coca" };
const withMenuDrink = (productId, selections) => productId.endsWith("-menu") ? [...selections, menuDrink] : selections;

test('burger à composer : mêmes prix de départ que les burgers seuls, jamais sous le menu équivalent', () => {
  for (const protein of PROTEINS.filter((choice) => choice.reference)) {
    const selection = { ...initialBurger(), protein: protein.id, bread: protein.recipe.bread, cheese: protein.recipe.cheese, sauces: [protein.recipe.sauce] };
    const burger = validateAndPriceOrderItems([{ productId: 'custom-burger', quantity: 1, price: 0.01, selections: selectionEntries(selection) }]);
    assert.equal(burger.subtotal, PRODUCT_CATALOG[protein.productId].price, protein.label);
    assert.equal(Math.round(burger.subtotal * 100), priceCents(selection));
    assert.ok(burger.subtotal + 3.9 + 1.8 >= PRODUCT_CATALOG[`${protein.productId}-menu`].price, protein.label);
    assert.equal(burger.items[0].name, 'Burger à composer');
  }
});

test('burger à composer : les recettes bœuf comparables ne passent pas sous la carte', () => {
  const base = initialBurger();
  const comparable = [
    [{ ...base, cheese: 'raclette', extras: ['bacon'] }, 'montagnes'],
    [{ ...base, cheese: 'fourme', extras: ['lard'] }, 'gros-lard'],
    [{ ...base, cheese: 'chevre', sauces: ['pesto-verde'], extras: ['extra-mozzarella'] }, 'basilic']
  ];
  for (const [selection, productId] of comparable) {
    const actual = validateAndPriceOrderItems([{ productId: 'custom-burger', quantity: 1, selections: selectionEntries(selection) }]);
    assert.ok(actual.subtotal >= PRODUCT_CATALOG[productId].price, productId);
  }
});

test('burger à composer : chaque supplément est tarifé par le serveur et le prix transmis est ignoré', () => {
  const selection = { ...initialBurger(), bread: 'charbon', sauces: ['barbecue', 'mayo'], crudites: ['roquette', 'tomate', 'oignons', 'cornichons', 'concombre', 'chou-rouge'], extras: ['bacon'] };
  const priced = validateAndPriceOrderItems([{ productId: 'custom-burger', quantity: 2, price: 0.01, selections: selectionEntries(selection) }]);
  assert.equal(priced.items[0].price, priceCents(selection) / 100);
  assert.equal(priced.subtotal, priced.items[0].price * 2);
  assert.equal(priced.items[0].options.find((option) => option.groupId === 'custom-bread').price, 1);
  assert.equal(priced.items[0].options.filter((option) => option.groupId === 'custom-crudite' && option.price === 0.5).length, 1);
});

test('burger à composer : rejet des choix forgés, du porc halal et des ruptures', () => {
  const base = selectionEntries(initialBurger());
  const order = (selections, stock) => validateAndPriceOrderItems([{ productId: 'custom-burger', quantity: 1, selections }], stock);
  assert.throws(() => order(base.filter((choice) => choice.groupId !== 'custom-protein')), /Choisis une viande/);
  assert.throws(() => order([...base, { groupId: 'custom-protein', id: 'boeuf' }]), /invalide/);
  assert.throws(() => order([...base, { groupId: 'custom-extra', id: 'jambon-parme' }]), /invalide/);
  assert.throws(() => order([...base, { groupId: 'custom-extra', id: 'bacon' }, { groupId: 'custom-diet', id: 'halal' }]), /porc/);
  assert.throws(() => order([...base, { groupId: 'custom-diet', id: 'halal' }], { classique: false }), /disponible/);
  assert.throws(() => order([...base, { groupId: 'custom-extra', id: 'bacon' }], { 'ingredient-bacon': false }), /disponible/);
  const catalog = availabilityCatalog({ 'ingredient-bacon': false });
  assert.equal(catalog.options['custom-extra:bacon'], false);
  assert.equal(catalog.products.find((product) => product.id === 'custom-burger').category, 'burgers');
});

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

test("records the imposed sauce and rejects a replacement sauce", () => {
  const recipes = {
    atlas: ["fixed-atlas", "Sauce imposée · Barbecue miel"],
    dynamite: ["fixed-dynamite", "Sauce imposée · Sauce thaï"],
    duck: ["fixed-duck", "Sauce imposée · Sauce chinoise"],
    hambagu: ["fixed-hambagu", "Sauce imposée · Sauce Hambagu (à base de mirin, de soja et de saké)"],
    basilic: ["fixed-basilic", "Sauce imposée · Pesto"],
    pork: ["fixed-pork", "Sauce imposée · Barbecue coréenne"]
  };
  for (const [burgerId, [sauceId, label]] of Object.entries(recipes)) {
    for (const productId of [burgerId, `${burgerId}-menu`]) {
      const saladId = ['duck', 'hambagu', 'pork'].includes(burgerId) ? 'concombre' : 'roquette';
      const fixedSelections = [requiredSelections[0], { groupId: 'salad', id: saladId }, { groupId: "sauces", id: sauceId }];
      const result = validateAndPriceOrderItems([{ productId, quantity: 1, selections: withMenuDrink(productId, fixedSelections) }], { "atlas-menu": true });
      assert.equal(result.items[0].options[2].label, label);
      assert.throws(() => validateAndPriceOrderItems([{ productId, quantity: 1, selections: withMenuDrink(productId, requiredSelections) }], { "atlas-menu": true }), /sauce de ce burger est imposée/);
    }
  }
});

test("rejects unavailable products and incompatible exclusive choices", () => {
  const atlasSelections = [requiredSelections[0], requiredSelections[1], { groupId: "sauces", id: "fixed-atlas" }, menuDrink];
  assert.throws(() => validateAndPriceOrderItems([{ productId: "atlas-menu", quantity: 1, selections: atlasSelections }]), /indisponible/);
  assert.throws(() => validateAndPriceOrderItems([{ productId: "classique", quantity: 1, selections: [requiredSelections[0], { groupId: "salad", id: "roquette" }, { groupId: "salad", id: "sans-crudites" }, requiredSelections[2]] }]), /incompatibles/);
});

test("accepts exactly one sauce and rejects multiple sauces", () => {
  const oneSauce = validateAndPriceOrderItems([{ productId: "classique", quantity: 1, selections: requiredSelections }]);
  assert.equal(oneSauce.items[0].options.filter((option) => option.groupId === "sauces").length, 1);
  assert.throws(() => validateAndPriceOrderItems([{ productId: "classique", quantity: 1, selections: [...requiredSelections, { groupId: "sauces", id: "ketchup" }] }]), /maximum 1 choix/);
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

test("Menu Solo : 3 tenders, frites et une boisson obligatoire pour 9,90 €", () => {
  const productId = "menu-solo-tenders";
  assert.equal(PRODUCT_CATALOG[productId].price, 9.9);
  assert.throws(() => validateAndPriceOrderItems([{ productId, quantity: 1, selections: [] }]), /Choisis une boisson/);
  const result = validateAndPriceOrderItems([{ productId, quantity: 2, price: 0.01, selections: [{ groupId: "drink", id: "oasis-tropical" }] }]);
  assert.equal(result.subtotal, 19.8);
  assert.equal(result.items[0].price, 9.9);
  assert.equal(result.items[0].name, "Menu Solo");
  assert.equal(result.items[0].options[0].label, "Oasis tropical");
  assert.throws(() => validateAndPriceOrderItems([{ productId, quantity: 1, selections: [{ groupId: "drink", id: "coca" }, { groupId: "drink", id: "eau" }] }]), /maximum 1 choix/);
  assert.throws(() => validateAndPriceOrderItems([{ productId, quantity: 1, selections: [{ groupId: "drink", id: "coca" }, { groupId: "extras", id: "bacon" }] }]), /option.*invalide/);
});

test('les quatre recettes acceptent plusieurs nouvelles crudités et les anciens choix Android', () => {
  const recipes = {
    duck: ['concombre', 'chou-rouge', 'salade-thai', 'tomate'],
    hambagu: ['concombre', 'chou-rouge', 'salade-thai', 'tomate'],
    pork: ['concombre', 'chou-rouge', 'salade-thai', 'tomate'],
    dynamite: ['cornichons', 'roquette', 'chou-rouge', 'tomate', 'oignon']
  };
  const sauces = { duck: 'fixed-duck', hambagu: 'fixed-hambagu', pork: 'fixed-pork', dynamite: 'fixed-dynamite' };
  for (const [burger, ids] of Object.entries(recipes)) for (const productId of [burger, `${burger}-menu`]) {
    const selections = [{ groupId: 'protein', id: 'viande' }, ...ids.slice(0, 2).map(id => ({ groupId: 'salad', id })), { groupId: 'sauces', id: sauces[burger] }];
    assert.equal(validateAndPriceOrderItems([{ productId, quantity: 1, selections: withMenuDrink(productId, selections) }]).items[0].options.filter(option => option.groupId === 'salad').length, 2);
    const legacy = burger === 'dynamite' ? 'oignons' : 'roquette';
    const oldAndroidSelections = [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: legacy }, { groupId: 'sauces', id: sauces[burger] }];
    assert.equal(validateAndPriceOrderItems([{ productId, quantity: 1, selections: withMenuDrink(productId, oldAndroidSelections) }]).items[0].options.find(option => option.groupId === 'salad').id, legacy);
  }
});

test('dessert à 2 € dans un menu et 3,90 € à la carte, prix imposés par le serveur', () => {
  const menu = validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [
    ...requiredSelections, menuDrink, { groupId: 'menu-desserts', id: 'oreo' }
  ] }]);
  assert.equal(menu.subtotal, 16.9);
  assert.equal(menu.items[0].options.find(option => option.groupId === 'menu-desserts').price, 2);
  assert.equal(validateAndPriceOrderItems([{ productId: 'dessert-oreo', quantity: 1, selections: [] }]).subtotal, 3.9);
  assert.throws(() => validateAndPriceOrderItems([{ productId: 'classique', quantity: 1, selections: [...requiredSelections, { groupId: 'menu-desserts', id: 'oreo' }] }]), /option/);
  assert.throws(() => validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...requiredSelections, menuDrink, { groupId: 'menu-desserts', id: 'oreo' }, { groupId: 'menu-desserts', id: 'cookie' }] }]), /maximum 1 choix/);
});

test('frites cheddar bacon : remplacement du menu à 2,50 €, portion seule à 6,90 €', () => {
  const included = { groupId: 'menu-fries', id: 'maison' };
  const regularMenu = validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...requiredSelections, menuDrink, included] }]);
  assert.equal(regularMenu.subtotal, 14.9);
  assert.deepEqual(regularMenu.items[0].options.find(option => option.groupId === 'menu-fries'), {
    ...included, label: 'Frites maison incluses dans le menu', price: 0
  });
  const upgrade = { groupId: 'menu-fries', id: 'cheddar-bacon' };
  const menu = validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...requiredSelections, menuDrink, upgrade] }]);
  assert.equal(menu.subtotal, 17.4);
  assert.deepEqual(menu.items[0].options.find(option => option.groupId === 'menu-fries'), {
    ...upgrade, label: 'Frites du menu remplacées par des frites cheddar bacon', price: 2.5
  });
  assert.equal(validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...requiredSelections, menuDrink] }]).subtotal, 14.9);
  assert.equal(validateAndPriceOrderItems([{ productId: 'frites-cheddar-bacon', quantity: 1, selections: [] }]).subtotal, 6.9);
  assert.throws(() => validateAndPriceOrderItems([{ productId: 'classique', quantity: 1, selections: [...requiredSelections, upgrade] }]), /option/);
  assert.throws(() => validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...requiredSelections, menuDrink, included, upgrade] }]), /maximum 1 choix/);
  assert.throws(() => validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...requiredSelections, menuDrink, upgrade] }], { 'frites-cheddar-bacon': false }), /plus disponible/);
});

test('le serveur refuse le bacon de porc avec viande halal, même en portion supplémentaire', () => {
  const halal = [...requiredSelections, menuDrink, { groupId: 'meat-type', id: 'halal' }];
  for (const selection of [
    { groupId: 'menu-fries', id: 'cheddar-bacon' },
    { groupId: 'sides', id: 'frites-cheddar' }
  ]) {
    assert.throws(
      () => validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...halal, selection] }]),
      /bacon de porc, non halal/
    );
  }
  assert.equal(validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: halal }]).subtotal, 14.9);
  assert.equal(validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...requiredSelections, menuDrink, { groupId: 'meat-type', id: 'non-halal' }, { groupId: 'menu-fries', id: 'cheddar-bacon' }] }]).subtotal, 17.4);
});

test('chaque menu impose une boisson choisie, contrairement au burger seul', () => {
  assert.throws(() => validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: requiredSelections }]), /Choisis une boisson dans chaque menu/);
  const menu = validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...requiredSelections, menuDrink] }]);
  assert.equal(menu.items[0].options.find(option => option.groupId === 'drink').label, 'Coca 33 cl');
  assert.throws(() => validateAndPriceOrderItems([{ productId: 'classique-menu', quantity: 1, selections: [...requiredSelections, menuDrink, { groupId: 'drink', id: 'eau' }] }]), /maximum 1 choix/);
  assert.doesNotThrow(() => validateAndPriceOrderItems([{ productId: 'classique', quantity: 1, selections: requiredSelections }]));
});
