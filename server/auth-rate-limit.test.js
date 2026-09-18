const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthRateLimiter } = require('./auth-rate-limit');

test('limite les essais, annonce le délai et ne prolonge pas le blocage à chaque essai', () => {
  let timestamp = 1000;
  const limiter = createAuthRateLimiter({ limit: 2, windowMs: 60000, now: () => timestamp });
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('a').allowed, true);
  assert.deepEqual(limiter.consume('a'), { allowed: false, retryAfterSeconds: 60 });
  timestamp += 30000;
  assert.deepEqual(limiter.consume('a'), { allowed: false, retryAfterSeconds: 30 });
  timestamp += 30000;
  assert.equal(limiter.consume('a').allowed, true);
});

test('une connexion valide réinitialise ses essais, sans débloquer les autres', () => {
  const limiter = createAuthRateLimiter({ limit: 1 });
  limiter.consume('a'); limiter.consume('b'); limiter.reset('a');
  assert.equal(limiter.consume('a').allowed, true);
  assert.equal(limiter.consume('b').allowed, false);
});

test('mémoire bornée : varier les identifiants ne chasse pas un blocage actif', () => {
  let timestamp = 0;
  const limiter = createAuthRateLimiter({ limit: 1, maxKeys: 2, windowMs: 1000, now: () => timestamp });
  limiter.consume('a'); limiter.consume('b');
  assert.equal(limiter.consume('c').allowed, false);
  assert.equal(limiter.consume('a').allowed, false);
  timestamp = 1000;
  assert.equal(limiter.consume('c').allowed, true);
});
