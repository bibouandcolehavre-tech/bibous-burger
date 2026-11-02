const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const core = require('./wallet/core');
const providers = require('./wallet/providers');
const { createWorker } = require('./wallet/worker');
const { readCustomerSession } = require('./customer-session');
const { anonymizeCustomerAccount } = require('./account-deletion');
const fixture = () => ({ customers: [{ id: 'synthetic-alice', firstName: 'Alice', lastName: 'Test', name: 'Alice Test', phone: '+33600000001', phoneVerifiedAt: '2026-01-01', points: 345, weeklyOrders: 2 }], orders: [], reservations: [] });

test('one membership reuses existing points; barcode, pass token and Wallet cookie never become login credentials', () => {
  const db = fixture(), c = db.customers[0];
  core.ensureMembership(db, c); const serial = c.clubWallet.serial;
  core.ensureMembership(db, c); assert.equal(c.clubWallet.serial, serial); assert.equal(c.points, 345);
  const view = core.memberView(c); assert.equal(view.points, 345);
  assert.deepEqual(Object.keys(view).sort(), ['barcode', 'firstName', 'memberId', 'points']);
  assert.equal(readCustomerSession(view.barcode, 'secret'), null);
  assert.equal(readCustomerSession(core.passAuth(serial, 'secret'), 'secret'), null);
  const cookie = core.walletCookie(c.id, 'secret'); assert.match(cookie, /HttpOnly; SameSite=Strict.*Secure/);
  assert.equal(readCustomerSession(cookie.split(';')[0].split('=')[1], 'secret'), null);
  assert.equal(core.customerForCookie({ headers: { cookie } }, db, 'secret').id, c.id);
  assert.equal(core.customerForCookie({ headers: { cookie } }, db, 'wrong'), null);
  assert.equal(core.scan(db, 'BIBOU:1:' + '0'.repeat(32)), null);
  assert.equal(core.scan(db, view.barcode).firstName, 'Alice');
  assert.equal(core.scan(db, serial), null);
  const before = c.clubWallet.revision; c.points += 27; core.reconcile(db); assert.ok(c.clubWallet.revision > before);
  const after = c.clubWallet.revision; core.reconcile(db); assert.equal(c.clubWallet.revision, after);
  c.points -= 40; core.reconcile(db); assert.equal(core.memberView(c).points, 332);
  assert.equal(c.weeklyOrders, 2, 'Wallet does not change loyalty rules');
});

test('deleted account invalidates its barcode and retains only anonymous pass revocation metadata', () => {
  const db = fixture(), c = db.customers[0]; core.ensureMembership(db, c);
  const view = core.memberView(c); c.clubWallet.googleIssued = true; c.clubWallet.appleIssued = true;
  anonymizeCustomerAccount(db, c);
  assert.equal(core.scan(db, view.barcode), null); assert.equal(db.customers.length, 0);
  const revoked = core.findPass(db, view.memberId); assert.equal(revoked.voided, true); assert.equal(revoked.points, 0);
  const serialized = JSON.stringify(db.clubWalletRevocations); for (const personal of ['Alice', '+33600000001', 'synthetic-alice']) assert.ok(!serialized.includes(personal));
});

test('all providers fail closed by default; origins cannot contain credentials, query tokens or insecure public HTTP', () => {
  assert.equal(providers.configFromEnv({}).enabled, false);
  assert.equal(providers.configFromEnv({ WALLET_ENABLED: 'true', WALLET_PUBLIC_ORIGIN: 'http://example.com' }).enabled, false);
  for (const origin of ['https://secret@example.com', 'https://example.com/path', 'https://example.com/?token=secret']) assert.equal(core.publicOrigin(origin), null);
  assert.throws(() => core.assertSameOrigin({ headers: { origin: 'https://evil.example' } }, 'https://bibou.example'), /Recharge/);
});

test('Google Save JWT has a valid RSA signature and contains only the chosen card, without phone or orders', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibou-wallet-sign-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const file = path.join(dir, 'credentials.json');
  fs.writeFileSync(file, JSON.stringify({ type: 'service_account', client_email: 'wallet@synthetic-test.iam.gserviceaccount.com', private_key: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  const config = { origin: 'https://bibou.example', google: { issuer: '123456789', classId: '123456789.club', credentialFile: file } };
  const db = fixture(); core.ensureMembership(db, db.customers[0]); const pass = core.findPass(db, db.customers[0].clubWallet.serial);
  const url = providers.googleSaveLink(pass, config); assert.ok(url.startsWith('https://pay.google.com/gp/v/save/'));
  const [header, body, signature] = url.split('/').pop().split('.');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(header + '.' + body), keys.publicKey, Buffer.from(signature, 'base64url')));
  const payload = JSON.parse(Buffer.from(body, 'base64url')); assert.equal(payload.aud, 'google'); assert.equal(payload.typ, 'savetowallet');
  const object = payload.payload.loyaltyObjects[0]; assert.equal(object.loyaltyPoints.balance.int, 345); assert.equal(object.accountName, 'Alice');
  assert.equal(payload.payload.loyaltyClasses, undefined, 'A Save link cannot silently create a new class');
  for (const field of ['+33600000001', 'synthetic-alice', 'Alice Test']) assert.ok(!JSON.stringify(payload).includes(field));
});

test('Apple pass ZIP, manifest and CMS signature are valid with ephemeral TEST certificates; no Apple-installability claim', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibou-wallet-pkpass-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const key = path.join(dir, 'test.key'), cert = path.join(dir, 'test.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=LOCAL TEST ONLY'], { stdio: 'ignore' });
  const config = { origin: 'https://bibou.example', apple: { passType: 'pass.com.bibousburgers.club', team: 'RXT78KZ7A7', keyFile: key, certFile: cert, wwdrFile: cert } };
  const db = fixture(); core.ensureMembership(db, db.customers[0]); const pass = core.findPass(db, db.customers[0].clubWallet.serial);
  const file = path.join(dir, 'test.pkpass'); fs.writeFileSync(file, providers.applePass(pass, config, 'secret'));
  const extract = name => execFileSync('unzip', ['-p', file, name]);
  const content = JSON.parse(extract('pass.json')); assert.equal(content.storeCard.headerFields[0].value, 345);
  assert.equal(content.barcodes[0].message, pass.barcode); assert.equal(content.authenticationToken, core.passAuth(pass.memberId, 'secret'));
  assert.ok(!JSON.stringify(content).includes('+33600000001'));
  const manifest = extract('manifest.json');
  for (const [name, sha] of Object.entries(JSON.parse(manifest))) assert.equal(crypto.createHash('sha1').update(extract(name)).digest('hex'), sha);
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifest); fs.writeFileSync(path.join(dir, 'signature'), extract('signature'));
  execFileSync('openssl', ['cms', '-verify', '-binary', '-inform', 'DER', '-in', path.join(dir, 'signature'), '-content', path.join(dir, 'manifest.json'), '-noverify', '-out', path.join(dir, 'verified')], { stdio: 'ignore' });
});

test('balance sync retries failures, survives concurrent balance changes and never changes loyalty points or sends SMS', async () => {
  const db = fixture(), c = db.customers[0]; core.ensureMembership(db, c); c.clubWallet.googleIssued = true; c.clubWallet.appleIssued = true;
  c.clubWallet.devices.push({ deviceId: 'device-test-123456789', pushToken: 'f'.repeat(64), notifiedRevision: 0 });
  const transact = async (fn, save) => { const result = await fn(db); if (save) core.reconcile(db); return result; };
  let calls = 0, pushes = 0;
  const tick = createWorker({ config: { enabled: true, google: { enabled: true }, apple: { enabled: true } }, transact,
    updateGoogle: async pass => { calls++; if (calls === 1) { c.points += 50; core.reconcile(db); throw Error('Synthetic outage'); } assert.equal(pass.points, 395); return true; },
    pushApple: async () => { pushes++; return pushes === 1 ? 503 : 200; } });
  await tick(); assert.equal(c.clubWallet.googleSyncedRevision, undefined); assert.equal(c.points, 395);
  await tick(); assert.equal(c.clubWallet.googleSyncedRevision, c.clubWallet.revision); assert.equal(pushes, 2);
  await tick(); assert.equal(calls, 2); assert.equal(pushes, 2);
  assert.equal(c.points, 395); assert.equal(db.orders.length, 0);
});
