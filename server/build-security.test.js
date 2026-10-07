const test = require('node:test'), assert = require('node:assert/strict');
const lock = require('../package-lock.json');
function atLeast(version, minimum) {
  const value = version.split('.').map(Number), floor = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (value[i] !== floor[i]) return value[i] > floor[i]; }
  return true;
}
test('les outils de compilation conservent les correctifs shell-quote et source-map-js', () => {
  for (const [name, minimum] of [['shell-quote', '1.11.0'], ['source-map-js', '1.2.2']]) {
    const entries = Object.entries(lock.packages).filter(([key]) => key.endsWith('/node_modules/' + name) || key === 'node_modules/' + name);
    assert.ok(entries.length, name + ' absent du verrouillage');
    for (const [, dependency] of entries) assert.ok(atLeast(dependency.version, minimum), name + ' doit conserver son correctif de sécurité');
  }
});
