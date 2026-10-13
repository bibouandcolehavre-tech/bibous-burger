// Prize administration messages, not advertising. No code/phone in stored jobs.
// Nothing is sent unless server flags AND the winner's optional consent allow it.
const crypto = require('node:crypto');
const prizes = require('./contest-prizes');
const push = require('./push-notifications');
const keyyo = require('./keyyo-call-sms');
function configFromEnv(env) {
  const enabled = env.CONTEST_PRIZE_SMS_ENABLED === 'true';
  return { enabled, sender: { ...keyyo.configFromEnv(env), enabled } };
}
const configured = config => Boolean(config?.enabled && keyyo.configured(config.sender));
const verifiedPhone = customer => /^\+33[67]\d{8}$/.test(customer?.phone || '') && customer.verifiedPhone === customer.phone && Number.isFinite(Date.parse(customer.phoneVerifiedAt));
function copyFor(voucher, type) {
  const end = voucher.lastDay.split('-').reverse().slice(0, 2).join('/');
  return type === 'reminder'
    ? { title: 'Tes menus gagnés expirent bientôt', body: `Il te reste des menus gagnés à utiliser avant la fin du ${end}. Ouvre l’application : sans utilisation, ils seront perdus, sans report.`, sms: `Bibou's Burgers : rappel, vos menus gagnes expirent le ${end}. Ouvrez l'application pour commander. Non utilises = perdus, sans report.` }
    : { title: 'Ton code personnel est disponible', body: `Tes menus gagnés du mois sont disponibles dans l’application, rubrique Mes menus gagnés. Commande avant la fin du ${end}.`, sms: `Bibou's Burgers : votre code personnel du mois est disponible dans l'application, Mes menus gagnes. Commandez avant le ${end}.` };
}
function schedule(db, { pushConfig, smsConfig }, now = new Date()) {
  if (!db.contestPrizes) return false;
  const before = JSON.stringify([db.contestPrizes, db.pushNotifications]);
  prizes.issueCurrentMonth(db, now); prizes.reconcile(db);
  const time = +new Date(now), s = prizes.store(db);
  for (const voucher of s.vouchers) {
    if (!prizes.alertEligible(db, voucher.id, now)) continue;
    // On a late restart send only the relevant reminder, not two old messages.
    const type = time >= Date.parse(voucher.reminderAt) ? 'reminder' : time >= Date.parse(voucher.availableAlertAt) ? 'available' : null;
    if (!type || (voucher.alerts?.[type] && voucher.alerts[type].channel !== 'in_app')) continue;
    voucher.alerts ||= {};
    const copy = copyFor(voucher, type), customer = db.customers.find(c => c.id === voucher.customerId);
    const eventKey = `contest-prize:${voucher.id}:${type}`;
    const devices = push.queueContestPrizeNotification(db, voucher, { ...copy, eventKey }, pushConfig, time);
    let channel = devices ? 'push' : 'in_app';
    if (!devices && configured(smsConfig) && verifiedPhone(customer)) {
      const id = crypto.createHash('sha256').update(eventKey).digest('hex');
      if (!s.smsJobs.some(j => j.id === id)) s.smsJobs.push({ id, voucherId: voucher.id, customerId: customer.id, type, status: 'queued', createdAt: time, expiresAt: Math.min(time + 86400000, Date.parse(voucher.expiresAt)) });
      channel = 'sms';
    }
    if (!voucher.alerts[type] || voucher.alerts[type].channel !== channel) voucher.alerts[type] = { channel, queuedAt: new Date(now).toISOString() };
  }
  return before !== JSON.stringify([db.contestPrizes, db.pushNotifications]);
}
function createWorker({ config, transact, sendSms = keyyo.createSender(config.sender), now = Date.now }) {
  let running = false;
  const canSend = (db, job) => {
    const customer = db.customers.find(c => c.id === job.customerId);
    return configured(config) && now() < job.expiresAt && verifiedPhone(customer) && prizes.alertEligible(db, job.voucherId, new Date(now()));
  };
  async function tick() {
    if (running || !configured(config)) return;
    running = true;
    try {
      const selected = await transact(db => {
        if (!db.contestPrizes) return null;
        let selected;
        for (const job of prizes.store(db).smsJobs) {
          if (job.status === 'sending') job.status = 'uncertain'; // Never re-bill after a crash/response loss.
          if (job.status !== 'queued') continue;
          if (!canSend(db, job)) { job.status = 'cancelled'; continue; }
          if (selected) continue;
          const customer = db.customers.find(c => c.id === job.customerId), voucher = db.contestPrizes.vouchers.find(v => v.id === job.voucherId);
          const message = copyFor(voucher, job.type).sms;
          if (message.length > 160 || !/^[\x20-\x7e]+$/.test(message)) { job.status = 'invalid'; continue; }
          job.status = 'sending'; job.attemptedAt = now();
          selected = { ...job, recipient: keyyo.phone(customer.phone), message };
        }
        return selected;
      });
      if (!selected) return;
      let status = 'uncertain';
      try {
        await sendSms(selected.recipient, selected.message, { canSend: () => transact(db => canSend(db, selected) && db.contestPrizes?.smsJobs.some(j => j.id === selected.id && j.status === 'sending')) });
        status = 'accepted';
      } catch (error) {
        if (error.keyyoReason === 'temporary_refusal') status = 'rejected';
        if (error.keyyoReason === 'cancelled') status = 'cancelled';
      }
      await transact(db => {
        const job = db.contestPrizes?.smsJobs.find(j => j.id === selected.id);
        if (job) { job.status = status; job.finishedAt = now(); }
      });
    } finally { running = false; }
  }
  return { tick };
}
function backupDatabase(db) {
  if (!db.contestPrizes) return db;
  return { ...db, contestPrizes: { ...db.contestPrizes, smsJobs: db.contestPrizes.smsJobs.map(job => ({ ...job, status: ['queued', 'sending'].includes(job.status) ? 'uncertain' : job.status })) } };
}
module.exports = { configFromEnv, configured, copyFor, schedule, createWorker, backupDatabase };
