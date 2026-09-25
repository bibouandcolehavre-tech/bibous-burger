const { slotsForDate, validateServiceSlot, serviceClosureReason } = require("./availability");

const RESERVATION_STATUSES = ["pending", "confirmed", "cancelled"];
const RESERVATION_SLOT_CAPACITY = 2;

const normalizeReservationPhone = (value) => {
  const compact = String(value || "").replace(/[\s.()-]/g, "");
  if (/^0[1-9]\d{8}$/.test(compact)) return `+33${compact.slice(1)}`;
  if (/^\+33[1-9]\d{8}$/.test(compact)) return compact;
  return null;
};

const ensureReservationStore = (database) => {
  if (!Array.isArray(database.reservations)) database.reservations = [];
  if (!Number.isInteger(database.nextReservationNumber) || database.nextReservationNumber < 1) {
    database.nextReservationNumber = database.reservations.reduce((highest, reservation) => Math.max(highest, Number(reservation.number) || 0), 0) + 1;
  }
  return database;
};

// Two tables per half hour, shared between :00/:15 or :30/:45.
// Legacy interval reservations still consume capacity; no stored bookings are moved.
const reservationBucket = (slot) => {
  const match = /^(\d{2}):(\d{2})(?:$| – )/.exec(String(slot || ""));
  return match ? `${match[1]}:${Number(match[2]) < 30 ? "00" : "30"}` : null;
};
const holdsReservationSlot = (reservation, dateKey, slot) => reservation.serviceDate === dateKey && Boolean(reservationBucket(slot)) && reservationBucket(reservation.slot) === reservationBucket(slot) && reservation.status !== "cancelled";

const remainingReservationPlaces = (database, dateKey, slot) => {
  ensureReservationStore(database);
  const reserved = database.reservations.filter((reservation) => holdsReservationSlot(reservation, dateKey, slot)).length;
  return { capacity: RESERVATION_SLOT_CAPACITY, reserved, remaining: Math.max(0, RESERVATION_SLOT_CAPACITY - reserved), full: reserved >= RESERVATION_SLOT_CAPACITY };
};

const reservationAvailabilityForDate = (database, dateKey, now = new Date()) => Object.fromEntries(
  slotsForDate(dateKey, "reservation").map((slot) => {
    const status = remainingReservationPlaces(database, dateKey, slot);
    const unavailableReason = validateServiceSlot(dateKey, slot, now, "reservation");
    return [slot, { ...status, closed: Boolean(serviceClosureReason(dateKey, slot)), unavailable: Boolean(unavailableReason), unavailableReason }];
  })
);

const reservationsForCustomer = (database, customer) => {
  ensureReservationStore(database);
  const customerPhone = normalizeReservationPhone(customer?.phone);
  return database.reservations.filter((reservation) => reservation.customerId === customer?.id || (customerPhone && normalizeReservationPhone(reservation.phone) === customerPhone));
};

const createReservation = (database, input, now = new Date()) => {
  ensureReservationStore(database);
  const customerName = String(input.customerName || input.name || "").trim();
  const phone = normalizeReservationPhone(input.phone);
  const guests = Number(input.guests);
  const note = String(input.note || "").trim().slice(0, 500);

  if (customerName.length < 2) throw new Error("Indique ton nom pour réserver.");
  if (!phone) throw new Error("Indique un numéro de téléphone français valide.");
  if (!Number.isInteger(guests) || guests < 1 || guests > 4) throw new Error("Choisis entre 1 et 4 personnes.");
  const slotError = validateServiceSlot(input.serviceDate, input.slot, now, "reservation");
  if (slotError) throw new Error(slotError.replace("livraison", "réservation"));
  if (remainingReservationPlaces(database, input.serviceDate, input.slot).full) throw new Error("Ce créneau de réservation est complet.");

  const number = database.nextReservationNumber++;
  const reservation = {
    id: `reservation-${number}`,
    number,
    customerId: input.customerId || null,
    customerName,
    phone,
    guests,
    serviceDate: input.serviceDate,
    slot: input.slot,
    note,
    status: "pending",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  database.reservations.push(reservation);
  return reservation;
};

const updateReservationStatus = (database, id, status, now = new Date()) => {
  ensureReservationStore(database);
  if (!RESERVATION_STATUSES.includes(status)) throw new Error("Statut de réservation invalide.");
  const reservation = database.reservations.find((item) => item.id === id);
  if (!reservation) return null;
  if (reservation.status === "cancelled" && status !== "cancelled" && remainingReservationPlaces(database, reservation.serviceDate, reservation.slot).full) {
    throw new Error("Cette demi-heure est complète. Impossible de réactiver la réservation.");
  }
  reservation.status = status;
  reservation.updatedAt = now.toISOString();
  return reservation;
};

module.exports = {
  RESERVATION_SLOT_CAPACITY,
  RESERVATION_STATUSES,
  createReservation,
  ensureReservationStore,
  holdsReservationSlot,
  normalizeReservationPhone,
  remainingReservationPlaces,
  reservationAvailabilityForDate,
  reservationsForCustomer,
  updateReservationStatus
};
