const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const push = require('./krokli-native-push');
function fixture() {
  let now = 1800000000000;
  const driver = { id: 'fixture-driver', active: true, authVersion: 1 };
  const db = { kroklyDrivers: [driver], orders: [{ id: 'fixture-order', method: 'delivery', payment: { status: 'PAID' }, status: 'ready',
    customerPhone: 'NEVER-SEND-CONTACT', deliveryAddress: { address: 'NEVER-SEND-ADDRESS' }, kroklyDriver: { driverId: driver.id, status: 'offered', offeredAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString() } }] };
  const input = { installationId: crypto.randomUUID(), installationSecret: crypto.randomUUID(), platform: 'ios', informed: true, token: 'ExpoPushToken[fictional_native_token]', projectId: push.PROJECT_ID };
  const calls = [], sent = [], ticketId = crypto.randomUUID();
  let send = async () => ({ data: [{ status: 'ok', id: ticketId }] }), receipt = async () => ({ data: { [ticketId]: { status: 'ok' } } });
  const worker = config => push.createWorker({ config: config || { enabled: true }, clock: () => now, transact: async fn => fn(db), fetchImpl: async (url, options) => {
    calls.push({ url, options }); const body = JSON.parse(options.body); if (url.endsWith('/send')) sent.push(...body);
    const result = await (url.endsWith('/send') ? send : receipt)(body);
    return { ok: result.http ? result.http < 400 : true, status: result.http || 200, json: async () => result };
  } });
  const register = (value = input, account = driver) => push.register(db, account, value, now + 3600000, now);
  return { db, driver, input, calls, sent, register, worker, queue: () => push.queue(db, driver.id, 'fixture-order', now), advance: ms => { now += ms; }, now: () => now,
    send: fn => { send = fn; }, receipt: fn => { receipt = fn; } };
}
test('native registration requires exact project, explicit consent, device proof and verified session deadline', () => {
  for (const patch of [{ projectId: 'customer-project' }, { platform: 'web' }, { informed: false }, { token: 'not-an-expo-token' }, { installationSecret: 'weak' }, { installationId: null }]) {
    const h = fixture(); assert.throws(() => h.register({ ...h.input, ...patch })); assert.equal(h.db.krokliNativePush?.devices?.length || 0, 0);
  }
  const h = fixture(); assert.throws(() => push.register(h.db, h.driver, h.input, h.now() + 13 * 3600000, h.now()));
  h.register(); assert.equal(h.db.krokliNativePush.devices.length, 1); assert.ok(!JSON.stringify(h.db).includes(h.input.installationSecret));
  assert.equal(h.db.pushNotifications, undefined);
});
test('installation proof prevents token theft and limits three devices without dropping another phone', () => {
  const h = fixture(); h.register(); assert.throws(() => h.register({ ...h.input, installationSecret: crypto.randomUUID() }), e => e.statusCode === 403);
  assert.throws(() => h.register({ ...h.input, installationId: crypto.randomUUID() }), e => e.statusCode === 409);
  for (let i = 0; i < 2; i++) h.register({ ...h.input, installationId: crypto.randomUUID(), token: `ExpoPushToken[fictional_native_${i}]` });
  assert.throws(() => h.register({ ...h.input, installationId: crypto.randomUUID(), token: 'ExpoPushToken[fictional_fourth_token]' }), e => e.statusCode === 409);
  assert.equal(h.db.krokliNativePush.devices.length, 3);
});
test('registration is idempotent and account switching cancels former offer jobs', () => {
  const h = fixture(); h.register(); h.queue(); h.register(); h.queue(); assert.equal(h.db.krokliNativePush.jobs.length, 1);
  const other = { id: 'other-driver', active: true, authVersion: 1 }; h.db.kroklyDrivers.push(other); h.register(h.input, other);
  assert.equal(h.db.krokliNativePush.jobs.length, 0); assert.equal(h.db.krokliNativePush.devices[0].driverId, other.id);
});
test('device revocation needs its own proof, not another login, and cannot delete other devices', () => {
  const h = fixture(); h.register(); h.queue(); assert.throws(() => push.unregister(h.db, { ...h.input, installationSecret: crypto.randomUUID() }));
  push.unregister(h.db, h.input); push.unregister(h.db, h.input); assert.equal(h.db.krokliNativePush.devices.length, 0); assert.equal(h.db.krokliNativePush.jobs.length, 0);
});
for (const state of ['accepted', 'declined', 'expired', 'delivered']) test(`native alert is cancelled after offer becomes ${state}`, async () => {
  const h = fixture(); h.register(); h.queue(); h.db.orders[0].kroklyDriver.status = state; await h.worker().tick(); assert.equal(h.calls.length, 0); assert.equal(h.db.krokliNativePush.jobs[0].status, 'cancelled');
});
for (const mutation of ['unpaid', 'cancelled', 'other-driver', 'uber', 'driver-inactive', 'auth-reset', 'expired-session', 'reoffered']) test(`dispatch rechecks ${mutation} before contacting provider`, async () => {
  const h = fixture(); h.register(); h.queue(); const order = h.db.orders[0];
  if (mutation === 'unpaid') order.payment.status = 'PENDING';
  if (mutation === 'cancelled') order.status = 'cancelled';
  if (mutation === 'other-driver') order.kroklyDriver.driverId = 'other';
  if (mutation === 'uber') order.uberDirect = { phase: 'created', status: 'pending' };
  if (mutation === 'driver-inactive') h.driver.active = false;
  if (mutation === 'auth-reset') h.driver.authVersion++;
  if (mutation === 'expired-session') h.advance(3600000);
  if (mutation === 'reoffered') order.kroklyDriver.offeredAt = new Date(h.now() + 1).toISOString();
  await h.worker().tick(); assert.equal(h.calls.length, 0);
});
test('payload is generic, expires with offer, and provider acceptance is not delivery', async () => {
  const h = fixture(); h.register(); assert.equal(h.queue(), 1); assert.equal(h.queue(), 0);
  await h.worker().tick(); assert.equal(h.sent.length, 1); assert.equal(h.sent[0].ttl, 300); assert.equal(h.sent[0].channelId, 'krokli-offers-v1');
  assert.ok(!JSON.stringify(h.calls).includes('NEVER-SEND')); assert.equal(h.db.krokliNativePush.jobs[0].status, 'accepted');
  h.advance(15 * 60000); await h.worker().tick(); assert.equal(h.db.krokliNativePush.jobs[0].status, 'provider_ok'); assert.equal(h.sent.length, 1);
});
test('network ambiguity is not resent and a 429 retries only while offer is valid', async () => {
  const h = fixture(); h.register(); h.queue(); h.send(async () => { throw Error('network lost'); }); const worker = h.worker(); await worker.tick(); await worker.tick();
  assert.equal(h.sent.length, 1); assert.equal(h.db.krokliNativePush.jobs[0].status, 'uncertain');
  const limited = fixture(); limited.register(); limited.queue(); limited.send(async () => ({ http: 429 })); const w = limited.worker(); await w.tick(); limited.advance(30000); await w.tick();
  assert.equal(limited.sent.length, 2); limited.advance(300000); await w.tick(); assert.equal(limited.sent.length, 2);
});
for (const phase of ['ticket', 'receipt']) test(`DeviceNotRegistered in ${phase} removes only native device`, async () => {
  const h = fixture(); h.db.pushNotifications = { devices: [{ id: 'untouched-customer' }] }; h.register(); h.queue();
  if (phase === 'ticket') h.send(async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }));
  else h.receipt(async () => ({ data: { [h.db.krokliNativePush.jobs[0].ticketId]: { status: 'error', details: { error: 'DeviceNotRegistered' } } } }));
  const w = h.worker(); await w.tick(); if (phase === 'receipt') { h.advance(15 * 60000); await w.tick(); }
  assert.equal(h.db.krokliNativePush.devices.length, 0); assert.equal(h.db.pushNotifications.devices.length, 1);
});
test('worker is serialized and disabled configuration sends nothing', async () => {
  const h = fixture(); h.register(); h.queue(); let release; h.send(() => new Promise(r => { release = r; })); const w = h.worker();
  const first = w.tick(); await new Promise(r => setImmediate(r)); await w.tick(); release({ data: [{ status: 'ok', id: crypto.randomUUID() }] }); await first; assert.equal(h.sent.length, 1);
  const off = fixture(); off.register(); off.queue(); await off.worker({ enabled: false }).tick(); assert.equal(off.calls.length, 0);
});
test('password reset and account deactivation revoke native subscriptions and jobs', () => {
  const drivers = require('./krokly-drivers');
  for (const action of ['reset', 'deactivate']) { const h = fixture(); h.register(); h.queue(); if (action === 'reset') drivers.resetPassword(h.db, h.driver.id); else drivers.setActive(h.db, h.driver.id, false);
    assert.equal(h.db.krokliNativePush.devices.length, 0); assert.equal(h.db.krokliNativePush.jobs.length, 0); }
});
