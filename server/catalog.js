const PRODUCT_CATALOG = {
  taurus: { name: "Le Taurus", price: 16.9, menu: true },
  "montagnes-menu": { name: "À travers les montagnes", price: 16.9, menu: true },
  "atlas-menu": { name: "Au sommet de l'Atlas", price: 18.9, menu: true, soldOut: true, fixedSauce: "fixed-atlas" },
  "classique-menu": { name: "Classique, simple et efficace", price: 14.9, menu: true },
  "duck-menu": { name: "Duck", price: 18.9, menu: true, fixedSauce: "fixed-duck" },
  "dynamite-menu": { name: "Dynamite Chicken", price: 16.9, menu: true, fixedSauce: "fixed-dynamite" },
  "gros-lard-menu": { name: "Le gros lard", price: 16.9, menu: true },
  "hambagu-menu": { name: "Hambagu", price: 16.9, menu: true, fixedSauce: "fixed-hambagu" },
  "basilic-menu": { name: "Le basilic du potager", price: 16.9, menu: true, fixedSauce: "fixed-basilic" },
  "pork-menu": { name: "Le Pork", price: 16.9, menu: true, fixedSauce: "fixed-pork" },
  atlas: { name: "Au sommet de l'Atlas", price: 13.9, fixedSauce: "fixed-atlas" },
  classique: { name: "Classique, simple et efficace", price: 9.9 },
  duck: { name: "Duck", price: 13.9, fixedSauce: "fixed-duck" },
  dynamite: { name: "Dynamite Chicken", price: 11.9, fixedSauce: "fixed-dynamite" },
  hambagu: { name: "Hambagu", price: 11.9, fixedSauce: "fixed-hambagu" },
  basilic: { name: "Le basilic du potager", price: 11.9, fixedSauce: "fixed-basilic" },
  montagnes: { name: "À travers les montagnes", price: 11.9 },
  "gros-lard": { name: "Le gros lard", price: 11.9 },
  pork: { name: "Le Pork", price: 11.9, fixedSauce: "fixed-pork" },
  "frites-maison": { name: "Frites maison", price: 3.9, kind: "simple" },
  "frites-cheddar-bacon": { name: "Frites cheddar bacon", price: 6.9, kind: "simple" },
  "tenders-xl-3": { name: "Tenders XL par 3", price: 6.9, kind: "simple" },
  "menu-duo-tenders": { name: "Menu Duo · 10 tenders", price: 19.9, kind: "duo" },
  "drink-coca": { name: "Coca 33 cl", price: 1.8, kind: "simple" },
  "drink-coca-cherry": { name: "Coca Cherry 33 cl", price: 1.8, kind: "simple" },
  "drink-fuse-menthe": { name: "Fuse Tea thé vert menthe", price: 1.8, kind: "simple" },
  "drink-lipton-framboise": { name: "Lipton framboise 33 cl", price: 1.8, kind: "simple" },
  "drink-lipton-peche": { name: "Lipton pêche 33 cl", price: 1.8, kind: "simple" },
  "drink-oasis-pomme": { name: "Oasis pomme cassis framboise", price: 1.8, kind: "simple" },
  "drink-oasis-tropical": { name: "Oasis tropical", price: 1.8, kind: "simple" },
  "drink-perrier": { name: "Perrier", price: 1.8, kind: "simple" },
  "drink-tropico": { name: "Tropico", price: 1.8, kind: "simple" }
};

const STOCK_ONLY_CATALOG = {
  "ingredient-second-steak": { name: "Supplément · Steak haché", price: 3, category: "supplements" },
  "ingredient-potato-patty": { name: "Supplément · Galette de pomme de terre", price: 2, category: "supplements" },
  "ingredient-cheddar": { name: "Supplément · Cheddar", price: 1, category: "supplements" },
  "ingredient-raclette": { name: "Supplément · Raclette", price: 1, category: "supplements" },
  "ingredient-mozzarella": { name: "Supplément · Mozzarella", price: 1, category: "supplements" },
  "ingredient-fourme": { name: "Supplément · Fourme d'Ambert", price: 1, category: "supplements" },
  "ingredient-lard": { name: "Supplément · Lard fumé", price: 1.5, category: "supplements" },
  "ingredient-bacon": { name: "Supplément · Bacon", price: 1, category: "supplements" }
};
const STOCK_CATALOG = { ...PRODUCT_CATALOG, ...STOCK_ONLY_CATALOG };

const option = (groupId, id, label, price = 0, extra = {}) => ({ groupId, id, label, price, ...extra });
const OPTIONS = [
  option("protein", "viande", "Viande"),
  option("protein", "galette", "Galette de pomme de terre (végétarien)"),
  option("salad", "roquette", "Roquette"),
  option("salad", "tomate", "Tomate"),
  option("salad", "oignons", "Oignons caramélisés"),
  option("salad", "cornichons", "Cornichons"),
  option("salad", "sans-crudites", "Pas de crudités", 0, { exclusive: true }),
  option("sauces", "ketchup", "Ketchup"),
  option("sauces", "mayo", "Mayonnaise"),
  option("sauces", "moutarde", "Moutarde"),
  option("sauces", "barbecue", "Barbecue"),
  option("sauces", "tartare", "Tartare"),
  option("sauces", "blanche", "Blanche"),
  option("sauces", "bearnaise", "Béarnaise"),
  option("sauces", "sans-sauce", "Pas de sauce", 0, { exclusive: true }),
  option("sauces", "fixed-atlas", "Sauce imposée · Barbecue miel"),
  option("sauces", "fixed-dynamite", "Sauce imposée · Sauce thaï"),
  option("sauces", "fixed-duck", "Sauce imposée · Sauce chinoise"),
  option("sauces", "fixed-hambagu", "Sauce imposée · Sauce Hambagu (à base de mirin, de soja et de saké)"),
  option("sauces", "fixed-basilic", "Sauce imposée · Pesto"),
  option("sauces", "fixed-pork", "Sauce imposée · Barbecue coréenne"),
  option("extras", "second-steak", "Second steak", 3),
  option("extras", "galette-plus", "Galette de pomme de terre", 2),
  option("extras", "cheddar", "Cheddar", 1),
  option("extras", "raclette", "Raclette", 1),
  option("extras", "mozzarella", "Mozzarella", 1),
  option("extras", "fourme", "Fourme d'Ambert", 1),
  option("extras", "lard", "Lard fumé", 1.5),
  option("extras", "bacon", "Bacon", 1),
  option("sides", "frites", "Portion de frites maison ajoutée", 3.9),
  option("sides", "frites-cheddar", "Frites cheddar bacon ajoutées", 6.9),
  option("sides", "tenders", "3 Tenders ajoutés", 6.9),
  option("desserts", "oreo", "Tiramisu Oreo", 3.9),
  option("desserts", "cookie", "Tiramisu cookie", 3.9),
  option("desserts", "framboise", "Tiramisu framboise pistache", 3.9),
  option("drink", "coca", "Coca 33 cl"),
  option("drink", "coca-zero", "Coca Zero"),
  option("drink", "coca-cherry", "Coca Cherry"),
  option("drink", "coca-vanille", "Coca Vanille"),
  option("drink", "lipton", "Lipton pêche"),
  option("drink", "lipton-peche", "Lipton pêche"),
  option("drink", "lipton-framboise", "Lipton framboise"),
  option("drink", "fuse-menthe", "Fuse Tea thé vert menthe"),
  option("drink", "oasis", "Oasis pomme cassis framboise"),
  option("drink", "oasis-pomme", "Oasis pomme cassis framboise"),
  option("drink", "oasis-tropical", "Oasis tropical"),
  option("drink", "fanta", "Fanta Orange"),
  option("drink", "fanta-orange", "Fanta Orange"),
  option("drink", "fanta-dragon", "Fanta fruit du dragon"),
  option("drink", "perrier", "Perrier"),
  option("drink", "tropico", "Tropico"),
  option("drink", "eau", "Cristaline 50 cl"),
  ...["coca", "coca-zero", "coca-cherry", "coca-vanille", "lipton-peche", "lipton-framboise", "fuse-menthe", "oasis-pomme", "oasis-tropical", "fanta-orange", "fanta-dragon", "perrier", "tropico", "eau"].flatMap((id) => {
    const label = {
      coca: "Coca 33 cl", "coca-zero": "Coca Zero", "coca-cherry": "Coca Cherry", "coca-vanille": "Coca Vanille",
      "lipton-peche": "Lipton pêche", "lipton-framboise": "Lipton framboise", "fuse-menthe": "Fuse Tea thé vert menthe",
      "oasis-pomme": "Oasis pomme cassis framboise", "oasis-tropical": "Oasis tropical", "fanta-orange": "Fanta Orange",
      "fanta-dragon": "Fanta fruit du dragon", perrier: "Perrier", tropico: "Tropico", eau: "Cristaline 50 cl"
    }[id];
    return [option("duo-drink-one", id, label), option("duo-drink-two", id, label)];
  })
];

const OPTION_CATALOG = new Map(OPTIONS.map((entry) => [`${entry.groupId}:${entry.id}`, entry]));
const GROUP_RULES = {
  protein: { min: 1, max: 1 },
  salad: { min: 1, max: 4 },
  sauces: { min: 1 },
  drink: { max: 1 },
  "duo-drink-one": { min: 1, max: 1 },
  "duo-drink-two": { min: 1, max: 1 },
  extras: {},
  sides: {},
  desserts: {}
};
const MENU_GROUPS = new Set(["protein", "salad", "sauces", "drink", "extras", "sides"]);
const BURGER_GROUPS = new Set(["protein", "salad", "sauces", "extras", "sides", "desserts"]);
const DUO_GROUPS = new Set(["duo-drink-one", "duo-drink-two"]);
const SIMPLE_GROUPS = new Set();

const cents = (value) => Math.round(Number(value) * 100);
const orderInputError = (message) => Object.assign(new Error(message), { statusCode: 400 });

// Stock is shared by a standalone product and the same product selected in a menu.
const optionProductId = ({ groupId, id }) => {
  if (groupId === "protein" && id === "galette") return "ingredient-potato-patty";
  if (groupId === "extras") return {
    "second-steak": "ingredient-second-steak", "galette-plus": "ingredient-potato-patty", cheddar: "ingredient-cheddar",
    raclette: "ingredient-raclette", mozzarella: "ingredient-mozzarella", fourme: "ingredient-fourme", lard: "ingredient-lard", bacon: "ingredient-bacon"
  }[id];
  if (groupId === "sides") return { frites: "frites-maison", "frites-cheddar": "frites-cheddar-bacon", tenders: "tenders-xl-3" }[id];
  if (groupId === "drink" || groupId?.startsWith("duo-drink-")) {
    const productId = `drink-${({ lipton: "lipton-peche", oasis: "oasis-pomme" })[id] || id}`;
    return Object.hasOwn(PRODUCT_CATALOG, productId) ? productId : null;
  }
  return null;
};

const productStock = (id, overrides = {}) => {
  const product = Object.hasOwn(STOCK_CATALOG, id) ? STOCK_CATALOG[id] : null;
  if (!product) return { available: false, enabled: false, reason: "Ce produit n’est plus à la carte." };
  const enabled = Object.hasOwn(overrides, id) ? overrides[id] : !product.soldOut;
  if (!enabled) return { available: false, enabled: false, reason: `${product.name} est momentanément indisponible.` };
  const included = product.menu ? ["frites-maison"] : product.kind === "duo" ? ["frites-maison", "tenders-xl-3"] : [];
  for (const includedId of included) {
    if (!productStock(includedId, overrides).available) return { available: false, enabled: true, reason: `${product.name} : ${PRODUCT_CATALOG[includedId].name} indisponibles.` };
  }
  return { available: true, enabled: true, reason: "" };
};

const availabilityCatalog = (overrides = {}) => ({
  products: Object.entries(STOCK_CATALOG).map(([id, product]) => ({
    id, name: product.menu ? `Menu - ${product.name}` : product.name, price: product.price,
    category: product.category || (product.menu ? "menus" : id.startsWith("drink-") ? "drinks" : product.kind ? "snacks" : "burgers"),
    ...productStock(id, overrides)
  })),
  options: Object.fromEntries(OPTIONS.map((entry) => {
    const productId = optionProductId(entry);
    return [`${entry.groupId}:${entry.id}`, !productId || productStock(productId, overrides).available];
  }))
});

const assertItemAvailable = (productId, selections, overrides = {}) => {
  const stock = productStock(productId, overrides);
  if (!stock.available) throw orderInputError(stock.reason);
  for (const selection of selections || []) {
    const selectedProduct = optionProductId(selection);
    if (selectedProduct && !productStock(selectedProduct, overrides).available) throw orderInputError(`${STOCK_CATALOG[selectedProduct].name} n’est plus disponible. Modifie les options de ton panier.`);
  }
};

const assertStoredOrderAvailable = (items, overrides = {}) => {
  for (const item of items) assertItemAvailable(item.productId, item.options, overrides);
};

const validatedSelections = (product, selections) => {
  if (!Array.isArray(selections)) throw orderInputError("Actualise l’application avant de commander.");
  const allowedGroups = product.kind === "simple" ? SIMPLE_GROUPS : product.kind === "duo" ? DUO_GROUPS : product.menu ? MENU_GROUPS : BURGER_GROUPS;
  const seen = new Set();
  const resolved = selections.map((selection) => {
    const key = `${String(selection?.groupId || "")}:${String(selection?.id || "")}`;
    const catalogOption = OPTION_CATALOG.get(key);
    if (!catalogOption || !allowedGroups.has(catalogOption.groupId) || seen.has(key)) throw orderInputError("Une option de la commande est invalide.");
    seen.add(key);
    return catalogOption;
  });
  const byGroup = Object.fromEntries([...allowedGroups].map((groupId) => [groupId, resolved.filter((entry) => entry.groupId === groupId)]));
  for (const groupId of allowedGroups) {
    const rule = GROUP_RULES[groupId];
    const count = byGroup[groupId].length;
    if ((rule.min && count < rule.min) || (rule.max && count > rule.max)) throw orderInputError("Complète les choix requis avant de commander.");
    if (count > 1 && byGroup[groupId].some((entry) => entry.exclusive)) throw orderInputError("Deux choix incompatibles ont été sélectionnés.");
  }
  if (product.fixedSauce && (byGroup.sauces.length !== 1 || byGroup.sauces[0].id !== product.fixedSauce)) throw orderInputError("La sauce de ce burger est imposée. Actualise l’application avant de commander.");
  return resolved;
};

const validateAndPriceOrderItems = (inputItems, overrides = {}) => {
  if (!Array.isArray(inputItems) || !inputItems.length || inputItems.length > 20) throw orderInputError("Le panier est invalide.");
  let subtotalCents = 0;
  const items = inputItems.map((input) => {
    const productId = String(input?.productId || "");
    const product = Object.hasOwn(PRODUCT_CATALOG, productId) ? PRODUCT_CATALOG[productId] : null;
    if (!product) throw orderInputError("Un produit du panier n’existe plus.");
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw orderInputError("La quantité demandée est invalide.");
    const selections = validatedSelections(product, input.selections);
    assertItemAvailable(productId, selections, overrides);
    const unitPriceCents = cents(product.price) + selections.reduce((sum, entry) => sum + cents(entry.price), 0);
    subtotalCents += unitPriceCents * quantity;
    return {
      productId,
      name: product.name,
      quantity,
      price: unitPriceCents / 100,
      options: selections.map(({ groupId, id, label, price }) => ({ groupId, id, label, price }))
    };
  });
  return { items, subtotal: subtotalCents / 100 };
};

module.exports = { PRODUCT_CATALOG, STOCK_CATALOG, availabilityCatalog, assertStoredOrderAvailable, validateAndPriceOrderItems };
