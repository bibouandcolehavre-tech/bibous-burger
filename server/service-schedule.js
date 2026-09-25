const { candidateSlots, regularSlotsForDate, serviceClosureReason, validateServiceDate, parisDateKey } = require('./availability');
const METHODS = ['pickup', 'delivery', 'reservation'];
const failure = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
function assertDate(date, now) {
  const error = validateServiceDate(date, now);
  if (error) throw failure('Choisis une date dans les 14 prochains jours.');
}
function dashboard(database, date, now = new Date()) {
  assertDate(date, now);
  const saved = database.serviceSchedule?.dates?.[date];
  const services = Object.fromEntries(METHODS.map(method => {
    const standard = new Set(regularSlotsForDate(date, method));
    const overrides = saved?.services?.[method] || {};
    return [method, candidateSlots(method).map(slot => ({ slot, standard: standard.has(slot),
      open: typeof overrides[slot] === 'boolean' ? overrides[slot] : standard.has(slot) && !serviceClosureReason(date, slot, method),
      committed: method === 'reservation'
        ? (database.reservations || []).filter(r => r.serviceDate === date && r.status !== 'cancelled' && r.slot.slice(0, 5) === slot).length
        : (database.orders || []).filter(o => o.serviceDate === date && o.method === method && o.status !== 'cancelled' && (o.payment?.status === 'PAID' || o.status === 'awaiting_payment') && o.slot === slot).length
    }))];
  }));
  return { date, revision: saved?.revision || 0, services, timeZone: 'Europe/Paris', today: parisDateKey(now),
    updatedAt: saved?.updatedAt || null };
}
function save(database, input, now = new Date()) {
  assertDate(input.date, now);
  const current = dashboard(database, input.date, now);
  if (input.revision !== current.revision) throw failure('Les créneaux ont changé dans un autre onglet. Actualise avant de recommencer.', 409);
  if (!input.services || typeof input.services !== 'object' || Object.keys(input.services).some(m => !METHODS.includes(m))) throw failure('Services invalides.');
  const services = {};
  for (const method of METHODS) {
    const values = input.services[method];
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw failure('Les trois services sont requis.');
    const candidates = candidateSlots(method);
    if (Object.keys(values).length !== candidates.length || candidates.some(slot => typeof values[slot] !== 'boolean')) throw failure('Liste de créneaux invalide.');
    services[method] = {};
    for (const row of current.services[method]) {
      if (row.committed && row.open && !values[row.slot] && input.acknowledgeExisting !== true) throw failure('Des commandes ou tables existent sur les créneaux fermés. Confirme leur prise en charge.', 409);
      // Keep only exceptions to the regular schedule (including the one-off closure).
      const defaultOpen = row.standard && !serviceClosureReason(input.date, row.slot, method);
      if (values[row.slot] !== defaultOpen) services[method][row.slot] = values[row.slot];
    }
  }
  database.serviceSchedule ||= { dates: {} };
  database.serviceSchedule.dates ||= {};
  database.serviceSchedule.dates[input.date] = { revision: current.revision + 1, services, updatedAt: now.toISOString() };
  // Each day's changes remain available for an audit without customer details.
  database.serviceSchedule.history ||= [];
  database.serviceSchedule.history.push({ date: input.date, revision: current.revision + 1, services, at: now.toISOString() });
  database.serviceSchedule.history = database.serviceSchedule.history.slice(-200);
}
module.exports = { dashboard, save, METHODS };
