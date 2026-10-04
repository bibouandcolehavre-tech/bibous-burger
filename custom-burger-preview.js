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

module.exports = { BASE_CENTS, PROTEINS, BREADS, CHEESES, SAUCES, CRUDITES, EXTRAS, initialBurger, priceCents, stockAvailable };
