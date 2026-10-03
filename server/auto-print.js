const crypto = require('node:crypto');

// A claim is never recycled automatically: after a network timeout the printer
// might have printed even though the browser did not receive its response.
function state(database, startedAt) {
  if (!database.restaurantAutoPrint) database.restaurantAutoPrint = { startedAt, jobs: {} };
  return database.restaurantAutoPrint;
}

function claim(database, startedAt, now = new Date()) {
  const print = state(database, startedAt);
  const order = (database.orders || []).filter(item =>
    item?.id && item.payment?.status === 'PAID' &&
    ['confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(item.status) &&
    !print.jobs[item.id] &&
    Number.isFinite(Date.parse(item.payment.paidAt || item.createdAt)) &&
    Date.parse(item.payment.paidAt || item.createdAt) >= Date.parse(print.startedAt)
  ).sort((a, b) => Date.parse(a.payment.paidAt || a.createdAt) - Date.parse(b.payment.paidAt || b.createdAt))[0];
  if (!order) return null;
  const claimId = crypto.randomUUID();
  print.jobs[order.id] = { status: 'claimed', claimId, claimedAt: now.toISOString() };
  return { order, claimId };
}

function finish(database, id, input, now = new Date()) {
  const job = database.restaurantAutoPrint?.jobs?.[id];
  if (!job || job.status !== 'claimed' || job.claimId !== input.claimId) {
    throw Object.assign(new Error('Cette impression n’est plus en attente.'), { statusCode: 409 });
  }
  if (!['printed', 'failed', 'uncertain'].includes(input.status)) {
    throw Object.assign(new Error('Résultat d’impression invalide.'), { statusCode: 400 });
  }
  job.status = input.status;
  job.finishedAt = now.toISOString();
  delete job.claimId;
  return { status: job.status };
}

function manual(database, id, startedAt, now = new Date()) {
  const print = state(database, startedAt);
  const order = (database.orders || []).find(item => item.id === id && item.payment?.status === 'PAID');
  if (!order) throw Object.assign(new Error('Commande payée introuvable.'), { statusCode: 404 });
  if (print.jobs[id]?.status === 'claimed' && now.getTime() - Date.parse(print.jobs[id].claimedAt) < 30000) {
    throw Object.assign(new Error('Une impression est déjà en cours pour cette commande.'), { statusCode: 409 });
  }
  const claimId = crypto.randomUUID();
  print.jobs[id] = { status: 'claimed', claimId, claimedAt: now.toISOString(), source: 'manual' };
  return { order, claimId };
}

module.exports = { state, claim, finish, manual };
