const test = require('node:test');
const assert = require('node:assert/strict');
const { supportsNewCustomerJourneys, supportsRankingContest } = require('../customer-experience-policy');

test('the approved customer journeys run on web, Android and iPhone', () => {
  assert.equal(supportsNewCustomerJourneys('web'), true);
  assert.equal(supportsNewCustomerJourneys('android'), true);
  assert.equal(supportsNewCustomerJourneys('ios'), true);
});

test('the ranking contest is shared by all three platforms', () => {
  assert.equal(supportsRankingContest('android'), true);
  assert.equal(supportsRankingContest('ios'), true);
  assert.equal(supportsRankingContest('web'), true);
});
