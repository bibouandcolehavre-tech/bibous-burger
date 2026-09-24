const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
function harness({ permission = true, isDevice = true, executionEnvironment = 'standalone', platform = 'ios', preference = true, delayed = null } = {}) {
  let stored = null, lastResponse = null, onOpen, onToken, asks = 0, registrations = 0, detached = 0, generated = 0;
  const calls = [], state = { preferences: { service: preference, marketing: false } };
  const Notifications = {
    IosAuthorizationStatus: { PROVISIONAL: 3 }, AndroidImportance: { DEFAULT: 3 }, setNotificationHandler: () => {},
    getPermissionsAsync: async () => ({ granted: permission, canAskAgain: true }), requestPermissionsAsync: async () => { asks++; return { granted: permission, canAskAgain: true }; },
    setNotificationChannelAsync: async id => { calls.push(id); }, getExpoPushTokenAsync: async () => { generated++; return { data: 'ExpoPushToken[FAKE_ONLY_123456]' }; },
    dismissAllNotificationsAsync: async () => {}, clearLastNotificationResponseAsync: async () => {},
    addNotificationResponseReceivedListener: fn => { onOpen = fn; return { remove: () => {} }; }, addPushTokenListener: fn => { onToken = fn; return { remove: () => {} }; },
    getLastNotificationResponseAsync: async () => lastResponse,
  };
  const context = { Promise, setTimeout, clearTimeout, Error, JSON, module: { exports: {} }, Linking: { openSettings: async () => {} }, Platform: { OS: platform }, Notifications, Device: { isDevice }, Constants: { executionEnvironment, expoConfig: { extra: { eas: { projectId: 'fake-project' } } } }, Crypto: { randomUUID: crypto.randomUUID }, SecureStore: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device', getItemAsync: async () => stored, setItemAsync: async (_, value) => { stored = value; } }, pushRequest: async (_, token, route = '', method = 'GET') => {
    if (!route) { if (delayed) await delayed; return state; }
    if (method === 'POST') registrations++;
    if (method === 'DELETE') detached++;
    calls.push(method); return state;
  } };
  const code = fs.readFileSync(path.join(__dirname, '../push-client.native.js'), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '') + '\nmodule.exports={syncPushDevice,detachPushDevice,observePush,pushDeviceStatus};';
  vm.runInNewContext(code, context);
  return { ...context.module.exports, state, calls, counts: () => ({ asks, registrations, detached, generated }), open: r => onOpen(r), refreshToken: () => onToken(), setResponse: r => { lastResponse = r; } };
}

test('natif : pas de demande système au démarrage, demande après choix explicite uniquement', async () => {
  const h = harness({ permission: false });
  await h.syncPushDevice('api', 'token'); assert.equal(h.counts().asks, 0); assert.equal(h.counts().registrations, 0);
  await h.syncPushDevice('api', 'token', { ask: true }); assert.equal(h.counts().asks, 1); assert.equal(h.counts().registrations, 0);
});
test('natif : canaux Android distincts et association sans nouveau consentement publicitaire', async () => {
  const h = harness({ platform: 'android' }); await h.syncPushDevice('api', 'token');
  assert.deepEqual(h.calls.slice(0, 2), ['commandes', 'promotions']); assert.equal(h.counts().registrations, 1); assert.equal(h.state.preferences.marketing, false);
});
test('natif : refus des deux catégories retire l’appareil sans générer de jeton', async () => {
  const h = harness({ preference: false }); await h.syncPushDevice('api', 'token');
  assert.equal(h.counts().generated, 0); assert.equal(h.counts().detached, 1);
});
test('natif : déconnexion pendant une association empêche la réassociation tardive', async () => {
  let resolve; const delayed = new Promise(r => { resolve = r; }); const h = harness({ delayed });
  const registration = h.syncPushDevice('api', 'token');
  await new Promise(r => setImmediate(r));
  const logout = h.detachPushDevice('api', 'token'); resolve();
  await Promise.all([registration, logout]);
  assert.equal(h.counts().registrations, 0); assert.equal(h.counts().detached, 1);
});
test('natif : ouverture à froid et clic live ne naviguent qu’une fois', async () => {
  const h = harness(), response = { notification: { request: { identifier: 'message-1', content: { data: { accountId: 'c1', screen: 'orders' } } } } };
  h.setResponse(response); const opened = []; let refreshed = 0;
  const stop = h.observePush(d => opened.push(d), () => { refreshed++; });
  await new Promise(r => setImmediate(r)); h.open(response); h.refreshToken();
  assert.equal(opened.length, 1); assert.equal(opened[0].screen, 'orders'); assert.equal(refreshed, 1);
  stop(); h.open({ notification: { request: { identifier: 'other', content: { data: {} } } } }); assert.equal(opened.length, 1);
});
test('natif : simulateur iOS exclu du parcours de test, aucune inscription réseau', async () => {
  const h = harness({ isDevice: false }); assert.equal((await h.pushDeviceStatus()).supported, false);
  await h.syncPushDevice('api', 'token', { ask: true }); assert.equal(h.counts().registrations, 0); assert.equal(h.counts().asks, 0);
});
test('natif : émulateur Android accepté, canaux et consentement conservés', async () => {
  const h = harness({ platform: 'android', isDevice: false });
  assert.equal((await h.pushDeviceStatus()).supported, true);
  await h.syncPushDevice('api', 'token');
  assert.deepEqual(h.calls.slice(0, 2), ['commandes', 'promotions']);
  assert.equal(h.counts().registrations, 1); assert.equal(h.counts().asks, 0);
  assert.equal(h.state.preferences.marketing, false);
});
test('natif : émulateur Android sans consentement ne génère aucun jeton', async () => {
  const h = harness({ platform: 'android', isDevice: false, preference: false });
  await h.syncPushDevice('api', 'token', { ask: true });
  assert.equal(h.counts().generated, 0); assert.equal(h.counts().asks, 0); assert.equal(h.counts().registrations, 0);
});
test('natif : refus système sur émulateur Android empêche toute association', async () => {
  const h = harness({ platform: 'android', isDevice: false, permission: false });
  await h.syncPushDevice('api', 'token', { ask: true });
  assert.equal(h.counts().asks, 1); assert.equal(h.counts().generated, 0); assert.equal(h.counts().registrations, 0);
});
test('natif : Expo Go reste exclu sur téléphone et émulateur', async () => {
  for (const platform of ['android', 'ios']) for (const isDevice of [true, false]) {
    const h = harness({ platform, isDevice, executionEnvironment: 'storeClient' });
    assert.equal((await h.pushDeviceStatus()).supported, false);
    await h.syncPushDevice('api', 'token', { ask: true });
    assert.equal(h.counts().asks, 0); assert.equal(h.counts().generated, 0); assert.equal(h.counts().registrations, 0);
  }
});
