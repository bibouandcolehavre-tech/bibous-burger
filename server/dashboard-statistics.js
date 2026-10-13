const { parisDateKey } = require('./availability');
const DAY = 86400000;
const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const shift = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const monday = date => shift(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
const cents = value => value === undefined || value === null || value === '' ? null : Number.isFinite(Number(value)) && Number(value) >= 0 && Number.isSafeInteger(Math.round(Number(value) * 100)) ? Math.round(Number(value) * 100) : null;
const timestamp = value => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
function windowFor(granularity, date) {
  if (!validDate(date) || !['hour', 'day', 'week', 'month'].includes(granularity)) fail('Choisis une date valide et une vue par heure, jour, semaine ou mois.');
  let start = date, end = date;
  if (granularity === 'day') { start = monday(date); end = shift(start, 6); }
  if (granularity === 'week') { start = date.slice(0, 7) + '-01'; end = shift(new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 1, 12)).toISOString().slice(0, 10), -1); }
  if (granularity === 'month') { start = date.slice(0, 4) + '-01-01'; end = date.slice(0, 4) + '-12-31'; }
  return { start, end };
}
const emptyTotals = () => ({ grossCents: 0, refundCents: 0, netCents: 0, orderCount: 0, subscriptionCount: 0 });
function statistics(database, input = {}, now = new Date()) {
  const granularity = input.granularity || 'hour', date = input.date || parisDateKey(now);
  const range = windowFor(granularity, date), events = [], paidOrders = [], seen = new Set();
  const warnings = { missingPaymentDates: 0, missingRefundDates: 0, invalidAmounts: 0, cappedRefunds: 0, legacyPaymentDates: 0, duplicateRecords: 0 };
  const add = (records, kind) => {
    for (const record of records || []) {
      if (record?.payment?.status !== 'PAID' || record.reviewMode === true) continue;
      const key = record.id ? `${kind}:${record.id}` : null;
      if (key && seen.has(key)) { warnings.duplicateRecords++; continue; }
      if (key) seen.add(key);
      const gross = cents(record.paidTotal ?? record.payment.amount ?? (kind === 'order' ? record.total : record.amount));
      if (gross === null) { warnings.invalidAmounts++; continue; }
      const exact = record.payment.paidAt || record.paidAt;
      const at = timestamp(exact || record.createdAt);
      if (at === null) { warnings.missingPaymentDates++; continue; }
      if (!exact) warnings.legacyPaymentDates++;
      if (at > +now) continue;
      const dateKey = parisDateKey(new Date(at));
      if (gross > 0) events.push({ at, date: dateKey, kind, gross, refund: 0, record });
      let refund = 0, refundAt = null;
      if (record.refund?.status === 'recorded') {
        const amount = cents(record.refund.amount);
        if (amount === null) warnings.invalidAmounts++;
        else {
          refund = Math.min(gross, amount);
          if (amount > gross) warnings.cappedRefunds++;
          refundAt = timestamp(record.refund.recordedAt);
          if (refund > 0 && refundAt === null) warnings.missingRefundDates++;
          if (refund > 0 && refundAt !== null && refundAt <= +now) events.push({ at: refundAt, date: parisDateKey(new Date(refundAt)), kind, gross: 0, refund, record });
        }
      }
      if (kind === 'order' && gross > 0 && record.status !== 'cancelled' && !(refund >= gross && refundAt !== null && refundAt <= +now)) paidOrders.push({ at, date: dateKey, record });
    }
  };
  add(database.orders, 'order'); add(database.bibouPlusPurchases, 'subscription');
  const bucketKey = value => granularity === 'hour' ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(value.at)) : granularity === 'week' ? monday(value.date) : granularity === 'month' ? value.date.slice(0, 7) : value.date;
  const buckets = new Map();
  if (granularity === 'hour') for (let hour = 0; hour < 24; hour++) { const key = String(hour).padStart(2, '0'); buckets.set(key, { key, label: `${key} h`, ...emptyTotals() }); }
  else for (let key = range.start; key <= range.end; key = shift(key, 1)) {
    const grouped = bucketKey({ date: key }), start = grouped.length === 7 ? grouped + '-01' : grouped;
    if (!buckets.has(grouped)) buckets.set(grouped, { key: grouped, label: granularity === 'week' ? `Semaine du ${start}` : grouped, ...emptyTotals() });
  }
  const accumulate = (target, event) => { target.grossCents += event.gross; target.refundCents += event.refund; target.netCents += event.gross - event.refund; if (event.gross > 0) target[event.kind === 'order' ? 'orderCount' : 'subscriptionCount']++; };
  const totals = emptyTotals();
  for (const event of events) if (event.date >= range.start && event.date <= range.end) { accumulate(totals, event); accumulate(buckets.get(bucketKey(event)), event); }
  const customerIds = new Set((database.customers || []).filter(customer => !customer.deletedAt && customer.id).map(customer => customer.id));
  const selected = paidOrders.filter(order => order.date >= range.start && order.date <= range.end);
  const identified = new Set(selected.filter(order => customerIds.has(order.record.customerId)).map(order => order.record.customerId));
  const previous = new Set(paidOrders.filter(order => order.date < range.start).map(order => order.record.customerId));
  const returning = [...identified].filter(id => previous.has(id)).length;
  const lifetime = new Map();
  for (const order of paidOrders.filter(order => order.date <= range.end)) if (customerIds.has(order.record.customerId)) lifetime.set(order.record.customerId, (lifetime.get(order.record.customerId) || 0) + 1);
  const pendingRefundsCents = (database.orders || []).reduce((sum, order) => sum + (order.refund?.status === 'due' ? cents(order.refund.amount) || 0 : 0), 0);
  return { source: 'recorded-production-transactions', fictitious: false, generatedAt: new Date(now).toISOString(), currency: 'EUR', timeZone: 'Europe/Paris', granularity, date, range, totals,
    customers: { identified: identified.size, returning, firstPurchaseInPeriod: identified.size - returning, recurring: [...identified].filter(id => lifetime.get(id) >= 2).length, returningPercent: identified.size ? Math.round(returning / identified.size * 100) : null, unlinkedOrders: selected.filter(order => !customerIds.has(order.record.customerId)).length },
    series: [...buckets.values()], pendingRefundsCents, warnings,
    firstRecordedPaymentDate: events.filter(event => event.gross > 0).map(event => event.date).sort()[0] || null,
    notes: [ 'Chiffre d’affaires TTC des commandes et abonnements Bibou + enregistrés ici, après remises et remboursements enregistrés.', 'Ventes de caisse et plateformes externes non intégrées, acomptes de réservation et paiements non confirmés exclus.', 'Clients de retour : clients identifiés ayant déjà acheté avant la période. Clients récurrents : au moins deux commandes payées non annulées dans l’historique.', 'Les commandes sans compte identifié ne permettent pas de mesurer le retour des clients. Les heures du changement d’heure sont regroupées par heure locale.' ] };
}
module.exports = { statistics, windowFor };
