const test = require('node:test'), assert = require('node:assert/strict');
const replacements = require('./order-replacements'), amendments = require('./order-amendments');
const { validateAndPriceOrderItems } = require('./catalog');
const now = Date.parse('2026-10-14T10:00:00Z');
function order(items) {
  const cart = validateAndPriceOrderItems(items);
  return { id: 'o1', customerId: 'c1', method: 'pickup', serviceDate: '2026-10-14', slot: '19:00', payment: { status: 'PAID' }, status: 'confirmed', items: cart.items, subtotal: cart.subtotal, total: cart.subtotal, discountRate: 0, deliveryFee: 0, createdAt: new Date(now).toISOString() };
}
const drink = id => ({ productId: 'drink-' + id, quantity: 2, selections: [] });
test('replacement: only missing category changes, quantity and original basket preserved until restaurant confirmation', () => {
  const o = order([drink('coca'), { productId: 'dessert-cookie', quantity: 1, selections: [] }]), original = structuredClone(o.items);
  replacements.requestReplacement(o, { revision: 0, reason: 'Coca indisponible', targets: ['0:product'] }, now);
  const offered = replacements.options(o, { 'drink-coca': false }, now);
  assert(offered.choices[0].alternatives.every(p => p.id.startsWith('drink-') && p.id !== 'drink-coca'));
  assert.throws(() => replacements.submit(o, { revision: 1, choices: [{ target: '0:product', productId: 'dessert-oreo' }] }, {}, now));
  replacements.submit(o, { revision: 1, choices: [{ target: '0:product', productId: 'drink-perrier' }] }, {}, now);
  replacements.submit(o, { revision: 1, choices: [{ target: '0:product', productId: 'drink-perrier' }] }, {}, now);
  assert.throws(() => replacements.submit(o, { revision: 1, choices: [{ target: '0:product', productId: 'drink-tropico' }] }, {}, now), /déjà envoyés/);
  assert.deepEqual(o.items, original); assert.equal(o.amendment.phase, 'submitted');
  assert.throws(() => amendments.decide(o, { revision: 1, decision: 'accept' }, {}, now));
  replacements.confirm(o, { revision: 1, decision: 'accept' }, {}, now);
  assert.equal(o.items[0].productId, 'drink-perrier'); assert.equal(o.items[0].quantity, 2); assert.deepEqual(o.items[1], original[1]);
});
test('replacement: dessert alternatives, stale stock/revision, rejection, refusal and refund accounting', () => {
  const o = order([{ productId: 'dessert-speculoos', quantity: 1, selections: [] }]);
  replacements.requestReplacement(o, { revision: 0, reason: 'Dessert indisponible', targets: ['0:product'] }, now);
  assert(replacements.options(o, {}, now).choices[0].alternatives.every(p => p.id.startsWith('dessert-')));
  const chosen = { revision: 1, choices: [{ target: '0:product', productId: 'dessert-cookie' }] };
  assert.throws(() => replacements.submit(o, chosen, { 'dessert-cookie': false }, now));
  replacements.submit(o, chosen, {}, now);
  assert.throws(() => replacements.confirm(o, { revision: 1, decision: 'accept' }, { 'dessert-cookie': false }, now));
  replacements.confirm(o, { revision: 1, decision: 'reject' }, {}, now);
  assert.equal(o.amendment.phase, 'choosing'); assert.equal(o.amendment.revision, 2);
  assert.throws(() => replacements.submit(o, chosen, {}, now));
  amendments.decide(o, { revision: 2, decision: 'refuse' }, {}, now);
  assert.equal(o.status, 'cancelled'); assert.equal(o.refund.amount, 3.9); assert.equal(o.refund.status, 'due');
});
test('replacement: menu drink/fries component and whole menu/burger categories', () => {
  const selections = [{ groupId: 'protein', id: 'viande' }, { groupId: 'salad', id: 'sans-crudites' }, { groupId: 'sauces', id: 'sans-sauce' }, { groupId: 'menu-fries', id: 'cheddar' }, { groupId: 'drink', id: 'coca' }];
  const o = order([{ productId: 'classique-menu', quantity: 1, selections }]);
  replacements.requestReplacement(o, { revision: 0, reason: 'Boisson indisponible', targets: ['0:drink:coca'] }, now);
  assert(replacements.options(o, {}, now).choices[0].alternatives.every(c => c.groupId === 'drink'));
  replacements.submit(o, { revision: 1, choices: [{ target: '0:drink:coca', id: 'perrier' }] }, {}, now);
  assert.equal(o.amendment.proposal.items[0].options.find(c => c.groupId === 'drink').id, 'perrier');
  for (const id of ['classique-menu', 'classique']) assert.equal(replacements.category(id), id.endsWith('-menu') ? 'menus' : 'burgers');
  const fries = order([{ productId: 'frites-cheddar', quantity: 1, selections: [] }]);
  replacements.requestReplacement(fries, { revision: 0, reason: 'Frites cheddar indisponibles', targets: ['0:product'] }, now);
  replacements.submit(fries, { revision: 1, choices: [{ target: '0:product', productId: 'frites-maison' }] }, {}, now);
  replacements.confirm(fries, { revision: 1, decision: 'accept' }, {}, now);
  assert.equal(fries.refund.amount, 1); assert.equal(fries.paidTotal, 4.9);
});
test('replacement: Solo, Duo and Taurus stay in menus; a composed burger stays in burgers', () => {
  for (const id of ['menu-solo-tenders', 'menu-duo-tenders', 'taurus', 'montagnes-menu', 'classique-menu']) assert.equal(replacements.category(id), 'menus', id);
  for (const id of ['custom-burger', 'montagnes', 'classique']) assert.equal(replacements.category(id), 'burgers', id);
  const o = order([{ productId: 'menu-solo-tenders', quantity: 1, selections: [{ groupId: 'drink', id: 'coca' }] }]);
  replacements.requestReplacement(o, { revision: 0, reason: 'Menu Solo indisponible', targets: ['0:product'] }, now);
  const offered = replacements.options(o, {}, now).choices[0];
  assert.equal(offered.category, 'menus'); assert(offered.alternatives.length > 0);
  assert(offered.alternatives.every(p => replacements.category(p.id) === 'menus'));
  assert(!offered.alternatives.some(p => p.id === 'tenders-xl-3' || p.id.startsWith('drink-')));
});
