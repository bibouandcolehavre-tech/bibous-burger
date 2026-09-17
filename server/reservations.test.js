const test = require("node:test");
const assert = require("node:assert/strict");
const { createReservation, ensureReservationStore, normalizeReservationPhone, reservationAvailabilityForDate, updateReservationStatus } = require("./reservations");

test("normalise les numéros de téléphone français", () => {
  assert.equal(normalizeReservationPhone("06 12 34 56 78"), "+33612345678");
  assert.equal(normalizeReservationPhone("02 35 12 34 56"), "+33235123456");
  assert.equal(normalizeReservationPhone("123"), null);
});

test("crée une demande de réservation numérotée et en attente", () => {
  const database = { reservations: [], nextReservationNumber: 12 };
  const now = new Date("2026-09-17T09:00:00.000Z");
  const reservation = createReservation(database, {
    name: "Hélène Martin",
    phone: "06 12 34 56 78",
    guests: 4,
    serviceDate: "2026-09-18",
    slot: "19:00 – 19:30",
    note: "Près de la fenêtre"
  }, now);

  assert.equal(reservation.id, "reservation-12");
  assert.equal(reservation.status, "pending");
  assert.equal(reservation.guests, 4);
  assert.equal(database.nextReservationNumber, 13);
});

test("refuse un nombre de personnes invalide", () => {
  assert.throws(() => createReservation({}, {
    name: "Hélène",
    phone: "06 12 34 56 78",
    guests: 5,
    serviceDate: "2026-09-18",
    slot: "19:00 – 19:30"
  }, new Date("2026-09-17T09:00:00.000Z")), /entre 1 et 4/);
});

test("retrouve le prochain numéro et met à jour le statut", () => {
  const database = { reservations: [{ id: "reservation-8", number: 8, status: "pending" }] };
  ensureReservationStore(database);
  assert.equal(database.nextReservationNumber, 9);
  const updated = updateReservationStatus(database, "reservation-8", "confirmed", new Date("2026-09-17T10:00:00.000Z"));
  assert.equal(updated.status, "confirmed");
});

test("limite chaque tranche de 30 minutes à deux réservations", () => {
  const database = { reservations: [], nextReservationNumber: 1 };
  const now = new Date("2026-09-17T09:00:00.000Z");
  const input = { name: "Client test", phone: "06 12 34 56 78", guests: 2, serviceDate: "2026-09-18", slot: "19:00 – 19:30" };
  createReservation(database, input, now);
  createReservation(database, { ...input, name: "Deuxième client" }, now);

  const availability = reservationAvailabilityForDate(database, input.serviceDate, now);
  assert.equal(availability[input.slot].remaining, 0);
  assert.equal(availability[input.slot].full, true);
  assert.throws(() => createReservation(database, { ...input, name: "Troisième client" }, now), /complet/);

  updateReservationStatus(database, "reservation-1", "cancelled", now);
  assert.equal(reservationAvailabilityForDate(database, input.serviceDate, now)[input.slot].remaining, 1);
});
