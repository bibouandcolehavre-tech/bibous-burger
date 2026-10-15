const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { RESTAURANT } = require('../restaurant-info');
const { enrichIndex, restaurantPage, supportPage, installPage, restaurantSchema, robots, sitemap, escape, build } = require('../scripts/build-web-seo.cjs');
const sample = '<!DOCTYPE html><html lang="en"><head><title>Bibou</title></head><body><noscript>You need JavaScript</noscript><div id="root"></div><script src="/app.js" defer></script></body></html>';
const graphFrom = html => JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);

test('Accueil SEO : français, canonical stable et contenu public sans JavaScript', () => {
  const html = enrichIndex(sample);
  assert.match(html, /<html lang="fr">/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /<title>Bibou&#39;s Burgers Le Havre/);
  assert.match(html, /<meta name="description"/);
  assert.match(html.split('</head>')[0], /<meta name="google-site-verification" content="LfixJmMoMMRd9_8dmXcTHi4VoK4ggCXinCB_r6kcjYU">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/bibous-burger-app.onrender.com\/">/);
  assert.match(html, /<div id="root"><main id="seo-home"/);
  const body = html.split('<body>')[1];
  assert.match(body, /<h1[^>]*>Bibou&#39;s Burgers<\/h1>/);
  assert.match(body, /href="\/restaurant-le-havre.html"[^>]*>Infos pratiques<\/a>/);
  assert.doesNotMatch(body, /<address|class="hours"|153 quai Georges V|<h2>/, 'Le chargement ne doit pas réafficher le grand bloc pratique.');
  assert.match(html, /<script src="\/app.js" defer><\/script>/);
  assert.doesNotMatch(html, /You need JavaScript|noindex|userAgent|display:none/);
  assert.throws(() => enrichIndex('<html></html>'), /Structure Expo/);
  assert.throws(() => enrichIndex(html), /Structure Expo/);
});
test('Responsive desktop uses the shared journeys and leaves mobile rules untouched', () => {
  const css = fs.readFileSync(path.join(__dirname, '../web/desktop-layout.css'), 'utf8');
  const html = enrichIndex(sample);
  assert.equal((html.match(/id="bibou-desktop-layout"/g) || []).length, 1);
  assert.ok(html.includes(`<style id="bibou-desktop-layout">${css}</style>`));
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  assert.match(rules, /^@media \(min-width: 900px\) \{/);
  assert.match(css, /max-width: none !important/);
  assert.match(css, /width: 100% !important/);
  assert.match(css, /\[data-bibou="journey"\]/);
  assert.match(css, /grid-template-columns: 210px minmax\(0, 1fr\)/);
  assert.match(css, /\[data-bibou="navigation"\]/);
  assert.match(css, /\[data-bibou="catalogue"\]/);
  assert.doesNotMatch(css, /url\(|@import|visibility:\s*hidden/);
  assert.match(html, /<script src="\/app.js" defer><\/script>/, 'Le JavaScript existant reste le même.');
});
test('Le restaurant possède une vraie page HTML publique et les données structurées correspondantes', () => {
  const page = restaurantPage();
  assert.match(page, /<html lang="fr">/);
  assert.equal((page.match(/<h1>/g) || []).length, 1);
  assert.match(page, /href="\/"/);
  assert.match(page, /livraison|Livraison/);
  assert.match(page, /3,99 €/);
  assert.match(page, /4,99 €/);
  assert.match(page, /5,99 €/);
  assert.match(page, /1 à 4 personnes/);
  assert.doesNotMatch(page, /_expo\/|sumupstore|onload=|onclick=/);
  const graph = graphFrom(page)['@graph'];
  assert.deepEqual(graph.find(item => item['@type'] === 'Restaurant'), restaurantSchema);
  assert.equal(graph.find(item => item['@type'] === 'BreadcrumbList').itemListElement[1].item, RESTAURANT.origin + RESTAURANT.page);
  assert.equal(restaurantSchema.openingHoursSpecification.length, 4);
  assert.equal(restaurantSchema.address.postalCode, '76600');
  assert.equal(restaurantSchema.sameAs.length, 3);
  assert.equal(restaurantSchema.aggregateRating, undefined, 'Pas de note inventée ni de note Google présentée comme avis propres.');
  assert.equal(restaurantSchema.telephone, undefined, 'Ne pas publier le numéro personnel du gérant.');
  assert.deepEqual(graphFrom(enrichIndex(sample))['@graph'][0], restaurantSchema);
});
test('Sitemap : uniquement les deux URL publiques canoniques, sans clients ni paramètres de test', () => {
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  assert.match(robots, /Sitemap: https:\/\/bibous-burger-app.onrender.com\/sitemap.xml/);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 2);
  for (const [, url] of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) assert.doesNotMatch(url, /\?|customer|admin|account|restaurant.onrender|localhost|sumup/);
  const dashboard = fs.readFileSync(path.join(__dirname, '../restaurant-dashboard/index.html'), 'utf8');
  assert.match(dashboard, /name="robots" content="noindex, nofollow"/);
});
test('Le générateur complète le vrai export sans modifier le JavaScript ou copier des secrets', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibou-seo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'index.html'), sample);
  build(dir);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['app', 'assistance.html', 'index.html', 'restaurant-le-havre.html', 'robots.txt', 'seo', 'sitemap.xml']);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'seo')).sort(), ['bibou-icon.png', 'restaurant.css', 'taurus.jpg']);
  assert.match(fs.readFileSync(path.join(dir, 'app/index.html'), 'utf8'), /Télécharger sur Google Play/);
  assert.match(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), /\/app.js/);
  assert.ok(fs.statSync(path.join(dir, 'seo/taurus.jpg')).size > 0);
  assert.equal(escape('<img onerror="x">&'), '&lt;img onerror=&quot;x&quot;&gt;&amp;');
});
test('Lien intelligent : Android vers Google Play, iPhone et iPad vers la fiche App Store publiée', () => {
  const page = installPage();
  assert.match(page, /com\.krokly\.bibousburgers/);
  assert.match(page, /Android/);
  assert.match(page, /iPhone\|iPad\|iPod/);
  assert.match(page, /MacIntel/);
  assert.match(page, /window\.location\.replace/);
  assert.match(page, /Télécharger sur l’App Store/);
  assert.match(page, /https:\/\/apps\.apple\.com\/fr\/app\/bibous-burgers\/id6817744169/);
  assert.doesNotMatch(page, /Ouvrir sur iPhone|pendant la préparation|pas encore/);
  const iphoneButton = page.match(/<a class="button secondary" href="([^"]+)"/)[1];
  assert.equal(iphoneButton, 'https://apps.apple.com/fr/app/bibous-burgers/id6817744169');
  const androidButton = page.match(/<a class="button" href="([^"]+)"/)[1].replaceAll('&amp;', '&');
  assert.equal(androidButton, 'https://play.google.com/store/apps/details?id=com.krokly.bibousburgers&hl=fr');
});
test('SmartLink: real generated script redirects iOS and Android, while desktop keeps both buttons', () => {
  const script = installPage().match(/<script>([\s\S]*?)<\/script>/)[1];
  const apple = 'https://apps.apple.com/fr/app/bibous-burgers/id6817744169';
  const google = 'https://play.google.com/store/apps/details?id=com.krokly.bibousburgers&hl=fr';
  const cases = [
    { name: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', expected: apple },
    { name: 'iPad', userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', expected: apple },
    { name: 'iPod', userAgent: 'Mozilla/5.0 (iPod touch)', expected: apple },
    { name: 'desktop-class iPad', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5, expected: apple },
    { name: 'Android', userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8)', expected: google },
    { name: 'Instagram iPhone browser', userAgent: 'Mozilla/5.0 (iPhone) Instagram 402.0.0', expected: apple },
    { name: 'SMS iPhone browser', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Mobile/15E148', expected: apple },
    { name: 'Mac', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 0, expected: null },
    { name: 'Windows', userAgent: 'Mozilla/5.0 (Windows NT 10.0)', expected: null },
    { name: 'unknown', userAgent: '', expected: null },
  ];
  for (const item of cases) {
    const destinations = [], status = { textContent: '' };
    vm.runInNewContext(script, {
      navigator: { userAgent: item.userAgent, platform: item.platform || '', maxTouchPoints: item.maxTouchPoints || 0 },
      window: { location: { replace: target => destinations.push(target) } },
      document: { getElementById: id => { assert.equal(id, 'status'); return status; } },
      setTimeout: (callback, delay) => { assert.equal(delay, 900); callback(); },
    }, { timeout: 1000 });
    assert.deepEqual(destinations, item.expected ? [item.expected] : [], item.name);
    if (!item.expected) assert.equal(status.textContent, 'Choisis la version de ton appareil.');
  }
});
test('Assistance publique : contacts et liens utiles sans données privées', () => {
  const page = supportPage();
  assert.match(page, /<title>Assistance/);
  assert.match(page, /href="tel:\+33278088498"/);
  assert.match(page, /href="mailto:contact@bibousburgers.com"/);
  assert.match(page, /href="\/\?legal=delete-account"/);
  assert.match(page, /href="\/\?legal=privacy"/);
  assert.doesNotMatch(page, /code de revue|mot de passe technique|clé privée/i);
});
test('Accueil discret : lien pratique accessible vers la page complète, sans grand bloc ni HTML natif', () => {
  const web = fs.readFileSync(path.join(__dirname, '../RestaurantInfo.web.js'), 'utf8');
  assert.match(web, /href=\{info.page\}/);
  assert.match(web, />Infos pratiques<\/a>/);
  assert.match(web, /<nav aria-label="Informations du restaurant"/);
  assert.match(web, /minHeight: 44/, 'Cible tactile conservée malgré le texte discret.');
  assert.doesNotMatch(web, /<h1|<address|<ul|info\.hours|info\.introduction|display:\s*'none'/);
  const page = restaurantPage();
  assert.match(page, /<address>153 quai Georges V, 76600 Le Havre, France<\/address>/);
  for (const hour of RESTAURANT.hours) assert.ok(page.includes(escape(hour.text)));
  assert.match(fs.readFileSync(path.join(__dirname, '../RestaurantInfo.native.js'), 'utf8'), /return null/);
  assert.match(fs.readFileSync(path.join(__dirname, '../App.js'), 'utf8'), /<RestaurantInfo \/>/);
});
