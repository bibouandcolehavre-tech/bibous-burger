const fs = require('node:fs');
const path = require('node:path');
const { RESTAURANT: info } = require('../restaurant-info');

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const address = `${info.street}, ${info.postalCode} ${info.city}`;
const image = `${info.origin}/seo/taurus.jpg`;
const openingHoursSpecification = info.hours.flatMap(hour => hour.periods.map(([opens, closes]) => ({
  '@type': 'OpeningHoursSpecification', dayOfWeek: hour.days.map(day => `https://schema.org/${day}`), opens, closes,
})));
const restaurantSchema = {
  '@type': 'Restaurant', '@id': `${info.origin}/#restaurant`, name: info.name,
  url: `${info.origin}/`, image, servesCuisine: 'Burgers', description: info.description,
  address: { '@type': 'PostalAddress', streetAddress: info.street, postalCode: info.postalCode, addressLocality: info.city, addressCountry: info.country },
  openingHoursSpecification, sameAs: info.socials.map(social => social.url), hasMenu: `${info.origin}/`,
};
function head({ title, description = info.description, url, detail = false }) {
  const graph = [restaurantSchema, { '@type': 'WebSite', '@id': `${info.origin}/#website`, name: info.name, url: `${info.origin}/`, inLanguage: 'fr-FR' }];
  if (detail) graph.push({ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Commander', item: `${info.origin}/` },
    { '@type': 'ListItem', position: 2, name: 'Le restaurant au Havre', item: url },
  ] });
  return `<title>${escape(title)}</title>
    <meta name="description" content="${escape(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <meta name="theme-color" content="#E95122">
    <meta name="google-site-verification" content="LfixJmMoMMRd9_8dmXcTHi4VoK4ggCXinCB_r6kcjYU">
    <link rel="canonical" href="${escape(url)}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="fr_FR">
    <meta property="og:site_name" content="${escape(info.name)}">
    <meta property="og:title" content="${escape(title)}">
    <meta property="og:description" content="${escape(description)}">
    <meta property="og:url" content="${escape(url)}">
    <meta property="og:image" content="${image}">
    <meta property="og:image:alt" content="Le Taurus, burger de Bibou’s Burgers">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escape(title)}">
    <meta name="twitter:description" content="${escape(description)}">
    <meta name="twitter:image" content="${image}">
    <script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}
const hoursHtml = () => `<dl class="hours">${info.hours.map(hour => `<div><dt>${escape(hour.label)}</dt><dd>${escape(hour.text)}</dd></div>`).join('')}</dl>`;
const servicesHtml = () => info.services.map(service => `<article><h2>${escape(service.title)}</h2><p>${escape(service.text)}</p></article>`).join('');
const css = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f8f1e6;color:#231813;font:17px/1.7 system-ui,sans-serif}a{color:inherit;text-underline-offset:4px}a:focus-visible{outline:3px solid #ad380f;outline-offset:5px}header,main,footer{max-width:1100px;margin:auto;padding:24px}header{display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:1px solid #dacfc2}.brand{font-weight:850;font-size:21px;text-decoration:none}nav{display:flex;gap:20px;flex-wrap:wrap}h1{font-size:clamp(32px,5vw,58px);line-height:1.12;margin:14px 0 22px;letter-spacing:-1.5px}h2{font-size:24px;line-height:1.25}p{margin:12px 0 24px}.eyebrow{font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#8c371e}.hero{display:grid;grid-template-columns:1.1fr 1fr;gap:36px;align-items:center;padding:30px 0}.hero img{width:100%;height:auto;border-radius:24px;background:#111}.button{display:inline-block;padding:14px 22px;border-radius:12px;background:#24201d;color:white;font-weight:750;text-decoration:none}.services{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:42px 0}article,.practical{padding:24px;background:white;border:1px solid #e3d8cb;border-radius:18px}article p{font-size:15px;margin-bottom:0}.practical{display:grid;grid-template-columns:1fr 1fr;gap:32px}.hours{margin:0}.hours>div{padding:10px 0;border-bottom:1px solid #eee}dt{font-weight:700}dd{margin:0}address{font-style:normal}.footer-links{display:flex;gap:20px;flex-wrap:wrap}footer{margin-top:36px;font-size:14px;border-top:1px solid #dacfc2}.note{font-size:14px;color:#614f43}.breadcrumb{font-size:13px}@media(max-width:680px){header{align-items:start;flex-direction:column}.hero,.services,.practical{grid-template-columns:1fr}.hero{gap:20px}main{padding:20px}.services{margin:24px 0}.hero img{max-height:280px;object-fit:cover}h1{font-size:36px}nav{gap:14px}}`;

function restaurantPage() {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  ${head({ title: "Bibou's Burgers au Havre — Adresse, horaires et livraison", url: info.origin + info.page, detail: true })}
  <link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/seo/restaurant.css"></head><body>
  <header><a class="brand" href="/">${escape(info.name)}</a><nav aria-label="Navigation"><a href="/">Carte & commande</a><a href="#horaires">Horaires & adresse</a></nav></header>
  <main><p class="breadcrumb"><a href="/">Accueil</a> / Le restaurant au Havre</p>
    <section class="hero"><div><p class="eyebrow">Burgers · Livraison · Click & collect</p><h1>${escape(info.heading)}</h1><p>${escape(info.introduction)}</p><a class="button" href="/">Voir la carte et commander →</a></div>
    <img src="/seo/taurus.jpg" alt="Le Taurus dans son pain noir au sésame, chez Bibou’s Burgers" width="1200" height="800" fetchpriority="high"></section>
    <section class="services" aria-label="Nos services">${servicesHtml()}</section>
    <section class="practical" id="horaires"><div><h2>Nous retrouver au Havre</h2><address>${escape(address)}, France</address><p>Sur place, à emporter ou en livraison : choisissez votre façon de profiter de Bibou’s Burgers.</p><a href="/">Choisir un créneau ou réserver une table →</a></div><div><h2>Horaires des services</h2>${hoursHtml()}<p class="note">Les disponibilités et les éventuelles fermetures exceptionnelles sont indiquées dans le parcours de commande ou de réservation.</p></div></section>
  </main><footer><p>Bibou & Co · ${escape(info.name)} · ${escape(address)}</p><nav class="footer-links" aria-label="Liens utiles">${info.socials.map(social => `<a href="${escape(social.url)}" target="_blank" rel="noopener noreferrer">${escape(social.name)} ↗</a>`).join('')}<a href="/?legal=privacy">Confidentialité</a></nav></footer></body></html>`;
}
function enrichIndex(source) {
  if (!source.includes('<div id="root"></div>')) throw new Error('Structure Expo inattendue : ne pas publier une page sans contenu public.');
  // Same lightweight loading view for everyone, with an ordinary link to the full public page.
  const fallback = `<main id="seo-home" style="overflow:auto;width:100%;padding:24px;font:15px/1.6 system-ui,sans-serif;color:#231813;background:#f8f1e6"><h1 style="font-size:22px;margin:0 0 12px">${escape(info.name)}</h1><p>La carte interactive se charge…</p><nav aria-label="Informations du restaurant"><a href="${info.page}" style="display:inline-flex;align-items:center;min-height:44px;font-size:13px;color:inherit;text-underline-offset:3px">Infos pratiques</a></nav><noscript><p>Activez JavaScript pour commander en ligne. L’adresse, les horaires et les informations de livraison sont disponibles dans « Infos pratiques ».</p></noscript></main>`;
  return source.replace(/<html lang="[^"]*">/, '<html lang="fr">')
    .replace(/<title>[^<]*<\/title>/, head({ title: "Bibou's Burgers Le Havre — Livraison & Click & collect", url: info.origin + '/' }))
    .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
    .replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);
}
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${info.origin}/sitemap.xml\n`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', info.page].map(url => `<url><loc>${escape(info.origin + url)}</loc></url>`).join('')}</urlset>\n`;

function build(directory = path.resolve(__dirname, '../dist')) {
  const source = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const html = enrichIndex(source);
  fs.mkdirSync(path.join(directory, 'seo'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), html);
  fs.writeFileSync(path.join(directory, info.page.slice(1)), restaurantPage());
  fs.writeFileSync(path.join(directory, 'seo/restaurant.css'), css);
  fs.copyFileSync(path.resolve(__dirname, '../assets/taurus.jpg'), path.join(directory, 'seo/taurus.jpg'));
  fs.writeFileSync(path.join(directory, 'robots.txt'), robots);
  fs.writeFileSync(path.join(directory, 'sitemap.xml'), sitemap);
  console.log('SEO : accueil français, informations restaurant, données structurées, robots.txt et sitemap générés.');
}
if (require.main === module) build();
module.exports = { escape, head, restaurantSchema, enrichIndex, restaurantPage, robots, sitemap, build };
