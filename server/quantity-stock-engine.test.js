const test = require('node:test'), assert = require('node:assert/strict');
const stock = require('./quantity-stock');
test('production stock: burger/menu share quantities; included drinks, fries and extras count every serving', () => {
  const db = {};
  for (const id of ['montagnes', 'drink-coca', 'frites-maison', 'ingredient-bacon']) stock.setQuantity(db, id, { quantity: 2, revision: 0 });
  const menu = { id: 'fixture', items: [{ productId: 'montagnes-menu', quantity: 2, options: [{ groupId: 'drink', id: 'coca' }, { groupId: 'extras', id: 'bacon' }] }], payment: { status: 'PENDING' } };
  stock.reserve(db, menu);
  for (const id of ['montagnes', 'montagnes-menu', 'drink-coca', 'frites-maison', 'ingredient-bacon']) assert.equal(stock.available(db, id), 0);
  assert.throws(() => stock.reserve(db, { ...menu, id: 'second-fixture' }));
  menu.payment.status = 'PAID'; stock.commit(db, menu); stock.commit(db, menu);
  for (const id of ['montagnes', 'drink-coca', 'frites-maison', 'ingredient-bacon']) assert.equal(stock.status(db, id).quantity, 0);
});
test('production stock: pending banking retains stock over restart; expiry and manual flags remain independent', () => {
  const now = new Date('2026-10-12T16:00:00Z');
  const order = { id: 'fictional', createdAt: now.toISOString(), items: [{ productId: 'drink-coca', quantity: 1 }], payment: { status: 'PENDING', checkoutReference: 'fictional' } };
  const db = { orders: [order] }; stock.setQuantity(db, 'drink-coca', { quantity: 1, revision: 0 }, now);
  const restarted = JSON.parse(JSON.stringify(db));
  stock.reconcile(restarted, new Date(now.getTime() + 86400000)); assert.equal(stock.available(restarted, 'drink-coca'), 0);
  restarted.orders[0].payment.status = 'EXPIRED'; stock.reconcile(restarted, now); assert.equal(stock.available(restarted, 'drink-coca'), 1);
  assert.equal(stock.effectiveFlags(restarted, { 'drink-coca': false })['drink-coca'], false);
});
