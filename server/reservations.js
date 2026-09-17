const { validateServiceSlot } = require("./availability");

const RESERVATION_STATUSES = ["pending", "confirmed", "cancelled"];

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

const createReservation = (database, input, now = new Date()) => {
  ensureReservationStore(database);
  const customerName = String(input.customerName || input.name || "").trim();
  const phone = normalizeReservationPhone(input.phone);
  const guests = Number(input.guests);
  const note = String(input.note || "").trim().slice(0, 500);

  if (customerName.length < 2) throw new Error("Indique ton nom pour réserver.");
  if (!phone) throw new Error("Indique un numéro de téléphone français valide.");
  if (!Number.isInteger(guests) || guests < 1 || guests > 12) throw new Error("Choisis entre 1 et 12 personnes.");
  const slotError = validateServiceSlot(input.serviceDate, input.slot, now);
  if (slotError) throw new Error(slotError.replace("livraison", "réservation"));

  const number = database.nextReservationNumber++;
  const reservation = {
    id: `reservation-${number}`,
    number,
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
  reservation.status = status;
  reservation.updatedAt = now.toISOString();
  return reservation;
};

module.exports = {
  RESERVATION_STATUSES,
  createReservation,
  ensureReservationStore,
  normalizeReservationPhone,
  updateReservationStatus
};
