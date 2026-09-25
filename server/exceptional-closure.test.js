const test = require('node:test');
const assert = require('node:assert/strict');
const { slotsForDate, validateServiceSlot, availabilityForDate, serviceClosureReason } = require('./availability');
const { reservationAvailabilityForDate, createReservation } = require('./reservations');
const now = new Date('2026-09-25T08:00:00Z');

test('September 25 evening is closed for delivery, pickup and tables, while lunch remains open', () => {
  for (const method of ['delivery', 'pickup', 'reservation']) {
    const statuses = method === 'reservation'
      ? reservationAvailabilityForDate({}, '2026-09-25', now)
      : availabilityForDate({}, '2026-09-25', now, method);
    for (const slot of slotsForDate('2026-09-25', method)) {
      const evening = slot.slice(0, 5) >= '19:00';
      assert.equal(statuses[slot].closed, evening);
      assert.equal(statuses[slot].unavailable, evening);
      if (evening) assert.match(validateServiceSlot('2026-09-25', slot, now, method), /exceptionnellement fermé/);
      else assert.equal(validateServiceSlot('2026-09-25', slot, now, method), null);
    }
  }
});

test('closure expires by date and leaves Saturday, Sunday and following Friday open', () => {
  for (const date of ['2026-09-26', '2026-09-27', '2026-10-02']) {
    for (const method of ['delivery', 'pickup', 'reservation']) {
      const slot = method === 'delivery' ? '19:00 – 19:30' : '19:00';
      assert.equal(serviceClosureReason(date, slot), null);
      assert.equal(validateServiceSlot(date, slot, now, method), null);
    }
  }
});

test('a direct table reservation for the closed evening is rejected without recording a booking', () => {
  const database = { reservations: [] };
  assert.throws(() => createReservation(database, {
    customerName: 'Test', phone: '0612345678', guests: 2,
    serviceDate: '2026-09-25', slot: '19:15'
  }, now), /exceptionnellement fermé/);
  assert.equal(database.reservations.length, 0);
});
