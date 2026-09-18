const crypto = require("node:crypto");

const CUSTOMER_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

const sign = (payload, secret) => crypto
  .createHmac("sha256", secret)
  .update(payload)
  .digest("base64url");

const createCustomerSession = (customerId, secret, options = {}) => {
  if (!customerId || !secret) throw new Error("Impossible de créer la session client.");
  const now = options.now ?? Date.now();
  const durationMs = options.durationMs ?? CUSTOMER_SESSION_DURATION_MS;
  const payload = Buffer.from(JSON.stringify({
    customerId: String(customerId),
    expiresAt: now + durationMs,
  })).toString("base64url");

  return `v1.${payload}.${sign(payload, secret)}`;
};

const readCustomerSession = (token, secret, options = {}) => {
  if (typeof token !== "string" || !secret || token.length > 2048) return null;
  const [version, payload, signature, extra] = token.split(".");
  if (version !== "v1" || !payload || !signature || extra) return null;

  const expectedSignature = sign(payload, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = options.now ?? Date.now();
    if (typeof session.customerId !== "string" || !session.customerId) return null;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= now) return null;
    return session;
  } catch {
    return null;
  }
};

module.exports = {
  CUSTOMER_SESSION_DURATION_MS,
  createCustomerSession,
  readCustomerSession,
};
