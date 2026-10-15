// Fail the website/native build if the old customer entry point is reintroduced.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = __dirname, read = name => fs.readFileSync(path.join(root, name), 'utf8');
assert.equal(JSON.parse(read('package.json')).main, './customer-entry.js', 'Customer builds must use the shared customer entry.');
for (const file of ['CustomerJourneyScreens.js', 'ContestWelcome.js', 'ContestCampaignCards.js', 'ContestEntryCard.js', 'ContestPrizes.js', 'ArticleReviews.js', 'ReplacementChoices.js', 'consumer-recipe.js', 'cart-client.js', 'assets/stb-le-havre-logo.jpg']) assert(fs.existsSync(path.join(root, file)), 'Missing approved customer module: ' + file);
const policy = require('./customer-experience-policy');
for (const platform of ['ios', 'android', 'web']) {
  assert.equal(policy.supportsNewCustomerJourneys(platform), true, 'Approved customer features disabled on ' + platform);
  assert.equal(policy.supportsRankingContest(platform), true, 'Contest disabled on ' + platform);
}
assert.match(read('App.js'), /<ContestWelcome /);
assert.match(read('ContestEntry.web.js'), /ContestEntryCard/);
assert.match(read('ContestEntry.native.js'), /ContestEntryCard/);
assert.match(read('app-store-links.js'), /id6817744169/);
assert.equal(read('ContestRegistration.native.js'), read('ContestRegistration.web.js'), 'Native and web contest registration must share the approved component.');
assert.match(read('ContestRegistration.native.js'), /ContestRegistrationContent/);
assert.match(read('ContestRegistrationContent.js'), /Ce bouton ne t’inscrit pas encore au concours/);
assert.match(read('ContestRegistrationContent.js'), /Confirmer mon inscription au concours/);
console.log('Shared customer interface and contest entry verified.');
