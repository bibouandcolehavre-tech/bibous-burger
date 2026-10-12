const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { encodeBackup } = require('./backups');
const { extractBackup } = require('./restore-backup');
test('backup extraction preserves SMS opt-outs and deduplication alongside customers, stock and reservations', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-extra-backup-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const data = { database: { customers: [{ id: 'fictitious', points: 700 }], orders: [], reservations: [{ id: 'fictitious-table', status: 'confirmed' }] }, stock: { 'drink-coca': false }, keyyoCallSms: { version: 1, optOuts: ['fictional-hash'], calls: [{ id: 'fictional-call', status: 'uncertain' }] } };
  const file = path.join(dir, 'before.json.gz'), output = path.join(dir, 'restored');
  await fs.writeFile(file, await encodeBackup(data)); await extractBackup(file, output);
  for (const [name, section] of [['data.json', 'database'], ['product-stock.json', 'stock'], ['keyyo-call-sms.json', 'keyyoCallSms']]) assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, name), 'utf8')), data[section]);
  await assert.rejects(() => extractBackup(file, output));
});
