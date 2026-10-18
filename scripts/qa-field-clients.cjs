'use strict';
// Usage: node scripts/qa-field-clients.cjs /path/to/driver/src/bibou-api-service.cjs
// In-process transports only. No phone position, real credential or network.
const assert = require('node:assert/strict'), crypto = require('node:crypto'), path = require('node:path');
const { createFieldTest, USERNAME } = require('../server/krokli-field-test');
const { createCustomerFetch } = require('../review-client');
const { receivedSnapshot } = require('../delivery-tracking-client');
if (!process.argv[2]) throw Error('Provide the existing Driver API contract file.');
const { createBibouService } = require(path.resolve(process.argv[2]));
const code = 'essai-' + 'q'.repeat(32), now = Date.now();
const s = createFieldTest({ enabled: true, accessHash: crypto.createHash('sha256').update(code).digest('hex'), expiresAt: new Date(now + 3600000).toISOString() });
const caps = { protocol: 'krokli-bibou-live-v1', restaurant: 'bibou-le-havre', sharedDriverAccounts: true, manualDispatch: true, gpsPilot: { optional: true },
  timedDispatch: { supported: true, availableCouriersOnly: true, requiresRestaurantActivation: true },
  customerTracking: { protocol: 'bibou-customer-delivery-v1', explicitDriverConsent: true, onlyOwnActiveDelivery: true, maximumPositionAgeSeconds: 30 } };
async function transport(url, options = {}) {
  const u = new URL(url), token = String(options.headers?.Authorization || '').replace(/^Bearer /, ''), body = options.body ? JSON.parse(options.body) : undefined;
  try {
    let data;
    if (u.pathname === '/api/krokly-driver/capabilities') data = caps;
    else if (u.pathname === '/api/krokly-driver/login') data = s.loginDriver(body);
    else if (u.pathname.startsWith('/api/krokly-driver/')) data = await s.handleDriver(token, u.pathname, options.method || 'GET', body);
    else if (u.pathname.startsWith('/api/review/')) data = await s.handleCustomer(token, u.pathname.slice('/api/review'.length), options.method || 'GET', async () => body);
    else throw Error('Test transport forbids real routes.');
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) { return new Response(JSON.stringify({ error: error.message }), { status: error.statusCode || 500 }); }
}
(async () => {
  try {
    const api = createBibouService({ fetchImpl: transport }), login = await api.login(USERNAME, code), customer = s.loginCustomer({ accessCode: code });
    const fetchCustomer = createCustomerFetch('https://bibous-burger.onrender.com/api', transport);
    const getOrders = async () => (await (await fetchCustomer('https://bibous-burger.onrender.com/api/customer/orders', { headers: { Authorization: `Bearer ${customer.token}` } })).json()).orders;
    let state = await api.state(login.token); assert.equal(state.reviewMode, false); assert.equal(state.serviceFeatures.customerTracking, true);
    assert.equal((await getOrders())[0].id, state.orders[0].id);
    const id = state.orders[0].id; await api.act(login.token, id, 'accept'); await api.act(login.token, id, 'pickup');
    const gps = await api.gps(login.token, 'start', { consentVersion: 'bibou-native-gps-customer-v3', customerTracking: true });
    await api.gps(login.token, 'position', { sessionId: gps.sessionId, position: { latitude: 49.49, longitude: .12, accuracy: 10, timestamp: Date.now() } });
    const trackingUrl = 'https://bibous-burger.onrender.com/api/customer/orders/' + id + '/delivery-tracking';
    const result = await (await fetchCustomer(trackingUrl, { headers: { Authorization: `Bearer ${customer.token}` } })).json();
    assert.equal(receivedSnapshot(result).position.latitude, 49.49);
    await api.act(login.token, id, 'deliver'); assert.equal((await getOrders())[0].status, 'delivered');
    state = await api.state(login.token); assert.equal(state.orders[0].slot, 'TEST B');
    process.stdout.write('Existing Driver and Bibou client contracts: shared course, phone-GPS protocol and next course verified. No network or personal data used.\n');
  } finally { s.close(); }
})().catch(() => { process.stderr.write('Client compatibility QA failed.\n'); process.exitCode = 1; });
