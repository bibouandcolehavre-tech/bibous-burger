const test = require('node:test');
const assert = require('node:assert/strict');
const { supportsNewCustomerJourneys, supportsRankingContest } = require('../customer-experience-policy');

test('the approved new journeys run on web and Android, but not the iPhone review build', () => {
  assert.equal(supportsNewCustomerJourneys('web'), true);
  assert.equal(supportsNewCustomerJourneys('android'), true);
  assert.equal(supportsNewCustomerJourneys('ios'), false);
});

test('the Android release does not include the ranking contest', () => {
  assert.equal(supportsRankingContest('android'), false);
  assert.equal(supportsRankingContest('web'), true);
});
