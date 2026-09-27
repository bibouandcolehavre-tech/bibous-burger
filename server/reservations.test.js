const test = require("node:test");
const assert = require("node:assert/strict");
const { createReservation, ensureReservationStore, normalizeReservationPhone, reservationAvailabilityForDate, reservationsForCustomer, updateReservationStatus } = require("./reservations");

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
    slot: "19:00",
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
    slot: "19:00"
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
  const input = { name: "Client test", phone: "06 12 34 56 78", guests: 2, serviceDate: "2026-09-18", slot: "19:00" };
  createReservation(database, input, now);
  createReservation(database, { ...input, slot: "19:15", name: "Deuxième client" }, now);

  const availability = reservationAvailabilityForDate(database, input.serviceDate, now);
  assert.equal(availability[input.slot].remaining, 0);
  assert.equal(availability[input.slot].full, true);
  assert.equal(availability["19:15"].full, true);
  assert.equal(availability["19:30"].remaining, 2);
  assert.throws(() => createReservation(database, { ...input, name: "Troisième client" }, now), /complet/);

  updateReservationStatus(database, "reservation-1", "cancelled", now);
  assert.equal(reservationAvailabilityForDate(database, input.serviceDate, now)[input.slot].remaining, 1);
  assert.equal(reservationAvailabilityForDate(database, input.serviceDate, now)["19:15"].remaining, 1);
});

test("les anciennes réservations par intervalle continuent à bloquer la demi-heure", () => {
  const database = { reservations: [{ serviceDate: "2026-09-18", slot: "19:00 – 19:30", status: "confirmed" }] };
  const now = new Date("2026-09-17T09:00:00Z");
  const slots = reservationAvailabilityForDate(database, "2026-09-18", now);
  assert.equal(slots["19:00"].remaining, 1);
  assert.equal(slots["19:15"].remaining, 1);
  assert.equal(slots["19:30"].remaining, 2);
  assert.equal(slots["19:00 – 19:30"], undefined);
});

test("les nouvelles tables refusent les intervalles et les heures passées", () => {
  const input = { name: "Client test", phone: "06 12 34 56 78", guests: 2, serviceDate: "2026-09-18", slot: "12:00 – 12:30" };
  const now = new Date("2026-09-18T10:00:00Z");
  assert.throws(() => createReservation({}, input, now), /pas disponible/);
  assert.throws(() => createReservation({}, { ...input, slot: "12:00" }, now), /déjà passé/);
  assert.equal(createReservation({}, { ...input, slot: "12:15" }, now).slot, "12:15");
});

test("retrouve uniquement les réservations du client connecté", () => {
  const database = { reservations: [
    { id: "reservation-1", customerId: "customer-1", phone: "+33612345678" },
    { id: "reservation-2", customerId: null, phone: "06 12 34 56 78" },
    { id: "reservation-3", customerId: "customer-2", phone: "+33699999999" }
  ] };
  const results = reservationsForCustomer(database, { id: "customer-1", phone: "+33612345678" });
  assert.deepEqual(results.map((reservation) => reservation.id), ["reservation-1", "reservation-2"]);
});

test("réactiver une réservation annulée ne dépasse pas la capacité partagée", () => {
  const now = new Date("2026-09-17T09:00:00Z");
  const input = { name: "Client fictif", phone: "0600000000", guests: 2, serviceDate: "2026-09-18", slot: "19:00" };
  const db = {};
  const old = createReservation(db, input, now);
  updateReservationStatus(db, old.id, "cancelled", now);
  createReservation(db, input, now);
  createReservation(db, { ...input, slot: "19:15" }, now);
  assert.throws(() => updateReservationStatus(db, old.id, "confirmed", now), /complète/);
  assert.equal(old.status, "cancelled");
});
