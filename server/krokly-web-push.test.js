const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const push = require('./krokly-web-push');

const privateKey = crypto.createECDH('prime256v1');
privateKey.generateKeys();
const config = push.configFromEnv({ KROKLY_VAPID_PRIVATE_KEY: privateKey.getPrivateKey().toString('base64url') });
const appleEndpoint = 'https://web.push.apple.com/QAbc123';

test('VAPID identity signs the audience without publishing the private key', () => {
  assert.equal(config.enabled, true);
  assert.equal(config.publicKey, privateKey.getPublicKey(undefined, 'uncompressed').toString('base64url'));
  const [header, payload, signature] = push.vapidToken(config, appleEndpoint).split('.');
  assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).aud, 'https://web.push.apple.com');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'ES256');
  const key = crypto.createPublicKey(config.privateKey);
  assert.equal(crypto.verify('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
  assert.equal(push.configFromEnv({}).enabled, false);
  const derived = push.configFromEnv({ SESSION_SECRET: 'a'.repeat(64) });
  assert.equal(derived.enabled, true);
  assert.equal(derived.publicKey, push.configFromEnv({ SESSION_SECRET: 'a'.repeat(64) }).publicKey);
  assert.notEqual(derived.publicKey, push.configFromEnv({ SESSION_SECRET: 'b'.repeat(64) }).publicKey);
  assert.equal(push.configFromEnv({ SESSION_SECRET: 'weak' }).enabled, false);
});

test('subscriptions refuse arbitrary external and private network targets', () => {
  for (const endpoint of ['http://localhost:8080/x', 'https://127.0.0.1/x', 'https://push.apple.com.evil.test/x', 'https://user@web.push.apple.com/x', 'https://web.push.apple.com:8080/x']) assert.equal(push.validEndpoint(endpoint), false);
  assert.equal(push.validEndpoint(appleEndpoint), true);
  const db = { kroklyDrivers: [{ id: 'm', active: true }], orders: [] };
  assert.throws(() => push.register(db, 'm', 'https://127.0.0.1/x'), /non reconnu/);
  assert.deepEqual(push.register(db, 'm', appleEndpoint), { subscribed: true, devices: 1 });
  assert.equal(db.kroklyPushSubscriptions.length, 1);
  push.register(db, 'm', appleEndpoint);
  assert.equal(db.kroklyPushSubscriptions.length, 1);
});

test('one offer queues one generic push per device, invalid endpoints are removed', async () => {
  const now = Date.now();
  const db = { kroklyDrivers: [{ id: 'm', active: true }], orders: [{ id: 'o', method: 'delivery', payment: { status: 'PAID' }, status: 'ready', kroklyDriver: { driverId: 'm', status: 'offered', expiresAt: new Date(now + 60000).toISOString() } }] };
  push.register(db, 'm', appleEndpoint, now);
  assert.equal(push.queue(db, 'm', 'o', now, now + 60000), 1);
  assert.equal(push.claim(db, now).length, 1);
  assert.equal(push.claim(db, now).length, 0);
  const job = db.kroklyPushJobs[0];
  const sent = await push.send(config, appleEndpoint, async (endpoint, options) => {
    assert.equal(endpoint, appleEndpoint);
    assert.equal(options.method, 'POST');
    assert.equal(options.body, undefined);
    assert.match(options.headers.Authorization, /^vapid t=/);
    return { status: 201 };
  });
  push.settle(db, job.id, sent, now);
  assert.equal(db.kroklyPushJobs.length, 0);
  push.queue(db, 'm', 'o', now, now + 60000);
  const retry = push.claim(db, now)[0];
  push.settle(db, retry.id, { ok: false, status: 410 }, now);
  assert.equal(db.kroklyPushSubscriptions.length, 0);
});

test('cancelled, refunded and no-longer-ready deliveries cannot send a queued alert', () => {
  const now = Date.now();
  for (const changed of [{ status: 'cancelled' }, { payment: { status: 'REFUNDED' } }, { method: 'pickup' }, { status: 'delivered' }]) {
    const order = { id: 'o', method: 'delivery', payment: { status: 'PAID' }, status: 'ready', kroklyDriver: { driverId: 'm', status: 'offered', expiresAt: new Date(now + 60000).toISOString() } };
    const db = { kroklyDrivers: [{ id: 'm', active: true }], orders: [order] };
    push.register(db, 'm', appleEndpoint, now); push.queue(db, 'm', 'o', now, now + 60000);
    Object.assign(order, changed);
    assert.equal(push.claim(db, now).length, 0);
    assert.equal(db.kroklyPushJobs[0].status, 'discarded');
  }
});

test('test push waits 15 seconds, limits repeat tests, and revoked accounts lose subscriptions', () => {
  const now = Date.now();
  const db = { kroklyDrivers: [{ id: 'm', active: true }], orders: [] };
  push.register(db, 'm', appleEndpoint, now);
  assert.equal(push.queueTest(db, 'm', now).delaySeconds, 15);
  assert.equal(push.claim(db, now).length, 0);
  assert.equal(push.claim(db, now + 15000).length, 1);
  assert.throws(() => push.queueTest(db, 'm', now + 30000), /cinq minutes/);
  push.revokeDriver(db, 'm');
  assert.equal(db.kroklyPushSubscriptions.length, 0);
  assert.equal(db.kroklyPushJobs.length, 0);
});
