const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('./krokly-drivers');
const { parisDateKey } = require('./availability');

function fixture() {
  const now = Date.now();
  const order = (id, status = 'ready', method = 'delivery') => ({
    id, number: Number(id.slice(6)), method, status, payment: { status: 'PAID' },
    customerName: 'Client fictif', customerPhone: '0600000000',
    deliveryAddress: { address: '1 rue fictive', postalCode: '76600', city: 'Le Havre' },
    serviceDate: parisDateKey(new Date(now)), slot: '19:00', distanceKm: 1.2
  });
  return { now, db: { orders: [order('order-1'), order('order-2'), order('order-3', 'preparing'), order('order-4', 'ready', 'pickup')] } };
}

test('separate courier accounts use hashed passwords and independent sessions', () => {
  const { db, now } = fixture();
  const lina = K.createDriver(db, { username: 'Lina', name: 'Lina' }, now);
  const malik = K.createDriver(db, { username: 'Malik', name: 'Malik' }, now);
  assert.equal(db.kroklyDrivers[0].username, 'lina');
  assert.notEqual(db.kroklyDrivers[0].passwordHash, lina.password);
  assert.equal(JSON.stringify(db).includes(lina.password), false);
  assert.notEqual(lina.password, malik.password);
  const session = K.sessionFor(db, 'lina', lina.password, 'secret', now);
  assert.equal(K.authenticate(db, session.token, 'secret', now).id, lina.driver.id);
  assert.equal(K.authenticate(db, session.token, 'wrong-secret', now), null);
  assert.equal(K.authenticate(db, session.token, 'secret', now + 12 * 3600_000), null);
  assert.throws(() => K.sessionFor(db, 'lina', malik.password, 'secret', now), error => error.statusCode === 401);
  K.resetPassword(db, lina.driver.id);
  assert.equal(K.authenticate(db, session.token, 'secret', now), null);
});

test('only paid ready delivery orders without active Uber can be assigned', () => {
  const { db, now } = fixture();
  const lina = K.createDriver(db, { username: 'lina', name: 'Lina' }, now);
  const malik = K.createDriver(db, { username: 'malik', name: 'Malik' }, now);
  assert.throws(() => K.assign(db, 'order-3', lina.driver.id, now), error => error.statusCode === 409);
  assert.throws(() => K.assign(db, 'order-4', lina.driver.id, now), error => error.statusCode === 409);
  db.orders[2].status = 'ready';
  db.orders[2].serviceDate = '2020-01-01';
  assert.throws(() => K.assign(db, 'order-3', lina.driver.id, now), error => error.statusCode === 409, 'Old ready orders must never appear in a new pilot dispatch');
  db.orders[1].uberDirect = { phase: 'sending' };
  assert.throws(() => K.assign(db, 'order-2', lina.driver.id, now), error => error.statusCode === 409);
  K.assign(db, 'order-1', lina.driver.id, now);
  assert.throws(() => K.assign(db, 'order-1', malik.driver.id, now), error => error.statusCode === 409);
  assert.equal(K.assigned(db, malik.driver.id).length, 0);
  assert.equal(K.assigned(db, lina.driver.id).length, 1);
  assert.equal(K.assigned(db, lina.driver.id)[0].deliveryAddress, undefined, 'destination details stay hidden before acceptance');
});

test('copied courier credentials tolerate surrounding whitespace but not wrong password characters', () => {
  const { db, now } = fixture();
  const created = K.createDriver(db, { username: 'mathieu', name: 'Mathieu' }, now);
  const session = K.sessionFor(db, '  MATHIEU\n', `\u00a0${created.password}\n `, 'secret', now);
  assert.equal(K.authenticate(db, session.token, 'secret', now).id, created.driver.id);
  const wrong = (created.password[0] === 'A' ? 'B' : 'A') + created.password.slice(1);
  assert.throws(() => K.sessionFor(db, 'mathieu', ` ${wrong} `, 'secret', now), error => error.statusCode === 401);
  assert.throws(() => K.sessionFor(db, 'mathieu', null, 'secret', now), error => error.statusCode === 401);
});

test('only assigned courier advances the real order through delivery steps', () => {
  const { db, now } = fixture();
  const lina = K.createDriver(db, { username: 'lina', name: 'Lina' }, now);
  const malik = K.createDriver(db, { username: 'malik', name: 'Malik' }, now);
  K.assign(db, 'order-1', lina.driver.id, now);
  assert.throws(() => K.transition(db, 'order-1', malik.driver.id, 'accept', now), error => error.statusCode === 404);
  K.transition(db, 'order-1', lina.driver.id, 'accept', now);
  assert.equal(K.assigned(db, lina.driver.id)[0].deliveryAddress.address, '1 rue fictive');
  assert.throws(() => K.transition(db, 'order-1', lina.driver.id, 'deliver', now), error => error.statusCode === 409);
  K.transition(db, 'order-1', lina.driver.id, 'pickup', now);
  assert.equal(db.orders[0].status, 'out_for_delivery');
  K.transition(db, 'order-1', lina.driver.id, 'deliver', now);
  assert.equal(db.orders[0].status, 'delivered');
  assert.equal(K.assigned(db, lina.driver.id).length, 0);
});

test('expired offer can be reassigned to another courier, and deactivation revokes access', () => {
  const { db, now } = fixture();
  const lina = K.createDriver(db, { username: 'lina', name: 'Lina' }, now);
  const malik = K.createDriver(db, { username: 'malik', name: 'Malik' }, now);
  const session = K.sessionFor(db, 'lina', lina.password, 'secret', now);
  K.assign(db, 'order-1', lina.driver.id, now);
  assert.equal(K.expireOffers(db, now + K.OFFER_MS + 1), true);
  K.assign(db, 'order-1', malik.driver.id, now + K.OFFER_MS + 1);
  assert.equal(K.assigned(db, lina.driver.id).length, 0);
  assert.equal(K.assigned(db, malik.driver.id).length, 1);
  K.setActive(db, lina.driver.id, false);
  assert.equal(K.authenticate(db, session.token, 'secret', now), null);
});
