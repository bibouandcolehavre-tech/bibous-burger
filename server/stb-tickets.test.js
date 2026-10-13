const test = require('node:test'), assert = require('node:assert/strict');
const stb = require('./stb-tickets'), wheel = require('./wheel');
const now = new Date('2026-10-12T17:00:00Z');
const match = { id: 'home-denain', opponent: 'Denain', startAt: '2026-10-24T18:00:00Z', opensAt: '2026-10-12T12:00:00Z', confirmed: true };
test('STB : calendrier officiel à 20 h Paris, limite cinq jours avant ; préparation toujours inactive', () => {
  const schedule = require('./stb-schedule-draft.json');
  assert.equal(schedule.confirmed, true); assert.equal(schedule.enabled, false);
  for (const m of schedule.matches) {
    const clock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(m.startAt));
    assert.equal(clock, '20:00'); assert.equal(Date.parse(m.startAt) - Date.parse(m.deadlineAt), 5 * 86400000);
  }
  const quimper = schedule.matches.find(m => m.opponent === 'UJAP Quimper'); assert(Date.parse(quimper.deadlineAt) < Date.parse('2026-10-13T12:00:00Z'));
  assert.equal(schedule.matches.find(m => m.opponent === 'Denain VB').deadlineAt, '2026-10-19T18:00:00.000Z');
  assert.equal(stb.availableMatch({}, new Date('2026-10-13T12:00:00Z')), null);
});
function setup() {
  const db = { customers: [{ id: 'c1', points: 0 }], orders: [{ id: 'o1', customerId: 'c1', status: 'confirmed', subtotal: 30, total: 30, discount: 0, wheelEurosPerTurn: 15, payment: { provider: 'sumup', status: 'PAID', paidAt: now.toISOString() } }], wheelSpins: [] };
  stb.configure(db, { enabled: true, confirmation: 'ACTIVER LES LOTS STB', rules: 'Lot de deux places remis ensemble par le restaurant. Aucun concours de classement ouvert.', matches: [match] }); return db;
}
test('STB: disabled by default and activation requires confirmed schedule and rules', () => {
  assert.equal(stb.availableMatch({}, now), null);
  assert.throws(() => stb.configure({}, { enabled: true, rules: '', matches: [match] }));
  assert.throws(() => stb.configure({}, { enabled: true, confirmation: 'ACTIVER LES LOTS STB', rules: 'Règles', matches: [{ ...match, confirmed: false }] }));
});
test('STB: exactly one winner gets both tickets, standard odds sum to 100 and replay never duplicates an award', () => {
  const db = setup(), state = wheel.customerWheelState(db, 'c1', now);
  for (const segments of Object.values(state.segments)) assert.equal(segments.reduce((sum, [, n]) => sum + n, 0), 100);
  const input = { requestId: 'test-stb-spin-001', orderId: 'o1', now, randomInt: () => 0 };
  const result = wheel.spinWheel(db, 'c1', input); assert.equal(result.spin.prizeId, 'stb-tickets'); assert.equal(db.stbTickets.awards[0].quantity, 2);
  wheel.spinWheel(db, 'c1', input); assert.equal(db.stbTickets.awards.length, 1);
  wheel.spinWheel(db, 'c1', { ...input, requestId: 'test-stb-spin-002' }); assert.equal(db.stbTickets.awards.length, 1);
  assert.equal(stb.customerState(db, 'c1', now).awards.length, 1); assert.equal(stb.customerState(db, 'other', now).awards.length, 0);
});
test('STB: catch-up occurs before five-day deadline, excludes cancelled orders, no invented winner and no late backdating', () => {
  const db = setup(); wheel.spinWheel(db, 'c1', { requestId: 'test-stb-lose-001', orderId: 'o1', now, randomInt: () => 10 });
  const draw = new Date(stb.drawAt(match)); assert.equal(wheel.reconcileStbTickets(db, draw, () => 0), true);
  assert.equal(db.stbTickets.awards[0].source, 'catch_up_draw'); assert(Date.parse(match.startAt) - Date.parse(db.stbTickets.awards[0].awardedAt) >= 5 * 86400000);
  assert.equal(wheel.reconcileStbTickets(db, draw, () => 0), false);
  const cancelled = setup(); wheel.spinWheel(cancelled, 'c1', { requestId: 'test-stb-lose-002', orderId: 'o1', now, randomInt: () => 10 }); cancelled.orders[0].status = 'cancelled';
  assert.equal(wheel.reconcileStbTickets(cancelled, draw, () => 0), false); assert.equal(cancelled.stbTickets.awards.length, 0);
  const late = setup(); wheel.spinWheel(late, 'c1', { requestId: 'test-stb-lose-003', orderId: 'o1', now, randomInt: () => 10 });
  assert.equal(wheel.reconcileStbTickets(late, new Date(stb.cutoff(match) + 1), () => 0), false);
});
