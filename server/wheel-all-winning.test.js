const test = require('node:test'), assert = require('node:assert/strict');
const wheel = require('./wheel'), policy = require('./wheel-rewards-policy'), stb = require('./stb-tickets');
const now = new Date('2026-10-30T18:00:00Z');
const match = { id: 'orleans', opponent: 'Orléans LBA', startAt: '2026-11-06T19:00:00.000Z', opensAt: '2026-10-21T22:00:00.000Z', confirmed: true };
const activation = { rewardsVersion: 2, monthlyClassicEnabled: true, allSpinsWin: true };
function fixture(amount = 15) {
  const db = { wheel: wheel.defaultWheel(), customers: [{ id: 'fictional', points: 0 }], orders: [{ id: 'paid', customerId: 'fictional', subtotal: amount, total: amount, discount: 0, wheelEurosPerTurn: 15, status: 'confirmed', payment: { provider: 'sumup', status: 'PAID', paidAt: now.toISOString() } }], wheelSpins: [] };
  stb.configure(db, { enabled: true, rules: 'Règles fictives de test', matches: [match] });
  return db;
}
test('all 100 outcomes of all tiers win; rare lots replace points and all previous gifts remain possible', () => {
  for (const classic of [false, true]) for (const tickets of [false, true]) {
    for (const [tier, rows] of Object.entries(policy.segments({ allSpinsWin: true, classic, stb: tickets }))) {
      assert.equal(rows.reduce((n, [, weight]) => n + weight, 0), 100);
      assert(rows.every(([, weight]) => weight > 0));
      assert.equal(rows.filter(([id]) => id.startsWith('points-')).reduce((n, [, weight]) => n + weight, 0), 90 - Number(classic) - Number(tickets));
      for (const gift of ['drink', 'fries', 'dessert']) assert(rows.some(([id]) => id === gift));
      const outcomes = Array.from({ length: 100 }, (_, number) => wheel.prizeForNumber(number, tier, rows));
      assert(outcomes.every(prize => prize.id !== 'none'));
      assert.equal(outcomes.filter(p => p.id === 'classic').length, Number(classic));
      assert.equal(outcomes.filter(p => p.id === 'stb-tickets').length, Number(tickets));
    }
  }
});
test('activation is idempotent, requires no extra confirmation and preserves earned turns, former losses and STB entries', () => {
  const db = fixture(150); db.wheelSpins.push({ id: 'former-loss', customerId: 'fictional', orderId: 'paid', prizeId: 'none', awardedAt: now.toISOString() });
  db.stbTickets.entries = Array.from({ length: 33 }, (_, i) => ({ spinId: 'historical-' + i }));
  const before = structuredClone(db), turns = wheel.customerWheelState(db, 'fictional', now).available;
  assert.equal(policy.activate(db, activation, now), true); assert.equal(policy.activate(db, activation, now), false);
  assert.deepEqual(db.wheelSpins, before.wheelSpins); assert.deepEqual(db.stbTickets, before.stbTickets);
  assert.equal(wheel.customerWheelState(db, 'fictional', now).available, turns);
  assert.equal(db.wheel.startDate, before.wheel.startDate); assert.equal(db.wheel.endDate, before.wheel.endDate);
  assert.throws(() => policy.activate(db, { rewardsVersion: 2, monthlyClassicEnabled: true, confirmation: 'ACTIVER LA ROUE 80' }), /barème 100 %/);
});
test('real spin flow, displayed odds and coupon generation agree for every roll and tier', () => {
  for (const amount of [15, 45, 150]) for (let number = 0; number < 100; number++) {
    const db = fixture(amount); policy.activate(db, activation, now);
    const before = wheel.customerWheelState(db, 'fictional', now);
    assert.equal(before.winRatePercent, 100); assert.equal(before.stbTickets.active, true);
    assert(!before.rules.includes('20 % sans gain')); assert(!before.rules.includes('80 % de chances'));
    const input = { now, orderId: 'paid', requestId: 'fictional-spin-roll-' + number, randomInt: () => number };
    const result = wheel.spinWheel(db, 'fictional', input);
    assert.notEqual(result.spin.prizeId, 'none');
    assert.equal(result.spin.prizeId, wheel.prizeForNumber(number, result.spin.tier, before.segments[result.spin.tier]).id);
    if (result.spin.prizeId.startsWith('points-')) assert.equal(db.customers[0].points, result.spin.pointsAdded);
    if (['drink', 'fries', 'dessert'].includes(result.spin.prizeId)) assert.equal(db.merchantPromotions[0].type, {drink:'free_drink',fries:'free_fries',dessert:'free_dessert'}[result.spin.prizeId]);
    if (result.spin.prizeId === 'stb-tickets') assert.equal(db.stbTickets.awards[0].quantity, 2);
    assert.equal(wheel.spinWheel(db, 'fictional', input).spin.id, result.spin.id);
    assert.equal(db.wheelSpins.length, 1);
  }
});
test('STB fallback for 6 November awards both tickets once on 1 November at 19:55 Paris', () => {
  const db = fixture(150); policy.activate(db, activation, now);
  wheel.spinWheel(db, 'fictional', { now, orderId: 'paid', requestId: 'fictional-catchup', randomInt: () => 0 });
  assert.equal(db.stbTickets.awards.length, 0);
  const draw = new Date('2026-11-01T18:55:00.000Z'); assert.equal(stb.drawAt(match), +draw);
  assert.equal(wheel.reconcileStbTickets(db, draw, () => 0), true);
  assert.equal(db.stbTickets.awards[0].quantity, 2); assert.equal(db.stbTickets.awards[0].source, 'catch_up_draw');
  assert.equal(wheel.reconcileStbTickets(db, new Date(+draw + 60000), () => 0), false); assert.equal(db.stbTickets.awards.length, 1);
  assert.equal(stb.availableMatch(db, new Date(+draw + 60000)), null);
});
