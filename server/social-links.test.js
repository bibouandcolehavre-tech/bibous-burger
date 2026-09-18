const test = require("node:test");
const assert = require("node:assert/strict");
const { SOCIAL_PROFILES, isSocialProfileUrl, openSocialProfile } = require("../social-links");
const icons = require("../social-icons");

test("social profiles use the owner's three exact addresses and local vector icons", () => {
  assert.deepEqual(SOCIAL_PROFILES.map(({ url }) => url), [
    "https://www.instagram.com/bibousburgers/?hl=fr",
    "https://www.facebook.com/p/Bibous-Burgers-61586807056617/",
    "https://www.tiktok.com/@bibouburgers",
  ]);
  for (const profile of SOCIAL_PROFILES) {
    assert.equal(isSocialProfileUrl(profile), true);
    assert.match(icons[profile.icon].path, /^M/);
    assert.match(icons[profile.icon].viewBox, /^0 0 \d+ \d+$/);
  }
});

test("social links reject malformed URLs, insecure schemes and lookalike hosts", () => {
  for (const url of ["", "javascript:alert(1)", "http://www.instagram.com/bibousburgers/", "https://www.instagram.com.evil.example/bibousburgers/", "https://user:password@www.instagram.com/bibousburgers/", "https://www.instagram.com:8080/bibousburgers/", "https://www.instagram.com/"]) {
    assert.equal(isSocialProfileUrl({ id: "instagram", url }), false);
  }
  assert.equal(isSocialProfileUrl({ id: "facebook", url: SOCIAL_PROFILES[0].url }), false);
  assert.equal(isSocialProfileUrl(null), false);
});

test("native opening uses the supplied public HTTPS link without modifying it", async () => {
  for (const profile of SOCIAL_PROFILES) {
    const opened = [];
    assert.equal(await openSocialProfile(profile, async url => opened.push(url), () => assert.fail("Unexpected error")), true);
    assert.deepEqual(opened, [profile.url]);
  }
});

test("native opening failures produce a French message instead of a silent tap", async () => {
  const messages = [];
  const result = await openSocialProfile(SOCIAL_PROFILES[0], async () => { throw new Error("Unavailable"); }, (...args) => messages.push(args));
  assert.equal(result, false);
  assert.deepEqual(messages, [["Lien indisponible", "Impossible d’ouvrir Instagram pour le moment. Réessaie dans quelques instants."]]);
});

test("invalid social configuration never launches an external URL", async () => {
  let message;
  assert.equal(await openSocialProfile({ label: "Instagram", url: "https://example.com" }, () => assert.fail("Must not open"), title => { message = title; }), false);
  assert.equal(message, "Lien indisponible");
});
