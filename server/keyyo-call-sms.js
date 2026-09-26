// Incoming-call SMS is independent of customer accounts and Twilio Verify.
// Disabled until the owner approves the Keyyo -> Render connection and secrets are configured.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createDatabaseLock } = require('./database-lock');
const DAY = 86400000;
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const hash = (key, value) => crypto.createHmac('sha256', key).update(value).digest('base64url');
const equal = (a, b) => {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};
function phone(value) {
  let number = String(value || '').replace(/[\s().-]/g, '');
  if (number.startsWith('+')) number = number.slice(1);
  if (number.startsWith('0033')) number = number.slice(2);
  if (/^0[1-9]\d{8}$/.test(number)) number = '33' + number.slice(1);
  return /^33[1-9]\d{8}$/.test(number) ? number : null;
}
function configFromEnv(env) {
  return {
    enabled: env.KEYYO_CALL_SMS_ENABLED === 'true',
    account: phone(env.KEYYO_LINE),
    webhookSecret: env.KEYYO_WEBHOOK_SECRET || '',
    privacyKey: env.KEYYO_SMS_PRIVACY_KEY || '',
    sipPassword: env.KEYYO_SIP_PASSWORD || '',
    appUrl: 'https://bibous-burger-app.onrender.com/',
    apiOrigin: 'https://bibous-burger.onrender.com',
  };
}
function configured(config) {
  return Boolean(config.enabled && config.account && config.sipPassword
    && /^[A-Za-z0-9_-]{43,128}$/.test(config.webhookSecret)
    && /^[A-Za-z0-9_-]{43,128}$/.test(config.privacyKey));
}
function smsText(config, token) {
  const message = `Bibou's Burgers : commandez ici ${config.appUrl} Stop SMS : ${config.apiOrigin}/s/${token}`;
  // Keep one GSM-7 segment. No smart apostrophe, emoji, tracking or advertising offer.
  if (!/^[\x20-\x7e]+$/.test(message) || message.length > 160 || /[\[\]{}\\^~|]/.test(message)) fail('SMS invalide.', 503);
  return message;
}
function digestAuthorization(challenge, { account, sipPassword }, uri, cnonce = crypto.randomBytes(16).toString('hex')) {
  if (!/^Digest\s/i.test(challenge || '') || challenge.length > 4096) fail('Authentification Keyyo indisponible.', 503);
  const values = {};
  for (const match of challenge.slice(7).matchAll(/([\w-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g)) {
    values[match[1].toLowerCase()] = match[2] !== undefined ? match[2].replace(/\\(.)/g, '$1') : match[3];
  }
  const algorithm = String(values.algorithm || 'MD5').toUpperCase();
  if (!['MD5', 'MD5-SESS', 'SHA-256', 'SHA-256-SESS'].includes(algorithm)
    || !values.nonce || values.realm === undefined
    || (values.qop && !values.qop.split(',').map(s => s.trim()).includes('auth'))) fail('Authentification Keyyo non prise en charge.', 503);
  const h = value => crypto.createHash(algorithm.startsWith('MD5') ? 'md5' : 'sha256').update(value).digest('hex');
  const quoted = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  if (/[\r\n]/.test(Object.values(values).join('') + account + uri + cnonce)) fail('Authentification Keyyo invalide.', 503);
  let a1 = h(`${account}:${values.realm}:${sipPassword}`);
  if (algorithm.endsWith('-SESS')) a1 = h(`${a1}:${values.nonce}:${cnonce}`);
  const a2 = h(`GET:${uri}`), nc = '00000001';
  const response = values.qop ? h(`${a1}:${values.nonce}:${nc}:${cnonce}:auth:${a2}`) : h(`${a1}:${values.nonce}:${a2}`);
  return 'Digest ' + [`username=${quoted(account)}`, `realm=${quoted(values.realm)}`, `nonce=${quoted(values.nonce)}`,
    `uri=${quoted(uri)}`, `response=${quoted(response)}`, `algorithm=${algorithm}`,
    ...(values.opaque ? [`opaque=${quoted(values.opaque)}`] : []),
    ...(values.qop ? ['qop=auth', `nc=${nc}`, `cnonce=${quoted(cnonce)}`] : algorithm.endsWith('-SESS') ? [`cnonce=${quoted(cnonce)}`] : [])].join(', ');
}
function createSender(config, fetchImpl = fetch) {
  return async (recipient, message) => {
    if (!configured(config) || !/^33[67]\d{8}$/.test(recipient)) fail('Envoi Keyyo non configuré.', 503);
    const url = new URL('https://ssl.keyyo.com/sendsms.html');
    url.search = new URLSearchParams({ ACCOUNT: config.account, CALLEE: recipient, MSG: message });
    const request = headers => fetchImpl(url.href, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(12000) });
    let response = await request({});
    if (response.status === 401) {
      const authorization = digestAuthorization(response.headers.get('www-authenticate'), config, url.pathname + url.search);
      await response.body?.cancel();
      response = await request({ Authorization: authorization });
    }
    // OK acknowledges acceptance by Keyyo, not handset delivery. Never retry an ambiguous send.
    if (!response.ok || (await response.text()).trim() !== 'OK') fail('Keyyo n’a pas confirmé le SMS.', 502);
    return { accepted: true };
  };
}
function createCallSms({ config, file, sendSms = createSender(config), now = Date.now }) {
  const lock = createDatabaseLock();
  let running = false;
  async function read() {
    try {
      const state = JSON.parse(await fs.readFile(file, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.calls) || !Array.isArray(state.optOuts)) throw Error('Invalid SMS state');
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') return { version: 1, calls: [], optOuts: [] };
      throw error; // Never erase a corrupted ledger and accidentally send duplicates.
    }
  }
  async function write(state) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, file);
    } finally { await fs.unlink(temporary).catch(() => {}); }
  }
  async function transact(task) {
    const release = await lock();
    try {
      const state = await read(), previous = JSON.stringify(state);
      const result = await task(state);
      if (JSON.stringify(state) !== previous) await write(state);
      return result;
    }
    finally { release(); }
  }
  const recipientToken = number => hash(config.privacyKey, 'recipient:' + number).slice(0, 22);
  async function receive(params) {
    if (!configured(config)) fail('Automatisation inactive.', 503);
    if (!equal(params.get('key'), config.webhookSecret)) fail('Accès refusé.', 401);
    for (const key of ['key','account','caller','callee','type','callref','session','ts']) {
      if (params.getAll(key).length > 1) fail('Notification ambiguë.');
    }
    // SETUP does not depend on a human answering: answered AND missed calls are included.
    if (params.get('type') !== 'SETUP') return { status: 'ignored' };
    const account = phone(params.get('account')), callee = phone(params.get('callee')), caller = phone(params.get('caller'));
    if (account !== config.account || callee !== config.account || !/^33[67]\d{8}$/.test(caller || '') || caller === account) return { status: 'ignored' };
    const at = Number(params.get('ts'));
    if (!/^\d{13}$/.test(params.get('ts') || '') || Math.abs(now() - at) > 10 * 60000) fail('Notification expirée.');
    const reference = params.get('callref') || '', session = params.get('session') || '';
    if (!/^[\w-]{8,64}$/.test(reference) || (session && !/^[\w-]{8,64}$/.test(session)) || reference.includes('_CALLREF_') || session.includes('_SESSION_ID_')) fail('Identifiant d’appel invalide.');
    const token = recipientToken(caller), id = hash(config.privacyKey, `call:${account}:${session || reference}:${token}`);
    smsText(config, token);
    return transact(state => {
      state.calls = state.calls.filter(call => call.createdAt > now() - 30 * DAY);
      if (state.optOuts.includes(token)) return { status: 'opted_out' };
      if (state.calls.some(call => call.id === id)) return { status: 'duplicate' };
      // Bounded pending queue, never hold up calls/order processing or launch an unbounded batch.
      if (state.calls.filter(call => call.status === 'queued').length >= 100) fail('File SMS temporairement pleine.', 503);
      state.calls.push({ id, token, recipient: caller, status: 'queued', createdAt: now() });
      return { status: 'queued' };
    });
  }
  async function tick() {
    if (running || !configured(config)) return;
    running = true;
    try {
      const job = await transact(state => {
        let selected;
        for (const call of state.calls) {
          // Reserved BEFORE the network request. A crash cannot cause a duplicate after restart.
          if (call.status === 'sending') { call.status = 'uncertain'; delete call.recipient; }
          if (call.status !== 'queued') continue;
          if (state.optOuts.includes(call.token) || now() - call.createdAt > 10 * 60000) {
            call.status = state.optOuts.includes(call.token) ? 'opted_out' : 'expired'; delete call.recipient;
          } else if (!selected) {
            selected = { ...call }; call.status = 'sending'; delete call.recipient;
          }
        }
        return selected;
      });
      if (!job) return;
      let status = 'uncertain';
      try { await sendSms(job.recipient, smsText(config, job.token)); status = 'accepted'; } catch { /* No raw provider error, phone or secret in logs. */ }
      await transact(state => { const call = state.calls.find(c => c.id === job.id); if (call) call.status = status; });
    } finally { running = false; }
  }
  async function optOut(token) {
    if (!/^[\w-]{22}$/.test(token || '')) fail('Lien invalide.', 404);
    await transact(state => {
      if (!state.optOuts.includes(token) && !state.calls.some(call => call.token === token)) fail('Lien invalide ou expiré.', 404);
      if (!state.optOuts.includes(token)) state.optOuts.push(token);
      for (const call of state.calls) if (call.token === token && call.status === 'queued') { call.status = 'opted_out'; delete call.recipient; }
    });
  }
  async function status() {
    const release = await lock();
    try {
      const state = await read(), counts = {};
      for (const call of state.calls) counts[call.status] = (counts[call.status] || 0) + 1;
      return { enabled: config.enabled, configured: configured(config), counts, optedOut: state.optOuts.length };
    } finally { release(); }
  }
  async function backupState() {
    const release = await lock();
    try {
      const state = await read();
      // A recovered backup preserves opt-outs/deduplication, never replays old SMS.
      return { version: 1, optOuts: [...state.optOuts], calls: state.calls.map(({ recipient, ...call }) => ({
        ...call, status: ['queued', 'sending'].includes(call.status) ? 'uncertain' : call.status,
      })) };
    } finally { release(); }
  }
  return { receive, tick, optOut, status, backupState };
}
module.exports = { configFromEnv, configured, phone, smsText, digestAuthorization, createSender, createCallSms };
