const test = require('node:test'), assert = require('node:assert/strict');
const { createGpsPilot, CONSENT_VERSION, SESSION_MS, POSITION_TTL_MS } = require('./krokli-gps-pilot');
const { createGpsPilot: createClient } = require('../driver-app/gps');
const flush = () => new Promise(r => setImmediate(r));
function fixture(t) {
  let time = Date.now(); const db = { orders: [{ status: 'ready' }], kroklyDrivers: [{ id: 'lina', active: true, authVersion: 1 }, { id: 'malik', active: true, authVersion: 1 }] };
  const pilot = createGpsPilot({ clock: () => time }); t.after(pilot.close);
  const open = id => pilot.start(db, db.kroklyDrivers.find(d => d.id === id), { consentVersion: CONSENT_VERSION });
  const p = () => ({ latitude: 49.49, longitude: .1, accuracy: 12, timestamp: time });
  return { db, pilot, open, p, advance: n => { time += n; } };
}
test('GPS pilot requires explicit information and stores nothing in the order database', t => {
  const h = fixture(t), before = JSON.stringify(h.db);
  assert.throws(() => h.pilot.start(h.db, h.db.kroklyDrivers[0], {}), e => e.statusCode === 400);
  const s = h.open('lina'); h.pilot.update(h.db, 'lina', { sessionId: s.sessionId, position: h.p() });
  assert.equal(h.pilot.locations(h.db).length, 1); assert.equal(JSON.stringify(h.db), before);
  h.pilot.stop(h.db, 'lina', s); assert.equal(h.pilot.locations(h.db).length, 0);
});
test('GPS isolation, old device stop, out of order positions and expiry', t => {
  const h = fixture(t), old = h.open('lina'), s = h.open('lina');
  assert.throws(() => h.pilot.update(h.db, 'malik', { ...s, position: h.p() }), e => e.statusCode === 409);
  h.pilot.stop(h.db, 'lina', old); h.pilot.update(h.db, 'lina', { ...s, position: h.p() });
  assert.throws(() => h.pilot.update(h.db, 'lina', { ...s, position: h.p() }), e => e.statusCode === 409);
  h.advance(POSITION_TTL_MS); assert.deepEqual(h.pilot.locations(h.db), []);
  assert.throws(() => h.pilot.update(h.db, 'lina', { ...s, position: h.p() }), e => e.statusCode === 409);
});
test('GPS rejects inaccurate, stale, future, malformed and known simulated positions', t => {
  const h = fixture(t), s = h.open('lina');
  for (const change of [{ latitude: '49' }, { latitude: 91 }, { longitude: -181 }, { accuracy: 101 }, { accuracy: -1 }, { timestamp: h.p().timestamp - 30001 }, { timestamp: h.p().timestamp + 5001 }, { mocked: true }]) {
    assert.throws(() => h.pilot.update(h.db, 'lina', { ...s, position: { ...h.p(), ...change } }), e => e.statusCode === 400);
  }
  assert.deepEqual(h.pilot.locations(h.db), []);
});
test('GPS revoked on account deactivation, password reset and server restart', t => {
  const h = fixture(t); let s = h.open('lina'); h.pilot.update(h.db, 'lina', { ...s, position: h.p() });
  h.db.kroklyDrivers[0].authVersion++; assert.equal(h.pilot.locations(h.db).length, 0);
  s = h.open('lina'); h.pilot.update(h.db, 'lina', { ...s, position: h.p() }); h.db.kroklyDrivers[0].active = false;
  assert.equal(h.pilot.locations(h.db).length, 0);
  const second = createGpsPilot(); t.after(second.close); assert.deepEqual(second.locations(h.db), []);
});
test('pilot stops after thirty minutes even if positions keep arriving', t => {
  const h = fixture(t), s = h.open('lina');
  for (let i = 0; i < 30; i++) { h.pilot.update(h.db, 'lina', { ...s, position: h.p() }); h.advance(60_000); }
  assert.equal(h.pilot.locations(h.db).length, 0);
  assert.throws(() => h.pilot.update(h.db, 'lina', { ...s, position: h.p() }), e => e.statusCode === 409);
});
test('new voluntary sharing survives 30 minutes and a signal gap, but positions still disappear after 90 seconds', t => {
  const h = fixture(t), before = JSON.stringify(h.db);
  const s = h.pilot.start(h.db, h.db.kroklyDrivers[0], { consentVersion: 'bibou-foreground-gps-until-stop-v2' });
  assert.equal(s.sharingMode, 'until-stopped'); assert.equal(s.expiresAt, null);
  for (let i = 0; i < 65; i++) { h.pilot.update(h.db, 'lina', { ...s, position: h.p() }); h.advance(60_000); }
  assert.equal(h.pilot.locations(h.db).length, 1);
  h.advance(POSITION_TTL_MS); assert.deepEqual(h.pilot.locations(h.db), []);
  h.pilot.update(h.db, 'lina', { ...s, position: h.p() }); assert.equal(h.pilot.locations(h.db).length, 1);
  assert.equal(JSON.stringify(h.db), before);
  h.pilot.stop(h.db, 'lina', s);
  assert.throws(() => h.pilot.update(h.db, 'lina', { ...s, position: h.p() }), e => e.statusCode === 409);
});
test('continuous sharing is revoked with the driver account, and cannot stop a newer device grant', t => {
  const h = fixture(t), consent = { consentVersion: 'bibou-native-gps-until-stop-v2' };
  const old = h.pilot.start(h.db, h.db.kroklyDrivers[0], consent), s = h.pilot.start(h.db, h.db.kroklyDrivers[0], consent);
  h.pilot.stop(h.db, 'lina', old); h.pilot.update(h.db, 'lina', { ...s, position: h.p() });
  h.db.kroklyDrivers[0].authVersion++;
  assert.throws(() => h.pilot.update(h.db, 'lina', { ...s, position: h.p() }), e => e.statusCode === 409);
});
function clientHarness() {
  let success, error, interval, time = Date.now(); const sends = [], clears = [], messages = [];
  let send = async (action, data) => {
    sends.push({ action, data });
    if (action === 'start') return { sessionId: 'session-test-only', expiresAt: null, sharingMode: 'until-stopped' };
    return { receivedAt: new Date(time).toISOString() };
  };
  const client = createClient({ geolocation: { watchPosition: (ok, fail) => { success = ok; error = fail; return 9; }, clearWatch: id => clears.push(id) }, send: (...args) => send(...args), now: () => time,
    every: fn => { interval = fn; return 8; }, cancelEvery: () => { interval = null; }, onChange: s => messages.push(s) });
  return { client, sends, clears, messages, position: (accuracy = 10, delta = 0) => success({ coords: { latitude: 49.49, longitude: .1, accuracy }, timestamp: time + delta }),
    error: code => error({ code }), tick: n => { time += n; interval?.(); }, setSend: fn => { send = fn; } };
}
test('browser GPS never prompts without consent and starts only after server grant', async () => {
  const h = clientHarness(); await h.client.start(false); assert.equal(h.sends.length, 0);
  await h.client.start(true); assert.equal(h.sends[0].action, 'start'); h.position(); await flush();
  assert.equal(h.sends[1].action, 'position'); assert.match(h.client.snapshot().message, /Position reçue/);
  await h.client.stop(); assert.deepEqual(h.clears, [9]); assert.equal(h.sends.at(-1).action, 'stop');
  h.position(); assert.equal(h.sends.at(-1).action, 'stop');
});
test('browser GPS refusal and inaccurate fixes do not send coordinates', async () => {
  const h = clientHarness(); await h.client.start(true); h.position(101); await flush(); assert.equal(h.sends.length, 1);
  h.error(1); await flush(); assert.equal(h.client.snapshot().active, false); assert.match(h.client.snapshot().message, /refusée/);
  assert.equal(h.sends.some(s => s.action === 'position'), false);
});
test('browser GPS keeps voluntary sharing through network or signal interruption, without inventing fresh positions', async () => {
  const h = clientHarness(); await h.client.start(true); h.setSend(async action => { h.sends.push({ action }); if (action === 'position') throw Error('Offline'); return {}; });
  h.position(); await flush(); assert.equal(h.client.snapshot().active, true); assert.deepEqual(h.sends.map(s => s.action), ['start', 'position']);
  const fresh = clientHarness(); await fresh.client.start(true); fresh.position(); await flush(); fresh.tick(31000); await flush(); assert.equal(fresh.client.snapshot().active, true);
  assert.equal(fresh.sends.filter(s => s.action === 'position').length, 1);
  fresh.position(); fresh.tick(10000); await flush(); assert.equal(fresh.sends.filter(s => s.action === 'position').length, 2);
});
test('browser continuous grant is not silently replaced by a legacy 30-minute grant', async () => {
  const h = clientHarness(); h.setSend(async action => action === 'start' ? { sessionId: 'legacy-session', expiresAt: new Date().toISOString() } : {});
  await h.client.start(true); assert.equal(h.client.snapshot().active, false);
});
test('browser does not stop after 30 minutes and explicit Stop cancels subsequent callbacks', async () => {
  const h = clientHarness(); await h.client.start(true);
  for (let i = 0; i < 190; i++) { h.position(); h.tick(10000); await flush(); }
  assert.equal(h.client.snapshot().active, true); await h.client.stop(); h.position(); h.tick(10000); await flush();
  assert.equal(h.client.snapshot().active, false); assert.equal(h.sends.at(-1).action, 'stop');
});
test('late start after logout/stop is cancelled before accessing phone GPS', async () => {
  const h = clientHarness(); let resolve;
  h.setSend((action, data) => { h.sends.push({ action, data }); return action === 'start' ? new Promise(r => { resolve = r; }) : Promise.resolve({}); });
  const pending = h.client.start(true); await h.client.stop(); resolve({ sessionId: 'late', expiresAt: new Date(Date.now() + SESSION_MS).toISOString() }); await pending;
  assert.equal(h.client.snapshot().active, false); assert.deepEqual(h.clears, []); assert.equal(h.sends.at(-1).action, 'stop');
});
