const SLOT_CAPACITY = 2;
const PENDING_RESERVATION_MS = 15 * 60 * 1000;
const TIME_ZONE = "Europe/Paris";

const WEEKDAY_SLOTS = {
  0: ["19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00"],
  1: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"],
  2: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"],
  3: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"],
  4: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"],
  5: ["12:00 – 12:30", "12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00", "19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"],
  6: ["19:00 – 19:30", "19:30 – 20:00", "20:00 – 20:30", "20:30 – 21:00", "21:00 – 21:30", "21:30 – 22:00"]
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

const slotsForDate = (dateKey) => {
  const date = dateFromKey(dateKey);
  return date ? WEEKDAY_SLOTS[date.getUTCDay()] || [] : [];
};

const validateServiceDate = (dateKey, now = new Date()) => {
  const date = dateFromKey(dateKey);
  if (!date) return "Choisis une date de livraison valide.";
  const today = dateFromKey(parisDateKey(now));
  const differenceInDays = Math.round((date - today) / 86400000);
  if (differenceInDays < 0 || differenceInDays > 13) return "Choisis une date comprise dans les deux prochaines semaines.";
  return null;
};

const validateServiceSlot = (dateKey, slot, now = new Date()) => {
  const dateError = validateServiceDate(dateKey, now);
  if (dateError) return dateError;
  if (!slotsForDate(dateKey).includes(slot)) return "Ce créneau n’est pas disponible ce jour-là.";
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
  return null;
};

const holdsDeliverySlot = (order, dateKey, slot, now = new Date()) => {
  if (order.method !== "delivery" || order.serviceDate !== dateKey || order.slot !== slot || order.status === "cancelled") return false;
  if (order.payment?.status === "PAID") return true;
  if (order.status !== "awaiting_payment") return false;
  const createdAt = new Date(order.createdAt).getTime();
  return Number.isFinite(createdAt) && now.getTime() - createdAt < PENDING_RESERVATION_MS;
};

const remainingDeliveryPlaces = (database, dateKey, slot, now = new Date()) => {
  const reserved = (database.orders || []).filter((order) => holdsDeliverySlot(order, dateKey, slot, now)).length;
  return { capacity: SLOT_CAPACITY, reserved, remaining: Math.max(0, SLOT_CAPACITY - reserved), full: reserved >= SLOT_CAPACITY };
};

const availabilityForDate = (database, dateKey, now = new Date()) => Object.fromEntries(
  slotsForDate(dateKey).map((slot) => {
    const status = remainingDeliveryPlaces(database, dateKey, slot, now);
    const unavailableReason = validateServiceSlot(dateKey, slot, now);
    return [slot, { ...status, unavailable: Boolean(unavailableReason), unavailableReason }];
  })
);

module.exports = {
  PENDING_RESERVATION_MS,
  SLOT_CAPACITY,
  availabilityForDate,
  holdsDeliverySlot,
  parisDateKey,
  remainingDeliveryPlaces,
  slotsForDate,
  validateServiceDate,
  validateServiceSlot
};
