const test = require('node:test');
const assert = require('node:assert/strict');
const { validateIdentity, hasCompleteIdentity } = require('../customer-identity');
const { createRegistrationStore } = require('./customer-registration');
const { readCustomerSession } = require('./customer-session');

test('Identity: both real name fields required, Unicode and compound names supported', () => {
  assert.deepEqual(validateIdentity({ firstName: '  Jean-Paul ', lastName: ' de  La Tour ' }), { firstName: 'Jean-Paul', lastName: 'de La Tour', name: 'Jean-Paul de La Tour' });
  for (const [firstName, lastName] of [['Éloïse', 'D’Angelo'], ['李', '王'], ['Māia', "O'Connor"]]) assert.equal(hasCompleteIdentity({ firstName, lastName }), true);
  for (const value of ['', '  ', '12345', '<script>', '🙂', [], {}, 'A'.repeat(61)]) {
    assert.ok(validateIdentity({ firstName: value, lastName: 'Dupont' }).error);
    assert.ok(validateIdentity({ firstName: 'Alice', lastName: value }).error);
  }
  assert.equal(hasCompleteIdentity({ name: 'Alice Dupont' }), false, 'Never guess how to split an existing name');
});

test('Registration proofs expire, cannot authenticate customers, and are bounded/idempotent', () => {
  const store = createRegistrationStore({ ttlMs: 1000, maxEntries: 1 }), now = Date.now();
  const token = store.issue('+33600000001', now);
  assert.equal(store.read(token, now).phone, '+33600000001');
  assert.equal(readCustomerSession(token, 'test-secret'), null);
  assert.equal(store.read(token + 'x', now), null);
  assert.equal(store.read(null, now), null);
  assert.throws(() => store.issue('+33600000002', now), { statusCode: 429 });
  store.complete(token, 'customer-1');
  assert.equal(store.read(token, now).customerId, 'customer-1');
  assert.equal(store.read(token, now + 1000), null);
  assert.ok(store.issue('+33600000002', now + 1001));
});
