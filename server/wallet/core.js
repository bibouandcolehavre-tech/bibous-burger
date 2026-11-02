const crypto = require('node:crypto');
const { createCustomerSession, readCustomerSession } = require('../customer-session');

const COOKIE = 'bibou_club_wallet';
const ID = /^[a-f0-9]{32}$/;
const QR = /^BIBOU:1:([a-f0-9]{32})$/;
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const scopedKey = (secret, purpose) => crypto.createHmac('sha256', secret).update(`bibou-wallet-v1:${purpose}`).digest('hex');
const points = customer => Math.max(0, Math.trunc(Number(customer.points) || 0));
const firstName = customer => String(customer.firstName || customer.name?.split(' ')[0] || 'Membre').slice(0, 60);
const fingerprint = customer => JSON.stringify([firstName(customer), points(customer)]);

function ensureMembership(database, customer) {
  if (customer.clubWallet) return false;
  customer.clubWallet = { serial: crypto.randomBytes(16).toString('hex'), devices: [], createdAt: new Date().toISOString() };
  reconcile(database);
  return true;
}
function reconcile(database) {
  for (const customer of database.customers || []) {
    const wallet = customer.clubWallet;
    if (!wallet || wallet.fingerprint === fingerprint(customer)) continue;
    wallet.fingerprint = fingerprint(customer);
    wallet.revision = database.clubWalletRevision = (database.clubWalletRevision || 0) + 1;
  }
}
function memberView(customer) {
  return { firstName: firstName(customer), points: points(customer), memberId: customer.clubWallet.serial,
    barcode: `BIBOU:1:${customer.clubWallet.serial}` };
}
function scan(database, barcode) {
  const match = typeof barcode === 'string' && QR.exec(barcode);
  if (!match) return null;
  const customer = (database.customers || []).find(c => c.clubWallet?.serial === match[1]);
  return customer ? memberView(customer) : null;
}
function passAuth(serial, secret) { return scopedKey(secret, `apple:${serial}`); }
function safeEqual(left, right) {
  const a = Buffer.from(String(left || '')), b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function findPass(database, serial) {
  if (!ID.test(serial)) return null;
  const customer = (database.customers || []).find(c => c.clubWallet?.serial === serial);
  if (customer) return { ...memberView(customer), wallet: customer.clubWallet, voided: false };
  const removed = (database.clubWalletRevocations || []).find(w => w.serial === serial);
  return removed ? { firstName: 'Carte désactivée', points: 0, memberId: serial, barcode: '', wallet: removed, voided: true } : null;
}
function removeCustomer(database, customer, now = new Date()) {
  if (!customer.clubWallet) return;
  // Only installation metadata survives briefly to invalidate issued cards.
  // No name, phone, customer id or order data is copied to this queue.
  database.clubWalletRevocations ||= [];
  const wallet = customer.clubWallet;
  database.clubWalletRevocations.push({ serial: wallet.serial, devices: wallet.devices || [], appleIssued: wallet.appleIssued,
    googleIssued: wallet.googleIssued, revision: database.clubWalletRevision = (database.clubWalletRevision || 0) + 1,
    expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString() });
  delete customer.clubWallet;
}
function walletCookie(customerId, secret, { secure = true } = {}) {
  const token = createCustomerSession(customerId, scopedKey(secret, 'web-session'));
  return `${COOKIE}=${token}; Path=/api/wallet; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? '; Secure' : ''}`;
}
function customerForCookie(request, database, secret) {
  const token = String(request.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const session = readCustomerSession(token, scopedKey(secret, 'web-session'));
  return session ? (database.customers || []).find(c => c.id === session.customerId) : null;
}
function assertSameOrigin(request, publicOrigin) {
  if (request.headers.origin !== publicOrigin || request.headers['sec-fetch-site'] === 'cross-site')
    throw fail(403, 'Recharge cette page Bibou avant de continuer.');
}
function assertPreviewAccess(customer, config) {
  if (!config.previewOnly) return;
  let phone = String(customer.phone || '').replace(/\D/g, '');
  if (phone.startsWith('0033')) phone = phone.slice(2);
  if (/^0[1-9]\d{8}$/.test(phone)) phone = '33' + phone.slice(1);
  const hash = crypto.createHash('sha256').update(phone).digest('hex');
  if (!/^33[1-9]\d{8}$/.test(phone) || !config.previewPhoneHashes?.some(allowed => safeEqual(hash, allowed)))
    throw fail(403, 'La carte Wallet est réservée aux essais du restaurant pour le moment. Ton compte et tes points restent disponibles dans l’application Bibou.');
}
function publicOrigin(value, test = false) {
  try {
    const u = new URL(value);
    if (u.pathname !== '/' || u.search || u.hash || u.username || u.password) return null;
    if (u.protocol !== 'https:' && !(test && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return null;
    return u.origin;
  } catch { return null; }
}
module.exports = { COOKIE, ID, QR, fail, points, firstName, ensureMembership, reconcile, memberView, scan,
  passAuth, safeEqual, findPass, removeCustomer, walletCookie, customerForCookie, assertSameOrigin, assertPreviewAccess, publicOrigin };
