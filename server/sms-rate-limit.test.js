const test = require("node:test");
const assert = require("node:assert/strict");
const { createSmsAttemptLimiter } = require("./sms-rate-limit");

test("bloque après trois SMS réellement envoyés", () => {
  let timestamp = 0;
  const limiter = createSmsAttemptLimiter({ now: () => timestamp });

  for (let count = 0; count < 3; count += 1) {
    assert.equal(limiter.check("+33612345678").allowed, true);
    limiter.recordSuccess("+33612345678");
  }

  assert.deepEqual(limiter.check("+33612345678"), { allowed: false, retryAfterSeconds: 900 });
});

test("ne consomme aucune tentative quand aucun succès n'est enregistré", () => {
  const limiter = createSmsAttemptLimiter();

  for (let count = 0; count < 10; count += 1) {
    assert.equal(limiter.check("+33612345678").allowed, true);
  }
});

test("réinitialise automatiquement le quota après quinze minutes", () => {
  let timestamp = 0;
  const limiter = createSmsAttemptLimiter({ now: () => timestamp });

  for (let count = 0; count < 3; count += 1) limiter.recordSuccess("+33612345678");
  timestamp = 15 * 60 * 1000;

  assert.equal(limiter.check("+33612345678").allowed, true);
});
