const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
test('web registration separates account creation, explicit consent and published prize details', () => {
  const source = read('ContestRegistrationContent.js');
  assert.match(source, /Ce bouton ne t’inscrit pas encore au concours/);
  assert.match(source, /Ton compte est prêt\. Tu n’es pas encore inscrit au concours/);
  assert.match(source, /accessibilityLabel="Confirmer mon inscription au concours"/);
  assert.match(source, /disabled=\{busy \|\| !accepted \|\| !adult \|\| !region\}/);
  assert.match(source, /contest\.firstPrize/);
  assert.match(source, /contest\.secondPrize/);
  assert.match(source, /contest\.thirdPrize/);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage/);
});
test('approved enrollment is shared unchanged on web, Android and iPhone, with server-confirmed participation', () => {
  const screen = read('ContestScreen.js');
  assert.match(screen, /const enrollment = contest\?\.status === 'active' && !participation/);
  assert.doesNotMatch(screen, /enrolmentControls/);
  assert.doesNotMatch(read('ContestRegistrationContent.js'), /Platform\.OS/);
  assert.match(screen, /if \(!response\.ok\) throw new Error\(result\.error \|\| 'Participation impossible\.'\)/);
  assert.match(screen, /if \(epoch\.current === id\) \{ setData\(result\); setJoinedNow\(Boolean\(result\.participation\)\); \}/);
  assert.match(screen, /joinedNow && participation/);
  assert.equal(read('ContestRegistration.native.js'), read('ContestRegistration.web.js'));
  assert.match(read('ContestRegistration.native.js'), /ContestRegistrationContent/);
});
