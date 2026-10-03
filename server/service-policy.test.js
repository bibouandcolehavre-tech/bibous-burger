const test = require('node:test'), assert = require('node:assert/strict');
const { preparationMinutes } = require('../service-policy');
const availability = require('./availability');
const { remainingDeliveryPlaces, storedServiceSlotOpen } = availability;
const availabilityForDate = (database,date,now,method='delivery',subtotal) => availability.availabilityForDate(database,date,now,method,subtotal,20);
const validateServiceSlot = (date,slot,now,method='delivery',database={},subtotal) => availability.validateServiceSlot(date,slot,now,method,database,subtotal,20);
const slotsForDate = (date,method='delivery',database={}) => availability.slotsForDate(date,method,database,20);
const reservations = require('./reservations');
const reservationAvailabilityForDate = (database,date,now) => reservations.reservationAvailabilityForDate(database,date,now,20);
const createReservation = (database,input,now) => reservations.createReservation(database,{...input,slotGrid:20},now);
const { updateReservationStatus } = reservations;
const schedule = require('./service-schedule');
const date='2026-09-28', now=new Date('2026-09-28T08:00:00Z');

test('délais de préparation appliqués au retrait et à la livraison, selon le panier',()=>{
  for(const [amount,minutes] of [[24.99,20],[25,30],[60,30],[60.01,45]]) assert.equal(preparationMinutes(amount),minutes);
  const time=new Date('2026-09-28T17:10:00Z');
  for(const method of ['pickup','delivery']) {
    assert.match(validateServiceSlot(date,'19:20',time,method,{},24.99),/préparation/);
    assert.equal(validateServiceSlot(date,'19:40',time,method,{},25),null);
    assert.match(validateServiceSlot(date,'19:40',time,method,{},60.01),/45 minutes/);
    assert.equal(availabilityForDate({},date,time,method,60.01)['19:40'].unavailable,true);
  }
  assert.equal(validateServiceSlot(date,'19:20',time,'reservation',{},100),null);
});
test('grille identique de vingt minutes pour livraison, retrait et tables',()=>{
  for(const method of ['delivery','pickup','reservation']) {
    assert.equal(slotsForDate(date,method).length,15);
    for(const slot of ['19:00','19:20','19:40','20:00']) assert.equal(validateServiceSlot(date,slot,now,method),null);
    assert.match(validateServiceSlot(date,'19:15',now,method),/pas disponible/);
  }
});
test('livraisons de vingt minutes existantes conservées et comptées sur les deux plages chevauchées',()=>{
  const order={serviceDate:date,method:'delivery',slot:'19:20',slotDurationMinutes:20,status:'confirmed',payment:{status:'PAID'}};
  const db={orders:[order,{...order}]},before=JSON.stringify(db);
  for(const slot of ['19:00 – 19:30','19:30 – 20:00']) assert.equal(remainingDeliveryPlaces(db,date,slot,now).full,true);
  assert.equal(remainingDeliveryPlaces(db,date,'20:00 – 20:30',now).remaining,2);
  assert.equal(storedServiceSlotOpen(order,db),true);
  assert.equal(JSON.stringify(db),before);
});
test('tables de vingt minutes et ancien créneau comptés sans déplacement',()=>{
  const db={reservations:[{id:'twenty',slot:'19:20',slotDurationMinutes:20,serviceDate:date,status:'confirmed'},{id:'legacy',slot:'19:15',serviceDate:date,status:'pending'}]};
  const before=JSON.stringify(db.reservations);
  const slots=reservationAvailabilityForDate(db,date,now);
  assert.equal(slots['19:00'].remaining,1); assert.equal(slots['19:20'].full,true);
  assert.equal(slots['19:40'].remaining,2);
  assert.equal(slots['20:00'].remaining,2); assert.equal(JSON.stringify(db.reservations),before);
  assert.throws(()=>createReservation(db,{customerName:'Client fictif',phone:'0600000000',guests:2,serviceDate:date,slot:'19:20'},now),/complet/);
  db.reservations.push({id:'cancelled',slot:'19:20',slotDurationMinutes:20,serviceDate:date,status:'cancelled'});
  assert.throws(()=>updateReservationStatus(db,'cancelled','confirmed',now),/complète/);
});
test('exceptions vingt minutes projetées en lecture seule, fermetures conservées',()=>{
  const db={serviceSchedule:{dates:{[date]:{revision:3,slotMinutes:20,services:{delivery:{'19:20':false},pickup:{'19:20':false,'22:00':true,'22:20':true},reservation:{'19:20':false}}}}}};
  const before=JSON.stringify(db);
  const slots=availabilityForDate(db,date,now,'delivery');
  assert.equal(slots['19:00'].closed,false); assert.equal(slots['19:20'].closed,true);
  assert.equal(slots['19:40'].closed,false);
  const pickup=availabilityForDate(db,date,now,'pickup');
  assert.equal(pickup['19:20'].closed,true);
  assert.equal(pickup['22:00'].unavailable,false); assert.equal(pickup['22:40'],undefined);
  const state=schedule.dashboard(db,date,now);
  assert.equal(JSON.stringify(db),before);
  schedule.save(db,{date,revision:3,services:Object.fromEntries(Object.entries(state.services).map(([m,rows])=>[m,Object.fromEntries(rows.map(r=>[r.slot,r.open]))]))},now);
  assert.equal(db.serviceSchedule.dates[date].slotMinutes,20);
  for(const method of ['delivery','pickup','reservation']) assert.deepEqual(schedule.dashboard(db,date,now).services[method],state.services[method]);
});
test('fermer une plage chevauchant une table existante demande confirmation',()=>{
  const db={reservations:[{id:'twenty',serviceDate:date,slot:'19:20',slotDurationMinutes:20,status:'confirmed'}]};
  const state=schedule.dashboard(db,date,now);
  const input={date,revision:0,services:Object.fromEntries(Object.entries(state.services).map(([m,rows])=>[m,Object.fromEntries(rows.map(r=>[r.slot,r.open]))]))};
  input.services.reservation['19:20']=false;
  assert.throws(()=>schedule.save(db,input,now),/prise en charge/);
  assert.equal(db.reservations[0].slot,'19:20');
});
test('anciens paiements conservés mais fermetures chevauchantes respectées',()=>{
  const order={method:'pickup',serviceDate:date,slot:'19:20',slotDurationMinutes:20};
  assert.equal(storedServiceSlotOpen(order,{}),true);
  assert.equal(storedServiceSlotOpen(order,{serviceSchedule:{dates:{[date]:{services:{pickup:{'19:30':false}}}}}}),false);
  assert.equal(storedServiceSlotOpen({method:'pickup',serviceDate:date,slot:'22:45'},{serviceSchedule:{dates:{[date]:{services:{pickup:{'22:45':true}}}}}}),true);
});
