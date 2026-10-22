// Fail the website/native build if the old customer entry point is reintroduced.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = __dirname, read = name => fs.readFileSync(path.join(root, name), 'utf8');
assert.equal(JSON.parse(read('package.json')).main, './customer-entry.js', 'Customer builds must use the shared customer entry.');
for (const file of ['CustomerJourneyScreens.js', 'ContestWelcome.js', 'ContestCampaignCards.js', 'ContestEntryCard.js', 'ContestPrizes.js', 'ArticleReviews.js', 'ReplacementChoices.js', 'consumer-recipe.js', 'cart-client.js', 'WheelAfterPayment.js', 'wheel-presentation.js', 'assets/stb-le-havre-logo.jpg']) assert(fs.existsSync(path.join(root, file)), 'Missing approved customer module: ' + file);
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
assert.match(read('WheelAfterPayment.js'), /testID="wheel-remaining-counter"/);
for (const file of ['WheelArtwork.js', 'WheelAvailableNotice.js']) assert(fs.existsSync(path.join(root, file)), 'Missing shared wheel module: ' + file);
assert.match(read('WheelAfterPayment.js'), /<WheelArtwork diameter=\{diameter\} rotation=\{rotation\}/);
assert.match(read('WheelArtwork.js'), /width=\{diameter\} height=\{diameter\}/);
console.log('Shared customer interface and contest entry verified.');
for (const file of ['DeliveryTracking.js', 'BibouCourierMarker.js', 'DeliveryFeedback.js', 'DriverTipOffer.js', 'session-recovery.js', 'session-storage-queue.js', 'ContestReferralPanel.js']) assert(fs.existsSync(path.join(root, file)), 'Missing customer update module: ' + file);
assert.match(read('App.js'), /<DeliveryTracking /);
assert.match(read('App.js'), /<DeliveryFeedback /);
assert.match(read('App.js'), /onOpenReferral=\{openReferral\}/);
assert.match(read('DeliveryTracking.js'), /delivery-tracking/);
assert.match(read('DeliveryFeedback.js'), /<DriverTipOffer /);
assert.equal(require('./bibou-plus-offer').BIBOU_PLUS_PRICE, 5.99);
assert.equal(require('./bibou-plus-offer').BIBOU_PLUS_DURATION_DAYS, 30);
console.log('Customer delivery, feedback, referral, session and Bibou Plus update modules verified.');
for (const file of ['CustomerInvoiceButton.js', 'invoice-download.native.js', 'invoice-download.web.js']) assert(fs.existsSync(path.join(root, file)), 'Missing invoice download module: ' + file);
assert.match(read('App.js'), /<CustomerInvoiceButton api=\{api\} token=\{token\} orderId=\{order.apiId\}/);
assert.match(read('CustomerInvoiceButton.js'), /Confirmer et télécharger le PDF/);
assert.match(read('invoice-download.native.js'), /application\/pdf/);
console.log('Private per-order invoice download modules verified.');
