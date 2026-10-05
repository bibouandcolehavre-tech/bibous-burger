const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldShowPartnerLaunch } = require('../partner-launch-policy');

test('STB opening appears on Android and the public web home', () => {
  assert.equal(shouldShowPartnerLaunch('android', 'menu'), true);
  assert.equal(shouldShowPartnerLaunch('web', 'menu'), true);
});

test('STB opening stays off iPhone and direct legal or contest pages', () => {
  assert.equal(shouldShowPartnerLaunch('ios', 'menu'), false);
  assert.equal(shouldShowPartnerLaunch('web', 'privacy'), false);
  assert.equal(shouldShowPartnerLaunch('web', 'contest'), false);
});
