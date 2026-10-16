const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { contestEntry } = require('../contest-entry');
const active = { status: 'active', startDate: '2026-10-15', startTime: '11:00', endDate: '2026-12-31' };
const now = Date.parse('2026-10-15T11:00:00Z');
test('contest welcome: public active state offers immediate access and end date, not auto-registration', () => {
  const entry = contestEntry(active, now);
  assert.equal(entry.action, 'Participer au concours');
  assert.match(entry.eyebrow, /31 DÉCEMBRE/);
  assert.match(entry.detail, /Participation gratuite/);
  assert.match(entry.detail, /iPhone, Android et web/);
  assert.deepEqual(active, { status: 'active', startDate: '2026-10-15', startTime: '11:00', endDate: '2026-12-31' });
});
test('contest welcome: unpublished, unavailable or invalid data never advertises an open contest', () => {
  assert.equal(contestEntry({ ...active, status: 'inactive' }, now), null);
  for (const data of [null, {}, { ...active, status: 'unknown' }, { ...active, endDate: '2026-02-30' }, { ...active, startDate: '2027-01-01' }]) {
    assert.notEqual(contestEntry(data, now)?.action, 'Participer au concours');
  }
});
test('contest welcome: a published scheduled contest is discoverable but not presented as open', () => {
  const entry = contestEntry({ ...active, status: 'scheduled' }, now);
  assert.match(entry.detail, /15 octobre à 11 h 00/);
  assert.equal(entry.action, 'Découvrir le concours');
});
test('contest welcome: closure uses Paris midnight and overrides stale active state', () => {
  assert.equal(contestEntry(active, Date.parse('2026-12-31T22:59:59Z')).action, 'Participer au concours');
  assert.equal(contestEntry(active, Date.parse('2026-12-31T23:00:00Z')).action, 'Consulter le concours');
  assert.equal(contestEntry({ ...active, status: 'closed' }, now).action, 'Consulter le concours');
});
test('contest welcome: all platforms use a read-only entry and preserve explicit join/login flow', () => {
  const root = path.resolve(__dirname, '..');
  const web = fs.readFileSync(path.join(root, 'ContestEntry.web.js'), 'utf8');
  assert.match(web, /ContestEntryCard/);
  assert.doesNotMatch(web, /method:\s*['"](?:POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(web, /Authorization|localStorage|sessionStorage|acceptRules|\/join/);
  const overview = fs.readFileSync(path.join(root, 'useContestOverview.js'), 'utf8');
  assert.match(overview, /contestApi=2/);
  assert.doesNotMatch(overview, /method:\s*['"](?:POST|PATCH|PUT|DELETE)/);
  assert.match(overview, /document\.removeEventListener/);
  assert.match(fs.readFileSync(path.join(root, 'ContestEntry.native.js'), 'utf8'), /ContestEntryCard/);
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  assert.match(app, /<NativeWelcomeChoice onOpenContest=\{\(\) => \{ setShowNativeWelcome\(false\); setScreen\("contest"\); \}\}/);
  assert.match(app, /onLogin=\{\(\) => \{ setLoginDestination\(screen\); setScreen\("login"\); \}\}/);
  assert.match(app, /\['contest','referral'\]\.includes\(screen\)/);
});
