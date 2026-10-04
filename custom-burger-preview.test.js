const test = require('node:test');
const assert = require('node:assert/strict');
const { PROTEINS, EXTRAS, initialBurger, priceCents, stockAvailable } = require('./custom-burger-preview');

test('prix de départ identique aux burgers seuls comparables', () => {
  const prices = { boeuf: 990, poulet: 1190, canard: 1390, agneau: 1390, pork: 1190, hambagu: 1190 };
  for (const protein of PROTEINS.filter((choice) => choice.reference)) {
    const selection = { ...initialBurger(), protein: protein.id, bread: protein.recipe.bread, cheese: protein.recipe.cheese, sauces: [protein.recipe.sauce], crudites: [] };
    assert.equal(priceCents(selection), prices[protein.id], protein.label);
  }
});

test('pain au charbon à +1 € hors recettes qui l’incluent', () => {
  assert.equal(priceCents({ ...initialBurger(), bread: 'charbon' }), 1090);
  assert.equal(priceCents({ ...initialBurger(), protein: 'agneau', bread: 'charbon', cheese: 'chevre' }), 1390);
});

test('suppléments et crudités supplémentaires augmentent le prix', () => {
  const selection = { ...initialBurger(), crudites: ['roquette', 'tomate', 'oignons', 'cornichons', 'concombre', 'chou-rouge'], sauces: ['barbecue', 'mayo'], extras: ['bacon'] };
  assert.equal(priceCents(selection), 1190);
});

test('jambon de Parme absent et agneau sélectionnable lorsque le catalogue le permet', () => {
  assert.equal(EXTRAS.some((option) => /parme/i.test(option.label)), false);
  assert.equal(stockAvailable({ products: [{ id: 'atlas', available: true }] }, 'atlas'), true);
  assert.equal(stockAvailable({ products: [{ id: 'atlas', available: false }] }, 'atlas'), false);
});
