const test = require('node:test');
const assert = require('node:assert/strict');
const availability = require('./availability');
const reservations = require('./reservations');
const schedule = require('./service-schedule');
const { publicNews } = require('./news');
const now = new Date('2026-10-11T12:00:00Z');
const sundays = ['2026-10-11', '2026-10-18'];

test('dimanche soir : les créneaux de table sont absents sur les deux grilles', () => {
  for (const date of sundays) for (const grid of [15, 20]) {
    assert.deepEqual(availability.slotsForDate(date, 'reservation', {}, grid), []);
    assert.deepEqual(reservations.reservationAvailabilityForDate({}, date, now, grid), {});
    assert.match(availability.validateServiceSlot(date, '19:00', now, 'reservation', {}, undefined, grid), /dimanche soir/);
  }
});

test('les anciens réglages ne peuvent pas rouvrir une table le dimanche soir', () => {
  const date = sundays[0];
  const db = { serviceSchedule: { dates: { [date]: { revision: 1, slotMinutes: 20,
    services: { reservation: { '19:00': true, '20:40': true, '22:00': true, '12:00': true } } } } } };
  const before = JSON.stringify(db);
  for (const grid of [15, 20]) {
    const slots = availability.slotsForDate(date, 'reservation', db, grid);
    assert.equal(slots.includes('12:00'), true, 'une ouverture de midi reste possible');
    assert.equal(slots.some(slot => slot >= '19:00'), false);
  }
  assert.equal(availability.scheduleOverride(db, date, '19:00', 'reservation'), false);
  const state = schedule.dashboard(db, date, now);
  assert.equal(state.services.reservation.find(row => row.slot === '19:00').open, false);
  assert.equal(JSON.stringify(db), before, 'lecture sans modification des réglages existants');
  const draft = { date, revision: state.revision, services: Object.fromEntries(Object.entries(state.services)
    .map(([method, rows]) => [method, Object.fromEntries(rows.map(row => [row.slot, row.open]))])) };
  draft.services.reservation['19:00'] = true;
  assert.throws(() => schedule.save(db, draft, now), /dimanche soir/);
  assert.equal(JSON.stringify(db), before);
});

test('livraison et click & collect restent disponibles le dimanche de 19 h à 21 h', () => {
  for (const date of sundays) for (const method of ['pickup', 'delivery']) for (const grid of [15, 20]) {
    const slots = availability.slotsForDate(date, method, {}, grid);
    assert.equal(slots.length, grid === 20 ? 6 : method === 'pickup' ? 8 : 4);
    assert.equal(slots[0].slice(0, 5), '19:00');
    assert.equal(availability.validateServiceSlot(date, slots[0], now, method, {}, 10, grid), null);
    assert.equal(availability.serviceClosureReason(date, slots[0], method), null);
  }
  assert.doesNotMatch(publicNews({}, now).items[0].title, /Fermé exceptionnellement/);
});

test('les réservations des autres jours restent possibles', () => {
  for (const date of ['2026-10-12', '2026-10-17', '2026-10-23']) for (const grid of [15, 20]) {
    assert.equal(availability.slotsForDate(date, 'reservation', {}, grid).includes('19:00'), true);
    assert.equal(availability.validateServiceSlot(date, '19:00', now, 'reservation', {}, undefined, grid), null);
  }
  assert.equal(availability.recurringServiceClosureReason('invalid', '19:00', 'reservation'), null);
  assert.equal(availability.recurringServiceClosureReason(sundays[0], 'invalid', 'reservation'), null);
});

test('aucune nouvelle table dimanche soir, sans annuler ni déplacer les tables payées', () => {
  const date = sundays[0];
  const paid = { id: 'existing-table', number: 9, serviceDate: date, slot: '20:40',
    slotDurationMinutes: 20, status: 'confirmed', payment: { status: 'PAID' }, deposit: { amount: 40 } };
  const db = { reservations: [paid], nextReservationNumber: 10 };
  const before = JSON.stringify(db);
  for (const slotGrid of [15, 20]) assert.throws(() => reservations.createReservation(db, {
    name: 'Client fictif', phone: '0600000000', guests: 2, serviceDate: date, slot: '19:00', slotGrid,
  }, now), /dimanche soir/);
  assert.equal(JSON.stringify(db), before);
  assert.equal(availability.storedServiceSlotOpen({ method: 'reservation', serviceDate: date, slot: '19:00' }, db), false);
  assert.equal(availability.storedServiceSlotOpen({ method: 'pickup', serviceDate: date, slot: '19:00', tableReservationId: paid.id }, db), false);
  assert.equal(availability.storedServiceSlotOpen({ method: 'pickup', serviceDate: date, slot: '19:00' }, db), true);
});
