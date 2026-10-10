const { containsPork, porkOption } = require('../dietary-policy');
const { meatOption, vegetarianInstruction } = require('./kiosk-recipe');
const { productOfferForService, offerCatalogProduct } = require('../product-offer');
const { BASE_CENTS, PROTEINS, CHEESES, EXTRAS, EXTRA_STOCK_IDS, parseSelectionEntries, pricedOptions } = require('../custom-burger-preview');
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
  "custom-burger": { name: "Burger à composer", price: BASE_CENTS / 100, custom: true, category: "burgers" },
  "frites-maison": { name: "Frites maison", price: 3.9, kind: "simple" },
  "frites-cheddar": { name: "Frites cheddar (sans bacon)", price: 4.9, kind: "simple" },
  "frites-cheddar-bacon": { name: "Frites cheddar bacon", price: 6.9, kind: "simple" },
  "tenders-xl-3": { name: "Tenders XL par 3", price: 6.9, kind: "simple" },
  "menu-solo-tenders": { name: "Menu Solo", price: 9.9, kind: "solo" },
  "menu-duo-tenders": { name: "Menu Duo · 10 tenders", price: 19.9, kind: "duo" },
  "drink-coca": { name: "Coca 33 cl", price: 1.8, kind: "simple" },
  "drink-coca-cherry": { name: "Coca Cherry 33 cl", price: 1.8, kind: "simple" },
  "drink-fuse-menthe": { name: "Fuse Tea thé vert menthe", price: 1.8, kind: "simple" },
  "drink-lipton-framboise": { name: "Lipton framboise 33 cl", price: 1.8, kind: "simple" },
  "drink-lipton-peche": { name: "Lipton pêche 33 cl", price: 1.8, kind: "simple" },
  "drink-oasis-pomme": { name: "Oasis pomme cassis framboise", price: 1.8, kind: "simple" },
  "drink-oasis-tropical": { name: "Oasis tropical", price: 1.8, kind: "simple" },
  "drink-perrier": { name: "Perrier", price: 1.8, kind: "simple" },
  "drink-tropico": { name: "Tropico", price: 1.8, kind: "simple" },
  "dessert-oreo": { name: "Tiramisu Oreo", price: 3.9, kind: "simple", category: "desserts" },
  "dessert-cookie": { name: "Tiramisu cookie", price: 3.9, kind: "simple", category: "desserts" },
  "dessert-speculoos": { name: "Tiramisu spéculoos", price: 3.9, kind: "simple", category: "desserts" }
};

const STOCK_ONLY_CATALOG = {
  "ingredient-second-steak": { name: "Supplément · Steak haché", price: 3, category: "supplements" },
  "ingredient-potato-patty": { name: "Supplément · Galette de pomme de terre", price: 2, category: "supplements" },
  "ingredient-cheddar": { name: "Supplément · Cheddar", price: 1, category: "supplements" },
  "ingredient-raclette": { name: "Supplément · Raclette", price: 1, category: "supplements" },
  "ingredient-mozzarella": { name: "Supplément · Mozzarella", price: 1, category: "supplements" },
  "ingredient-fourme": { name: "Supplément · Fourme d'Ambert", price: 1, category: "supplements" },
  "ingredient-lard": { name: "Supplément · Lard fumé", price: 1.5, category: "supplements" },
  "ingredient-bacon": { name: "Supplément · Bacon", price: 1, category: "supplements" },
  // Keep the historical stock key so existing stock files remain readable, but never sell it again.
  "dessert-framboise": { name: "Tiramisu framboise pistache (retiré)", price: 3.9, category: "archives", retired: true }
};
const STOCK_CATALOG = { ...PRODUCT_CATALOG, ...STOCK_ONLY_CATALOG };

const option = (groupId, id, label, price = 0, extra = {}) => ({ groupId, id, label, price, ...extra });
const OPTIONS = [
  option("protein", "viande", "Viande"),
  option("protein", "galette", "Galette de pomme de terre (végétarien)"),
  option("protein", "galette-base", "Galette de pommes de terre"),
  option("protein", "vegetarian", vegetarianInstruction),
  option("meat-type", "halal", "Viande halal"),
  option("meat-type", "non-halal", "Viande non halal"),
  option("salad", "roquette", "Roquette"),
  option("salad", "tomate", "Tomate"),
  option("salad", "oignons", "Oignons caramélisés"),
  option("salad", "cornichons", "Cornichons"),
  option("salad", "concombre", "Concombre"),
  option("salad", "chou-rouge", "Chou rouge"),
  option("salad", "salade-thai", "Salade thaï"),
  option("salad", "oignon", "Oignon"),
  option("salad", "sans-crudites", "Pas de crudités", 0, { exclusive: true }),
  option("sauces", "ketchup", "Ketchup"),
  option("sauces", "mayo", "Mayonnaise"),
  option("sauces", "moutarde", "Moutarde"),
  option("sauces", "barbecue", "Barbecue"),
  option("sauces", "tartare", "Tartare"),
  option("sauces", "blanche", "Blanche"),
  option("sauces", "bearnaise", "Béarnaise"),
  option("sauces", "bleu", "Sauce au bleu"),
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
  option("sides", "frites-cheddar-sans-bacon", "Frites cheddar sans bacon ajoutées", 4.9),
  option("sides", "frites-cheddar", "Frites cheddar bacon ajoutées", 6.9),
  option("sides", "tenders", "3 Tenders ajoutés", 6.9),
  option("menu-fries", "maison", "Frites maison incluses dans le menu", 0),
  option("menu-fries", "cheddar", "Frites du menu remplacées par des frites cheddar sans bacon", 1),
  option("menu-fries", "cheddar-bacon", "Frites du menu remplacées par des frites cheddar bacon", 2.5),
  option("solo-fries", "maison", "Menu Solo : frites maison incluses", 0),
  option("solo-fries", "cheddar", "Menu Solo : frites cheddar sans bacon en remplacement", 1),
  option("solo-fries", "cheddar-bacon", "Menu Solo : frites cheddar bacon en remplacement", 2.5),
  option("duo-fries-one", "maison", "Menu Duo · personne 1 : frites maison incluses", 0),
  option("duo-fries-one", "cheddar", "Menu Duo · personne 1 : frites cheddar sans bacon en remplacement", 1),
  option("duo-fries-one", "cheddar-bacon", "Menu Duo · personne 1 : frites cheddar bacon en remplacement", 2.5),
  option("duo-fries-two", "maison", "Menu Duo · personne 2 : frites maison incluses", 0),
  option("duo-fries-two", "cheddar", "Menu Duo · personne 2 : frites cheddar sans bacon en remplacement", 1),
  option("duo-fries-two", "cheddar-bacon", "Menu Duo · personne 2 : frites cheddar bacon en remplacement", 2.5),
  option("desserts", "oreo", "Tiramisu Oreo", 3.9),
  option("desserts", "cookie", "Tiramisu cookie", 3.9),
  option("desserts", "speculoos", "Tiramisu spéculoos", 3.9),
  option("menu-desserts", "oreo", "Tiramisu Oreo", 2),
  option("menu-desserts", "cookie", "Tiramisu cookie", 2),
  option("menu-desserts", "speculoos", "Tiramisu spéculoos", 2),
  ...["solo-dessert", "duo-dessert-one", "duo-dessert-two"].flatMap((groupId) => [
    option(groupId, "oreo", "Tiramisu Oreo", 2),
    option(groupId, "cookie", "Tiramisu cookie", 2),
    option(groupId, "speculoos", "Tiramisu spéculoos", 2)
  ]),
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
  'meat-type': { max: 1 },
  salad: { min: 1, max: 5 },
  sauces: { min: 1, max: 1 },
  drink: { min: 1, max: 1 },
  "duo-drink-one": { min: 1, max: 1 },
  "duo-drink-two": { min: 1, max: 1 },
  "solo-fries": { max: 1 },
  "duo-fries-one": { max: 1 },
  "duo-fries-two": { max: 1 },
  extras: {},
  sides: {},
  'menu-fries': { max: 1 },
  desserts: { max: 1 },
  'menu-desserts': { max: 1 },
  'solo-dessert': { max: 1 },
  'duo-dessert-one': { max: 1 },
  'duo-dessert-two': { max: 1 }
};
const MENU_GROUPS = new Set(["protein", "meat-type", "salad", "sauces", "drink", "extras", "sides", "menu-fries", "menu-desserts"]);
const BURGER_GROUPS = new Set(["protein", "meat-type", "salad", "sauces", "extras", "sides", "desserts"]);
const DUO_GROUPS = new Set(["duo-fries-one", "duo-fries-two", "duo-drink-one", "duo-drink-two", "duo-dessert-one", "duo-dessert-two"]);
const SOLO_GROUPS = new Set(["solo-fries", "drink", "solo-dessert"]);
const FRIES_CHOICE_GROUPS = new Set(["menu-fries", "solo-fries", "duo-fries-one", "duo-fries-two"]);
const DESSERT_CHOICE_GROUPS = new Set(["desserts", "menu-desserts", "solo-dessert", "duo-dessert-one", "duo-dessert-two"]);
const SIMPLE_GROUPS = new Set();

const cents = (value) => Math.round(Number(value) * 100);
const orderInputError = (message) => Object.assign(new Error(message), { statusCode: 400 });
// Stock is shared by a standalone product and the same product selected in a menu.
const optionProductId = ({ groupId, id }) => {
  if (groupId === "custom-protein") return PROTEINS.find((choice) => choice.id === id)?.productId || null;
  if (groupId === "custom-extra") return EXTRA_STOCK_IDS[id] || null;
  if (groupId === "custom-cheese") return { cheddar: "ingredient-cheddar", mozzarella: "ingredient-mozzarella", raclette: "ingredient-raclette", fourme: "ingredient-fourme" }[id] || null;
  if (groupId === "protein" && ['galette','galette-base','vegetarian'].includes(id)) return "ingredient-potato-patty";
  if (groupId === "extras") return {
    "second-steak": "ingredient-second-steak", "galette-plus": "ingredient-potato-patty", cheddar: "ingredient-cheddar",
    raclette: "ingredient-raclette", mozzarella: "ingredient-mozzarella", fourme: "ingredient-fourme", lard: "ingredient-lard", bacon: "ingredient-bacon"
  }[id];
  if (DESSERT_CHOICE_GROUPS.has(groupId)) return { oreo: "dessert-oreo", cookie: "dessert-cookie", speculoos: "dessert-speculoos", framboise: "dessert-framboise" }[id];
  if (FRIES_CHOICE_GROUPS.has(groupId)) return { maison: "frites-maison", cheddar: "frites-cheddar", "cheddar-bacon": "frites-cheddar-bacon" }[id];
  if (groupId === "sides") return { frites: "frites-maison", "frites-cheddar-sans-bacon": "frites-cheddar", "frites-cheddar": "frites-cheddar-bacon", tenders: "tenders-xl-3" }[id];
  if (groupId === "drink" || groupId?.startsWith("duo-drink-")) {
    const productId = `drink-${({ lipton: "lipton-peche", oasis: "oasis-pomme" })[id] || id}`;
    return Object.hasOwn(PRODUCT_CATALOG, productId) ? productId : null;
  }
  return null;
};

const productStock = (id, overrides = {}) => {
  const product = Object.hasOwn(STOCK_CATALOG, id) ? STOCK_CATALOG[id] : null;
  if (!product) return { available: false, enabled: false, reason: "Ce produit n’est plus à la carte." };
  const enabled = product.retired ? false : Object.hasOwn(overrides, id) ? overrides[id] : !product.soldOut;
  if (!enabled) return { available: false, enabled: false, reason: `${product.name} est momentanément indisponible.` };
  const included = product.menu ? ["frites-maison"] : ["duo", "solo"].includes(product.kind) ? ["frites-maison", "tenders-xl-3"] : [];
  for (const includedId of included) {
    if (!productStock(includedId, overrides).available) return { available: false, enabled: true, reason: `${product.name} : ${PRODUCT_CATALOG[includedId].name} indisponibles.` };
  }
  return { available: true, enabled: true, reason: "" };
};

const availabilityCatalog = (overrides = {}, now = new Date()) => ({
  products: Object.entries(STOCK_CATALOG).map(([id, product]) => ({
    id, name: product.menu ? `Menu - ${product.name}` : product.name, ...offerCatalogProduct(id, product.price, now),
    category: product.category || (product.menu ? "menus" : id.startsWith("drink-") ? "drinks" : product.kind ? "snacks" : "burgers"),
    retired: Boolean(product.retired),
    ...productStock(id, overrides)
  })),
  options: Object.fromEntries([...OPTIONS,
    ...PROTEINS.map((choice) => ({ groupId: "custom-protein", id: choice.id })),
    ...CHEESES.map((choice) => ({ groupId: "custom-cheese", id: choice.id })),
    ...EXTRAS.map((choice) => ({ groupId: "custom-extra", id: choice.id })),
    ...["desserts", "menu-desserts"].map((groupId) => ({ groupId, id: "framboise" }))
  ].map((entry) => {
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

const validatedSelections = (product, selections, productId) => {
  if (!Array.isArray(selections)) throw orderInputError("Actualise l’application avant de commander.");
  if (product.custom) {
    try { return pricedOptions(parseSelectionEntries(selections)); }
    catch (error) { throw orderInputError(error.message); }
  }
  const allowedGroups = product.kind === "simple" ? SIMPLE_GROUPS : product.kind === "duo" ? DUO_GROUPS : product.kind === "solo" ? SOLO_GROUPS : product.menu ? MENU_GROUPS : BURGER_GROUPS;
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
    if (rule.min && count < rule.min) throw orderInputError(groupId === "drink" ? "Choisis une boisson dans chaque menu avant de commander." : "Complète les choix requis avant de commander.");
    if (rule.max && count > rule.max) throw orderInputError(`Tu peux sélectionner au maximum ${rule.max} choix dans cette catégorie.`);
    if (count > 1 && byGroup[groupId].some((entry) => entry.exclusive)) throw orderInputError("Deux choix incompatibles ont été sélectionnés.");
  }
  if (product.fixedSauce && (byGroup.sauces.length !== 1 || byGroup.sauces[0].id !== product.fixedSauce)) throw orderInputError("La sauce de ce burger est imposée. Actualise l’application avant de commander.");
  // Android v4 still offers the former crudités. Keep accepting those choices
  // until that installed version has been replaced; the web UI shows the new
  // recipe-specific lists without making existing carts fail at checkout.
  if (allowedGroups.has('meat-type')) {
    const vegetarian = byGroup.protein[0]?.id === 'galette';
    const meatType = byGroup['meat-type'][0]?.id;
    const kioskPatty = ['galette-base','vegetarian'].includes(byGroup.protein[0]?.id);
    const realVegetarian = byGroup.protein[0]?.id === 'vegetarian';
    if (kioskPatty && meatType) throw orderInputError('La galette remplace la viande : retire le choix de viande.');
    if (realVegetarian && resolved.some(meatOption)) throw orderInputError('Le burger végétarien ne peut pas contenir de viande, bacon, lard ou tenders.');
    // Android v4 has no meat-type selector. An absent choice stays absent: never
    // infer halal/non-halal. Still validate explicit choices from cached clients.
    if (vegetarian && meatType) throw orderInputError('Retire le choix de viande pour la version végétarienne.');
    if (vegetarian && resolved.some(porkOption)) throw orderInputError('Le bacon de porc ne convient pas à la version végétarienne.');
    if (meatType === 'halal' && (byGroup['menu-fries']?.some(option => option.id === 'cheddar-bacon') || byGroup.sides.some(option => option.id === 'frites-cheddar'))) throw orderInputError('Les frites cheddar bacon contiennent du bacon de porc, non halal. Cette option est indisponible avec une viande halal.');
    if (meatType === 'halal' && (containsPork(productId) || resolved.some(porkOption))) throw orderInputError('Cette recette ou un supplément contient du porc et ne peut pas être commandé en version halal.');
  }
  return resolved;
};

const validateAndPriceOrderItems = (inputItems, overrides = {}, context = {}, now = new Date()) => {
  if (!Array.isArray(inputItems) || !inputItems.length || inputItems.length > 20) throw orderInputError("Le panier est invalide.");
  let subtotalCents = 0;
  const items = inputItems.map((input) => {
    const productId = String(input?.productId || "");
    const product = Object.hasOwn(PRODUCT_CATALOG, productId) ? PRODUCT_CATALOG[productId] : null;
    if (!product) throw orderInputError("Un produit du panier n’existe plus.");
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw orderInputError("La quantité demandée est invalide.");
    const selections = validatedSelections(product, input.selections, productId);
    assertItemAvailable(productId, selections, overrides);
    const offer = productOfferForService(productId, context, now);
    const basePrice = offer ? offer.price : product.price;
    const unitPriceCents = cents(basePrice) + selections.reduce((sum, entry) => sum + cents(entry.price), 0);
    subtotalCents += unitPriceCents * quantity;
    return {
      productId,
      name: product.name,
      quantity,
      price: unitPriceCents / 100,
      ...(offer ? { basePrice, regularBasePrice: product.price, productOfferId: offer.id } : {}),
      options: selections.map(({ groupId, id, label, price }) => ({ groupId, id, label: ['montagnes','montagnes-menu'].includes(productId) && groupId === 'protein' && id === 'galette' ? 'Galette de pomme de terre (bacon conservé)' : label, price }))
    };
  });
  return { items, subtotal: subtotalCents / 100 };
};

const amendmentCatalog = (overrides = {}) => ({
  ...availabilityCatalog(overrides),
  definitions: Object.fromEntries(Object.entries(PRODUCT_CATALOG).map(([id,p]) => [id, { ...p, groups: [...(p.kind === "simple" ? SIMPLE_GROUPS : p.kind === "duo" ? DUO_GROUPS : p.kind === "solo" ? SOLO_GROUPS : p.menu ? MENU_GROUPS : BURGER_GROUPS)] }])),
  choices: OPTIONS, rules: GROUP_RULES
});

module.exports = { amendmentCatalog, PRODUCT_CATALOG, STOCK_CATALOG, availabilityCatalog, assertStoredOrderAvailable, validateAndPriceOrderItems };
