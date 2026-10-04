const BASE_CENTS = 690;

const PROTEINS = [
  { id: 'boeuf', label: 'Steak de bœuf frais', cents: 300, productId: 'classique', recipe: { bread: 'brioche', cheese: 'cheddar', sauce: 'barbecue' }, reference: 'Classique' },
  { id: 'poulet', label: 'Tenders de poulet maison', cents: 500, productId: 'dynamite', recipe: { bread: 'brioche', cheese: 'cheddar', sauce: 'thai' }, reference: 'Dynamite Chicken' },
  { id: 'canard', label: 'Canard effiloché', cents: 700, productId: 'duck', recipe: { bread: 'charbon', cheese: 'mozzarella', sauce: 'chinoise' }, reference: 'Duck' },
  { id: 'agneau', label: 'Agneau confit', cents: 700, productId: 'atlas', recipe: { bread: 'charbon', cheese: 'chevre', sauce: 'barbecue-miel' }, reference: 'Au sommet de l’Atlas' },
  { id: 'pork', label: 'Porc effiloché', cents: 500, productId: 'pork', pork: true, recipe: { bread: 'charbon', cheese: 'mozzarella', sauce: 'coreenne' }, reference: 'Le Pork' },
  { id: 'hambagu', label: 'Steak Hambagu bœuf-porc', cents: 500, productId: 'hambagu', pork: true, recipe: { bread: 'charbon', cheese: 'maasdam', sauce: 'hambagu' }, reference: 'Hambagu' },
  { id: 'galette', label: 'Galette de pomme de terre', cents: 300, productId: 'ingredient-potato-patty', recipe: { bread: 'brioche', cheese: 'cheddar', sauce: 'barbecue' }, reference: null }
];

const BREADS = [
  { id: 'brioche', label: 'Pain brioché maison', cents: 0 },
  { id: 'charbon', label: 'Pain au charbon végétal', cents: 100 }
];
const CHEESES = [
  { id: 'cheddar', label: 'Cheddar', cents: 0 },
  { id: 'mozzarella', label: 'Mozzarella', cents: 0 },
  { id: 'maasdam', label: 'Maasdam', cents: 0 },
  { id: 'raclette', label: 'Raclette', cents: 100 },
  { id: 'fourme', label: 'Fourme d’Ambert', cents: 100 },
  { id: 'chevre', label: 'Chèvre', cents: 200 },
  { id: 'sans', label: 'Sans fromage', cents: 0 }
];
const SAUCES = [
  { id: 'barbecue', label: 'Barbecue' }, { id: 'ketchup', label: 'Ketchup' },
  { id: 'mayo', label: 'Mayonnaise' }, { id: 'moutarde', label: 'Moutarde' },
  { id: 'tartare', label: 'Tartare' }, { id: 'blanche', label: 'Blanche' },
  { id: 'bearnaise', label: 'Béarnaise' }, { id: 'thai', label: 'Sauce thaï' },
  { id: 'chinoise', label: 'Sauce chinoise' }, { id: 'hambagu', label: 'Sauce Hambagu' },
  { id: 'coreenne', label: 'Barbecue coréenne' }, { id: 'pesto-rosso', label: 'Pesto rosso' },
  { id: 'pesto-verde', label: 'Pesto verde' }, { id: 'barbecue-miel', label: 'Barbecue miel' }
];
const CRUDITES = [
  { id: 'roquette', label: 'Roquette' }, { id: 'tomate', label: 'Tomate' },
  { id: 'oignons', label: 'Oignons caramélisés' }, { id: 'cornichons', label: 'Cornichons' },
  { id: 'concombre', label: 'Concombre' }, { id: 'chou-rouge', label: 'Chou rouge' },
  { id: 'salade-thai', label: 'Salade thaï' }, { id: 'oignon', label: 'Oignon' }
];
const EXTRAS = [
  { id: 'second-steak', label: 'Deuxième steak de bœuf', cents: 300 },
  { id: 'extra-poulet', label: 'Tenders de poulet en plus', cents: 500 },
  { id: 'extra-canard', label: 'Canard effiloché en plus', cents: 700 },
  { id: 'extra-agneau', label: 'Agneau confit en plus', cents: 700 },
  { id: 'extra-pork', label: 'Porc effiloché en plus', cents: 500, pork: true },
  { id: 'extra-hambagu', label: 'Steak Hambagu en plus', cents: 500, pork: true },
  { id: 'extra-galette', label: 'Galette de pomme de terre', cents: 200 },
  { id: 'extra-cheddar', label: 'Cheddar en plus', cents: 100 },
  { id: 'extra-mozzarella', label: 'Mozzarella en plus', cents: 100 },
  { id: 'extra-maasdam', label: 'Maasdam en plus', cents: 100 },
  { id: 'extra-raclette', label: 'Raclette en plus', cents: 100 },
  { id: 'extra-fourme', label: 'Fourme d’Ambert en plus', cents: 100 },
  { id: 'extra-chevre', label: 'Chèvre en plus', cents: 200 },
  { id: 'bacon', label: 'Bacon de porc', cents: 100, pork: true },
  { id: 'lard', label: 'Lard fumé', cents: 150, pork: true }
];

const EXTRA_STOCK_IDS = {
  'second-steak': 'ingredient-second-steak', 'extra-poulet': 'dynamite', 'extra-canard': 'duck',
  'extra-agneau': 'atlas', 'extra-pork': 'pork', 'extra-hambagu': 'hambagu',
  'extra-galette': 'ingredient-potato-patty', 'extra-cheddar': 'ingredient-cheddar',
  'extra-mozzarella': 'ingredient-mozzarella', 'extra-raclette': 'ingredient-raclette',
  'extra-fourme': 'ingredient-fourme', bacon: 'ingredient-bacon', lard: 'ingredient-lard'
};

const initialBurger = () => ({ protein: 'boeuf', bread: 'brioche', cheese: 'cheddar', sauces: ['barbecue'], crudites: ['roquette', 'tomate', 'oignons', 'cornichons'], extras: [], halal: false });
const find = (items, id) => items.find((item) => item.id === id);
const signatureBreadIncluded = (proteinId) => ['canard', 'agneau', 'pork', 'hambagu'].includes(proteinId);
const priceCents = (selection) => {
  const protein = find(PROTEINS, selection.protein);
  const bread = selection.bread === 'charbon' && !signatureBreadIncluded(selection.protein) ? 100 : 0;
  const cheese = selection.protein === 'agneau' && selection.cheese === 'chevre' ? 0 : (find(CHEESES, selection.cheese)?.cents || 0);
  const extras = selection.extras.reduce((sum, id) => sum + (find(EXTRAS, id)?.cents || 0), 0);
  return BASE_CENTS + (protein?.cents || 0) + bread + cheese + Math.max(0, selection.sauces.length - 1) * 50 + Math.max(0, selection.crudites.length - 5) * 50 + extras;
};
const stockAvailable = (catalog, productId) => catalog?.products?.find((product) => product.id === productId)?.available !== false;

const selectionEntries = (selection) => [
  { groupId: 'custom-protein', id: selection.protein },
  { groupId: 'custom-bread', id: selection.bread },
  { groupId: 'custom-cheese', id: selection.cheese },
  ...selection.sauces.map((id) => ({ groupId: 'custom-sauce', id })),
  ...selection.crudites.map((id) => ({ groupId: 'custom-crudite', id })),
  ...selection.extras.map((id) => ({ groupId: 'custom-extra', id })),
  ...(selection.halal ? [{ groupId: 'custom-diet', id: 'halal' }] : [])
];

const parseSelectionEntries = (entries) => {
  if (!Array.isArray(entries) || entries.length < 3 || entries.length > 50) throw Error('Complète les choix du burger à composer.');
  const groups = {
    'custom-protein': { choices: PROTEINS, limit: 1, required: true, field: 'protein' },
    'custom-bread': { choices: BREADS, limit: 1, required: true, field: 'bread' },
    'custom-cheese': { choices: CHEESES, limit: 1, required: true, field: 'cheese' },
    'custom-sauce': { choices: SAUCES, limit: SAUCES.length, field: 'sauces' },
    'custom-crudite': { choices: CRUDITES, limit: CRUDITES.length, field: 'crudites' },
    'custom-extra': { choices: EXTRAS, limit: EXTRAS.length, field: 'extras' },
    'custom-diet': { choices: [{ id: 'halal' }], limit: 1, field: 'halal' }
  };
  const values = Object.fromEntries(Object.values(groups).map(({ field }) => [field, []]));
  const seen = new Set();
  for (const entry of entries) {
    const group = groups[entry?.groupId];
    const key = `${entry?.groupId}:${entry?.id}`;
    if (!group || !group.choices.some((choice) => choice.id === entry?.id) || seen.has(key)) throw Error('Un ingrédient du burger à composer est invalide.');
    seen.add(key);
    values[group.field].push(entry.id);
    if (values[group.field].length > group.limit) throw Error('Trop de choix dans une catégorie du burger.');
  }
  for (const group of Object.values(groups)) if (group.required && values[group.field].length !== 1) throw Error('Choisis une viande, un pain et un fromage.');
  const selection = {
    protein: values.protein[0], bread: values.bread[0], cheese: values.cheese[0],
    sauces: values.sauces, crudites: values.crudites, extras: values.extras, halal: values.halal.length > 0
  };
  if (selection.halal && (find(PROTEINS, selection.protein)?.pork || selection.extras.some((id) => find(EXTRAS, id)?.pork))) {
    throw Error('Le porc et le bacon ne sont pas disponibles en version halal.');
  }
  return selection;
};

const pricedOptions = (selection) => {
  const protein = find(PROTEINS, selection.protein);
  const bread = find(BREADS, selection.bread);
  const cheese = find(CHEESES, selection.cheese);
  return [
    { groupId: 'custom-protein', id: protein.id, label: protein.label, price: protein.cents / 100 },
    { groupId: 'custom-bread', id: bread.id, label: bread.label, price: bread.id === 'charbon' && !signatureBreadIncluded(protein.id) ? 1 : 0 },
    { groupId: 'custom-cheese', id: cheese.id, label: cheese.label, price: protein.id === 'agneau' && cheese.id === 'chevre' ? 0 : cheese.cents / 100 },
    ...selection.sauces.map((id, index) => ({ groupId: 'custom-sauce', id, label: find(SAUCES, id).label, price: index ? 0.5 : 0 })),
    ...selection.crudites.map((id, index) => ({ groupId: 'custom-crudite', id, label: find(CRUDITES, id).label, price: index >= 5 ? 0.5 : 0 })),
    ...selection.extras.map((id) => ({ groupId: 'custom-extra', id, label: find(EXTRAS, id).label, price: find(EXTRAS, id).cents / 100 })),
    ...(selection.halal ? [{ groupId: 'custom-diet', id: 'halal', label: 'Version halal', price: 0 }] : [])
  ];
};

module.exports = { BASE_CENTS, PROTEINS, BREADS, CHEESES, SAUCES, CRUDITES, EXTRAS, EXTRA_STOCK_IDS, initialBurger, priceCents, pricedOptions, selectionEntries, parseSelectionEntries, stockAvailable };
