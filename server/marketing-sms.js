// Promotional SMS is separate from Twilio Verify and from order/service alerts.
// Nothing is sent on page load, consent, preview, or server activation.
const crypto = require('node:crypto');
const { bibouPlusStatus } = require('./bibou-plus');
const DAY = 86400000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PHONE = /^\+33[67]\d{8}$/;
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const store = db => db.marketingSms ||= { campaigns: [], jobs: [] };
const preferences = customer => ({ accepted: customer.smsMarketingPreferences?.accepted === true, updatedAt: customer.smsMarketingPreferences?.updatedAt || null });

function configFromEnv(env) {
  const origin = env.SMS_MARKETING_PUBLIC_ORIGIN || '';
  return { enabled: env.SMS_MARKETING_ENABLED === 'true', verified: env.SMS_MARKETING_VERIFIED === 'true', accountSid: env.TWILIO_ACCOUNT_SID || '', authToken: env.TWILIO_AUTH_TOKEN || '', from: env.SMS_MARKETING_FROM || '', origin: /^https:\/\/[^/?#]+$/.test(origin) ? origin : '', secret: env.SESSION_SECRET || '' };
}
const ready = config => config.enabled && config.verified && /^AC[a-f0-9]{32}$/i.test(config.accountSid) && !!config.authToken && /^(?=.*[a-z])[a-z0-9]{1,11}$/i.test(config.from) && !!config.origin && config.secret.length >= 32;
function connection(config) {
  const missing = [];
  if (!config.accountSid || !config.authToken) missing.push('Identifiants Twilio serveur');
  if (!/^(?=.*[a-z])[a-z0-9]{1,11}$/i.test(config.from)) missing.push('Expéditeur commercial Bibou');
  if (!config.origin || config.secret.length < 32) missing.push('Lien de désinscription sécurisé');
  if (!config.verified) missing.push('Vérification Twilio : France, expéditeur et tarif');
  if (!config.enabled) missing.push('Activation des SMS commerciaux');
  return { enabled: ready(config), missing, sender: config.from || null, oneWay: true };
}

function updatePreferences(db, customer, input, now = Date.now()) {
  if (!input || Object.keys(input).length !== 1 || typeof input.accepted !== 'boolean') fail('Choix de SMS invalide.');
  const old = preferences(customer).accepted, timestamp = new Date(now).toISOString();
  customer.smsMarketingPreferences = { ...customer.smsMarketingPreferences, accepted: input.accepted, updatedAt: timestamp, consentVersion: 1 };
  if (old !== input.accepted) {
    customer.smsMarketingPreferences[input.accepted ? 'acceptedAt' : 'revokedAt'] = timestamp;
    if (input.accepted) customer.smsMarketingPreferences.consentId = crypto.randomUUID();
  }
  if (!input.accepted) for (const job of db.marketingSms?.jobs || []) if (job.customerId === customer.id && job.status === 'queued') job.status = 'cancelled';
}
function customerState(customer) { return { preferences: preferences(customer), mobileSupported: PHONE.test(customer.phone || '') }; }
const stopToken = (customerId, config) => crypto.createHmac('sha256', config.secret).update('bibou-sms-stop-v1:' + customerId).digest('base64url');
function customerForStop(db, token, config) {
  if (!config.secret || !/^[A-Za-z0-9_-]{43}$/.test(token || '')) return null;
  return (db.customers || []).find(c => crypto.timingSafeEqual(Buffer.from(token), Buffer.from(stopToken(c.id, config)))) || null;
}
const stopUrl = (customerId, config) => config.origin + '/sms-stop/' + stopToken(customerId, config);
const messageBody = (body, customerId, config) => `Bibou's Burgers : ${body}\nSTOP : ${stopUrl(customerId, config)}`;

// GSM extension-table characters use two septets. UCS-2 counts UTF-16 units.
const GSM = new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const EXT = new Set(Array.from('^{}\\[~]|€\f'));
function segments(text) {
  let units = 0;
  for (const char of text) { if (GSM.has(char)) units++; else if (EXT.has(char)) units += 2; else return text.length <= 70 ? 1 : Math.ceil(text.length / 67); }
  return units <= 160 ? 1 : Math.ceil(units / 153);
}
function allowedWindow(now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  if (parts.weekday === 'Sun' || Number(parts.hour) < 10 || Number(parts.hour) >= 20) return false;
  const date = parts.month + '-' + parts.day;
  if (['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].includes(date)) return false;
  // Gregorian Easter; the three moveable French national holidays.
  const y = Number(parts.year), a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114;
  const easter = Date.UTC(y, Math.floor(n / 31) - 1, n % 31 + 1);
  return ![1, 39, 50].some(days => new Date(easter + days * DAY).toISOString().slice(5, 10) === date);
}
function eligible(db, audience, now) {
  const seen = new Set();
  return (db.customers || []).filter(c => {
    if (!preferences(c).accepted || !c.smsMarketingPreferences?.acceptedAt || !UUID.test(c.smsMarketingPreferences?.consentId || '') || !PHONE.test(c.phone || '') || (audience === 'plus' && !bibouPlusStatus(c, new Date(now)).active) || seen.has(c.phone)) return false;
    seen.add(c.phone); return true;
  });
}
function campaignView(db, campaign) {
  const jobs = (db.marketingSms?.jobs || []).filter(j => j.campaignId === campaign.id);
  return { id: campaign.id, title: campaign.title, body: campaign.body, audience: campaign.audience, status: campaign.status, createdAt: campaign.createdAt, expiresAt: campaign.expiresAt, sentAt: campaign.sentAt || null, customers: campaign.targets.length, segmentsPerMessage: campaign.segmentsPerMessage, maxSegments: campaign.maxSegments, counts: Object.fromEntries(['queued', 'sending', 'accepted', 'delivered', 'failed', 'uncertain', 'cancelled', 'expired'].map(status => [status, jobs.filter(j => j.status === status).length])) };
}
function dashboard(db, config, now = Date.now()) {
  return { connection: connection(config), optedInCustomers: (db.customers || []).filter(c => preferences(c).accepted).length, eligibleCustomers: eligible(db, 'all', now).length, allowedNow: allowedWindow(now), campaigns: (db.marketingSms?.campaigns || []).slice(0, 30).map(c => campaignView(db, c)), sampleStopUrl: config.origin ? config.origin + '/sms-stop/[lien-personnel]' : '[lien personnel de désinscription]', dailyLimit: 2, maxRecipients: 100 };
}
function prepareCampaign(db, input, config, now = Date.now()) {
  if (!input || !UUID.test(input.requestId || '') || typeof input.title !== 'string' || typeof input.body !== 'string' || !['all', 'plus'].includes(input.audience)) fail('SMS incomplet.');
  const title = input.title.trim(), body = input.body.trim();
  if (!title || title.length > 65 || !body || body.length > 220 || /[\u0000-\u0008\u000b-\u001f]/.test(title + body)) fail('Titre interne : 1 à 65 caractères. SMS : 1 à 220 caractères.');
  const s = store(db), fingerprint = hash(JSON.stringify([title, body, input.audience, config.from, config.origin]));
  const previous = s.campaigns.find(c => c.id === input.requestId);
  if (previous) { if (previous.fingerprint !== fingerprint) fail('SMS modifié : créez un nouvel aperçu.', 409); return campaignView(db, previous); }
  if (s.campaigns.filter(c => c.createdAt > now - DAY).length >= 50) fail('Limite de 50 aperçus par jour.', 429);
  const customers = eligible(db, input.audience, now);
  if (customers.length > 100) fail('Limite de sécurité : 100 destinataires par campagne.', 409);
  const count = segments(messageBody(body, 'preview', { ...config, origin: config.origin || 'https://bibous-burger.onrender.com' }));
  if (count > 4) fail('Le SMS dépasse quatre segments facturables. Raccourcissez-le.');
  const campaign = { id: input.requestId, title, body, audience: input.audience, fingerprint, status: 'draft', createdAt: now, expiresAt: now + 15 * 60000, sender: config.from, origin: config.origin, segmentsPerMessage: count, maxSegments: count * customers.length, targets: customers.map(c => ({ customerId: c.id, phoneHash: hash(c.phone), acceptedAt: c.smsMarketingPreferences.acceptedAt, consentId: c.smsMarketingPreferences.consentId })) };
  s.campaigns.unshift(campaign); return campaignView(db, campaign);
}
function canDispatch(db, target, audience, now) {
  return eligible(db, audience, now).find(c => c.id === target.customerId && hash(c.phone) === target.phoneHash && c.smsMarketingPreferences.consentId === target.consentId) || null;
}
function sendCampaign(db, id, input, config, now = Date.now()) {
  const s = store(db), campaign = s.campaigns.find(c => c.id === id);
  if (!campaign) fail('Aperçu introuvable.', 404);
  if (input?.confirm !== true || input?.maxSegments !== campaign.maxSegments) fail('Confirmez le nombre maximal de segments facturables.');
  if (campaign.status !== 'draft') return campaignView(db, campaign);
  if (!ready(config)) fail('SMS non activés : la connexion Twilio doit être vérifiée. Aucun envoi.', 409);
  if (!allowedWindow(now)) fail('Envoi autorisé de 10 h à 20 h (Paris), du lundi au samedi, hors jours fériés. Aucun envoi.', 409);
  if (campaign.expiresAt <= now || campaign.sender !== config.from || campaign.origin !== config.origin) fail('Aperçu expiré ou connexion modifiée. Vérifiez de nouveau les destinataires.', 409);
  if (s.campaigns.filter(c => c.sentAt > now - DAY).length >= 2) fail('Limite de sécurité : deux campagnes SMS par 24 heures.', 429);
  const targets = campaign.targets.filter(t => canDispatch(db, t, campaign.audience, now));
  if (!targets.length) fail('Aucun client n’a accepté les SMS pour cet envoi.', 409);
  campaign.targets = targets; campaign.status = 'sent'; campaign.sentAt = now;
  for (const target of targets) s.jobs.push({ id: hash(id + ':' + target.customerId), campaignId: id, ...target, status: 'queued', createdAt: now, expiresAt: now + DAY });
  return campaignView(db, campaign);
}
function deleteCustomer(db, customerId) {
  if (!db.marketingSms) return;
  db.marketingSms.jobs = db.marketingSms.jobs.filter(j => j.customerId !== customerId);
  db.marketingSms.campaigns.forEach(c => { c.targets = c.targets.filter(t => t.customerId !== customerId); });
}
function purge(db, now) {
  if (!db.marketingSms) return;
  const s = store(db); s.campaigns = s.campaigns.filter(c => c.createdAt > now - 30 * DAY); s.jobs = s.jobs.filter(j => j.createdAt > now - 30 * DAY);
  for (const j of s.jobs) {
    if (j.status === 'queued' && j.expiresAt <= now) j.status = 'expired';
    if (j.status === 'sending' && j.attemptedAt < now - 120000) j.status = 'uncertain';
  }
}
function createWorker({ config, transact, fetchImpl = fetch, clock = Date.now }) {
  let busy = false;
  const auth = 'Basic ' + Buffer.from(config.accountSid + ':' + config.authToken).toString('base64');
  const endpoint = 'https://api.twilio.com/2010-04-01/Accounts/' + config.accountSid + '/Messages';
  async function tick() {
    if (busy || !ready(config)) return;
    busy = true;
    try {
      const batch = await transact(db => {
        const now = clock(); purge(db, now);
        if (!allowedWindow(now)) return [];
        const selected = [];
        for (const job of store(db).jobs.filter(j => j.status === 'queued').slice(0, 10)) {
          const campaign = store(db).campaigns.find(c => c.id === job.campaignId && c.status === 'sent');
          const customer = campaign && campaign.sender === config.from && campaign.origin === config.origin && canDispatch(db, job, campaign.audience, now);
          if (!customer) { job.status = 'cancelled'; continue; }
          job.status = 'sending'; job.attemptedAt = now;
          selected.push({ id: job.id, to: customer.phone, body: messageBody(campaign.body, customer.id, config) });
        }
        return selected;
      });
      for (const selected of batch) {
        // Recheck opt-out immediately before provider submission, including during a batch.
        const authorized = await transact(db => {
          const job = store(db).jobs.find(j => j.id === selected.id), campaign = store(db).campaigns.find(c => c.id === job?.campaignId);
          if (!job || job.status !== 'sending') return false;
          if (!campaign || !canDispatch(db, job, campaign.audience, clock()) || !allowedWindow(clock())) { job.status = 'cancelled'; return false; }
          return true;
        });
        if (!authorized) continue;
        let response, result;
        try { response = await fetchImpl(endpoint + '.json', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: selected.to, From: config.from, Body: selected.body }).toString() }); result = await response.json().catch(() => null); } catch { /* Never retry an ambiguous, potentially billable send. */ }
        await transact(db => {
          const job = store(db).jobs.find(j => j.id === selected.id); if (!job || job.status !== 'sending') return;
          if (response?.ok && /^SM[a-f0-9]{32}$/i.test(result?.sid || '')) { job.status = ['delivered', 'undelivered', 'failed'].includes(result.status) ? (result.status === 'delivered' ? 'delivered' : 'failed') : 'accepted'; job.providerId = result.sid; job.receiptAt = clock() + 60000; }
          else { job.status = response && response.status < 500 && !response.ok ? 'failed' : 'uncertain'; if (Number.isInteger(result?.code)) job.errorCode = result.code; }
        });
      }
      const receipts = await transact(db => store(db).jobs.filter(j => j.status === 'accepted' && j.receiptAt <= clock() && j.createdAt > clock() - DAY).slice(0, 10).map(j => ({ id: j.id, providerId: j.providerId })));
      for (const receipt of receipts) {
        let result;
        try { const r = await fetchImpl(endpoint + '/' + receipt.providerId + '.json', { headers: { Authorization: auth }, signal: AbortSignal.timeout(10000) }); if (r.ok) result = await r.json(); } catch { /* Read-only receipt polling can safely run later. */ }
        await transact(db => { const job = store(db).jobs.find(j => j.id === receipt.id); if (!job || job.status !== 'accepted') return; if (result?.status === 'delivered') job.status = 'delivered'; else if (['failed', 'undelivered', 'canceled'].includes(result?.status)) { job.status = 'failed'; job.errorCode = result.error_code || null; } job.receiptAt = clock() + 15 * 60000; });
      }
    } finally { busy = false; }
  }
  return { tick };
}
module.exports = { configFromEnv, ready, connection, preferences, customerState, updatePreferences, stopToken, customerForStop, segments, allowedWindow, dashboard, prepareCampaign, sendCampaign, deleteCustomer, createWorker };
