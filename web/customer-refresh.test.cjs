// Client-only publication guards; no production server code is changed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('Web refresh keeps the approved entry and independent customer features', () => {
  assert.equal(JSON.parse(read('package.json')).main, './customer-entry.js');
  const app = read('App.js');
  for (const component of ['CustomerJourneyHome', 'CustomerCatalogScreen', 'DeliveryTracking', 'DeliveryFeedback', 'WheelAfterPayment', 'ArticleReviews', 'BibouPlusAfterPayment']) assert.match(app, new RegExp(component));
  for (const route of ['custom-burger-preview', 'partners', 'club-referral']) assert.ok(app.includes(route));
});
test('Web refresh preserves deliberate sauce and vegetable selection', () => {
  const app = read('App.js');
  assert.match(app, /Les sauces et crudités demandent un choix explicite/);
  assert.match(app, /Pas de crudités/);
  assert.match(app, /Pas de sauce/);
  assert.match(app, /required: true, min: 1/);
});
test('Web refresh contains the original HD story and real ingredient assets', () => {
  assert.match(read('ExperienceNews.js'), /histoire-hd\.mp4/);
  assert.ok(fs.statSync(path.join(__dirname, '../assets/experience/histoire-hd.mp4')).size > 20000000);
  for (const ingredient of ['oignons-caramelises.png', 'canard-effiloche-white.png', 'porc-effiloche-white.png', 'agneau-effiloche-white.png', 'coca-zero-canette.jpg', 'coca-vanille-slim.png']) assert.ok(fs.statSync(path.join(__dirname, '../assets/experience/ingredients', ingredient)).size > 1000);
});
test('Web refresh uses responsive CSS without changing native layout or remote scripts', () => {
  const css = read('web/desktop-layout.css');
  assert.match(css, /@media \(min-width: 900px\)/);
  assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\[data-bibou="navigation"\]/);
  assert.doesNotMatch(css, /@import|url\(/);
  assert.match(read('CustomerJourneyScreens.js'), /Platform\.OS === 'web'/);
});
