const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServiceModuleStore } = require('./service-modules');

test('service modules start enabled and persist a versioned change', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-modules-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'service-modules.json');
  const store = createServiceModuleStore(file);
  assert.deepEqual(await store.read(), { revision: 0, modules: { pickup: true, delivery: true, tables: true } });
  const saved = await store.update({ revision: 0, modules: { tables: false } });
  assert.deepEqual(saved, { revision: 1, modules: { pickup: true, delivery: true, tables: false } });
  assert.deepEqual(await createServiceModuleStore(file).read(), saved);
  await assert.rejects(store.update({ revision: 0, modules: { pickup: false } }), { statusCode: 409 });
});

test('service module configuration rejects unsupported keys and corrupt files', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-modules-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'service-modules.json');
  const store = createServiceModuleStore(file);
  await assert.rejects(store.update({ revision: 0, modules: { payments: false } }), { statusCode: 400 });
  await assert.rejects(store.update({ revision: 0, modules: { pickup: 'false' } }), { statusCode: 400 });
  await fs.writeFile(file, '{bad');
  await assert.rejects(store.read(), { statusCode: 503 });
});
