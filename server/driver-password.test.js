'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const K = require('./krokly-drivers'), P = require('./driver-password');
function setup() {
  const db = { orders: [{ id: 'unchanged-course' }] }, now = Date.now();
  const a = K.createDriver(db, { username: 'alice', name: 'Alice TEST' }, now), b = K.createDriver(db, { username: 'bob', name: 'Bob TEST' }, now);
  const driver = db.kroklyDrivers[0], session = K.sessionFor(db, a.driver.username, a.password, 'secret', now);
  return { db, now, a, b, driver, session };
}
test('self change requires current password and matching memorable phrase; failure never mutates account', async () => {
  const h = setup(), before = structuredClone(h.db), newPassword = 'trois mots personnels TEST';
  for (const input of [
    { currentPassword: 'wrong', newPassword, confirmation: newPassword },
    { currentPassword: h.a.password, newPassword, confirmation: 'different' },
    { currentPassword: h.a.password, newPassword: 'short', confirmation: 'short' },
    { currentPassword: h.a.password, newPassword, confirmation: newPassword, driverId: h.b.driver.id },
  ]) {
    await assert.rejects(() => K.changeOwnPassword(h.db, h.driver, input, h.now), e => [400, 401].includes(e.statusCode));
    assert.deepEqual(h.db, before);
  }
});
test('new phrase uses scrypt-v2, revokes old sessions/availability, preserves other accounts and courses', async () => {
  const h = setup(), other = structuredClone(h.db.kroklyDrivers[1]), newPassword = 'ma phrase de test privée';
  h.driver.krokliAvailability = { available: true, revision: 3, authVersion: 1, expiresAt: h.now + 100000, since: new Date(h.now).toISOString() };
  const result = await K.changeOwnPassword(h.db, h.driver, { currentPassword: h.a.password, newPassword, confirmation: newPassword }, h.now);
  assert.deepEqual(result, { changed: true, reconnect: true }); assert.equal(h.driver.passwordKdf, 'scrypt-v2');
  assert.equal(h.driver.authVersion, 2); assert.equal(h.driver.krokliAvailability.available, false);
  assert.equal(K.authenticate(h.db, h.session.token, 'secret', h.now), null);
  assert.throws(() => K.sessionFor(h.db, 'alice', h.a.password, 'secret', h.now), { statusCode: 401 });
  assert.ok(K.sessionFor(h.db, 'alice', newPassword, 'secret', h.now).token);
  assert.equal(JSON.stringify(h.db).includes(newPassword), false);
  assert.deepEqual(h.db.kroklyDrivers[1], other); assert.deepEqual(h.db.orders, [{ id: 'unchanged-course' }]);
  const reset = K.resetPassword(h.db, h.driver.id); assert.ok(K.sessionFor(h.db, 'alice', reset.password, 'secret', h.now).token);
});
test('password page is mobile, no third-party script/tracker, strict CSP and no secret persistence', () => {
  const html = P.page();
  assert.match(html, /name="viewport"/); assert.match(html, /autocomplete="current-password"/); assert.match(html, /autocomplete="new-password"/);
  assert.match(html, /15 caractères minimum/); assert.match(html, /Afficher les mots de passe/);
  assert.match(P.csp, /connect-src 'self'/); assert.match(P.csp, /frame-ancestors 'none'/); assert.match(P.csp, /script-src 'sha256-/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|console\.|<script src|google-analytics|googletagmanager/);
  for (const value of ['123456789012345', 'a'.repeat(15), 'passwordpassword']) assert.throws(() => P.validatePassword(value, value), { statusCode: 400 });
  P.validatePassword('une phrase longue très simple', 'une phrase longue très simple');
});
