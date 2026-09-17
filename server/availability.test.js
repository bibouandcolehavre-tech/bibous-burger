const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PENDING_RESERVATION_MS,
  availabilityForDate,
  remainingDeliveryPlaces,
  slotsForDate,
  validateServiceSlot
} = require("./availability");

const dateKey = "2026-09-18";
const slot = "19:00 – 19:30";
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
  assert.match(validateServiceSlot("2026-09-17", "12:00 – 12:30", new Date("2026-09-17T14:30:00Z")), /déjà passé/);
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
