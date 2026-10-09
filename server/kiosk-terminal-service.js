const crypto = require('node:crypto');
const { prepareTerminalIntent } = require('./kiosk-terminal-payment');
const { reconcileTerminalPayment } = require('./kiosk-terminal-api');
// Stable, domain-separated device credential. Never derive from the server's
// ephemeral fallback: the same provisioned kiosk must survive a deployment.
// A configured override supports rotation without changing customer sessions.
function terminalDeviceSecret(env) {
  if (env.KIOSK_TERMINAL_DEVICE_SECRET !== undefined) return typeof env.KIOSK_TERMINAL_DEVICE_SECRET === 'string' && env.KIOSK_TERMINAL_DEVICE_SECRET.length >= 32 ? env.KIOSK_TERMINAL_DEVICE_SECRET : null;
  if (typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32) return null;
  return crypto.createHmac('sha256', env.SESSION_SECRET).update('bibou-kiosk-device-v1:com.krokly.bibousborne').digest('base64url');
}
function authorizeTerminal(request, { enabled, deviceSecret }) {
  if (!enabled || typeof deviceSecret !== 'string' || deviceSecret.length < 32) return false;
  const candidate = Buffer.from(String(request.headers['x-bibou-kiosk-token'] || ''));
  const expected = Buffer.from(deviceSecret);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
// Caller owns the database lock and validates owner, stock, slot and service
// before entering this service. Persist the launch claim before returning it.
async function claimTerminalLaunch(order, { merchantCode, persist }) {
  const payment = prepareTerminalIntent(order, merchantCode);
  const canLaunch = payment.status === 'PENDING' && !payment.launchClaimedAt;
  if (canLaunch) payment.launchClaimedAt = new Date().toISOString();
  await persist();
  return { ...payment, canLaunch };
}
async function verifyTerminalOrder(order, { apiKey, merchantCode, fetchImpl, persist, finalize, now = new Date() }) {
  await reconcileTerminalPayment(order, { apiKey, merchantCode, fetchImpl });
  // Once a failed payment is authoritatively verified, an elapsed preparation
  // hold can be closed. Uncertain transactions remain reserved indefinitely.
  if (['FAILED', 'CANCELLED'].includes(order.payment.status) && order.payment.verifiedAt && Date.parse(order.createdAt) + 15 * 60000 <= now.getTime()) order.payment.status = 'EXPIRED';
  if (order.payment.status === 'PAID' && order.status === 'awaiting_payment') await finalize();
  await persist();
  return { ...order.payment, canLaunch: false };
}
module.exports = { terminalDeviceSecret, authorizeTerminal, claimTerminalLaunch, verifyTerminalOrder };
