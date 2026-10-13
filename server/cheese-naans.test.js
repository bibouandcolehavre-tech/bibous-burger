const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { CHEESE_NAANS, lunchSlot, parisServiceClock } = require('../cheese-naans');
const { availabilityCatalog, validateAndPriceOrderItems } = require('./catalog');
const { createProductStockStore } = require('./product-stock');
const { visibleCustomerProducts } = require('../stock-client');
test('naan loyalty uses the approved 10 points solo / 15 points menu', () => {
  const { naanLoyaltyPoints } = require('../cheese-naans');
  for (const productId of Object.keys(CHEESE_NAANS)) {
    assert.equal(naanLoyaltyPoints({ productId, options: [{ groupId: 'naan-format', id: 'solo' }] }), 10);
    assert.equal(naanLoyaltyPoints({ productId, options: [{ groupId: 'naan-format', id: 'menu' }] }), 15);
  }
  assert.equal(naanLoyaltyPoints({ productId: 'drink-coca', options: [] }), 0);
});
const NOON = new Date('2026-10-14T10:20:00Z'); // 12:20 in Paris, not host time.
const CONTEXT = { method: 'pickup', serviceDate: '2026-10-14', slot: '12:40' };
const choice = (groupId, id) => ({ groupId, id });
const solo = [choice('naan-format', 'solo')];
const fries = [choice('naan-format', 'menu'), choice('naan-side', 'fries'), choice('drink', 'coca')];
const dessert = [choice('naan-format', 'menu'), choice('naan-side', 'dessert'), choice('naan-dessert', 'cookie'), choice('drink', 'coca')];
const order = (selections = solo, stock = {}, context = CONTEXT, id = 'naan-poulet', quantity = 1) => validateAndPriceOrderItems([{ productId: id, quantity, price: .01, selections }], stock, context, NOON);
const row = (time, stock = {}, database = {}) => availabilityCatalog(stock, new Date(time), database).products.find(p => p.id === 'naan-poulet');
async function withPublication(t) {
  const previous = process.env.CHEESE_NAANS_PUBLISHED;
  process.env.CHEESE_NAANS_PUBLISHED = 'true';
  t.after(() => { if (previous === undefined) delete process.env.CHEESE_NAANS_PUBLISHED; else process.env.CHEESE_NAANS_PUBLISHED = previous; });
}
test('les trois recettes restent non publiées, même après réactivation du stock', () => {
  const previous = process.env.CHEESE_NAANS_PUBLISHED; delete process.env.CHEESE_NAANS_PUBLISHED;
  try {
    const products = availabilityCatalog({ 'naan-poulet': true }, NOON).products.filter(p => p.category === 'naans');
    assert.equal(products.length, 3);
    assert.ok(products.every(p => !p.published && !p.visible && !p.available));
    assert.equal(products[0].enabled, true);
    assert.throws(() => order(solo, {}, { ...CONTEXT, CHEESE_NAANS_PUBLISHED: true }), /pas encore publiés/);
  } finally { if (previous !== undefined) process.env.CHEESE_NAANS_PUBLISHED = previous; }
});
test('apparition automatique à midi, disparition à 14 h et le soir, heure de Paris été/hiver', async t => {
  await withPublication(t);
  for (const [time, open] of [['2026-10-14T09:59:59Z',false],['2026-10-14T10:00:00Z',true],['2026-10-14T11:59:59Z',true],['2026-10-14T12:00:00Z',false],['2026-10-14T17:00:00Z',false],['2026-12-02T11:00:00Z',true],['2026-12-02T13:00:00Z',false]]) {
    assert.equal(row(time).visible, open, time);
  }
  assert.equal(parisServiceClock(new Date('2026-12-02T11:00:00Z')).minutes, 720);
  assert.equal(row('2026-10-17T10:20:00Z').visible, false, 'pas de service du midi standard le samedi');
  const date='2026-10-14', slots=Object.fromEntries(['12:00','12:20','12:40','13:00','13:20','13:40'].map(s=>[s,false]));
  assert.equal(row('2026-10-14T10:20:00Z', {}, { serviceSchedule: { dates: { [date]: { services: { pickup: slots, delivery: slots } } } } }).visible, false, 'une fermeture du service est respectée');
});
test('un horaire du soir ou un intervalle dépassant le midi ne peut pas être forgé au paiement', async t => {
  await withPublication(t);
  for (const slot of ['19:00','11:59','14:00','13:90','13:30 – 14:30','12:20oops','']) assert.throws(() => order(solo, {}, { ...CONTEXT, slot }), /service du midi/);
  for (const slot of ['12:00','13:40','13:30 – 14:00']) assert.equal(lunchSlot(slot), true);
  assert.equal(order().subtotal, 7.9);
});
test('prix recalculés à 7,90 € seul et 10,90 € avec boisson et frites OU dessert', async t => {
  await withPublication(t);
  for (const id of Object.keys(CHEESE_NAANS)) {
    assert.equal(order(solo, {}, CONTEXT, id).subtotal, 7.9);
    for (const options of [fries, dessert]) {
      const cart = order(options, {}, CONTEXT, id, 2);
      assert.equal(cart.subtotal, 21.8); assert.match(cart.items[0].name, /^Menu · Cheese naan/);
      assert.deepEqual(cart.items[0].options.find(o => o.groupId === 'drink'), { groupId: 'drink', id: 'coca', label: 'Coca 33 cl', price: 0 });
    }
  }
  for (const options of [[], [choice('naan-format','menu')], [choice('naan-format','solo'),choice('naan-side','fries')], [...fries,choice('naan-side','dessert')], [...fries,choice('naan-dessert','cookie')], [choice('naan-format','menu'),choice('naan-side','dessert')], [...dessert,choice('naan-dessert','oreo')], [...solo,choice('drink','coca')]]) assert.throws(() => order(options));
});
test('le menu exige une seule boisson incluse, conservée sur le ticket et sans supplément', async t => {
  await withPublication(t);
  for (const options of [fries, dessert]) {
    assert.throws(() => order(options.filter(o => o.groupId !== 'drink')), /Choisis une boisson/);
    assert.throws(() => order([...options, choice('drink', 'perrier')]), /au maximum 1/);
    for (const drink of ['coca', 'perrier', 'oasis-pomme', 'eau']) {
      const cart = order(options.map(o => o.groupId === 'drink' ? choice('drink', drink) : o));
      assert.equal(cart.subtotal, 10.9);
      assert.equal(cart.items[0].options.filter(o => o.groupId === 'drink').length, 1);
      assert.equal(cart.items[0].options.find(o => o.groupId === 'drink').id, drink);
    }
  }
  assert.equal(order(solo).subtotal, 7.9);
  assert.throws(() => order([...solo, choice('drink', 'coca')]), /ni accompagnement ni boisson/);
});
test('une rupture de recette bloque le naan seul et le menu ; les accompagnements partagent leur stock', async t => {
  await withPublication(t);
  for (const selection of [solo, fries, dessert]) assert.throws(() => order(selection, { 'naan-poulet': false }), /indisponible/);
  assert.equal(order(solo, { 'frites-maison': false }).subtotal, 7.9);
  assert.equal(order(dessert, { 'frites-maison': false }).subtotal, 10.9);
  assert.throws(() => order(fries, { 'frites-maison': false }), /plus disponible/);
  assert.throws(() => order(dessert, { 'dessert-cookie': false }), /plus disponible/);
  assert.throws(() => order(fries, { 'drink-coca': false }), /plus disponible/);
  assert.throws(() => order(dessert, { 'drink-coca': false }), /plus disponible/);
  assert.equal(order(solo, { 'drink-coca': false }).subtotal, 7.9);
  const data = availabilityCatalog({ 'dessert-cookie': false, 'frites-maison': false }, NOON);
  assert.equal(data.options['naan-dessert:cookie'], false);
  assert.equal(data.options['naan-side:fries'], false);
  assert.equal(availabilityCatalog({ 'drink-coca': false }, NOON).options['drink:coca'], false);
});
test('le passage au midi du lendemain ne réactive jamais une rupture ; stockage et réouverture distincts', async t => {
  await withPublication(t);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-naan-stock-')); t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'stock.json'), store=createProductStockStore(file);
  await store.update('naan-poulet',false);
  assert.equal(row('2026-10-15T10:20:00Z', await createProductStockStore(file).read()).available, false);
  assert.equal(row('2026-10-15T10:20:00Z', await store.read()).availabilityState, 'out_of_stock');
  await store.update('naan-poulet',true);
  assert.equal(row('2026-10-15T10:20:00Z', await store.read()).available, true);
  assert.equal(row('2026-10-15T17:20:00Z', await store.read()).available, false);
});
test('les nouvelles applications cachent les recettes horaires sans preuve récente du serveur', async t => {
  await withPublication(t);
  const products=[{id:'classique'},...Object.entries(CHEESE_NAANS).map(([id,p])=>({id,...p}))];
  assert.deepEqual(visibleCustomerProducts(products,null).map(p=>p.id),['classique']);
  assert.equal(visibleCustomerProducts(products,availabilityCatalog({},NOON)).length,4);
  assert.deepEqual(visibleCustomerProducts(products,availabilityCatalog({},new Date('2026-10-14T17:00:00Z'))).map(p=>p.id),['classique']);
});
