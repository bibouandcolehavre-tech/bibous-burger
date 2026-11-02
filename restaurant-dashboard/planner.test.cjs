const test = require('node:test');
const assert = require('node:assert/strict');
const planner = require('./planner');
const schedule = require('../server/service-schedule');
const availability = require('../server/availability');
const now = new Date('2026-11-02T08:00:00Z');
const dates = Array.from({length:14},(_,i)=>new Date(Date.UTC(2026,10,2+i)).toISOString().slice(0,10));
const input = (date, data, draft) => ({date, revision:data.revision, services:draft});

test('order groups cover every exact slot once; afternoon is 14:00 inclusive to 19:00 exclusive', () => {
  for (const method of ['delivery']) {
    for (const slot of availability.candidateSlots(method)) {
      const matches = ['lunch','afternoon','evening','other'].filter(period => planner.inPeriod(slot, period, method));
      assert.equal(matches.length, 1, `${method} ${slot}`);
    }
    assert.equal(planner.inPeriod('13:59','afternoon',method),false);
    assert.equal(planner.inPeriod('14:00','afternoon',method),true);
    assert.equal(planner.inPeriod('18:59','afternoon',method),true);
    assert.equal(planner.inPeriod('19:00','afternoon',method),false);
  }
  assert.equal(planner.inPeriod('14:40','lunch','reservation'),true);
  assert.equal(planner.inPeriod('18:40','evening','reservation'),true);
  assert.equal(planner.inPeriod('16:00','other','reservation'),true);
  assert.equal(planner.inPeriod('16:00','afternoon','reservation'),false);
  assert.equal(planner.inPeriod('14:00','afternoon','pickup'),false);
  assert.equal(planner.inPeriod('18:40','afternoon','pickup'),false);
  const state = schedule.dashboard({}, dates[0], now);
  for (const method of ['pickup', 'reservation']) {
    const draft = planner.makeDraft(state);
    planner.openPeriod(state, draft, method, 'afternoon');
    assert.equal(planner.changes(state, draft).length, 0);
  }
});

for (const method of ['delivery']) test(`${method}: afternoon opens and closes on demand, preserves standard hours and other services`, () => {
  for (const date of dates) {
    const db = {};
    const original = schedule.dashboard(db,date,now);
    const originalDraft = planner.makeDraft(original);
    const draft = planner.makeDraft(original);
    planner.openPeriod(original,draft,method,'afternoon');
    const changes = planner.changes(original,draft);
    assert.equal(changes.length,method === 'delivery' ? 20 : 15);
    assert.ok(changes.every(row => row.method === method && row.nextOpen && row.slot >= '14:00' && row.slot < '19:00'));
    schedule.save(db,input(date,original,draft),now);
    const restored = JSON.parse(JSON.stringify(db));
    for (const grid of [20,15]) {
      const slots = availability.availabilityForDate(restored,date,now,method,undefined,grid);
      assert.equal(slots['14:00']?.unavailable ?? slots['14:00 – 14:30']?.unavailable,false);
    }
    const opened = schedule.dashboard(restored,date,now);
    for (const key of Object.keys(original.services)) for (const row of opened.services[key]) {
      assert.equal(row.standard,original.services[key].find(before => before.slot === row.slot).standard);
      if (key !== method || !planner.inPeriod(row.slot,'afternoon',method)) assert.equal(row.open,originalDraft[key][row.slot]);
    }
    const otherDate = date === dates[0] ? dates[1] : dates[0];
    assert.deepEqual(planner.makeDraft(schedule.dashboard(restored,otherDate,now)),planner.makeDraft(schedule.dashboard({},otherDate,now)));
    const close = planner.makeDraft(opened);
    for (const row of opened.services[method].filter(row => planner.inPeriod(row.slot,'afternoon',method))) close[method][row.slot] = false;
    schedule.save(restored,input(date,opened,close),now);
    assert.deepEqual(planner.makeDraft(schedule.dashboard(restored,date,now)),originalDraft);
  }
});

test('opening one afternoon slot keeps other exceptions and saved orders intact', () => {
  const date = dates[0], db = {orders:[{id:'fictional',serviceDate:date,slot:'19:00',method:'pickup',status:'confirmed',payment:{status:'PAID'}}]};
  const start = schedule.dashboard(db,date,now), first = planner.makeDraft(start);
  first.pickup['20:00'] = false;
  schedule.save(db,input(date,start,first),now);
  const original = schedule.dashboard(db,date,now), draft = planner.makeDraft(original);
  draft.delivery['16:00'] = true;
  assert.equal(planner.changes(original,draft).length,1);
  schedule.save(db,input(date,original,draft),now);
  const state = planner.makeDraft(schedule.dashboard(db,date,now));
  assert.equal(state.delivery['16:00'],true);
  assert.equal(state.delivery['16:15'],false);
  assert.equal(state.pickup['19:00'],true);
  assert.equal(state.pickup['20:00'],false);
  assert.equal(db.orders[0].status,'confirmed');
});

test('closing afternoon slots with bookings retains the existing warning and conflict protection', () => {
  const date = dates[0], db = {};
  const start = schedule.dashboard(db,date,now), opened = planner.makeDraft(start);
  planner.openPeriod(start,opened,'delivery','afternoon');
  schedule.save(db,input(date,start,opened),now);
  db.orders = [{id:'fictional',serviceDate:date,slot:'16:00',slotDurationMinutes:15,method:'delivery',status:'confirmed',payment:{status:'PAID'}}];
  const state = schedule.dashboard(db,date,now), draft = planner.makeDraft(state);
  draft.delivery['16:00'] = false;
  assert.equal(planner.impacts(state,draft).length,1);
  assert.throws(() => schedule.save(db,input(date,state,draft),now),/prise en charge/);
  schedule.save(db,{...input(date,state,draft),acknowledgeExisting:true},now);
  assert.equal(db.orders[0].status,'confirmed');
  assert.throws(() => schedule.save(db,input(date,state,draft),now),/autre onglet/);
});

test('opening the usual lunch hours never enables the optional afternoon', () => {
  const state = schedule.dashboard({},dates[0],now), draft = planner.makeDraft(state);
  draft.pickup['12:00'] = false;
  planner.openPeriod(state,draft,'pickup','lunch');
  assert.equal(draft.pickup['12:00'],true);
  assert.equal(draft.pickup['14:00'],false);
});
