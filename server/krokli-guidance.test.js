const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { externalLinks, preferredProvider } = require('../driver-app/guidance-core');
test('external GPS requests turn-by-turn from the current device, not a frozen origin', () => {
  const links = externalLinks({ address: '12 rue de Test & angle #2, 76600 Le Havre' });
  const google = new URL(links.google), apple = new URL(links.apple), waze = new URL(links.waze);
  assert.equal(google.searchParams.get('dir_action'), 'navigate');
  assert.equal(google.searchParams.get('travelmode'), 'driving');
  assert.equal(google.searchParams.get('origin'), null);
  assert.equal(apple.searchParams.get('dirflg'), 'd');
  assert.equal(waze.searchParams.get('navigate'), 'yes');
  for (const [url, key] of [[google, 'destination'], [apple, 'daddr'], [waze, 'q']]) {
    assert.equal(url.searchParams.get(key), '12 rue de Test & angle #2, 76600 Le Havre');
    assert.equal(url.hash, '');
  }
});
test('confirmed coordinates use latitude longitude in all GPS links', () => {
  const links = externalLinks({ address: 'Destination confirmée', coordinates: [0.15, 49.49] });
  for (const [provider, key] of [['google','destination'], ['apple','daddr'], ['waze','ll']]) assert.equal(new URL(links[provider]).searchParams.get(key), '49.49,0.15');
});
test('invalid destinations fail closed; no guessed origin or arbitrary navigation URL', () => {
  for (const target of [null, {}, {address: ''}, {address: 42}, {address: 'x'.repeat(501)}, {address: 'a\nb'}, ...[null,[NaN,1],[0,91],[181,0],[1],['1',2]].map(coordinates => ({address:'A', coordinates}))]) assert.equal(externalLinks(target), null);
  const links = externalLinks({address: 'https://evil.invalid/?token=test#x & q=hijack'});
  assert.equal(new URL(links.google).origin, 'https://www.google.com');
  assert.equal(new URL(links.apple).origin, 'https://maps.apple.com');
  assert.equal(new URL(links.waze).origin, 'https://waze.com');
  for (const link of Object.values(links)) { assert.equal(new URL(link).searchParams.get('token'), null); assert.equal(new URL(link).hash, ''); }
});
test('provider choices are allowlisted and keep Apple/other-phone defaults', () => {
  assert.equal(preferredProvider(null, true), 'apple'); assert.equal(preferredProvider(null, false), 'google');
  for (const value of ['google','apple','waze']) assert.equal(preferredProvider(value, true), value);
  for (const value of ['__proto__','https://evil.invalid',{},'']) assert.equal(preferredProvider(value, false), 'google');
});
test('links exclude unrelated customer identity, session and private comments', () => {
  const links = externalLinks({ address: 'Une adresse', name: 'PRIVATE-NAME', phone: 'PRIVATE-PHONE', token: 'PRIVATE-TOKEN', orderId:'PRIVATE-ORDER', origin: { latitude: 1, longitude: 2 } });
  assert.doesNotMatch(JSON.stringify(links), /PRIVATE|origin=|saddr=/);
});
test('web launcher uses direct, no-referrer links and clearly discloses foreground limitations', () => {
  const root = path.resolve(__dirname, '../driver-app');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(html, /id="guidance-launch"[^>]*referrerpolicy="no-referrer"/);
  assert.match(html, /navigateur peut suspendre le partage/);
  assert.doesNotMatch(html, /<select id="guidance-provider"/);
  assert.equal((html.match(/data-guidance-provider="/g) || []).length, 3);
  assert.match(app, /function signOut[^]*KrokliGuidance\?\.close/);
});
