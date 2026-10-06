const test = require('node:test');
const assert = require('node:assert/strict');
const { fullWheelRules } = require('../wheel-rules-client');
const { WHEEL_TIERS } = require('./wheel');

test('wheel rules disclose every fixed outcome and its probability for each spend tier', () => {
  const disclosure = fullWheelRules('Conditions approuvées.', WHEEL_TIERS);
  for (const tier of Object.values(WHEEL_TIERS)) {
    for (const [id, chance] of tier) {
      const section = disclosure.split('Commande de ').find(part => part.includes(`${chance} %`) && part.includes(id === 'none' ? 'aucun gain' : id.startsWith('points-') ? `${id.slice(7)} points` : id === 'drink' ? 'une boisson offerte' : id === 'fries' ? 'des frites maison offertes' : `une remise de ${id.slice(9)} %`));
      assert.ok(section, `${id} (${chance} %) absent des probabilités affichées`);
    }
  }
  assert.match(disclosure, /Conditions approuvées/);
  assert.equal(fullWheelRules('', WHEEL_TIERS), null);
});
