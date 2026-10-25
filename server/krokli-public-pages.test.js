'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { page, PRIVACY, SUPPORT, CONTACT } = require('./krokli-public-pages');
test('driver public privacy is independent, complete, accessible and free of trackers or sign-in', () => {
  const html = page('privacy');
  assert.match(html, /<html lang="fr">/); assert.match(html, /name="viewport"/);
  assert.match(html, /Livreurs indépendants/); assert.match(html, /Bibou &amp; Co/);
  assert.equal(PRIVACY.length, 15);
  assert.match(html,/Candidature livreur et demande restaurant/);
  assert.match(html,/carte d’identité recto verso/);
  assert.match(html,/90 jours/);
  for (const text of ['90 secondes', '30 secondes', '12 heures', '24 heures', '7 jours', '10 ans', 'consent', 'CNIL', 'Francfort', 'Expo', 'Apple', 'Google']) {
    if (text === 'consent') assert.match(html, /accord facultatif/); else assert.equal(html.includes(text), true, text);
  }
  assert.match(html, /<a href="mailto:/);
  assert.equal(html.includes(CONTACT), true);
  for (const forbidden of [/<script\b/i, /<iframe\b/i, /<form\b/i, /<input\b/i, /onload=/i, /googletagmanager/i, /krokli-review\./]) assert.equal(forbidden.test(html), false);
  assert.match(html, /Aucun historique des trajets/);
  assert.match(html, /aucun vrai client/i);
});
test('driver support explains actual external GPS and manual transfers, not future grouped navigation', () => {
  const html = page('support'); assert.equal(SUPPORT.length, 6);
  for (const text of ['Plans', 'Google Maps', 'Waze', 'Mon compte', 'Passer hors ligne', 'Bibou Plus', 'virement']) assert.equal(html.includes(text), true);
  assert.match(html, /pas par une carte de navigation intégrée/);
  assert.throws(() => page('<script>'));
});
