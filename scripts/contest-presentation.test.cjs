const test = require('node:test');
const assert = require('node:assert/strict');
const { contestPresentation, authDestination, INSTAGRAM_REEL, INSTAGRAM_PROFILE } = require('../contest-presentation');
const contest = { id: 'bibou-launch', status: 'active', startDate: '2026-10-15', startTime: '11:00', endDate: '2026-12-31', firstPrize: '2 menus par mois pendant 12 mois', secondPrize: '1 menu par mois pendant 6 mois', thirdPrize: '2 menus en une seule commande', scoring: { pointsPerVerifiedReferral: 20, pointsPerAwardedWheelPoint: 1 } };
const now = Date.parse('2026-10-15T15:00:00Z');
test('active campaign uses actual published prizes and explicit participation', () => {
  const info = contestPresentation(contest, null, now);
  assert.equal(info.action, 'Je participe au concours');
  assert.equal(info.prizes[0].detail, contest.firstPrize);
  assert.equal(info.prizes[2].title, '3e place · 2 menus');
  assert.equal(info.referralPoints, 20); assert.equal(info.wheelIncluded, true);
  assert.equal(info.instagramUrl, INSTAGRAM_REEL);
});
test('existing participant goes to rank, not another enrollment', () => assert.equal(contestPresentation(contest, { score: 60 }, now).action, 'Voir mon classement'));
test('inactive campaign is hidden', () => assert.equal(contestPresentation({ ...contest, status: 'inactive' }, null, now), null));
test('scheduled and closed campaigns never promise open participation or Instagram', () => {
  for (const status of ['scheduled', 'closed']) {
    const info = contestPresentation({ ...contest, status }, null, now);
    assert.equal(info.active, false); assert.equal(info.instagramOpen, false);
    assert.notEqual(info.action, 'Je participe au concours');
  }
});
test('no Instagram draw during December 29–31; ranking remains open', () => {
  const info = contestPresentation(contest, null, Date.parse('2026-12-29T00:00:00+01:00'));
  assert.equal(info.active, true); assert.equal(info.instagramOpen, false);
});
test('later quinzaines go to updated official Instagram publications, not stale first Reel', () => {
  assert.equal(contestPresentation(contest, null, Date.parse('2026-10-30T00:00:00+01:00')).instagramUrl, INSTAGRAM_PROFILE);
});
test('after closure no stale server active flag can advertise participation', () => {
  assert.equal(contestPresentation(contest, null, Date.parse('2027-01-01T00:00:00+01:00')).active, false);
});
test('network failure offers neutral access, without invented prizes or eligibility', () => {
  const info = contestPresentation(null, null, now);
  assert.equal(info.active, false); assert.equal(info.prizes.length, 0); assert.equal(info.instagramOpen, false);
});
test('different contest does not inherit Bibou launch prizes or Instagram campaign', () => {
  const info = contestPresentation({ ...contest, id: 'other' }, null, now);
  assert.deepEqual(info.prizes, []); assert.equal(info.instagramOpen, false);
});
test('new contest account returns straight to contest, without optional marketing detour', () => {
  assert.equal(authDestination({ loginDestination: 'contest', isNewCustomer: true, nativeAccountFirst: true }), 'contest');
  assert.equal(authDestination({ loginDestination: 'contest', preferencesChosen: true }), 'contest');
});
test('kiosk approval and normal onboarding retain priority and prior behavior', () => {
  assert.equal(authDestination({ phonePairing: {}, loginDestination: 'contest', isNewCustomer: true }), 'kiosk-phone-approval');
  assert.equal(authDestination({ loginDestination: 'menu', isNewCustomer: true, nativeAccountFirst: true }), 'notifications-welcome');
  assert.equal(authDestination({ loginDestination: 'details', isNewCustomer: false }), 'details');
});
