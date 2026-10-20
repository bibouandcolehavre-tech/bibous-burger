const test = require('node:test'), assert = require('node:assert/strict');
const a = require('./availability'), schedule = require('./service-schedule');
const date = '2026-10-20', now = new Date('2026-10-20T08:00:00Z');
test('une livraison de quinze minutes ne consomme pas la place du quart d’heure suivant', () => {
  const order = { serviceDate: date, method: 'delivery', slot: '19:00', slotDurationMinutes: 15, status: 'confirmed', payment: { status: 'PAID' } };
  const db = { orders: [order, { ...order }, { ...order }] }, before = JSON.stringify(db);
  assert.equal(a.remainingDeliveryPlaces(db, date, '19:00', now).full, true);
  assert.equal(a.remainingDeliveryPlaces(db, date, '19:15', now).remaining, 3);
  assert.equal(a.storedServiceSlotOpen(order, db), true);
  assert.equal(JSON.stringify(db), before);
});
test('une fermeture enregistrée à quinze minutes ne ferme pas le quart d’heure voisin', () => {
  const db = {}, state = schedule.dashboard(db, date, now);
  const input = { date, revision: 0, services: Object.fromEntries(Object.entries(state.services)
    .map(([method, rows]) => [method, Object.fromEntries(rows.map(row => [row.slot, row.open]))])) };
  input.services.delivery['19:15'] = false; schedule.save(db, input, now);
  const restored = JSON.parse(JSON.stringify(db));
  assert.deepEqual(restored.serviceSchedule.dates[date].slotMinutesByMethod, { pickup: 20, delivery: 15, reservation: 20 });
  const slots = a.availabilityForDate(restored, date, now, 'delivery', 10, 20);
  assert.equal(slots['19:00'].closed, false); assert.equal(slots['19:15'].closed, true); assert.equal(slots['19:30'].closed, false);
  assert.equal(a.validateServiceSlot(date, '19:20', now, 'pickup', restored, 10, 20), null);
});
test('une fermeture historique à vingt minutes reste appliquée sans modifier les réglages', () => {
  const db = { serviceSchedule: { dates: { [date]: { revision: 4, slotMinutes: 20, services: { delivery: { '19:20': false } } } } } };
  const before = JSON.stringify(db), slots = a.availabilityForDate(db, date, now, 'delivery', 10, 20);
  assert.equal(slots['19:15'].closed, true); assert.equal(slots['19:30'].closed, true); assert.equal(slots['19:45'].closed, false);
  assert.equal(JSON.stringify(db), before);
});
