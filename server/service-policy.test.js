const test = require('node:test'), assert = require('node:assert/strict');
const { preparationMinutes } = require('../service-policy');
const { availabilityForDate, validateServiceSlot, remainingDeliveryPlaces, storedServiceSlotOpen, slotsForDate } = require('./availability');
const { reservationAvailabilityForDate, createReservation, updateReservationStatus } = require('./reservations');
const schedule = require('./service-schedule');
const date='2026-09-28', now=new Date('2026-09-28T08:00:00Z');

test('règle future sauvegardée mais désactivée dans les disponibilités et commandes',()=>{
  for(const [amount,minutes] of [[24.99,20],[25,30],[60,30],[60.01,45]]) assert.equal(preparationMinutes(amount),minutes);
  const time=new Date('2026-09-28T16:55:00Z');
  for(const [method,slot] of [['pickup','19:00'],['delivery','19:00 – 19:30']]) {
    assert.equal(validateServiceSlot(date,slot,time,method,{},100),null);
    assert.deepEqual(availabilityForDate({},date,time,method),availabilityForDate({},date,time,method,100));
  }
});
test('grille identique pour tous les clients : livraison 30 min, retrait et tables 15 min',()=>{
  assert.equal(slotsForDate(date,'delivery').length,10);
  for(const method of ['pickup','reservation']) {
    assert.equal(slotsForDate(date,method).length,20);
    for(const slot of ['19:00','19:15','19:30','19:45']) assert.equal(validateServiceSlot(date,slot,now,method),null);
    assert.match(validateServiceSlot(date,'19:20',now,method),/pas disponible/);
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
test('tables de vingt minutes existantes comptées sans déplacement ; deux places par demi-heure',()=>{
  const db={reservations:[{id:'twenty',slot:'19:20',slotDurationMinutes:20,serviceDate:date,status:'confirmed'},{id:'legacy',slot:'19:15',serviceDate:date,status:'pending'}]};
  const before=JSON.stringify(db.reservations);
  const slots=reservationAvailabilityForDate(db,date,now);
  assert.equal(slots['19:00'].full,true); assert.equal(slots['19:15'].full,true);
  assert.equal(slots['19:30'].remaining,1); assert.equal(slots['19:45'].remaining,1);
  assert.equal(slots['20:00'].remaining,2); assert.equal(JSON.stringify(db.reservations),before);
  assert.throws(()=>createReservation(db,{customerName:'Client fictif',phone:'0600000000',guests:2,serviceDate:date,slot:'19:15'},now),/complet/);
  db.reservations.push({id:'cancelled',slot:'19:00',serviceDate:date,status:'cancelled'});
  assert.throws(()=>updateReservationStatus(db,'cancelled','confirmed',now),/complète/);
});
test('exceptions vingt minutes projetées en lecture seule, fermetures conservées',()=>{
  const db={serviceSchedule:{dates:{[date]:{revision:3,slotMinutes:20,services:{delivery:{'19:20':false},pickup:{'19:20':false,'22:00':true,'22:20':true},reservation:{'19:20':false}}}}}};
  const before=JSON.stringify(db);
  const slots=availabilityForDate(db,date,now,'delivery');
  assert.equal(slots['19:00 – 19:30'].closed,true); assert.equal(slots['19:30 – 20:00'].closed,true);
  assert.equal(slots['20:00 – 20:30'].closed,false);
  const pickup=availabilityForDate(db,date,now,'pickup');
  assert.equal(pickup['19:15'].closed,true); assert.equal(pickup['19:30'].closed,true);
  assert.equal(pickup['22:15'].unavailable,false); assert.equal(pickup['22:30'].closed,true);
  const state=schedule.dashboard(db,date,now);
  assert.equal(JSON.stringify(db),before);
  schedule.save(db,{date,revision:3,services:Object.fromEntries(Object.entries(state.services).map(([m,rows])=>[m,Object.fromEntries(rows.map(r=>[r.slot,r.open]))]))},now);
  assert.equal(db.serviceSchedule.dates[date].slotMinutes,undefined);
  for(const method of ['delivery','pickup','reservation']) assert.deepEqual(schedule.dashboard(db,date,now).services[method],state.services[method]);
});
test('fermer une plage chevauchant une table existante demande confirmation',()=>{
  const db={reservations:[{id:'twenty',serviceDate:date,slot:'19:20',slotDurationMinutes:20,status:'confirmed'}]};
  const state=schedule.dashboard(db,date,now);
  const input={date,revision:0,services:Object.fromEntries(Object.entries(state.services).map(([m,rows])=>[m,Object.fromEntries(rows.map(r=>[r.slot,r.open]))]))};
  input.services.reservation['19:30']=false;
  assert.throws(()=>schedule.save(db,input,now),/prise en charge/);
  assert.equal(db.reservations[0].slot,'19:20');
});
test('anciens paiements conservés mais fermetures chevauchantes respectées',()=>{
  const order={method:'pickup',serviceDate:date,slot:'19:20',slotDurationMinutes:20};
  assert.equal(storedServiceSlotOpen(order,{}),true);
  assert.equal(storedServiceSlotOpen(order,{serviceSchedule:{dates:{[date]:{services:{pickup:{'19:30':false}}}}}}),false);
  assert.equal(storedServiceSlotOpen({method:'pickup',serviceDate:date,slot:'22:45'},{serviceSchedule:{dates:{[date]:{services:{pickup:{'22:45':true}}}}}}),true);
});
