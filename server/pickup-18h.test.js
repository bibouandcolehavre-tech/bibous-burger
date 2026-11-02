const test = require('node:test'), assert = require('node:assert/strict');
const a = require('./availability'), schedule = require('./service-schedule');
const now = new Date('2026-11-02T08:00:00Z');
test('pickup from 18h every weekday, both installed protocols, with existing noon/end hours and delivery/table policy preserved',()=>{
  for(let day=2;day<=15;day++) {
    const date = new Date(Date.UTC(2026,10,day)).toISOString().slice(0,10);
    const weekday = new Date(date+'T12:00:00Z').getUTCDay();
    for(const grid of [20,15]) {
      const pickup = a.availabilityForDate({},date,now,'pickup',15,grid);
      for(const slot of ['18:00',grid===20?'18:20':'18:15',grid===20?'18:40':'18:45']) assert.equal(pickup[slot].unavailable,false,`${date} ${grid} ${slot}`);
      assert.equal(pickup['17:45'],undefined);
      assert.equal(Boolean(pickup['12:00']),weekday!==0&&weekday!==6);
      assert.equal(Boolean(pickup['21:00']),weekday!==0);
      assert.equal(pickup['22:00'],undefined);
      const delivery = a.slotsForDate(date,'delivery',{},grid), tables = a.slotsForDate(date,'reservation',{},grid);
      assert.ok(!delivery.some(slot=>slot>='14:00'&&slot<'19:00'));
      assert.ok(!tables.some(slot=>slot>='18:00'&&slot<'19:00'));
    }
    const state=schedule.dashboard({},date,now);
    assert.ok(state.services.delivery.filter(row=>row.slot>='14:00'&&row.slot<'19:00').every(row=>!row.open&&!row.standard));
    assert.ok(state.services.pickup.filter(row=>row.slot>='18:00'&&row.slot<'19:00').every(row=>row.open&&row.standard));
  }
});
test('date-specific pickup closure still overrides the new regular 18h service; old 19h bookings remain valid',()=>{
  const date='2026-11-03';
  const db={serviceSchedule:{dates:{[date]:{slotMinutesByMethod:{pickup:20},services:{pickup:{'18:20':false}}}}}};
  assert.equal(a.availabilityForDate(db,date,now,'pickup',undefined,20)['18:20'].closed,true);
  assert.equal(a.availabilityForDate(db,date,now,'pickup',undefined,20)['18:00'].unavailable,false);
  assert.equal(a.storedServiceSlotOpen({method:'pickup',serviceDate:date,slot:'19:20',slotDurationMinutes:20},db),true);
});
