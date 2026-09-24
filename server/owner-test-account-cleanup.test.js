const test = require('node:test');
const assert = require('node:assert/strict');
const { CLEANUP_KEY, removeAuthorizedOwnerTestAccounts } = require('./owner-test-account-cleanup');

test('one-time cleanup removes only the four owner-authorized test identities', () => {
  const customers = [
    ['one', 'Client Bibou', '0767656655'], ['two', 'juste', '06 56 56 56 56'],
    ['three', 'arnaud laurent', '078313416'], ['four', 'Arnaud Laurent', '+33783139416'],
    ['real', 'Arnaud Laurent', '+33612345678'], ['other', 'Client Bibou', '+33699999999']
  ].map(([id, name, phone]) => ({ id, name, phone }));
  const database = { customers, orders: [], reservations: [], rewardClaims: [], bibouPlusPurchases: [] };
  const removed = removeAuthorizedOwnerTestAccounts(database, new Date('2026-09-24T12:00:00Z'));
  assert.equal(removed.length, 4);
  assert.deepEqual(database.customers.map(customer => customer.id), ['real', 'other']);
  assert.equal(database.maintenance[CLEANUP_KEY].removed, 4);
  assert.deepEqual(removeAuthorizedOwnerTestAccounts(database), []);
});

test('cleanup is inert when no exact authorized identity exists', () => {
  const database = { customers: [{ id: 'real', name: 'Client réel', phone: '0656565656' }] };
  assert.deepEqual(removeAuthorizedOwnerTestAccounts(database), []);
  assert.equal(database.maintenance[CLEANUP_KEY], undefined);
  assert.equal(database.customers.length, 1);
});
