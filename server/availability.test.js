const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PENDING_RESERVATION_MS,
  availabilityForDate: availabilityForDateOnGrid,
  remainingDeliveryPlaces,
  serviceSlotInstant,
  qualifiesForAdvancePickup,
  slotsForDate: slotsForDateOnGrid,
  validateServiceSlot: validateServiceSlotOnGrid
} = require("./availability");
const slotsForDate = (date, method = 'delivery', database = {}) => slotsForDateOnGrid(date, method, database, 20);
const availabilityForDate = (database, date, now, method = 'delivery', subtotal) => availabilityForDateOnGrid(database, date, now, method, subtotal, 20);
const validateServiceSlot = (date, slot, now, method = 'delivery', database = {}, subtotal) => validateServiceSlotOnGrid(date, slot, now, method, database, subtotal, 20);

const dateKey = "2026-09-18";
const slot = "19:00";
const now = new Date("2026-09-17T12:00:00Z");
const order = (overrides = {}) => ({
  id: Math.random().toString(),
  method: "delivery",
  serviceDate: dateKey,
  slot,
  status: "awaiting_payment",
  createdAt: new Date(now.getTime() - 60_000).toISOString(),
  payment: { status: "PENDING" },
  ...overrides
});

test("propose les horaires correspondant au jour choisi", () => {
  assert.ok(slotsForDate(dateKey).includes(slot));
  assert.equal(validateServiceSlot(dateKey, slot, now), null);
  assert.match(validateServiceSlot("2026-09-18", "15:00 – 15:30", now), /pas disponible/);
});

test("refuse un horaire déjà passé le jour même", () => {
  assert.match(validateServiceSlot("2026-09-17", "12:00", new Date("2026-09-17T14:30:00Z")), /déjà passé/);
});

test("bloque le troisième créneau de livraison", () => {
  const database = { orders: [order(), order({ id: "second" })] };
  assert.deepEqual(remainingDeliveryPlaces(database, dateKey, slot, now), { capacity: 2, reserved: 2, remaining: 0, full: true });
  assert.equal(availabilityForDate(database, dateKey, now)[slot].full, true);
});

test("libère une réservation impayée après quinze minutes", () => {
  const expired = order({ createdAt: new Date(now.getTime() - PENDING_RESERVATION_MS - 1).toISOString() });
  assert.equal(remainingDeliveryPlaces({ orders: [expired] }, dateKey, slot, now).remaining, 2);
});

test("conserve une commande payée et libère une commande annulée", () => {
  const paid = order({ payment: { status: "PAID" }, createdAt: "2026-09-01T10:00:00Z", status: "confirmed" });
  const cancelled = order({ id: "cancelled", payment: { status: "PAID" }, status: "cancelled" });
  assert.equal(remainingDeliveryPlaces({ orders: [paid, cancelled] }, dateKey, slot, now).remaining, 1);
});

test("les retraits ne consomment aucune place de livraison", () => {
  const database = { orders: [order({ method: "pickup" }), order({ id: "pickup-2", method: "pickup" })] };
  assert.equal(remainingDeliveryPlaces(database, dateKey, slot, now).remaining, 2);
});

test("retrait, livraison et tables : trois créneaux fixes par heure", () => {
  for (const method of ["pickup", "reservation", "delivery"]) {
    const slots = slotsForDate(dateKey, method);
    assert.deepEqual(slots.slice(0, 4), ["12:00", "12:20", "12:40", "13:00"]);
    assert.equal(slots.length, 15);
    assert.equal(slots.at(-1), "21:40");
    assert.equal(slots.includes("14:00"), false);
    assert.equal(slots.includes("22:00"), false);
    assert.equal(validateServiceSlot(dateKey, "12:20", now, method), null);
    assert.match(validateServiceSlot(dateKey, "12:00 – 12:30", now, method), /pas disponible/);
    assert.match(validateServiceSlot(dateKey, "12:10", now, method), /pas disponible/);
    assert.equal(slotsForDate("2026-09-19", method)[0], "19:00");
    assert.equal(slotsForDate("2026-09-20", method).at(-1), "20:40");
  }
  assert.equal(slotsForDate(dateKey).length, 15);
  assert.equal(validateServiceSlot(dateKey, slot, now), null);
  assert.match(validateServiceSlot(dateKey, "19:15", now), /pas disponible/);
});

test("bonus retrait : limite exacte de 30 minutes, heure de Paris été/hiver", () => {
  for (const [date, utc] of [["2026-09-18", "17:00"], ["2026-12-18", "18:00"], ["2026-03-29", "17:00"], ["2026-10-25", "18:00"]]) {
    const arrival = serviceSlotInstant(date, "19:00");
    assert.equal(arrival.toISOString(), date + "T" + utc + ":00.000Z");
    const pickup = { method: "pickup", serviceDate: date, slot: "19:00", createdAt: new Date(+arrival - 1800000).toISOString() };
    assert.equal(qualifiesForAdvancePickup(pickup), true);
    assert.equal(qualifiesForAdvancePickup({ ...pickup, createdAt: new Date(+arrival - 1799999).toISOString() }), false);
    assert.equal(qualifiesForAdvancePickup({ ...pickup, method: "delivery" }), false);
    assert.equal(qualifiesForAdvancePickup({ ...pickup, createdAt: "invalid" }), false);
    assert.equal(qualifiesForAdvancePickup({ ...pickup, slot: "19:00 – 19:30" }), false);
  }
});

test("disponibilité retrait : passé désactivé et bonus informatif côté serveur", () => {
  const slots = availabilityForDate({}, dateKey, new Date("2026-09-18T09:45:00Z"), "pickup");
  assert.equal(slots["12:00"].pickupAdvanceEligible, false);
  assert.equal(slots["12:20"].pickupAdvanceEligible, true);
  assert.equal(slots["12:20"].unavailable, false);
  assert.equal(availabilityForDate({}, dateKey, new Date("2026-09-18T10:20:00Z"), "pickup")["12:20"].unavailable, true);
});
