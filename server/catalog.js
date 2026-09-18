const PRODUCT_CATALOG = {
  taurus: { name: "Le Taurus", price: 16.9, menu: true },
  "montagnes-menu": { name: "À travers les montagnes", price: 16.9, menu: true },
  "atlas-menu": { name: "Au sommet de l'Atlas", price: 18.9, menu: true, soldOut: true },
  "classique-menu": { name: "Classique, simple et efficace", price: 14.9, menu: true },
  "duck-menu": { name: "Duck", price: 18.9, menu: true },
  "dynamite-menu": { name: "Dynamite Chicken", price: 16.9, menu: true },
  "gros-lard-menu": { name: "Le gros lard", price: 16.9, menu: true },
  "hambagu-menu": { name: "Hambagu", price: 16.9, menu: true },
  "basilic-menu": { name: "Le basilic du potager", price: 16.9, menu: true },
  "pork-menu": { name: "Le Pork", price: 16.9, menu: true },
  atlas: { name: "Au sommet de l'Atlas", price: 13.9 },
  classique: { name: "Classique, simple et efficace", price: 9.9 },
  duck: { name: "Duck", price: 13.9 },
  dynamite: { name: "Dynamite Chicken", price: 11.9 },
  hambagu: { name: "Hambagu", price: 11.9 },
  basilic: { name: "Le basilic du potager", price: 11.9 },
  montagnes: { name: "À travers les montagnes", price: 11.9 },
  "gros-lard": { name: "Le gros lard", price: 11.9 },
  pork: { name: "Le Pork", price: 11.9 },
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
  option("extras", "second-steak", "Second steak", 3),
  option("extras", "galette-plus", "Galette de pomme de terre", 2),
  option("extras", "cheddar", "Cheddar", 1),
  option("extras", "raclette", "Raclette", 1),
  option("extras", "mozzarella", "Mozzarella", 1),
  option("extras", "fourme", "Fourme d'Ambert", 1),
  option("extras", "lard", "Lard fumé", 1.5),
  option("extras", "bacon", "Bacon", 1),
  option("sides", "frites", "Frites maison", 3.9),
  option("sides", "frites-cheddar", "Frites cheddar bacon", 6.9),
  option("sides", "tenders", "3 Tenders", 6.9),
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
  return resolved;
};

const validateAndPriceOrderItems = (inputItems) => {
  if (!Array.isArray(inputItems) || !inputItems.length || inputItems.length > 20) throw orderInputError("Le panier est invalide.");
  let subtotalCents = 0;
  const items = inputItems.map((input) => {
    const productId = String(input?.productId || "");
    const product = PRODUCT_CATALOG[productId];
    if (!product) throw orderInputError("Un produit du panier n’existe plus.");
    if (product.soldOut) throw orderInputError("Ce produit est momentanément indisponible.");
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw orderInputError("La quantité demandée est invalide.");
    const selections = validatedSelections(product, input.selections);
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

module.exports = { PRODUCT_CATALOG, validateAndPriceOrderItems };
