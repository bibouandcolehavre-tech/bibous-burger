const test = require('node:test');
const assert = require('node:assert/strict');
const { slotAlreadyStarted } = require('../client-slots');
const { validateServiceSlot } = require('./availability');

test('à 19 h 48 au Havre, 19 h 45 est passé mais 20 h reste proposé', () => {
  const now = new Date('2026-10-01T17:48:00Z');
  assert.equal(slotAlreadyStarted('2026-10-01', '19:45', now), true);
  assert.equal(slotAlreadyStarted('2026-10-01', '20:00', now), false);
  assert.match(validateServiceSlot('2026-10-01', '19:45', now, 'pickup'), /déjà passé/);
  assert.equal(validateServiceSlot('2026-10-01', '20:00', now, 'pickup'), null);
});

test('le créneau devient indisponible dès son heure de début, été comme hiver', () => {
  assert.equal(slotAlreadyStarted('2026-10-01', '19:45', new Date('2026-10-01T17:44:59Z')), false);
  assert.equal(slotAlreadyStarted('2026-10-01', '19:45', new Date('2026-10-01T17:45:00Z')), true);
  assert.equal(slotAlreadyStarted('2026-12-01', '19:45', new Date('2026-12-01T18:45:00Z')), true);
  assert.equal(slotAlreadyStarted('2026-10-02', '12:00', new Date('2026-10-01T17:48:00Z')), false);
});
