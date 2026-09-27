// Staff-only operational alerts. No customer phone, name, address or comment in SMS.
const crypto = require('node:crypto');
const keyyo = require('./keyyo-call-sms');
const MAX_AGE = 30 * 60 * 1000;
const RETENTION = 30 * 86400000;
const DASHBOARD = 'https://bibous-burgers-restaurant.onrender.com/';

function configFromEnv(env) {
  const raw = String(env.RESTAURANT_ORDER_SMS_RECIPIENTS || '').split(',').map(s => s.trim()).filter(Boolean);
  const recipients = [...new Set(raw.map(keyyo.phone))];
  const enabled = env.RESTAURANT_ORDER_SMS_ENABLED === 'true';
  return {
    enabled,
    recipients: raw.length && recipients.length <= 2 && recipients.every(n => /^33[67]\d{8}$/.test(n || '')) ? recipients : [],
    // Independent switch: stopping call-triggered messages does not stop order alerts.
    sender: { ...keyyo.configFromEnv(env), enabled },
  };
}
const configured = config => Boolean(config.enabled && config.recipients.length && keyyo.configured(config.sender));
const recipientId = (config, number) => crypto.createHmac('sha256', config.sender.privacyKey).update('staff-order-sms:' + number).digest('hex');
const oneSegment = text => /^[\x20-\x7e]+$/.test(text) && !/[\[\]{}\\^~|]/.test(text) && text.length <= 160;

function messageFor(order) {
  const number = Number.isSafeInteger(order.number) && order.number > 0 ? String(order.number).slice(0,12) : '?';
  const method = order.method === 'delivery' ? 'Livraison' : 'Retrait';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(order.serviceDate || '') ? order.serviceDate.slice(8) + '/' + order.serviceDate.slice(5,7) : '';
  const slot = String(order.slot || '').replace(/[–—]/g, '-').replace(/[^0-9: -]/g, '').slice(0,13);
  const amount = Number.isFinite(order.total) && order.total >= 0 && order.total <= 999999 ? order.total.toFixed(2) : '?';
  const text = `Bibou's Burgers : commande #${number}. ${method} ${date} ${slot}. ${amount} EUR. A traiter : ${DASHBOARD}`;
  if (!oneSegment(text)) throw new Error('Format d’alerte SMS invalide.');
  return text;
}
function store(database) {
  database.restaurantOrderSms ||= { version: 1, jobs: [] };
  if (database.restaurantOrderSms.version !== 1 || !Array.isArray(database.restaurantOrderSms.jobs)) throw new Error('Registre SMS invalide.');
  return database.restaurantOrderSms;
}

// Called ONLY on the real awaiting_payment -> confirmed transition, under the
// order database lock, before the same atomic write as the paid confirmation.
function queueOrder(database, order, config, now = Date.now()) {
  if (!configured(config) || order.restaurantSmsQueuedAt || order.status !== 'confirmed' || order.payment?.status !== 'PAID'
    || order.isTest || order.isReview || !/^order-\d+$/.test(order.id || '') || !['pickup','delivery'].includes(order.method)) return false;
  const ledger = store(database);
  ledger.jobs = ledger.jobs.filter(job => job.createdAt > now - RETENTION || ['queued','sending'].includes(job.status));
  // Never scan/backfill historic orders at startup. The per-order marker also
  // prevents an old callback from re-enqueueing after the log retention period.
  order.restaurantSmsQueuedAt = new Date(now).toISOString();
  if (ledger.jobs.filter(j => ['queued','sending'].includes(j.status)).length + config.recipients.length > 200) {
    order.restaurantSmsQueueError = 'queue_full';
    return false;
  }
  const message = messageFor(order);
  for (const recipient of config.recipients) {
    const recipientKey = recipientId(config, recipient);
    ledger.jobs.push({ id: crypto.randomUUID(), orderId: order.id, recipientKey, message, createdAt: now, status: 'queued' });
  }
  return true;
}

function createWorker({ config, transact, sendSms = keyyo.createSender(config.sender, fetch, { retryDelays: [30000, 60000] }), now = Date.now }) {
  const clock = now;
  let running = false;
  async function tick() {
    if (running || !configured(config)) return;
    running = true;
    try {
      const job = await transact(database => {
        if (!database.restaurantOrderSms) return null;
        const ledger = store(database);
        ledger.jobs = ledger.jobs.filter(j => j.createdAt > clock() - RETENTION || ['queued','sending'].includes(j.status));
        let selected;
        for (const item of ledger.jobs) {
          // Crash/response loss: never send a second billable SMS automatically.
          if (item.status === 'sending') { item.status = 'uncertain'; delete item.message; }
          if (item.status !== 'queued') continue;
          const recipient = config.recipients.find(n => recipientId(config,n) === item.recipientKey);
          const order = database.orders.find(o => o.id === item.orderId);
          if (!recipient || !order || order.payment?.status !== 'PAID' || order.status === 'cancelled') item.status = 'cancelled';
          else if (clock() - item.createdAt > MAX_AGE) item.status = 'expired';
          else if (!oneSegment(item.message || '')) item.status = 'invalid';
          else if (!selected) {
            selected = { ...item, recipient };
            item.status = 'sending'; item.attemptedAt = clock();
          }
          if (item.status !== 'queued') delete item.message;
        }
        return selected;
      });
      if (!job) return;
      let status = 'uncertain', diagnostic = {};
      try {
        const result = await sendSms(job.recipient, job.message, { canSend: () => transact(database => {
          const current = database.orders.find(o => o.id === job.orderId);
          return Boolean(current && current.payment?.status === 'PAID' && current.status !== 'cancelled' && clock() - job.createdAt <= MAX_AGE);
        }) });
        status = 'accepted';
        if (Number.isSafeInteger(result?.attempts) && result.attempts >= 1 && result.attempts <= 3) diagnostic.attempts = result.attempts;
      } catch (error) {
        // Only allowlisted codes/numbers, never raw provider text/URL/credentials.
        if (['temporary_refusal','network_error','unconfirmed_response','authentication_error','cancelled'].includes(error?.keyyoReason)) {
          diagnostic.reason = error.keyyoReason;
          if (Number.isInteger(error.providerStatus) && error.providerStatus >= 100 && error.providerStatus <= 599) diagnostic.providerStatus = error.providerStatus;
          if (Number.isSafeInteger(error.attempts) && error.attempts >= 1 && error.attempts <= 3) diagnostic.attempts = error.attempts;
          if (error.keyyoReason === 'temporary_refusal') status = 'rejected';
          if (error.keyyoReason === 'cancelled') status = 'cancelled';
        }
      }
      await transact(database => {
        const saved = store(database).jobs.find(j => j.id === job.id);
        if (saved) { saved.status = status; saved.finishedAt = clock(); Object.assign(saved, diagnostic); }
      });
    } finally { running = false; }
  }
  return { tick };
}

function status(database, config) {
  const counts = {};
  for (const job of database.restaurantOrderSms?.jobs || []) counts[job.status] = (counts[job.status] || 0) + 1;
  return { enabled: config.enabled, configured: configured(config), recipientCount: config.recipients.length, counts,
    queueErrors: database.orders.filter(o => o.restaurantSmsQueueError).length };
}
function backupDatabase(database) {
  if (!database.restaurantOrderSms) return database;
  return { ...database, restaurantOrderSms: { ...database.restaurantOrderSms, jobs: database.restaurantOrderSms.jobs.map(({message,...job}) => ({
    ...job, status: ['queued','sending'].includes(job.status) ? 'uncertain' : job.status,
  })) } };
}
module.exports = { configFromEnv, configured, messageFor, queueOrder, createWorker, status, backupDatabase };
