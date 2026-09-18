const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const push = require('./push-notifications');
const { anonymizeCustomerAccount } = require('./account-deletion');
const now = Date.parse('2026-09-19T17:00:00Z');
const config = { enabled: true, platforms: ['ios', 'android'], accessToken: '' };
const off = { enabled: false, platforms: [] };
const account = id => ({ id, name: 'Client fictif', phone: '+33600000001' });
const database = () => ({ customers: [account('c1'), account('c2')], orders: [], reservations: [] });
const device = (platform = 'ios') => ({ installationId: crypto.randomUUID(), secret: crypto.randomUUID(), token: `ExpoPushToken[${crypto.randomBytes(16).toString('hex')}]`, platform });
function setup(db = database(), kind = 'service') { const c = db.customers[0], d = device(); push.registerDevice(db, c, d, now); push.updatePreferences(db, c, { [kind]: true }, now); return { db, c, d }; }
const order = status => ({ id: 'o1', number: 1, customerId: 'c1', status, method: 'pickup', payment: { status: 'PAID' } });
const campaign = () => ({ requestId: crypto.randomUUID(), title: 'Le burger du mois', body: 'Découvre les nouveautés de Bibou.', screen: 'menu', audience: 'all' });
const worker = (db, fetchImpl, clock = () => now) => push.createPushWorker({ config, transact: async task => task(db), fetchImpl, clock });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('push : aucun consentement implicite et configuration fermée par défaut', () => {
  const db = database();
  assert.deepEqual(push.configFromEnv({}), { enabled: false, platforms: [], accessToken: '' });
  assert.deepEqual(push.customerPushState(db, db.customers[0], off).preferences, { service: false, marketing: false, updatedAt: null });
  assert.throws(() => push.updatePreferences(db, db.customers[0], { marketing: 'true' }), /invalide/);
  assert.throws(() => push.updatePreferences(db, db.customers[0], { customerId: 'c2' }), /invalide/);
  const d = device(); push.registerDevice(db, db.customers[0], d, now);
  push.queueServiceNotification(db, order('ready'), 'order', 'preparing', config, now);
  assert.equal(db.pushNotifications.jobs.length, 0);
});

test('push : jetons et preuve d’installation validés, aucune fuite de jeton', () => {
  const { db, c, d } = setup();
  assert.throws(() => push.registerDevice(db, c, { ...d, token: 'https://evil.test' }, now), /invalide/);
  assert.throws(() => push.registerDevice(db, db.customers[1], { ...d, secret: crypto.randomUUID() }, now), /associé/);
  const state = JSON.stringify(push.customerPushState(db, c, config, now));
  assert.ok(!state.includes(d.token)); assert.ok(!state.includes(d.secret)); assert.ok(!state.includes('secretHash'));
  push.registerDevice(db, c, d, now + 10);
  assert.equal(db.pushNotifications.devices.length, 1);
  for (let i = 0; i < 4; i++) push.registerDevice(db, c, device(), now);
  assert.throws(() => push.registerDevice(db, c, device(), now), /Cinq/);
});

test('push : commandes payées uniquement, doublons évités, anciens statuts périmés', () => {
  const { db } = setup(), o = order('preparing');
  push.queueServiceNotification(db, { ...o, payment: { status: 'PENDING' } }, 'order', 'confirmed', config, now);
  assert.equal(db.pushNotifications.jobs.length, 0);
  push.queueServiceNotification(db, o, 'order', 'confirmed', config, now);
  push.queueServiceNotification(db, o, 'order', 'confirmed', config, now);
  assert.equal(db.pushNotifications.jobs.length, 1);
  assert.equal(db.pushNotifications.jobs[0].title, 'Commande acceptée');
  o.status = 'ready'; push.queueServiceNotification(db, o, 'order', 'preparing', config, now);
  assert.equal(db.pushNotifications.jobs[0].status, 'cancelled');
  assert.match(db.pushNotifications.jobs[1].body, /retirée/);
  o.status = 'cancelled'; push.queueServiceNotification(db, o, 'order', 'ready', config, now);
  assert.ok(!db.pushNotifications.jobs.at(-1).body.includes('rembours'));
});

test('push : table confirmée ou annulée sans promesse prématurée', () => {
  const { db } = setup(), table = { id: 'reservation-1', customerId: 'c1', status: 'pending' };
  push.queueServiceNotification(db, table, 'reservation', null, config, now);
  assert.equal(db.pushNotifications.jobs.length, 0);
  table.status = 'confirmed'; push.queueServiceNotification(db, table, 'reservation', 'pending', config, now);
  assert.equal(db.pushNotifications.jobs[0].screen, 'reservations');
  assert.equal(db.pushNotifications.jobs[0].title, 'Table confirmée');
});

test('push : aperçu sans envoi, confirmation nécessaire, idempotence après coupure', () => {
  const { db } = setup(database(), 'marketing'), input = campaign();
  const preview = push.prepareCampaign(db, input, config, now);
  assert.equal(preview.customers, 1); assert.equal(db.pushNotifications.jobs.length, 0);
  assert.throws(() => push.sendCampaign(db, preview.id, {}, config, now), /explicitement/);
  const first = push.sendCampaign(db, preview.id, { confirm: true }, config, now);
  assert.equal(first.counts.queued, 1);
  push.sendCampaign(db, preview.id, { confirm: true }, config, now);
  assert.equal(db.pushNotifications.jobs.length, 1);
  assert.throws(() => push.prepareCampaign(db, { ...input, title: 'Autre' }, config, now), /changé/);
  assert.throws(() => push.prepareCampaign(db, { ...campaign(), screen: 'https://evil.test' }, config, now), /incomplète/);
});

test('push : désabonnement après aperçu et après mise en file', async () => {
  const { db, c } = setup(database(), 'marketing');
  let preview = push.prepareCampaign(db, campaign(), config, now);
  push.updatePreferences(db, c, { marketing: false }, now);
  assert.throws(() => push.sendCampaign(db, preview.id, { confirm: true }, config, now), /Aucun appareil/);
  push.updatePreferences(db, c, { marketing: true }, now);
  preview = push.prepareCampaign(db, campaign(), config, now);
  push.sendCampaign(db, preview.id, { confirm: true }, config, now);
  push.updatePreferences(db, c, { marketing: false }, now);
  await worker(db, () => { throw Error('Aucun réseau autorisé'); }).tick();
  assert.equal(db.pushNotifications.jobs[0].status, 'cancelled');
});

test('push : nouvel appareil ou changement de propriétaire non ajouté à un aperçu', () => {
  const { db, d } = setup(database(), 'marketing');
  const preview = push.prepareCampaign(db, campaign(), config, now);
  push.registerDevice(db, db.customers[1], d, now);
  push.updatePreferences(db, db.customers[1], { marketing: true }, now);
  assert.throws(() => push.sendCampaign(db, preview.id, { confirm: true }, config, now), /Aucun appareil/);
});

test('push : audience Bibou +, aperçu expiré et plafond de campagnes', () => {
  const { db, c } = setup(database(), 'marketing');
  assert.equal(push.prepareCampaign(db, { ...campaign(), audience: 'plus' }, config, now).devices, 0);
  c.bibouPlusExpiresAt = new Date(now + 3600000).toISOString();
  assert.equal(push.prepareCampaign(db, { ...campaign(), audience: 'plus' }, config, now).devices, 1);
  const expired = push.prepareCampaign(db, campaign(), config, now);
  assert.throws(() => push.sendCampaign(db, expired.id, { confirm: true }, config, now + 900001), /expiré/);
  for (let i = 0; i < 2; i++) { const p = push.prepareCampaign(db, campaign(), config, now); push.sendCampaign(db, p.id, { confirm: true }, config, now); }
  const p = push.prepareCampaign(db, campaign(), config, now);
  assert.throws(() => push.sendCampaign(db, p.id, { confirm: true }, config, now), /deux campagnes/);
});

test('push : désactivation globale empêche tout envoi', async () => {
  const { db } = setup(database(), 'marketing');
  const p = push.prepareCampaign(db, campaign(), config, now);
  push.sendCampaign(db, p.id, { confirm: true }, config, now);
  const w = push.createPushWorker({ config: off, transact: async task => task(db), clock: () => now, fetchImpl: () => { throw Error('Interdit'); } });
  await w.tick(); assert.equal(db.pushNotifications.jobs[0].status, 'queued');
  assert.throws(() => push.sendCampaign(db, push.prepareCampaign(db, campaign(), off, now).id, { confirm: true }, off, now), /pas encore activées/);
});

test('push : API Expo, ticket puis reçu, pas de confusion avec une lecture', async () => {
  const { db } = setup(); let clock = now, calls = [];
  push.queueServiceNotification(db, order('ready'), 'order', 'preparing', config, now);
  const w = worker(db, async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    if (url.endsWith('/send')) { assert.equal(body[0].data.accountId, 'c1'); assert.equal(body[0].channelId, 'commandes'); assert.ok(!JSON.stringify(body).includes('+336')); return response({ data: [{ status: 'ok', id: 'receipt-1' }] }); }
    return response({ data: { 'receipt-1': { status: 'ok' } } });
  }, () => clock);
  await w.tick(); assert.equal(db.pushNotifications.jobs[0].status, 'accepted');
  await w.tick(); assert.equal(calls.length, 1);
  clock += 15 * 60000; await w.tick(); assert.equal(db.pushNotifications.jobs[0].status, 'provider_ok');
  assert.equal(calls.length, 2); assert.ok(!JSON.stringify(push.dashboardPush(db, config, clock)).includes('ExpoPushToken'));
});

test('push : appareil désinstallé retiré après ticket ou reçu DeviceNotRegistered', async () => {
  for (const onReceipt of [false, true]) {
    const { db } = setup(); let clock = now;
    push.queueServiceNotification(db, order('ready'), 'order', 'preparing', config, now);
    const invalid = { status: 'error', details: { error: 'DeviceNotRegistered' } };
    const w = worker(db, async url => response(url.endsWith('/send') ? { data: [onReceipt ? { status: 'ok', id: 'r1' } : invalid] } : { data: { r1: invalid } }), () => clock);
    await w.tick(); if (onReceipt) { clock += 15 * 60000; await w.tick(); }
    assert.equal(db.pushNotifications.jobs[0].status, 'failed');
    assert.equal(db.pushNotifications.devices[0].token, undefined);
  }
});

test('push : timeout ambigu non renvoyé, limitation 429 retentée prudemment', async () => {
  for (const status of [0, 429]) {
    const { db } = setup(); let clock = now, calls = 0;
    push.queueServiceNotification(db, order('ready'), 'order', 'preparing', config, now);
    const w = worker(db, async () => { calls++; if (!status) throw Error('timeout'); return response({}, status); }, () => clock);
    await w.tick(); await w.tick(); assert.equal(calls, 1);
    clock += 60000; await w.tick(); assert.equal(calls, status ? 2 : 1);
    assert.equal(db.pushNotifications.jobs[0].status, status ? 'queued' : 'uncertain');
  }
});

test('push : déconnexion, suppression du compte et purge sans données résiduelles', () => {
  const { db, c, d } = setup();
  push.queueServiceNotification(db, order('ready'), 'order', 'preparing', config, now);
  push.removeDevice(db, db.customers[1], d.installationId);
  assert.equal(db.pushNotifications.devices.length, 1);
  push.removeDevice(db, c, d.installationId); assert.equal(db.pushNotifications.jobs[0].status, 'cancelled');
  push.registerDevice(db, c, d, now); anonymizeCustomerAccount(db, c, new Date(now));
  assert.equal(db.pushNotifications.devices.length, 0); assert.equal(db.pushNotifications.jobs.length, 0);
  const another = setup(); push.queueServiceNotification(another.db, order('ready'), 'order', 'preparing', config, now);
  push.purgePush(another.db, now + 91 * 86400000); assert.equal(another.db.pushNotifications.devices.length, 0); assert.equal(another.db.pushNotifications.jobs.length, 0);
});

test('push : reprise après arrêt ne répète pas un envoi déjà commencé', async () => {
  const { db } = setup(); push.queueServiceNotification(db, order('ready'), 'order', 'preparing', config, now);
  Object.assign(db.pushNotifications.jobs[0], { status: 'sending', attemptedAt: now - 180000 });
  let calls = 0; await worker(db, async () => { calls++; return response({}); }).tick();
  assert.equal(calls, 0); assert.equal(db.pushNotifications.jobs[0].status, 'uncertain');
});

test('push : preuves de consentement indépendantes et conservées lors des autres choix', () => {
  const { db, c } = setup(database(), 'marketing');
  push.updatePreferences(db, c, { service: true }, now + 1000);
  assert.equal(c.pushPreferences.marketingAcceptedAt, new Date(now).toISOString());
  assert.equal(c.pushPreferences.serviceAcceptedAt, new Date(now + 1000).toISOString());
  push.updatePreferences(db, c, { marketing: false }, now + 2000);
  assert.equal(c.pushPreferences.marketingRevokedAt, new Date(now + 2000).toISOString());
  assert.equal(c.pushPreferences.marketingAcceptedAt, new Date(now).toISOString());
  assert.equal(c.pushPreferences.service, true);
});

test('push : les alertes de commande passent avant les promotions sans dépasser 25 envois', async () => {
  const { db, c } = setup(database(), 'marketing');
  push.updatePreferences(db, c, { service: true }, now);
  const p = push.prepareCampaign(db, campaign(), config, now);
  push.sendCampaign(db, p.id, { confirm: true }, config, now);
  for (let i = 0; i < 26; i++) push.queueServiceNotification(db, { ...order('ready'), id: `priority-${i}` }, 'order', 'preparing', config, now);
  let count = 0;
  await worker(db, async (_, options) => {
    const messages = JSON.parse(options.body); count = messages.length;
    assert.ok(messages.every(m => m.channelId === 'commandes'));
    return response({ data: messages.map((m, i) => ({ status: 'ok', id: `priority-${i}` })) });
  }).tick();
  assert.equal(count, 25);
  assert.equal(db.pushNotifications.jobs.find(j => j.kind === 'marketing').status, 'queued');
  assert.equal(db.pushNotifications.jobs.filter(j => j.status === 'queued').length, 2);
});
