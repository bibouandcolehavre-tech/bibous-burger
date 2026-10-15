const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
test('web registration separates account creation, explicit consent and published prize details', () => {
  const source = read('ContestRegistration.web.js');
  assert.match(source, /Ce bouton ne t’inscrit pas encore au concours/);
  assert.match(source, /Ton compte est prêt\. Tu n’es pas encore inscrit au concours/);
  assert.match(source, /accessibilityLabel="Confirmer mon inscription au concours"/);
  assert.match(source, /disabled=\{busy \|\| !accepted \|\| !adult \|\| !region\}/);
  assert.match(source, /contest\.firstPrize/);
  assert.match(source, /contest\.secondPrize/);
  assert.match(source, /contest\.thirdPrize/);
  assert.doesNotMatch(source, /fetch\(|localStorage|sessionStorage/);
});
test('web-only proposal preserves native enrollment and waits for server-confirmed participation', () => {
  const screen = read('ContestScreen.js');
  assert.match(screen, /const webEnrollment = Platform\.OS === 'web' && contest\?\.status === 'active' && !participation/);
  assert.match(screen, /Platform\.OS !== 'web' && enrolmentControls/);
  assert.match(screen, /if \(!response\.ok\) throw new Error\(result\.error \|\| 'Participation impossible\.'\)/);
  assert.match(screen, /if \(epoch\.current === id\) \{ setData\(result\); setJoinedNow\(Boolean\(result\.participation\)\); \}/);
  assert.match(screen, /joinedNow && participation/);
  assert.match(read('ContestRegistration.native.js'), /return null/);
});
