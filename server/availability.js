const { SLOT_MINUTES, preparationMinutes, clock, clockMinutes, regularSlotsForWeekday } = require('../service-policy');
const SLOT_CAPACITY = 2;
const PENDING_RESERVATION_MS = 15 * 60 * 1000;
const TIME_ZONE = "Europe/Paris";

// One-off closure requested by the restaurant; dates use the Paris service day.
const serviceClosureReason = (dateKey, slot, method = "delivery", database = {}) => {
  const override = scheduleOverride(database, dateKey, slot, method);
  if (typeof override === "boolean") return override ? null : "Ce créneau est exceptionnellement fermé. Choisis un autre horaire.";
  return dateKey === "2026-09-25" && String(slot).slice(0, 5) >= "19:00"
    ? "Le restaurant est exceptionnellement fermé ce vendredi 25 septembre au soir. Choisis un autre jour." : null;
};

const parisDateKey = (value = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const dateFromKey = (dateKey) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return null;
  const parsed = new Date(`${dateKey}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateKey ? null : parsed;
};

const regularSlotsForDate = (dateKey, method = "delivery") => {
  const date = dateFromKey(dateKey);
  return date && ["delivery", "pickup", "reservation"].includes(method) ? regularSlotsForWeekday(date.getUTCDay()) : [];
};

const candidateSlots = () => Array.from({ length: 1440 / SLOT_MINUTES }, (_, i) => clock(i * SLOT_MINUTES));

// Old table appointments shared a half-hour capacity window. Keep their original
// footprint; new appointments use explicit 20-minute windows. Never move bookings.
const slotWindow = (slot, duration = SLOT_MINUTES, legacyTable = false) => {
  const parts = String(slot || '').split(' – ');
  let start = clockMinutes(parts[0]);
  if (start === null) return null;
  if (parts.length === 2) {
    let end = clockMinutes(parts[1]);
    if (end === null) return null;
    if (end === 0) end = 1440;
    return end > start ? [start, end] : null;
  }
  if (parts.length !== 1) return null;
  if (legacyTable) { start = Math.floor(start / 30) * 30; duration = 30; }
  return [start, start + duration];
};
const windowsOverlap = (a, b) => Boolean(a && b && a[0] < b[1] && b[0] < a[1]);
const bookingWindow = (booking, method = booking.method) => slotWindow(booking.slot,
  booking.slotDurationMinutes || (method === 'pickup' ? 15 : SLOT_MINUTES),
  method === 'reservation' && booking.slotDurationMinutes !== SLOT_MINUTES);

// Project legacy exceptions onto the new grid, conservatively: no newly offered
// slot may span a minute that was explicitly closed. Conversion is read-only.
const scheduleOverride = (database, dateKey, slot, method) => {
  const saved = database.serviceSchedule?.dates?.[dateKey];
  const entries = Object.entries(saved?.services?.[method] || {});
  const window = slotWindow(slot);
  if (!window || !entries.length) return undefined;
  const duration = saved.slotMinutes === SLOT_MINUTES ? SLOT_MINUTES : method === 'delivery' ? 30 : 15;
  const affected = entries.map(([key, open]) => ({ window: slotWindow(key, duration), open }))
    .filter(entry => typeof entry.open === 'boolean' && windowsOverlap(window, entry.window));
  if (!affected.length) return undefined;
  const standard = regularSlotsForDate(dateKey, method).map(value => slotWindow(value));
  for (let minute = window[0]; minute < window[1]; minute++) {
    const override = affected.find(entry => minute >= entry.window[0] && minute < entry.window[1]);
    const defaultOpen = standard.some(([a, b]) => minute >= a && minute < b) && !(dateKey === '2026-09-25' && minute >= 19 * 60);
    if (!(override ? override.open : defaultOpen)) return false;
  }
  return true;
};
const slotsForDate = (dateKey, method = "delivery", database = {}) => {
  const regular = regularSlotsForDate(dateKey, method);
  if (!dateFromKey(dateKey) || !["delivery", "pickup", "reservation"].includes(method)) return [];
  const extra = candidateSlots(method).filter(slot => scheduleOverride(database, dateKey, slot, method) !== undefined);
  return [...new Set([...regular, ...extra])].sort();
};

// Paris wall clock converted without relying on the server's local time zone.
// Service hours never overlap the ambiguous/nonexistent DST hours at night.
const serviceSlotInstant = (dateKey, slot) => {
  if (!dateFromKey(dateKey) || clockMinutes(slot) === null) return null;
  const wallTime = Date.parse(`${dateKey}T${slot}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(wallTime)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const localWallTime = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  return new Date(wallTime - (localWallTime - wallTime));
};

const qualifiesForAdvancePickup = (order) => {
  if (order.method !== "pickup") return false;
  const arrival = serviceSlotInstant(order.serviceDate, order.slot);
  const created = Date.parse(order.createdAt);
  return Boolean(arrival && Number.isFinite(created) && arrival.getTime() - created >= 30 * 60 * 1000);
};

const validateServiceDate = (dateKey, now = new Date()) => {
  const date = dateFromKey(dateKey);
  if (!date) return "Choisis une date de livraison valide.";
  const today = dateFromKey(parisDateKey(now));
  const differenceInDays = Math.round((date - today) / 86400000);
  if (differenceInDays < 0 || differenceInDays > 13) return "Choisis une date comprise dans les deux prochaines semaines.";
  return null;
};

const preparationError = (dateKey, slot, now, method, subtotal) => {
  if (method === 'reservation' || subtotal === undefined) return null;
  const minimum = preparationMinutes(subtotal);
  const arrival = serviceSlotInstant(dateKey, slot);
  return arrival && arrival.getTime() < now.getTime() + minimum * 60000
    ? `Prévois au moins ${minimum} minutes de préparation pour ce panier. Choisis un horaire plus tard.` : null;
};
const validateServiceSlot = (dateKey, slot, now = new Date(), method = "delivery", database = {}, subtotal) => {
  const dateError = validateServiceDate(dateKey, now);
  if (dateError) return dateError;
  if (!slotsForDate(dateKey, method, database).includes(slot)) return "Ce créneau n’est pas disponible ce jour-là. Actualise les horaires proposés.";
  const closureReason = serviceClosureReason(dateKey, slot, method, database);
  if (closureReason) return closureReason;
  if (dateKey === parisDateKey(now)) {
    const clockParts = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", {
      timeZone: TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const [startHour, startMinute] = slot.slice(0, 5).split(":").map(Number);
    if (startHour * 60 + startMinute <= clockParts.hour * 60 + clockParts.minute) return "Ce créneau est déjà passé.";
  }
  return preparationError(dateKey, slot, now, method, subtotal);
};

// Existing unpaid orders may still have an old :15/:30 appointment or range.
// Keep their checkout valid unless the service has since been explicitly closed.
const storedServiceSlotOpen = (order, database) => {
  const saved = database.serviceSchedule?.dates?.[order.serviceDate];
  const exact = saved?.services?.[order.method]?.[order.slot];
  if (saved?.slotMinutes !== SLOT_MINUTES && typeof exact === 'boolean') return exact;
  const start = String(order.slot || '').slice(0, 5);
  const window = slotWindow(start, 1);
  if (!window) return false;
  const override = scheduleOverride(database, order.serviceDate, start, order.method);
  if (override !== undefined) return override;
  return regularSlotsForDate(order.serviceDate, order.method).some(slot => windowsOverlap(window, slotWindow(slot))) && !serviceClosureReason(order.serviceDate, order.slot, order.method, database);
};

const holdsDeliverySlot = (order, dateKey, slot, now = new Date()) => {
  if (order.method !== "delivery" || order.serviceDate !== dateKey || !windowsOverlap(bookingWindow(order), slotWindow(slot)) || order.status === "cancelled") return false;
  if (order.payment?.status === "PAID") return true;
  if (order.status !== "awaiting_payment") return false;
  const createdAt = new Date(order.createdAt).getTime();
  return Number.isFinite(createdAt) && now.getTime() - createdAt < PENDING_RESERVATION_MS;
};

const remainingDeliveryPlaces = (database, dateKey, slot, now = new Date()) => {
  const reserved = (database.orders || []).filter((order) => holdsDeliverySlot(order, dateKey, slot, now)).length;
  return { capacity: SLOT_CAPACITY, reserved, remaining: Math.max(0, SLOT_CAPACITY - reserved), full: reserved >= SLOT_CAPACITY };
};

const availabilityForDate = (database, dateKey, now = new Date(), method = "delivery", subtotal) => Object.fromEntries(
  slotsForDate(dateKey, method, database).map((slot) => {
    const status = method === "delivery" ? remainingDeliveryPlaces(database, dateKey, slot, now) : { full: false };
    const unavailableReason = validateServiceSlot(dateKey, slot, now, method, database, subtotal);
    const tooSoon = !validateServiceSlot(dateKey, slot, now, method, database) && Boolean(preparationError(dateKey, slot, now, method, subtotal));
    return [slot, { ...status, tooSoon, closed: Boolean(serviceClosureReason(dateKey, slot, method, database)), unavailable: Boolean(unavailableReason), unavailableReason,
      ...(method === "pickup" ? { pickupAdvanceEligible: qualifiesForAdvancePickup({ method, serviceDate: dateKey, slot, createdAt: now.toISOString() }) } : {}) }];
  })
);

module.exports = {
  SLOT_MINUTES, preparationMinutes, scheduleOverride, slotWindow, bookingWindow, windowsOverlap, storedServiceSlotOpen,
  serviceClosureReason,
  regularSlotsForDate,
  candidateSlots,
  PENDING_RESERVATION_MS,
  SLOT_CAPACITY,
  availabilityForDate,
  holdsDeliverySlot,
  parisDateKey,
  serviceSlotInstant,
  qualifiesForAdvancePickup,
  remainingDeliveryPlaces,
  slotsForDate,
  validateServiceDate,
  validateServiceSlot
};
