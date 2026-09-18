const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CUSTOMER_SESSION_DURATION_MS,
  createCustomerSession,
  readCustomerSession,
} = require("./customer-session");

const secret = "une-cle-de-test-suffisamment-longue-et-privee";

test("conserve une connexion client valable pendant trente jours", () => {
  const token = createCustomerSession("customer-12", secret, { now: 1_000 });

  assert.deepEqual(readCustomerSession(token, secret, { now: 2_000 }), {
    customerId: "customer-12",
    expiresAt: 1_000 + CUSTOMER_SESSION_DURATION_MS,
  });
});

test("refuse une session expirée", () => {
  const token = createCustomerSession("customer-12", secret, { now: 1_000, durationMs: 500 });

  assert.equal(readCustomerSession(token, secret, { now: 1_500 }), null);
});

test("refuse une session modifiée", () => {
  const token = createCustomerSession("customer-12", secret, { now: 1_000 });
  const [version, payload, signature] = token.split(".");
  const changedPayload = Buffer.from(JSON.stringify({ customerId: "customer-99", expiresAt: 99_999 })).toString("base64url");

  assert.equal(readCustomerSession(`${version}.${changedPayload}.${signature}`, secret, { now: 2_000 }), null);
  assert.equal(readCustomerSession(`${token}x`, secret, { now: 2_000 }), null);
});

test("refuse une session signée avec une autre clé", () => {
  const token = createCustomerSession("customer-12", secret, { now: 1_000 });

  assert.equal(readCustomerSession(token, "une-autre-cle-secrete", { now: 2_000 }), null);
});
