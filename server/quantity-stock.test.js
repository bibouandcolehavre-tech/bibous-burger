const test = require('node:test'), assert = require('node:assert/strict');
const stock = require('./quantity-stock');
const order = (id, productId, quantity = 1, options = []) => ({ id, items: [{ productId, quantity, options }], payment: { status: 'PENDING' } });
test('quantity stock: the last unit cannot be reserved twice and payment reconciliation decrements only once', () => {
  const db = {}; stock.setQuantity(db, 'naan-boeuf', { quantity: 3, revision: 0 });
  const first = order('o1', 'naan-boeuf', 2); stock.reserve(db, first);
  assert.equal(stock.available(db, 'naan-boeuf'), 1);
  assert.throws(() => stock.reserve(db, order('o2', 'naan-boeuf', 2)), /assez/);
  const last = order('o3', 'naan-boeuf'); stock.reserve(db, last); assert.equal(stock.available(db, 'naan-boeuf'), 0);
  first.payment.status = 'PAID'; stock.commit(db, first); stock.commit(db, first);
  assert.equal(stock.status(db, 'naan-boeuf').quantity, 1); assert.equal(stock.available(db, 'naan-boeuf'), 0);
  last.payment.status = 'PAID'; stock.commit(db, last); assert.equal(stock.status(db, 'naan-boeuf').quantity, 0);
  assert.equal(stock.effectiveFlags(db, { 'naan-boeuf': true })['naan-boeuf'], false);
});
test('quantity stock: menu and burger use one stock, included Coca and dessert also consume their own quantities', () => {
  const db = {}; for (const id of ['montagnes', 'drink-coca', 'dessert-cookie']) stock.setQuantity(db, id, { quantity: 2, revision: 0 });
  const menu = order('menu', 'montagnes-menu', 1, [{ groupId: 'drink', id: 'coca' }, { groupId: 'menu-desserts', id: 'cookie' }]);
  stock.reserve(db, menu); menu.payment.status = 'PAID'; stock.commit(db, menu);
  for (const id of ['montagnes', 'montagnes-menu', 'drink-coca', 'dessert-cookie']) assert.equal(stock.available(db, id), 1);
  const solo = order('solo', 'montagnes'); stock.reserve(db, solo); assert.equal(stock.available(db, 'montagnes-menu'), 0);
});
test('quantity stock: payment uncertainty keeps the hold; known failure releases it without inventing a paid restock', () => {
  const db = {}; stock.setQuantity(db, 'drink-coca', { quantity: 1, revision: 0 });
  const o = order('o1', 'drink-coca'); stock.reserve(db, o); o.payment.checkoutReference = 'fixture';
  assert.throws(() => stock.release(db, o), /bancaire/); assert.equal(stock.available(db, 'drink-coca'), 0);
  o.payment.status = 'FAILED'; stock.release(db, o); assert.equal(stock.available(db, 'drink-coca'), 1);
  assert.equal(stock.release(db, o), false);
});
test('quantity stock: legacy flags, no daily reset, revisions and counts below held units remain protected', () => {
  const db = {}; assert.equal(stock.available(db, 'drink-coca'), null);
  assert.deepEqual(stock.effectiveFlags(db, { 'drink-coca': false }), { 'drink-coca': false });
  stock.setQuantity(db, 'drink-coca', { quantity: 2, revision: 0 }); stock.reserve(db, order('o1', 'drink-coca', 2));
  assert.throws(() => stock.setQuantity(db, 'drink-coca', { quantity: 1, revision: 1 }), /réservés/);
  assert.throws(() => stock.setQuantity(db, 'drink-coca', { quantity: 5, revision: 0 }), /changé/);
  assert.equal(stock.status(JSON.parse(JSON.stringify(db)), 'drink-coca').availableQuantity, 0);
  stock.setQuantity(db, 'drink-coca', { quantity: null, revision: 1 }); assert.equal(stock.available(db, 'drink-coca'), null);
});
test('quantity stock: activating a counter adopts existing unpaid orders and never exposes private quantities', () => {
  const now = new Date('2026-10-12T16:00:00Z');
  const waiting = { ...order('old-checkout', 'drink-coca', 2), status: 'awaiting_payment', createdAt: '2026-10-11T16:00:00Z', payment: { checkoutReference: 'fictional-old', status: 'PENDING' } };
  const db = { orders: [waiting] };
  assert.throws(() => stock.setQuantity(db, 'drink-coca', { quantity: 1, revision: 0 }, now), /réservés/);
  assert.equal(db.quantityStock, undefined);
  stock.setQuantity(db, 'drink-coca', { quantity: 3, revision: 0 }, now);
  assert.equal(stock.status(db, 'drink-coca').reserved, 2);
  assert.equal(stock.reconcile(db, new Date('2026-10-13T16:00:00Z')), false);
  assert.equal(stock.catalog(db, {}, now).products.find(p => p.id === 'drink-coca').quantityStock, undefined);
  waiting.payment.status = 'PAID'; stock.reconcile(db, now); stock.reconcile(db, now);
  assert.equal(stock.status(db, 'drink-coca').quantity, 1);
});
test('quantity stock: abandoned baskets expire but paid cancellations do not manufacture new stock', () => {
  const now = new Date('2026-10-12T16:00:00Z');
  const abandoned = { ...order('abandoned', 'drink-coca'), status: 'awaiting_payment', createdAt: now.toISOString() };
  const db = { orders: [abandoned] }; stock.setQuantity(db, 'drink-coca', { quantity: 1, revision: 0 }, now);
  assert.equal(stock.available(db, 'drink-coca'), 0);
  stock.reconcile(db, new Date(now.getTime() + 16 * 60000)); assert.equal(stock.available(db, 'drink-coca'), 1);
  const paid = { ...order('paid', 'drink-coca'), createdAt: now.toISOString() }; db.orders.push(paid); stock.reserve(db, paid, now);
  paid.payment.status = 'PAID'; stock.reconcile(db, now); paid.status = 'cancelled'; stock.reconcile(db, now);
  assert.equal(stock.available(db, 'drink-coca'), 0);
});
test('quantity stock: menu naan counts its drink and one side, burger options count extras', () => {
  const menu = order('naan', 'naan-boeuf', 2, [{ groupId: 'naan-format', id: 'menu' }, { groupId: 'naan-side', id: 'dessert' }, { groupId: 'naan-dessert', id: 'oreo' }, { groupId: 'drink', id: 'coca' }]);
  assert.deepEqual(stock.units(menu.items), { 'naan-boeuf': 2, 'dessert-oreo': 2, 'drink-coca': 2 });
  assert.deepEqual(stock.units(order('burg', 'montagnes-menu', 1, [{ groupId: 'menu-fries', id: 'cheddar' }, { groupId: 'extras', id: 'bacon' }]).items), { montagnes: 1, 'frites-cheddar': 1, 'ingredient-bacon': 1 });
});
test('quantity stock: replacement checks aggregate extra units and deducts once without restocking removed food', () => {
  const db = {}; for (const id of ['drink-coca', 'drink-perrier']) stock.setQuantity(db, id, { quantity: 1, revision: 0 });
  const paid = order('paid', 'drink-coca'); stock.reserve(db, paid); paid.payment.status = 'PAID'; stock.commit(db, paid);
  const before = structuredClone(paid.items);
  const tooMany = order('other', 'drink-perrier', 2).items; assert.throws(() => stock.assertChange(db, paid, tooMany), /remplacement/);
  paid.items = order('other', 'drink-perrier').items; stock.applyChange(db, paid, before);
  assert.equal(stock.available(db, 'drink-coca'), 0); assert.equal(stock.available(db, 'drink-perrier'), 0);
  stock.applyChange(db, paid, paid.items); assert.equal(stock.available(db, 'drink-perrier'), 0);
});

test('quantity stock: a late verified payment remains recordable after release, without a negative counter or second deduction', () => {
  const now = new Date('2026-10-12T16:00:00Z');
  const late = { ...order('late', 'drink-coca'), createdAt: now.toISOString(), status: 'awaiting_payment' };
  const other = { ...order('other', 'drink-coca'), createdAt: now.toISOString(), status: 'awaiting_payment' };
  const customer = { id: 'preserved', points: 650, name: 'Client fictif' };
  const reservation = { id: 'table-preserved', status: 'confirmed' };
  const db = { orders: [late], customers: [customer], reservations: [reservation] };
  stock.setQuantity(db, 'drink-coca', { quantity: 1, revision: 0 }, now);
  late.payment.status = 'EXPIRED'; stock.reconcile(db, now);
  assert.equal(stock.available(db, 'drink-coca'), 1);
  db.orders.push(other); stock.reserve(db, other, now);
  other.payment.status = 'PAID'; stock.reconcile(db, now);
  late.payment.status = 'PAID';
  assert.equal(stock.reconcile(db, now), true);
  assert.equal(stock.reconcile(db, now), false);
  assert.equal(stock.status(db, 'drink-coca').quantity, 0);
  assert.equal(stock.status(db, 'drink-coca').shortage, 1);
  assert.equal(db.quantityStock.orders.late.status, 'sold');
  assert.equal(db.orders[0].payment.status, 'PAID');
  assert.deepEqual(db.customers, [customer]); assert.deepEqual(db.reservations, [reservation]);
  stock.setQuantity(db, 'drink-coca', { quantity: 5, revision: 3 }, now);
  assert.equal(stock.status(db, 'drink-coca').shortage, 0);
  assert.equal(db.quantityStock.orders.late.shortages['drink-coca'].quantity, 1);
});

test('quantity stock: late payments consume available units and cannot consume another hold without a restaurant warning', () => {
  const late = order('late', 'drink-coca'), other = order('other', 'drink-coca');
  const db = { orders: [late, other] };
  stock.setQuantity(db, 'drink-coca', { quantity: 1, revision: 0 });
  stock.reserve(db, late); late.payment.status = 'FAILED'; stock.release(db, late);
  stock.reserve(db, other);
  late.payment.status = 'PAID'; stock.reconcile(db);
  assert.equal(stock.available(db, 'drink-coca'), 0);
  assert.equal(stock.status(db, 'drink-coca').reserved, 1);
  assert.equal(stock.status(db, 'drink-coca').shortage, 1);
  assert.throws(() => stock.setQuantity(db, 'drink-coca', { quantity: 0, revision: 2 }), /réservés/);
});

test('quantity stock: a missing counter never turns a paid held product into unlimited availability', () => {
  const paid = order('paid', 'drink-coca'), db = { orders: [paid] };
  stock.setQuantity(db, 'drink-coca', { quantity: 1, revision: 0 }); stock.reserve(db, paid);
  delete db.quantityStock.quantities['drink-coca'];
  paid.payment.status = 'PAID'; stock.reconcile(db);
  assert.equal(stock.available(db, 'drink-coca'), 0);
  assert.equal(stock.status(db, 'drink-coca').shortage, 1);
});

test('quantity stock: default fries, both duo drinks and repeated extras count every serving', () => {
  const menu = order('menu', 'montagnes-menu', 2, [{ groupId: 'drink', id: 'coca' }, { groupId: 'extras', id: 'bacon' }]);
  const duo = order('duo', 'menu-duo-tenders', 1, [{ groupId: 'duo-drink-one', id: 'coca' }, { groupId: 'duo-drink-two', id: 'coca' }]);
  assert.deepEqual(stock.units([...menu.items, ...duo.items]), { montagnes: 2, 'drink-coca': 4, 'ingredient-bacon': 2, 'frites-maison': 4, 'menu-duo-tenders': 1 });
});
test('quantity stock: historical name/price orders get exact stock identities without rewriting any saved field', () => {
  const legacy = { id: 'legacy', items: [{ name: 'À travers les montagnes', quantity: 1, price: 16.9 }], payment: { status: 'PENDING', checkoutReference: 'fictional' } };
  const original = structuredClone(legacy), db = { orders: [legacy] };
  stock.setQuantity(db, 'montagnes', { quantity: 2, revision: 0 });
  stock.setQuantity(db, 'frites-maison', { quantity: 2, revision: 0 });
  stock.setQuantity(db, 'drink-coca', { quantity: 2, revision: 0 });
  assert.deepEqual(legacy, original); assert.equal(stock.available(db, 'montagnes-menu'), 1);
  assert.equal(stock.status(db, 'montagnes').legacyReserved, 1); assert.equal(stock.available(db, 'frites-maison'), 1);
  assert.equal(stock.available(db, 'drink-coca'), 2); // No historical drink was recorded: never invent it.
  stock.reserve(db, legacy); legacy.payment.status = 'PAID'; stock.reconcile(db); stock.reconcile(db);
  assert.equal(stock.status(db, 'montagnes').quantity, 1); assert.equal(stock.status(db, 'frites-maison').quantity, 1);
  assert.deepEqual(legacy.items, original.items);
});
test('quantity stock: unidentifiable historical orders fail closed, and a new order without SKU is still rejected', () => {
  const legacy = { id: 'legacy', items: [{ name: 'À travers les montagnes', quantity: 1, price: 0.01 }], payment: { status: 'PENDING', checkoutReference: 'fictional' } };
  const db = { orders: [legacy] };
  assert.throws(() => stock.setQuantity(db, 'montagnes', { quantity: 2, revision: 0 }), /ambiguïté/);
  assert.equal(db.quantityStock, undefined);
  assert.throws(() => stock.reserve({}, { ...legacy, items: [{ name: 'À travers les montagnes', quantity: 1, price: 16.9 }] }), /invalide/);
});
