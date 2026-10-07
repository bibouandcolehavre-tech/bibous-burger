const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const sms = require('./marketing-sms');
const now = Date.parse('2026-10-08T10:00:00Z');
const config = { enabled: true, verified: true, accountSid: 'AC' + 'a'.repeat(32), authToken: 'test-only', from: 'BibouBurger', origin: 'https://fake.example', secret: 'test-secret-only-'.repeat(3) };
function fixture() { return { customers: [1, 2, 3].map(i => ({ id: 'c' + i, phone: '+3360000000' + i, crmPreferences: { personalizedOffers: true } })), orders: [] }; }
const input = () => ({ requestId: crypto.randomUUID(), title: 'Fictif', body: 'Offre fictive, uniquement en test.', audience: 'all' });
const opt = (db, id = 'c1', accepted = true, time = now) => sms.updatePreferences(db, db.customers.find(c => c.id === id), { accepted }, time);
function preview(db) { return sms.prepareCampaign(db, input(), config, now); }
function send(db, p) { return sms.sendCampaign(db, p.id, { confirm: true, maxSegments: p.maxSegments }, config, now); }

test('SMS : aucun ancien consentement CRM/push ne vaut un accord SMS ; validation stricte et lecture privée', () => {
  const db = fixture(), before = JSON.stringify(db);
  assert.equal(sms.dashboard(db, config, now).optedInCustomers, 0);
  assert.equal(JSON.stringify(db), before);
  for (const bad of [{ accepted: 'true' }, { accepted: true, customerId: 'c2' }, {}, { foo: true }]) assert.throws(() => sms.updatePreferences(db, db.customers[0], bad), /invalide/);
  opt(db); assert.equal(sms.dashboard(db, config, now).eligibleCustomers, 1);
  const view = JSON.stringify(sms.dashboard(db, config, now));
  for (const privateValue of ['+336', config.authToken, config.secret, '"c1"']) assert.ok(!view.includes(privateValue));
});

test('SMS : aperçu sans envoi, idempotence, absence d’autorisation implicite et plafond de segments', () => {
  const db = fixture(); opt(db); const i = input(), p = sms.prepareCampaign(db, i, config, now);
  assert.equal(db.marketingSms.jobs.length, 0); assert.equal(p.customers, 1);
  assert.deepEqual(sms.prepareCampaign(db, i, config, now), p);
  assert.throws(() => sms.prepareCampaign(db, { ...i, body: 'Modifié' }, config, now), /modifié/);
  assert.throws(() => sms.sendCampaign(db, p.id, { confirm: true, maxSegments: 999 }, config, now), /facturables/);
  assert.throws(() => sms.sendCampaign(db, p.id, { maxSegments: p.maxSegments }, config, now), /Confirmez/);
  assert.equal(db.marketingSms.jobs.length, 0);
  send(db, p); send(db, p); assert.equal(db.marketingSms.jobs.length, 1);
});

test('SMS : revalidation du consentement, téléphone, compte, audience et expiration avant l’envoi', () => {
  for (const change of [db => opt(db, 'c1', false), db => { db.customers[0].phone = '+33611111111'; }, db => { db.customers = db.customers.filter(c => c.id !== 'c1'); }, db => { opt(db, 'c1', false); opt(db, 'c1', true, now + 1); }]) {
    const db = fixture(); opt(db); const p = preview(db); change(db);
    assert.throws(() => send(db, p), /Aucun client/); assert.equal(db.marketingSms.jobs.length, 0);
  }
  const db = fixture(); opt(db); const p = preview(db); opt(db, 'c2'); send(db, p);
  assert.deepEqual(db.marketingSms.jobs.map(j => j.customerId), ['c1']);
  const db2 = fixture(); opt(db2); const p2 = preview(db2);
  assert.throws(() => sms.sendCampaign(db2, p2.id, { confirm: true, maxSegments: p2.maxSegments }, config, now + 900000), /expiré/);
  assert.throws(() => sms.sendCampaign(db2, p2.id, { confirm: true, maxSegments: p2.maxSegments }, { ...config, from: 'OtherBrand' }, now), /modifiée/);
});

test('SMS : activation complète, fenêtre Paris, dimanches et jours fériés', () => {
  for (const changes of [{ enabled: false }, { verified: false }, { from: '+33600000000' }, { origin: 'http://example.com' }, { secret: '' }, { accountSid: '' }]) {
    const c = changes.origin ? sms.configFromEnv({}) : { ...config, ...changes };
    assert.equal(sms.ready(c), false);
  }
  assert.equal(sms.allowedWindow(now), true);
  for (const time of ['2026-10-08T07:59:00Z', '2026-10-08T18:00:00Z', '2026-10-11T10:00:00Z', '2026-11-11T12:00:00Z', '2026-04-06T12:00:00Z', '2026-05-14T12:00:00Z', '2026-05-25T12:00:00Z']) assert.equal(sms.allowedWindow(Date.parse(time)), false, time);
  assert.equal(sms.allowedWindow(Date.parse('2026-10-26T09:00:00Z')), true, 'heure d’hiver');
  const db = fixture(); opt(db); const p = preview(db);
  assert.throws(() => sms.sendCampaign(db, p.id, { confirm: true, maxSegments: p.maxSegments }, { ...config, verified: false }, now), /Twilio/);
});

test('SMS : estimation GSM, extensions, Unicode et emoji en segments facturables', () => {
  assert.equal(sms.segments('a'.repeat(160)), 1); assert.equal(sms.segments('a'.repeat(161)), 2);
  assert.equal(sms.segments('^'.repeat(80)), 1); assert.equal(sms.segments('^'.repeat(81)), 2);
  assert.equal(sms.segments('🍔'.repeat(35)), 1); assert.equal(sms.segments('🍔'.repeat(36)), 2);
  assert.equal(sms.segments('’'.repeat(71)), 2);
});

test('SMS : STOP personnel, retrait immédiat, isolation et suppression des données', () => {
  const db = fixture(); opt(db); const p = preview(db); send(db, p);
  const token = sms.stopToken('c1', config);
  assert.equal(sms.customerForStop(db, token, config).id, 'c1');
  assert.equal(sms.customerForStop(db, token, { ...config, secret: 'wrong' }), null);
  assert.equal(sms.customerForStop(db, 'c1', config), null);
  opt(db, 'c1', false); assert.equal(db.marketingSms.jobs[0].status, 'cancelled');
  sms.deleteCustomer(db, 'c1'); assert.ok(!JSON.stringify(db.marketingSms).includes('"c1"'));
});

test('SMS worker : fournisseur fictif, POST unique, STOP inclus, retrait en file et reçu sans second envoi', async () => {
  const db = fixture(); opt(db); const p = preview(db); send(db, p); let time = now, calls = [];
  const worker = sms.createWorker({ config, transact: async fn => fn(db), clock: () => time, fetchImpl: async (url, options) => {
    calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ sid: 'SM' + 'a'.repeat(32), status: options.method === 'POST' ? 'queued' : 'delivered' }) };
  } });
  await Promise.all([worker.tick(), worker.tick()]); assert.equal(calls.length, 1);
  const body = new URLSearchParams(calls[0].options.body); assert.equal(body.get('To'), '+33600000001'); assert.equal(body.get('From'), config.from); assert.ok(body.get('Body').includes('/sms-stop/'));
  assert.equal(sms.segments(body.get('Body')), p.segmentsPerMessage); assert.equal(db.marketingSms.jobs[0].status, 'accepted');
  time += 60001; await worker.tick(); assert.equal(calls.length, 2); assert.equal(calls[1].options.method, undefined); assert.equal(db.marketingSms.jobs[0].status, 'delivered');
  const second = preview(db); send(db, second); opt(db, 'c1', false); await worker.tick(); assert.equal(calls.length, 2);
});

test('SMS worker : panne ambiguë, redémarrage, jours interdits et activation absente ne produisent aucun double SMS', async () => {
  const db = fixture(); opt(db); const p = preview(db); send(db, p); let calls = 0;
  const worker = sms.createWorker({ config, transact: async fn => fn(db), clock: () => now, fetchImpl: async () => { calls++; throw Error('fictitious timeout'); } });
  await worker.tick(); await worker.tick(); assert.equal(calls, 1); assert.equal(db.marketingSms.jobs[0].status, 'uncertain');
  db.marketingSms.jobs[0].status = 'sending'; db.marketingSms.jobs[0].attemptedAt = now - 121000; await worker.tick(); assert.equal(calls, 1); assert.equal(db.marketingSms.jobs[0].status, 'uncertain');
  db.marketingSms.jobs[0].status = 'queued';
  await sms.createWorker({ config: { ...config, enabled: false }, transact: async fn => fn(db), fetchImpl: async () => { calls++; } }).tick(); assert.equal(calls, 1);
  await sms.createWorker({ config, transact: async fn => fn(db), clock: () => Date.parse('2026-10-11T10:00:00Z'), fetchImpl: async () => { calls++; } }).tick(); assert.equal(calls, 1);
});

test('SMS : dédoublonnage d’un mobile et limite quotidienne indépendante des push', () => {
  const db = fixture(); db.customers[1].phone = db.customers[0].phone; opt(db); opt(db, 'c2');
  assert.equal(preview(db).customers, 1);
  send(db, preview(db)); send(db, preview(db)); assert.throws(() => send(db, preview(db)), /deux campagnes/);
});
