const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { parisDateKey } = require('./availability');

test('Krokli Driver HTTP: accounts, isolation, attribution and order status', { timeout: 30000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'krokly-driver-http-'));
  const file = path.join(dir, 'data.json');
  const date = parisDateKey(new Date());
  const order = (number, status = 'ready') => ({
    id: `order-${number}`, number, customerId: 'c1', customerName: 'Client fictif',
    customerPhone: '0600000000', deliveryAddress: { address: '1 rue fictive', postalCode: '76600', city: 'Le Havre' },
    method: 'delivery', serviceDate: date, slot: '19:00', items: [{ name: 'Burger', price: 10, quantity: 1 }],
    subtotal: 10, total: 13.99, deliveryFee: 3.99, status, payment: { status: 'PAID' }, createdAt: new Date().toISOString()
  });
  await fs.writeFile(file, JSON.stringify({ customers: [{ id: 'c1', name: 'Client fictif', points: 0 },{id:'c2',name:'Autre client fictif',points:0}], orders: [order(1), order(2)], reservations: [], nextOrderNumber: 3, nextCustomerId: 3 }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/driver-no-external.cjs'), path.join(__dirname, 'server.js')], {
    cwd: dir,
    env: { PATH: process.env.PATH, PORT: '0', NODE_ENV: 'test', DATA_FILE_PATH: file, SESSION_SECRET: 's'.repeat(64), RESTAURANT_DASHBOARD_PASSWORD: 'owner-test-password' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
    await fs.rm(dir, { recursive: true, force: true });
  });
  let output = '', errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0]); });
    child.on('error', reject);
    child.on('exit', code => reject(Error(`${code}: ${errors}`)));
  });
  async function request(route, bearer = '', method = 'GET', input) {
    const response = await fetch(`${base}${route}`, {
      method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      ...(input ? { body: JSON.stringify(input) } : {})
    });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  const driverPage = await fetch(`${base}/driver/`);
  assert.equal(driverPage.status, 200);
  assert.doesNotMatch(await driverPage.text(), /metro-trip|METRO Le Havre|rue Desmarais/);
  const manifestResponse = await fetch(`${base}/driver/manifest.webmanifest`);
  assert.match(manifestResponse.headers.get('content-type'), /application\/manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, 'Krokli Driver'); assert.equal(manifest.id, '/driver/');
  for (const [asset, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const response = await fetch(`${base}/driver/${asset}`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
  }
  assert.equal((await request('/api/dashboard/krokly-drivers')).status, 401);
  const owner = (await request('/api/dashboard/auth/login', '', 'POST', { password: 'owner-test-password' })).data.token;
  const lina = await request('/api/dashboard/krokly-drivers', owner, 'POST', { username: 'lina', name: 'Lina' });
  const malik = await request('/api/dashboard/krokly-drivers', owner, 'POST', { username: 'malik', name: 'Malik' });
  assert.equal(lina.status, 201);
  assert.equal(malik.status, 201);
  const copiedLogin = await request('/api/krokly-driver/login', '', 'POST', { username: ' LINA ', password: `\n${lina.data.password}\u00a0` });
  assert.equal(copiedLogin.status, 200);
  const linaToken = copiedLogin.data.token;
  const malikToken = (await request('/api/krokly-driver/login', '', 'POST', { username: 'malik', password: malik.data.password })).data.token;
  const firstResponse = await request('/api/krokly-driver/state', linaToken);
  assert.equal(firstResponse.headers.get('cache-control'), 'no-store');
  const firstState = firstResponse.data;
  const capabilities = await request('/api/krokly-driver/capabilities');
  assert.equal(capabilities.data.protocol, 'krokli-bibou-live-v1');
  assert.equal(capabilities.data.automaticNearestDispatch, false);
  assert.equal(capabilities.data.nativePush.protocol, 'krokli-native-push-v1');
  assert.equal(capabilities.data.nativePush.projectId, '8f737171-95c6-449a-8c34-4ce9f0ee747c');
  const nativeInput = { installationId: require('node:crypto').randomUUID(), installationSecret: require('node:crypto').randomUUID(), projectId: capabilities.data.nativePush.projectId,
    platform: 'android', informed: true, token: 'ExpoPushToken[fixture_driver_only]' };
  const nativeRoute = '/api/krokly-driver/native-push/register';
  assert.equal((await request(nativeRoute, '', 'POST', nativeInput)).status, 401);
  assert.equal((await request(nativeRoute, owner, 'POST', nativeInput)).status, 401);
  assert.equal((await request(nativeRoute, linaToken, 'POST', { ...nativeInput, informed: false })).status, 400);
  const registeredNative = await request(nativeRoute, linaToken, 'POST', nativeInput);
  assert.equal(registeredNative.status, 200); assert.equal(registeredNative.data.registered, true);
  assert.ok(Date.parse(registeredNative.data.expiresAt) > Date.now());
  assert.equal(JSON.stringify((await request('/api/krokly-driver/state', malikToken)).data).includes(nativeInput.token), false);
  assert.equal((await request(nativeRoute, malikToken, 'POST', { ...nativeInput, installationSecret: require('node:crypto').randomUUID() })).status, 403);
  assert.equal((await fetch(`${base}/driver/gps.js`)).status, 200);
  assert.equal((await request('/api/krokly-driver/gps/start', '', 'POST', { consentVersion: 'bibou-foreground-gps-v1' })).status, 401);
  assert.equal((await request('/api/krokly-driver/gps/start', linaToken, 'POST', {})).status, 400);
  const gps = await request('/api/krokly-driver/gps/start', linaToken, 'POST', { consentVersion: 'bibou-foreground-gps-v1' });
  assert.equal(gps.status, 200);
  const fix = { latitude: 49.49, longitude: .1, accuracy: 12, timestamp: Date.now() };
  assert.equal((await request('/api/krokly-driver/gps/position', malikToken, 'POST', { ...gps.data, position: fix })).status, 409);
  assert.equal((await request('/api/krokly-driver/gps/position', linaToken, 'POST', { ...gps.data, position: fix })).status, 200);
  const located = (await request('/api/dashboard/krokly-drivers', owner)).data.gpsPositions;
  assert.equal(located.length, 1); assert.equal(located[0].driverId, lina.data.driver.id);
  assert.equal(JSON.stringify((await request('/api/krokly-driver/state', malikToken)).data).includes('latitude'), false);
  assert.equal(JSON.stringify(JSON.parse(await fs.readFile(file, 'utf8'))).includes('latitude'), false, 'GPS is absent from database and backups');
  assert.equal((await request('/api/krokly-driver/gps/stop', linaToken, 'POST', gps.data)).status, 200);
  assert.deepEqual((await request('/api/dashboard/krokly-drivers', owner)).data.gpsPositions, []);
  assert.ok(capabilities.data.gpsPilot.sharingModes.includes('until-stopped'));
  const continuous = await request('/api/krokly-driver/gps/start', linaToken, 'POST', { consentVersion: 'bibou-foreground-gps-until-stop-v2' });
  assert.equal(continuous.status, 200); assert.equal(continuous.data.expiresAt, null); assert.equal(continuous.data.sharingMode, 'until-stopped');
  assert.equal((await request('/api/krokly-driver/gps/position', linaToken, 'POST', { ...continuous.data, position: { ...fix, timestamp: Date.now() } })).status, 200);
  await request('/api/krokly-driver/gps/stop', linaToken, 'POST', continuous.data);
  assert.deepEqual((await request('/api/dashboard/krokly-drivers', owner)).data.gpsPositions, []);
  const customerGps = await request('/api/krokly-driver/gps/start', linaToken, 'POST', { consentVersion: 'bibou-foreground-gps-customer-v3', customerTracking: true });
  assert.equal(customerGps.status, 200); assert.equal(customerGps.data.customerTracking, true);
  assert.equal(customerGps.data.sharingMode, 'until-stopped'); assert.equal(customerGps.data.expiresAt, null);
  await request('/api/krokly-driver/gps/stop', linaToken, 'POST', customerGps.data);
  const nativeGps = await request('/api/krokly-driver/gps/start', linaToken, 'POST', { consentVersion: 'bibou-native-gps-customer-v3', customerTracking: true });
  assert.equal(nativeGps.status, 200); assert.equal(nativeGps.data.customerTracking, true);
  assert.equal((await request('/api/krokly-driver/gps/position', linaToken, 'POST', { ...nativeGps.data, position: { ...fix, timestamp: Date.now() } })).status, 200);
  await request('/api/krokly-driver/gps/stop', linaToken, 'POST', nativeGps.data);
  assert.equal(firstState.orders.length, 0);
  const renameRoute = '/api/dashboard/krokly-drivers/' + lina.data.driver.id + '/name';
  assert.equal((await request(renameRoute, '', 'PATCH', { name: 'Lina (surnom)' })).status, 401);
  assert.equal((await request(renameRoute, linaToken, 'PATCH', { name: 'Lina (surnom)' })).status, 401);
  assert.equal((await request(renameRoute, owner, 'PATCH', { name: '' })).status, 400);
  assert.equal((await request(renameRoute, owner, 'PATCH', { name: 'Lina (surnom)' })).status, 200);
  assert.equal((await request('/api/krokly-driver/state', linaToken)).data.driver.name, 'Lina (surnom)');
  assert.equal((await request('/api/krokly-driver/login', '', 'POST', { username: 'lina', password: lina.data.password })).status, 200);
  assert.equal(firstState.push.enabled, true);
  assert.equal(typeof firstState.push.publicKey, 'string');
  assert.equal((await request('/api/krokly-driver/push/subscribe', linaToken, 'POST', { endpoint: 'https://127.0.0.1/private' })).status, 400);
  assert.equal((await request('/api/dashboard/krokly-drivers/orders/order-1/assign', owner, 'POST', { driverId: lina.data.driver.id })).status, 200);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).krokliNativePush.jobs.length, 1);
  assert.equal((await request('/api/dashboard/krokly-drivers/orders/order-1/assign', owner, 'POST', { driverId: malik.data.driver.id })).status, 409);
  assert.equal((await request('/api/krokly-driver/state', malikToken)).data.orders.length, 0);
  assert.equal((await request('/api/krokly-driver/orders/order-1/accept', malikToken, 'POST')).status, 404);
  assert.equal((await request('/api/krokly-driver/state', linaToken)).data.orders[0].deliveryAddress, undefined);
  assert.equal((await request('/api/krokly-driver/orders/order-1/accept', linaToken, 'POST')).status, 200);
  const acceptedResponse = await request('/api/krokly-driver/state', linaToken);
  assert.equal(acceptedResponse.headers.get('cache-control'), 'no-store');
  assert.equal(acceptedResponse.data.orders[0].deliveryAddress.address, '1 rue fictive');
  assert.equal(acceptedResponse.data.orders[0].orderTotal, undefined,'Driver must not receive restaurant basket revenue');
  assert.equal(acceptedResponse.data.orders[0].courierPay, 3.99);
  assert.equal((await request('/api/dashboard/orders/order-1', owner, 'PATCH', { status: 'delivered' })).status, 409);
  assert.equal((await request('/api/krokly-driver/orders/order-1/pickup', linaToken, 'POST')).status, 200);
  assert.equal((await request('/api/krokly-driver/orders/order-1/deliver', linaToken, 'POST')).status, 200);
  const persisted = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(persisted.orders[0].status, 'delivered');
  assert.equal((await request('/api/krokly-driver/account')).status,401);
  assert.equal((await request('/api/krokly-driver/account',owner)).status,401);
  assert.equal((await request('/api/krokly-driver/account?driverId=other',linaToken)).status,400);
  assert.equal((await request('/api/krokly-driver/account?week=2026-02-30',linaToken)).status,400);
  const history=(await request('/api/krokly-driver/account',linaToken)).data;
  assert.equal(history.history.length,1);assert.equal(history.summary.totalEntitlementCents,399);
  for(const privateValue of ['Client fictif','0600000000','1 rue fictive'])assert.equal(JSON.stringify(history).includes(privateValue),false);
  assert.equal((await request('/api/krokly-driver/account',malikToken)).data.history.length,0);
  const pdf=await fetch(`${base}/api/krokly-driver/statement?week=${history.week.startDate}`,{headers:{Authorization:`Bearer ${linaToken}`}});
  assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.match(pdf.headers.get('cache-control'),/no-store/);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  const session=require('./customer-session').createCustomerSession;
  const customer=session('c1','s'.repeat(64)),other=session('c2','s'.repeat(64));
  const feedbackRoute='/api/customer/orders/order-1/delivery-feedback';
  assert.equal((await request(feedbackRoute)).status,401);
  assert.equal((await request(feedbackRoute,linaToken)).status,401);
  assert.equal((await request(feedbackRoute,other)).status,404);
  assert.equal((await request(feedbackRoute,customer,'POST',{stars:5,tipCents:100})).status,400);
  assert.equal((await request(feedbackRoute,customer,'POST',{stars:5,comment:'Livraison soignée'})).status,200);
  assert.equal((await request(feedbackRoute,customer,'POST',{stars:5,comment:'Livraison soignée'})).status,200);
  assert.equal((await request(feedbackRoute,customer,'POST',{stars:2})).status,409);
  const rated=(await request('/api/krokly-driver/account',linaToken)).data;
  assert.deepEqual(rated.ratings,{count:1,averageStars:5});assert.equal(JSON.stringify(rated).includes('Livraison soignée'),false);
  assert.equal((await request('/api/krokly-driver/native-push/unregister', '', 'POST', { ...nativeInput, installationSecret: require('node:crypto').randomUUID() })).status, 403);
  assert.equal((await request('/api/krokly-driver/native-push/unregister', '', 'POST', nativeInput)).status, 200);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).krokliNativePush.devices.length, 0);
  assert.equal((await request('/api/dashboard/krokly-drivers/' + lina.data.driver.id + '/active', owner, 'PATCH', { active: false })).status, 200);
  assert.equal((await request('/api/krokly-driver/state', linaToken)).status, 401);
  assert.equal((await request('/api/krokly-driver/account', linaToken)).status, 401);
  assert.equal((await fetch(`${base}/api/krokly-driver/statement`,{headers:{Authorization:`Bearer ${linaToken}`}})).status,401);
});
