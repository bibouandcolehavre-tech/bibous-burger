const test=require('node:test'),assert=require('node:assert/strict');
const {normalize}=require('./iban-validation'),S=require('./driver-settlements');
const registry=require('./iban-registry.json'),fixtures=require('./test-fixtures/iban-registry-103.json');
function synthetic(country,bban){let r=0;for(const c of bban+country+'00')for(const digit of /[A-Z]/.test(c)?String(c.charCodeAt(0)-55):c)r=(r*10+Number(digit))%97;return country+String(98-r).padStart(2,'0')+bban;}
test('all 89 public SWIFT registry examples follow the pinned national structures and checksum',()=>{
  assert.equal(Object.keys(registry.countries).length,89);assert.deepEqual(Object.keys(registry.countries).sort(),Object.keys(fixtures.examples).sort());
  for(const [country,value]of Object.entries(fixtures.examples)){assert.equal(value.length,registry.countries[country].length,country);assert.equal(normalize(value),value,country);assert.equal(normalize(value.toLowerCase().replace(/(.{4})/g,'$1 ')),value,country);}
});
test('correct MOD97 alone cannot accept unknown countries, truncated national accounts or wrong BBAN character types',()=>{
  for(const value of [synthetic('FR','0'.repeat(11)),synthetic('ZZ','0'.repeat(11)),synthetic('FR','A'.repeat(23)),synthetic('DE','A'.repeat(18)),synthetic('NL','0'.repeat(14)),fixtures.examples.FR.slice(0,-1)+'7','x'.repeat(100000),null,123,{},fixtures.examples.FR+';'])assert.equal(normalize(value),null);
  const db={},driver={id:'fixture-driver'};assert.throws(()=>S.saveBank(db,driver,{holder:'Exemple',iban:synthetic('FR','0'.repeat(11))},'a'.repeat(64)),error=>error.statusCode===400);assert.equal(db.driverBankProfiles,undefined);
  assert.equal(normalize(fixtures.examples.LT),fixtures.examples.LT,'Non-French IBANs remain supported, including EU accounts');
});
