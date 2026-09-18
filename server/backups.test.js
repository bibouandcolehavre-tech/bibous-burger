const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { gzipSync, gunzipSync } = require("node:zlib");
const { createBackupStore, encodeBackup, decodeBackup, retainedIds } = require("./backups");
const { extractBackup } = require("./restore-backup");
const sample = () => ({ database: { customers: [{ id: "test", points: 215, referralCode: "TEST" }], orders: [{ id: "order-test", payment: { status: "PAID" } }], reservations: [], rewardClaims: [], bibouPlusPurchases: [], nextOrderNumber: 2 }, stock: { "drink-coca": false } });
async function temp(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bibou-backup-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("sauvegarde : données complètes et intégrité, corruption refusée", async () => {
  const data = sample();
  const buffer = await encodeBackup(data, new Date("2026-09-18T10:00:00Z"));
  assert.deepEqual((await decodeBackup(buffer)).data, data);
  await assert.rejects(decodeBackup(buffer.subarray(0, buffer.length - 5)), /illisible/);
  const envelope = JSON.parse(gunzipSync(buffer));
  envelope.payload = envelope.payload.replace('"points":215', '"points":999');
  await assert.rejects(decodeBackup(gzipSync(JSON.stringify(envelope))), /intégrité/);
  await assert.rejects(encodeBackup({ database: {}, stock: {} }), /invalides/);
  await assert.rejects(encodeBackup({ ...sample(), stock: { coca: "oui" } }), /invalides/);
});

test("sauvegarde : fichiers privés, export et extraction isolée sans écrasement", async (t) => {
  const directory = await temp(t);
  const store = createBackupStore({ directory: path.join(directory, "copies"), capture: async () => sample() });
  const copy = await store.create();
  const status = await store.status();
  assert.equal(status.stale, false);
  assert.equal(status.copies.length, 1);
  assert.equal(JSON.stringify(status).includes("referralCode"), false);
  const file = path.join(directory, "copies", copy.id);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(file))).mode & 0o777, 0o700);
  assert.deepEqual((await decodeBackup(await store.download(copy.id))).data, sample());
  const recovery = path.join(directory, "recovery");
  await extractBackup(file, recovery);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(recovery, "data.json"))), sample().database);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(recovery, "product-stock.json"))), sample().stock);
  await assert.rejects(extractBackup(file, recovery), { code: "EEXIST" });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(recovery, "data.json"))), sample().database);
  await assert.rejects(store.download("../../data.json"), { statusCode: 404 });
  await fs.symlink(file, path.join(directory, "copies", "bibou-1789720000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json.gz"));
  assert.equal((await store.status()).copies.length, 1);
  await assert.rejects(store.download("bibou-1789720000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json.gz"), { statusCode: 404 });
});

test("sauvegarde : rotation bornée, un historique horaire et quotidien, dernière copie préservée", () => {
  const now = Date.parse("2026-09-18T10:45:00Z");
  const entries = Array.from({ length: 500 }, (_, i) => ({ id: String(i), timestamp: now - i * 1800000 }));
  const keep = retainedIds(entries, now);
  assert.ok(keep.size <= 31);
  assert.ok(keep.has("0"));
  assert.ok(!keep.has("1"));
  assert.ok(!keep.has("499"));
  assert.ok([...keep].some((id) => Number(id) > 48));
  assert.deepEqual([...retainedIds(entries, now + 30 * 86400000)], ["0"]);
});

test("sauvegarde : planification, redémarrage, échec et reprise sans perdre les copies", async (t) => {
  const directory = await temp(t);
  let now = new Date("2026-09-18T10:00:00Z");
  let broken = false;
  const options = { directory, clock: () => now, capture: async () => { if (broken) throw new Error("Contenu privé : ne pas divulguer"); return sample(); } };
  const store = createBackupStore(options);
  await store.runIfDue();
  const original = (await store.status()).copies[0];
  now = new Date(now.getTime() + 1800000);
  await createBackupStore(options).runIfDue();
  assert.equal((await store.status()).copies.length, 1);
  now = new Date(now.getTime() + 3 * 3600000);
  broken = true;
  await assert.rejects(store.runIfDue(), /disque/);
  assert.equal((await store.status()).stale, true);
  assert.equal((await store.status()).lastError.includes("privé"), false);
  assert.equal((await store.status()).copies[0].id, original.id);
  broken = false;
  await store.runIfDue();
  assert.equal((await store.status()).lastError, null);
  assert.equal((await store.status()).stale, false);
});

test("sauvegarde : disque plein ou quota atteint préservent la copie précédente", async (t) => {
  const directory = await temp(t);
  const options = { directory, capture: async () => sample() };
  const store = createBackupStore(options);
  const copy = await store.create();
  await assert.rejects(createBackupStore({ ...options, freeSpaceBytes: async () => 0 }).create(), /insuffisant/);
  await assert.rejects(createBackupStore({ ...options, budgetBytes: copy.bytes }).create(), /insuffisant/);
  assert.equal((await store.status()).copies[0].id, copy.id);
  assert.deepEqual((await decodeBackup(await store.download(copy.id))).data, sample());
});

test("sauvegarde : demandes simultanées regroupées ; rotation seulement après nouvelle copie valide", async (t) => {
  const directory = await temp(t);
  let calls = 0;
  let now = new Date("2026-09-18T10:00:00Z");
  const store = createBackupStore({ directory, clock: () => now, capture: async () => { calls++; return sample(); } });
  const copies = await Promise.all([store.create(), store.create(), store.create()]);
  assert.equal(calls, 1);
  assert.equal(new Set(copies.map((copy) => copy.id)).size, 1);
  now = new Date(now.getTime() + 1000);
  await store.create();
  assert.equal((await store.status()).copies.length, 1);
  assert.equal((await fs.readdir(directory)).some((name) => name.endsWith(".tmp")), false);
});

test("sauvegarde : le minuteur démarre automatiquement et peut s’arrêter", async (t) => {
  const directory = await temp(t);
  let calls = 0;
  let notify;
  const captured = new Promise((resolve) => { notify = resolve; });
  const store = createBackupStore({ directory, capture: async () => { calls++; notify(); return sample(); } });
  const stop = store.start({ intervalMs: 10 });
  await captured;
  stop();
  await store.create(); // Wait for the running operation before removing the fixture.
  assert.equal(calls, 1);
});
