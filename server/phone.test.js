const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFrenchMobile } = require("../phone");

test("accepte les formats mobiles français courants", () => {
  assert.equal(normalizeFrenchMobile("06 12 34 56 78"), "0612345678");
  assert.equal(normalizeFrenchMobile("+33 6 12 34 56 78"), "+33612345678");
  assert.equal(normalizeFrenchMobile("0033 7 12 34 56 78"), "+33712345678");
});

test("refuse un numéro incomplet ou non mobile", () => {
  assert.equal(normalizeFrenchMobile("06 12 34"), null);
  assert.equal(normalizeFrenchMobile("02 35 12 34 56"), null);
});
