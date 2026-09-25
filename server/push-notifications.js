const crypto = require('node:crypto');
const { bibouPlusStatus } = require('./bibou-plus');

const DAY = 86400000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOKEN = /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/;
const DESTINATIONS = ['menu', 'loyalty', 'bibou-plus', 'reservation'];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const store = db => db.pushNotifications ||= { devices: [], jobs: [], campaigns: [] };
const prefs = customer => ({ service: customer.pushPreferences?.service === true, marketing: customer.pushPreferences?.marketing === true, updatedAt: customer.pushPreferences?.updatedAt || null });
const configFromEnv = env => ({ enabled: env.PUSH_ENABLED === 'true', platforms: ['ios', 'android'].filter(p => env[`PUSH_${p.toUpperCase()}_ENABLED`] === 'true'), accessToken: env.EXPO_ACCESS_TOKEN || '' });
const live = (config, platform) => config.enabled && config.platforms.includes(platform);
const activeDevice = (device, now) => !device.disabledAt && TOKEN.test(device.token || '') && Date.parse(device.lastSeenAt) > now - 90 * DAY;
const customerDevices = (db, customer, now = Date.now()) => (db.pushNotifications?.devices || []).filter(d => d.customerId === customer.id && activeDevice(d, now));

function customerPushState(db, customer, config, now = Date.now()) {
  return { preferences: prefs(customer), devices: customerDevices(db, customer, now).map(d => ({ installationId: d.installationId, platform: d.platform, lastSeenAt: d.lastSeenAt })), enabledPlatforms: config.enabled ? config.platforms : [], webSupported: false };
}

function updatePreferences(db, customer, input, now = Date.now()) {
  if (!input || Object.keys(input).some(k => !['service', 'marketing'].includes(k)) || !Object.keys(input).length || Object.values(input).some(v => typeof v !== 'boolean')) fail('Choix de notifications invalide.');
  const previous = prefs(customer), timestamp = new Date(now).toISOString();
  customer.pushPreferences = { ...customer.pushPreferences, ...previous, ...input, updatedAt: timestamp, consentVersion: 1 };
  for (const [kind, accepted] of Object.entries(input)) {
    if (accepted !== previous[kind]) customer.pushPreferences[`${kind}${accepted ? 'Accepted' : 'Revoked'}At`] = timestamp;
  }
  for (const job of store(db).jobs) if (job.customerId === customer.id && !prefs(customer)[job.kind] && job.status === 'queued') job.status = 'cancelled';
}

function registerDevice(db, customer, input, now = Date.now()) {
  if (!input || !UUID.test(input.installationId || '') || !UUID.test(input.secret || '') || !TOKEN.test(input.token || '') || !['ios', 'android'].includes(input.platform)) fail('Appareil de notification invalide.');
  const s = store(db), proof = hash(input.secret);
  const existing = s.devices.find(d => d.installationId === input.installationId);
  if (existing && existing.secretHash !== proof) fail('Cet appareil ne peut pas être associé.', 409);
  if (s.devices.some(d => d.installationId !== input.installationId && d.token === input.token)) fail('Cette installation est déjà associée. Reconnecte-toi sur cet appareil.', 409);
  if (!existing && customerDevices(db, customer, now).length >= 5) fail('Cinq appareils sont déjà associés. Retire un ancien appareil avant de continuer.', 409);
  // Re-association requires the installation's private proof, never just its public ID.
  if (existing && existing.customerId !== customer.id) s.jobs.filter(j => j.deviceId === existing.installationId && j.status === 'queued').forEach(j => { j.status = 'cancelled'; });
  const device = { installationId: input.installationId, secretHash: proof, customerId: customer.id, token: input.token, platform: input.platform, lastSeenAt: new Date(now).toISOString(), disabledAt: null };
  if (existing) Object.assign(existing, device); else s.devices.push(device);
}

function removeDevice(db, customer, id) {
  if (!UUID.test(id || '')) fail('Appareil invalide.');
  const s = store(db);
  // Idempotent and scoped to the authenticated account. Other accounts cannot be detached.
  s.devices = s.devices.filter(d => d.customerId !== customer.id || d.installationId !== id);
  s.jobs.filter(j => j.customerId === customer.id && j.deviceId === id && j.status === 'queued').forEach(j => { j.status = 'cancelled'; });
}

function deleteCustomerPush(db, customerId) {
  if (!db.pushNotifications) return;
  const s = store(db), ids = new Set(s.devices.filter(d => d.customerId === customerId).map(d => d.installationId));
  s.devices = s.devices.filter(d => d.customerId !== customerId);
  s.jobs = s.jobs.filter(j => j.customerId !== customerId);
  s.campaigns.forEach(c => { c.deviceIds = c.deviceIds.filter(id => !ids.has(id)); for (const id of ids) delete c.targetOwners?.[id]; });
}

function eligibleDevices(db, audience, config, now) {
  const s = store(db), customers = new Map(db.customers.map(c => [c.id, c]));
  return s.devices.filter(d => {
    const c = customers.get(d.customerId);
    return c && prefs(c).marketing && activeDevice(d, now) && live(config, d.platform) && (audience === 'all' || bibouPlusStatus(c, new Date(now)).active);
  });
}

function enqueue(db, customer, devices, message, now) {
  const s = store(db);
  for (const device of devices) {
    const id = hash(`${message.eventKey}:${device.installationId}`);
    if (s.jobs.some(j => j.id === id)) continue;
    s.jobs.push({ id, customerId: customer.id, deviceId: device.installationId, ...message, status: 'queued', attempts: 0, createdAt: now, nextAttemptAt: now, expiresAt: now + (message.kind === 'marketing' ? DAY : 2 * 3600000) });
  }
}

function queueServiceNotification(db, record, type, previousStatus, config, now = Date.now()) {
  if (previousStatus === record.status || !record.customerId || !config.enabled || (type === 'order' && record.payment?.status !== 'PAID')) return;
  const customer = db.customers.find(c => c.id === record.customerId);
  if (!customer || !prefs(customer).service) return;
  const messages = type === 'order' ? {
    confirmed: ['Commande transmise', 'Ton paiement est confirmé. Le restaurant va prendre en charge ta commande.'],
    preparing: ['Commande acceptée', 'Ta commande est en préparation chez Bibou’s Burgers.'],
    ready: ['Commande prête', record.method === 'pickup' ? 'Ta commande est prête à être retirée au restaurant.' : 'Ta commande est prête. Elle attend son départ en livraison.'],
    out_for_delivery: [record.method === 'pickup' ? 'Commande remise' : 'Livraison en route', record.method === 'pickup' ? 'Merci pour ta commande et bon appétit !' : 'Ta commande a été confiée au livreur.'],
    delivered: ['Bon appétit !', 'Ta commande est terminée. Merci et à bientôt chez Bibou’s Burgers.'],
    cancelled: ['Commande annulée', 'Ta commande a été annulée. Consulte son suivi et contacte le restaurant pour toute question.'],
  } : {
    confirmed: ['Table confirmée', 'Ta réservation est confirmée. Retrouve la date et l’heure dans tes réservations.'],
    cancelled: ['Réservation annulée', 'Ta réservation a été annulée. Consulte tes réservations pour en savoir plus.'],
  };
  const copy = messages[record.status];
  if (!copy || record.pushNotifiedStatuses?.includes(record.status)) return;
  const devices = customerDevices(db, customer, now).filter(d => live(config, d.platform));
  if (!devices.length) return;
  record.pushNotifiedStatuses ||= [];
  record.pushNotifiedStatuses.push(record.status);
  // Superseded status updates should never arrive late, out of sequence.
  store(db).jobs.filter(j => j.entityId === record.id && j.kind === 'service' && j.status === 'queued').forEach(j => { j.status = 'cancelled'; });
  enqueue(db, customer, devices, { kind: 'service', eventKey: `${type}:${record.id}:${record.status}`, title: copy[0], body: copy[1], screen: type === 'order' ? 'orders' : 'reservations', entityId: record.id }, now);
}

function queueAmendmentNotification(db, order, config, now = Date.now()) {
  const a = order.amendment, customer = db.customers.find(c => c.id === order.customerId);
  if (!a || !customer) return { channel: 'in_app', devices: 0 };
  const devices = prefs(customer).service ? customerDevices(db, customer, now).filter(d => live(config, d.platform)) : [];
  const copies = {
    pending: ['Commande modifiée : ton accord est requis', 'Un article est indisponible. Consulte le nouveau panier dans Mes commandes pour accepter ou refuser.'],
    accepted: ['Nouveau panier validé', 'Ton accord a été enregistré. Le restaurant peut maintenant accepter ta commande.'],
    refused: ['Commande annulée', 'Ton refus a été enregistré. Le restaurant doit traiter le remboursement.'],
    expired: ['Proposition expirée', 'Sans réponse à temps, la commande a été annulée. Le restaurant doit traiter le remboursement.'],
    cancelled: ['Commande annulée', 'Le restaurant a annulé la commande. Consulte le suivi du remboursement.']
  };
  const copy = copies[a.status];
  if (!copy) return { channel: 'in_app', devices: 0 };
  store(db).jobs.filter(j => j.entityId === order.id && j.kind === 'service' && j.status === 'queued').forEach(j => { j.status = 'cancelled'; });
  enqueue(db, customer, devices, { kind: 'service', eventKey: `amendment:${order.id}:${a.revision}:${a.status}`, title: copy[0], body: copy[1], screen: 'orders', entityId: order.id }, now);
  return { channel: devices.length ? 'in_app_push' : 'in_app', devices: devices.length };
}

function prepareCampaign(db, input, config, now = Date.now()) {
  if (!input || !UUID.test(input.requestId || '') || typeof input.title !== 'string' || typeof input.body !== 'string' || !DESTINATIONS.includes(input.screen) || !['all', 'plus'].includes(input.audience)) fail('Notification incomplète.');
  const title = input.title.trim(), body = input.body.trim();
  if (!title || title.length > 65 || !body || body.length > 220 || /[\u0000-\u0008\u000b-\u001f]/.test(title + body)) fail('Titre : 1 à 65 caractères. Message : 1 à 220 caractères.');
  const s = store(db), fingerprint = hash(JSON.stringify([title, body, input.screen, input.audience]));
  const old = s.campaigns.find(c => c.id === input.requestId);
  if (old) { if (old.fingerprint !== fingerprint) fail('Cet aperçu a changé. Crée un nouvel aperçu.', 409); return campaignView(db, old); }
  if (s.campaigns.filter(c => c.createdAt > now - DAY).length >= 50) fail('Trop d’aperçus aujourd’hui. Réessayez demain.', 429);
  const devices = eligibleDevices(db, input.audience, config, now);
  const campaign = { id: input.requestId, fingerprint, title, body, screen: input.screen, audience: input.audience, status: 'draft', createdAt: now, previewExpiresAt: now + 15 * 60000, deviceIds: devices.map(d => d.installationId), targetOwners: Object.fromEntries(devices.map(d => [d.installationId, d.customerId])), customers: new Set(devices.map(d => d.customerId)).size };
  s.campaigns.unshift(campaign);
  return campaignView(db, campaign);
}

function sendCampaign(db, id, input, config, now = Date.now()) {
  const s = store(db), campaign = s.campaigns.find(c => c.id === id);
  if (!campaign) fail('Aperçu introuvable.', 404);
  if (input?.confirm !== true) fail('Confirmez explicitement l’envoi.');
  if (campaign.status !== 'draft') return campaignView(db, campaign);
  if (!config.enabled || !config.platforms.length) fail('Les notifications sur téléphone ne sont pas encore activées. Aucun envoi effectué.', 409);
  if (campaign.previewExpiresAt <= now) fail('Cet aperçu a expiré. Préparez un nouvel aperçu.', 409);
  if (s.campaigns.filter(c => c.sentAt > now - DAY).length >= 2) fail('Limite de sécurité : deux campagnes promotionnelles par 24 heures.', 429);
  const snapshot = new Set(campaign.deviceIds);
  const devices = eligibleDevices(db, campaign.audience, config, now).filter(d => snapshot.has(d.installationId) && campaign.targetOwners[d.installationId] === d.customerId);
  if (!devices.length) fail('Aucun appareil autorisé pour cet envoi.', 409);
  for (const device of devices) {
    const customer = db.customers.find(c => c.id === device.customerId);
    enqueue(db, customer, [device], { kind: 'marketing', campaignId: id, eventKey: `campaign:${id}`, title: campaign.title, body: campaign.body, screen: campaign.screen }, now);
  }
  campaign.status = 'sent'; campaign.sentAt = now; campaign.customers = new Set(devices.map(d => d.customerId)).size;
  campaign.deviceIds = devices.map(d => d.installationId);
  return campaignView(db, campaign);
}

function campaignView(db, campaign) {
  const jobs = (db.pushNotifications?.jobs || []).filter(j => j.campaignId === campaign.id);
  return { id: campaign.id, title: campaign.title, body: campaign.body, screen: campaign.screen, audience: campaign.audience, status: campaign.status, createdAt: campaign.createdAt, sentAt: campaign.sentAt || null, previewExpiresAt: campaign.previewExpiresAt, customers: campaign.customers, devices: campaign.deviceIds.length, counts: Object.fromEntries(['queued', 'sending', 'accepted', 'provider_ok', 'failed', 'uncertain', 'cancelled', 'expired'].map(status => [status, jobs.filter(j => j.status === status).length])) };
}

function dashboardPush(db, config, now = Date.now()) {
  const s = store(db), devices = s.devices.filter(d => activeDevice(d, now));
  const eligible = eligibleDevices(db, 'all', config, now);
  return { enabled: config.enabled, platforms: config.enabled ? config.platforms : [], registeredDevices: devices.length, optedInCustomers: db.customers.filter(c => prefs(c).marketing).length, eligibleCustomers: new Set(eligible.map(d => d.customerId)).size, eligibleDevices: eligible.length, campaigns: s.campaigns.slice(0, 30).map(c => campaignView(db, c)), jobs: Object.fromEntries(['queued', 'accepted', 'provider_ok', 'failed', 'uncertain'].map(status => [status, s.jobs.filter(j => j.status === status).length])) };
}

function canDispatch(db, job, config, now) {
  const s = store(db), device = s.devices.find(d => d.installationId === job.deviceId && d.customerId === job.customerId), customer = db.customers.find(c => c.id === job.customerId);
  if (!customer || !device || !prefs(customer)[job.kind] || !activeDevice(device, now)) return null;
  if (job.kind === 'marketing') {
    if (job.crmOfferId) {
      const offer = db.crm?.offers.find(o => o.id === job.crmOfferId && o.customerId === customer.id);
      if (!db.crm?.settings.enabled || !offer || offer.expiresAt <= now || customer.crmPreferences?.personalizedOffers !== true || !db.crm.settings.rules.some(r => r.id === offer.ruleId && r.enabled && r.channel === 'in_app_push')) return null;
    } else {
      const campaign = s.campaigns.find(c => c.id === job.campaignId);
      if (!campaign || campaign.status !== 'sent' || (campaign.audience === 'plus' && !bibouPlusStatus(customer, new Date(now)).active)) return null;
    }
  }
  return live(config, device.platform) ? device : null;
}

function queueCrmNotification(db, offer, config, now = Date.now()) {
  const customer = db.customers.find(c => c.id === offer.customerId);
  if (!customer || customer.crmPreferences?.personalizedOffers !== true || !prefs(customer).marketing) return;
  const devices = customerDevices(db, customer, now).filter(d => live(config, d.platform));
  if (!devices.length) return;
  enqueue(db, customer, devices, { kind:'marketing', crmOfferId:offer.id, eventKey:`crm:${offer.id}`, title:offer.title,
    body:`Une offre personnelle de −${offer.discountPercent} % t’attend. Consulte ses conditions dans Mon compte > Mes offres.`, screen:'account' }, now);
}

function purgePush(db, now = Date.now()) {
  if (!db.pushNotifications) return false;
  const before = JSON.stringify(db.pushNotifications), s = store(db);
  s.devices = s.devices.filter(d => activeDevice(d, now));
  s.jobs = s.jobs.filter(j => j.createdAt > now - 7 * DAY);
  s.campaigns = s.campaigns.filter(c => c.createdAt > now - 7 * DAY);
  for (const job of s.jobs) {
    if (job.status === 'queued' && job.expiresAt <= now) job.status = 'expired';
    if (job.status === 'sending' && job.attemptedAt < now - 120000) job.status = 'uncertain';
  }
  return before !== JSON.stringify(db.pushNotifications);
}

// DB changes are committed before contacting Expo. Network calls never hold the order DB lock.
function createPushWorker({ config, transact, fetchImpl = fetch, clock = Date.now }) {
  let running = false;
  const expo = async (endpoint, payload) => {
    const response = await fetchImpl(`https://exp.host/--/api/v2/push/${endpoint}`, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}) }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => null);
    return { response, data };
  };
  const disable = (db, job) => { const d = store(db).devices.find(d => d.installationId === job.deviceId && d.customerId === job.customerId); if (d) { d.disabledAt = clock(); delete d.token; } };
  const errorCode = value => ['DeviceNotRegistered', 'InvalidCredentials', 'MessageTooBig', 'MessageRateExceeded', 'MismatchSenderId'].includes(value) ? value : 'ProviderError';
  async function tick() {
    if (running) return;
    running = true;
    try {
      const batch = await transact(db => {
        const now = clock(); purgePush(db, now);
        if (!config.enabled) return [];
        const selected = [];
        // Order/table updates take priority over promotional campaigns.
        const pending = store(db).jobs.filter(j => j.status === 'queued').sort((a, b) => Number(a.kind === 'marketing') - Number(b.kind === 'marketing') || a.createdAt - b.createdAt);
        for (const job of pending) {
          if (job.status !== 'queued' || job.nextAttemptAt > now || selected.length >= 25) continue;
          const device = canDispatch(db, job, config, now);
          if (!device) { job.status = 'cancelled'; continue; }
          job.status = 'sending'; job.attemptedAt = now; job.attempts += 1;
          selected.push({ id: job.id, to: device.token, title: job.title, body: job.body, sound: 'default', channelId: job.kind === 'marketing' ? 'promotions' : 'commandes', ttl: Math.max(1, Math.floor((job.expiresAt - now) / 1000)), data: { messageId: job.id, accountId: job.customerId, screen: job.screen, entityId: job.entityId || null } });
        }
        return selected;
      });
      if (batch.length) {
        let result;
        try { result = await expo('send', batch.map(({ id, ...message }) => message)); } catch { /* An ambiguous network response must not trigger a duplicate send. */ }
        await transact(db => {
          batch.forEach((message, i) => {
            const job = store(db).jobs.find(j => j.id === message.id);
            if (!job || job.status !== 'sending') return;
            const ticket = result?.data?.data?.[i];
            if (result?.response.ok && ticket?.status === 'ok' && typeof ticket.id === 'string') { job.status = 'accepted'; job.ticketId = ticket.id; job.receiptAt = clock() + 15 * 60000; }
            else if (result?.response.ok && ticket?.status === 'error') { job.status = 'failed'; job.errorCode = errorCode(ticket.details?.error); if (job.errorCode === 'DeviceNotRegistered') disable(db, job); }
            else if (result?.response.status === 429 && job.attempts < 3) { job.status = 'queued'; job.nextAttemptAt = clock() + job.attempts * 60000; }
            else { job.status = result && result.response.status >= 400 && result.response.status < 500 ? 'failed' : 'uncertain'; job.errorCode = result ? `HTTP_${result.response.status}` : 'NetworkUncertain'; }
          });
        });
      }
      if (!config.enabled) return;
      const receipts = await transact(db => store(db).jobs.filter(j => j.status === 'accepted' && j.receiptAt <= clock()).slice(0, 100).map(j => ({ id: j.id, ticketId: j.ticketId })));
      if (!receipts.length) return;
      let result;
      try { result = await expo('getReceipts', { ids: receipts.map(r => r.ticketId) }); } catch { /* Receipt checks are safely retried, unlike an uncertain send. */ }
      await transact(db => {
        for (const item of receipts) {
          const job = store(db).jobs.find(j => j.id === item.id);
          if (!job || job.status !== 'accepted') continue;
          const receipt = result?.response.ok && result.data?.data?.[item.ticketId];
          if (receipt?.status === 'ok') job.status = 'provider_ok';
          else if (receipt?.status === 'error') { job.status = 'failed'; job.errorCode = errorCode(receipt.details?.error); if (job.errorCode === 'DeviceNotRegistered') disable(db, job); }
          else if (job.attemptedAt < clock() - 23 * 3600000) job.status = 'uncertain';
          else job.receiptAt = clock() + 15 * 60000;
        }
      });
    } finally { running = false; }
  }
  return { tick };
}

module.exports = { configFromEnv, customerPushState, updatePreferences, registerDevice, removeDevice, deleteCustomerPush, queueServiceNotification, queueAmendmentNotification, queueCrmNotification, prepareCampaign, sendCampaign, dashboardPush, purgePush, createPushWorker };
