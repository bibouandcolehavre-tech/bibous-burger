const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
// Server-only OAuth refresh credentials. No API key/password goes to the APK.
function createTerminalSession({ env = process.env, fetchImpl = fetch, now = Date.now, store } = {}) {
  let cached = null, pending = null, nextAttempt = 0, revoked = false, authorization = null;
  const unavailable = () => Object.assign(new Error('Reconnexion SumUp non disponible.'), { statusCode: 503 });
  const file = env.SUMUP_KIOSK_OAUTH_STORE;
  const tokens = store || {
    async read() {
      try { return JSON.parse(await fs.readFile(file, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return { refreshToken: env.SUMUP_KIOSK_OAUTH_REFRESH_TOKEN }; throw unavailable(); }
    },
    async write(value) {
      const temp = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
        await fs.rename(temp, file);
      } finally { await fs.unlink(temp).catch(() => {}); }
    }
  };
  async function refresh(expectedMerchant) {
    if (revoked || !expectedMerchant || !env.SUMUP_KIOSK_OAUTH_CLIENT_ID || !env.SUMUP_KIOSK_OAUTH_CLIENT_SECRET
        || (!store && !file) || !env.SUMUP_KIOSK_AFFILIATE_KEY?.startsWith('sup_afk_')) throw unavailable();
    if (cached && cached.merchantCode === expectedMerchant && cached.expiresAt > now() + 60000) return cached;
    if (now() < nextAttempt) throw unavailable();
    nextAttempt = now() + 30000;
    const saved = await tokens.read();
    if (!saved.refreshToken || saved.revoked) throw unavailable();
    const response = await fetchImpl('https://api.sumup.com/token', { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved.refreshToken,
        client_id: env.SUMUP_KIOSK_OAUTH_CLIENT_ID, client_secret: env.SUMUP_KIOSK_OAUTH_CLIENT_SECRET }) });
    const result = await response.json();
    if (!response.ok) {
      if (result.error === 'invalid_grant') { revoked = true; await tokens.write({ revoked: true }); }
      throw unavailable();
    }
    if (!result.access_token || result.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in) <= 60) throw unavailable();
    // Persist rotated refresh token before using it; survive a server restart.
    await tokens.write({ refreshToken: result.refresh_token || saved.refreshToken });
    const profileResponse = await fetchImpl('https://api.sumup.com/v0.1/me', { redirect: 'error',
      signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${result.access_token}` } });
    if (!profileResponse.ok) throw unavailable();
    const profile = await profileResponse.json();
    const code = profile.merchant_code || profile.merchant?.merchant_code || profile.merchant_profile?.merchant_code || profile.merchant?.merchant_profile?.merchant_code;
    if (code !== expectedMerchant) throw unavailable();
    cached = { accessToken: result.access_token, merchantCode: code, affiliateKey: env.SUMUP_KIOSK_AFFILIATE_KEY,
      expiresAt: now() + Number(result.expires_in) * 1000 };
    nextAttempt = 0;
    return cached;
  }
  function beginAuthorization(expectedMerchant) {
    const redirect = env.SUMUP_KIOSK_OAUTH_REDIRECT_URI;
    if (!expectedMerchant || !env.SUMUP_KIOSK_OAUTH_CLIENT_ID || !env.SUMUP_KIOSK_OAUTH_CLIENT_SECRET
        || (!store && !file) || !redirect?.startsWith('https://')) throw unavailable();
    const state = crypto.randomBytes(32).toString('hex');
    authorization = { state, expectedMerchant, redirect, expiresAt: now() + 10 * 60000 };
    const url = new URL('https://api.sumup.com/authorize');
    url.search = new URLSearchParams({ response_type: 'code', client_id: env.SUMUP_KIOSK_OAUTH_CLIENT_ID,
      redirect_uri: redirect, state }).toString();
    return { url: url.toString() };
  }
  async function completeAuthorization(state, code) {
    const current = authorization;
    if (!current || !state || state !== current.state || current.expiresAt <= now() || !code || code.length > 4096) throw unavailable();
    authorization = null; // One use; a replay never exchanges a code again.
    const response = await fetchImpl('https://api.sumup.com/token', { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: current.redirect,
        client_id: env.SUMUP_KIOSK_OAUTH_CLIENT_ID, client_secret: env.SUMUP_KIOSK_OAUTH_CLIENT_SECRET }) });
    if (!response.ok) throw unavailable();
    const result = await response.json();
    if (!result.access_token || !result.refresh_token || result.token_type?.toLowerCase() !== 'bearer') throw unavailable();
    const profileResponse = await fetchImpl('https://api.sumup.com/v0.1/me', { redirect: 'error',
      signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${result.access_token}` } });
    if (!profileResponse.ok) throw unavailable();
    const profile = await profileResponse.json();
    const merchant = profile.merchant_code || profile.merchant?.merchant_code || profile.merchant_profile?.merchant_code || profile.merchant?.merchant_profile?.merchant_code;
    if (merchant !== current.expectedMerchant) throw unavailable();
    if (pending) await pending.catch(() => {});
    await tokens.write({ refreshToken: result.refresh_token });
    cached = null; revoked = false; nextAttempt = 0;
    return { authorized: true };
  }
  return { beginAuthorization, completeAuthorization, async get(expectedMerchant) {
    if (!pending) pending = refresh(expectedMerchant).finally(() => { pending = null; });
    const result = await pending;
    if (result.merchantCode !== expectedMerchant) throw unavailable();
    return result;
  } };
}
module.exports = { createTerminalSession };
