const test = require('node:test');
const assert = require('node:assert/strict');
const { destinationForLegacyPath } = require('./domain-forwarding');

test('le QR /app va vers la page intelligente, les anciens liens vers la carte', () => {
  assert.equal(destinationForLegacyPath('/app', 'GET'), 'https://bibous-burger-app.onrender.com/app');
  assert.equal(destinationForLegacyPath('/app/', 'HEAD'), 'https://bibous-burger-app.onrender.com/app');
  assert.equal(destinationForLegacyPath('/', 'GET'), 'https://bibous-burger-app.onrender.com/');
  assert.equal(destinationForLegacyPath('/article/ancien-produit', 'GET'), 'https://bibous-burger-app.onrender.com/');
});

test('les API, liens de désinscription et requêtes de modification ne sont pas redirigés', () => {
  assert.equal(destinationForLegacyPath('/api/health', 'GET'), null);
  assert.equal(destinationForLegacyPath('/api/orders', 'POST'), null);
  assert.equal(destinationForLegacyPath('/s/example', 'GET'), null);
  assert.equal(destinationForLegacyPath('/app', 'POST'), null);
});
