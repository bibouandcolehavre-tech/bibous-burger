const test = require('node:test');
const assert = require('node:assert/strict');
const { regularSlotsForDate } = require('./availability');
const { publicNews } = require('./news');

const date = '2026-10-04';
const tonight = new Date('2026-10-04T16:00:00Z');
const closedSlots = method => Object.fromEntries(
  regularSlotsForDate(date, method).filter(slot => slot >= '18:00').map(slot => [slot, false])
);
const database = () => ({ serviceSchedule: { dates: { [date]: { slotMinutes: 20, services: {
  pickup: closedSlots('pickup'), delivery: closedSlots('delivery'), reservation: closedSlots('reservation')
} } } } });

test('Fermeture totale de ce soir annoncée aux anciens clients et retirée demain', () => {
  const db = database();
  const notice = publicNews(db, tonight).items[0];
  assert.equal(notice.id, 'contest');
  assert.equal(notice.kind, 'note');
  assert.match(notice.title, /Fermé exceptionnellement ce soir/);
  assert.match(notice.subtitle, /click & collect, de livraison ni de réservation de table/);
  assert.doesNotMatch(publicNews(db, new Date('2026-10-04T22:00:00Z')).items[0].title, /Fermé exceptionnellement/);
});

test('Une fermeture partielle ne s’annonce pas comme fermeture totale', () => {
  const db = database();
  db.serviceSchedule.dates[date].services.reservation['19:00'] = true;
  assert.doesNotMatch(publicNews(db, tonight).items[0].title, /Fermé exceptionnellement/);
});
