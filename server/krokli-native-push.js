// Native Driver devices only: never reuse customer tokens, jobs or campaigns.
const crypto = require('node:crypto');
const PROJECT_ID = '8f737171-95c6-449a-8c34-4ce9f0ee747c';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,200}\]$/;
const DAY = 86400000;
const store = db => db.krokliNativePush ||= { devices: [], jobs: [] };
const fail = (message, statusCode = 400) => { throw Object.assign(Error(message), { statusCode }); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (left, right) => typeof left === 'string' && typeof right === 'string' && left.length === right.length && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
function configFromEnv(env) { return { enabled: env.KROKLI_NATIVE_PUSH_ENABLED !== 'false', accessToken: env.EXPO_ACCESS_TOKEN || '' }; }
function proof(input) {
  if (!UUID.test(input?.installationId) || !UUID.test(input?.installationSecret)) fail('Preuve de ce téléphone requise.');
  return { id: input.installationId, secretHash: hash(input.installationSecret) };
}
function liveDevice(db, device, now) {
  return device && device.sessionExpiresAt > now && (db.kroklyDrivers || []).some(d => d.id === device.driverId && d.active === true && d.authVersion === device.authVersion);
}
function prune(db, now) {
  const s = store(db);
  s.devices = s.devices.filter(d => liveDevice(db, d, now));
  s.jobs = s.jobs.filter(j => j.createdAt > now - DAY);
  for (const job of s.jobs) {
    if (job.status === 'queued' && job.expiresAt <= now) job.status = 'expired';
    // An interrupted send may already have reached Expo. Never resend blindly.
    if (job.status === 'sending' && job.attemptedAt + 30000 <= now) job.status = 'uncertain';
  }
}
function register(db, driver, input, sessionExpiresAt, now = Date.now()) {
  const p = proof(input);
  if (input.projectId !== PROJECT_ID || !['ios', 'android'].includes(input.platform) || !TOKEN.test(input.token) || input.informed !== true ||
    !Number.isSafeInteger(sessionExpiresAt) || sessionExpiresAt <= now || sessionExpiresAt > now + 12 * 3600000 || !driver?.active) fail('Inscription aux alertes natives invalide.');
  const s = store(db), previous = s.devices.find(d => d.installationId === p.id);
  if (previous && !same(previous.secretHash, p.secretHash)) fail('Ce téléphone ne peut pas remplacer cette inscription.', 403);
  if (s.devices.some(d => d.token === input.token && d.installationId !== p.id && liveDevice(db, d, now))) fail('Ce téléphone est déjà inscrit. Désactive ses anciennes alertes.', 409);
  if (s.devices.filter(d => d.installationId !== p.id && d.driverId === driver.id && liveDevice(db, d, now)).length >= 3) fail('Trois téléphones sont déjà inscrits pour ce livreur.', 409);
  prune(db, now);
  const previousToken = previous?.token;
  s.devices = s.devices.filter(d => d.installationId !== p.id);
  // Rebinding an installation never transfers queued offers to its new owner.
  if (previous?.driverId !== driver.id || previousToken !== input.token) s.jobs = s.jobs.filter(j => j.installationId !== p.id);
  s.devices.push({ installationId: p.id, secretHash: p.secretHash, token: input.token, platform: input.platform,
    driverId: driver.id, authVersion: driver.authVersion, sessionExpiresAt, updatedAt: now });
  return { registered: true, installationId: p.id, expiresAt: new Date(sessionExpiresAt).toISOString() };
}
function unregister(db, input) {
  const p = proof(input), s = store(db), device = s.devices.find(d => d.installationId === p.id);
  if (device && !same(device.secretHash, p.secretHash)) fail('Preuve de ce téléphone requise.', 403);
  s.devices = s.devices.filter(d => d.installationId !== p.id);
  s.jobs = s.jobs.filter(j => j.installationId !== p.id);
  return { removed: true };
}
function revokeDriver(db, driverId) {
  if (!db.krokliNativePush) return;
  const s = store(db); s.devices = s.devices.filter(d => d.driverId !== driverId); s.jobs = s.jobs.filter(j => j.driverId !== driverId);
}
function queue(db, driverId, orderId, now = Date.now()) {
  prune(db, now);
  const s = store(db), order = (db.orders || []).find(o => o.id === orderId);
  const offer = order?.kroklyDriver;
  const expiresAt = Date.parse(offer?.expiresAt);
  if (!validOffer(order, driverId, now) || !Number.isFinite(expiresAt)) return 0;
  let added = 0;
  for (const d of s.devices.filter(d => d.driverId === driverId && liveDevice(db, d, now))) {
    if (s.jobs.some(j => j.installationId === d.installationId && j.orderId === orderId && j.offeredAt === offer.offeredAt)) continue;
    s.jobs.push({ id: crypto.randomUUID(), installationId: d.installationId, driverId, orderId, offeredAt: offer.offeredAt,
      createdAt: now, expiresAt: Math.min(expiresAt, d.sessionExpiresAt), status: 'queued', nextAttemptAt: now, attempts: 0 }); added++;
  }
  s.jobs = s.jobs.slice(-500);
  return added;
}
function validOffer(order, driverId, now) {
  const u = order?.uberDirect;
  return order?.method === 'delivery' && order.payment?.status === 'PAID' && order.status === 'ready' &&
    order.kroklyDriver?.driverId === driverId && order.kroklyDriver.status === 'offered' && Date.parse(order.kroklyDriver.expiresAt) > now &&
    !(u && ['sending', 'uncertain', 'created'].includes(u.phase) && !['canceled', 'returned', 'delivered'].includes(u.status));
}
function deviceForJob(db, job, now) {
  const d = store(db).devices.find(d => d.installationId === job.installationId && d.driverId === job.driverId);
  const o = (db.orders || []).find(o => o.id === job.orderId);
  return liveDevice(db, d, now) && validOffer(o, job.driverId, now) && o.kroklyDriver.offeredAt === job.offeredAt && job.expiresAt > now ? d : null;
}
const errorCode = value => ['DeviceNotRegistered', 'InvalidCredentials', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId'].includes(value) ? value : 'ProviderError';
function createWorker({ config, transact, fetchImpl = fetch, clock = Date.now }) {
  let busy = false;
  async function expo(endpoint, body) {
    const response = await fetchImpl(`https://exp.host/--/api/v2/push/${endpoint}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}) }, body: JSON.stringify(body) });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  }
  const disable = (db, job) => { const s = store(db); s.devices = s.devices.filter(d => !(d.installationId === job.installationId && d.driverId === job.driverId)); };
  async function tick() {
    if (busy || !config.enabled) return;
    busy = true;
    try {
      const batch = await transact(db => {
        const now = clock(); prune(db, now); const picked = [];
        for (const job of store(db).jobs) {
          if (job.status !== 'queued' || job.nextAttemptAt > now || picked.length >= 20) continue;
          const device = deviceForJob(db, job, now);
          if (!device) { job.status = 'cancelled'; continue; }
          job.status = 'sending'; job.attemptedAt = now; job.attempts++;
          picked.push({ id: job.id, to: device.token, title: 'Krokli Driver', body: 'Une proposition de livraison t’attend. Ouvre l’application pour vérifier les détails.',
            sound: 'default', channelId: 'krokli-offers-v1', priority: 'high', ttl: Math.max(1, Math.floor((job.expiresAt - now) / 1000)),
            data: { kind: 'krokli-offer', remote: true, messageId: job.id, driverId: job.driverId, orderId: job.orderId, expiresAt: job.expiresAt } });
        }
        return picked;
      });
      // Tokens are all from the independent Krokli project. No client address,
      // phone, driver location or order amount leaves the restaurant here.
      if (batch.length) {
        let result; try { result = await expo('send', batch.map(({ id, ...message }) => message)); } catch { /* No duplicate on unknown send outcome. */ }
        await transact(db => {
          for (const [i, message] of batch.entries()) {
            const job = store(db).jobs.find(j => j.id === message.id && j.status === 'sending'); if (!job) continue;
            const ticket = result?.data?.data?.[i];
            if (result?.ok && ticket?.status === 'ok' && typeof ticket.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(ticket.id)) { job.status = 'accepted'; job.ticketId = ticket.id; job.receiptAt = clock() + 15 * 60000; }
            else if (result?.ok && ticket?.status === 'error') { job.status = 'failed'; job.errorCode = errorCode(ticket.details?.error); if (job.errorCode === 'DeviceNotRegistered') disable(db, job); }
            else if (result?.status === 429 && job.attempts < 3) { job.status = 'queued'; job.nextAttemptAt = clock() + 15000 * 2 ** job.attempts; }
            else { job.status = result && result.status >= 400 && result.status < 500 ? 'failed' : 'uncertain'; job.errorCode = result ? `HTTP_${result.status}` : 'NetworkUncertain'; }
          }
        });
      }
      const receipts = await transact(db => store(db).jobs.filter(j => j.status === 'accepted' && j.receiptAt <= clock()).slice(0, 100).map(j => ({ id: j.id, ticketId: j.ticketId })));
      if (receipts.length) {
        let result; try { result = await expo('getReceipts', { ids: receipts.map(j => j.ticketId) }); } catch { /* Safe to retry receipts. */ }
        await transact(db => { for (const item of receipts) {
          const job = store(db).jobs.find(j => j.id === item.id && j.status === 'accepted'); if (!job) continue;
          const receipt = result?.ok && result.data?.data?.[item.ticketId];
          if (receipt?.status === 'ok') job.status = 'provider_ok';
          else if (receipt?.status === 'error') { job.status = 'failed'; job.errorCode = errorCode(receipt.details?.error); if (job.errorCode === 'DeviceNotRegistered') disable(db, job); }
          else job.receiptAt = clock() + 15 * 60000;
        } });
      }
    } finally { busy = false; }
  }
  return { tick };
}
module.exports = { PROJECT_ID, configFromEnv, register, unregister, revokeDriver, queue, createWorker, prune };
