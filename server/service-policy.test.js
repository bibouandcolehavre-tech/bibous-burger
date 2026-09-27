const test = require('node:test'), assert = require('node:assert/strict');
const { preparationMinutes, regularSlotsForWeekday } = require('../service-policy');
const { availabilityForDate, validateServiceSlot, remainingDeliveryPlaces, storedServiceSlotOpen } = require('./availability');
const { reservationAvailabilityForDate } = require('./reservations');
const schedule = require('./service-schedule');
const date='2026-09-28', now=new Date('2026-09-28T17:10:00Z'); // 19:10 Paris

test('préparation : frontières exactes 25/60 euros et montants invalides',()=>{
  for(const [amount, minutes] of [[0,20],[24.99,20],[25,30],[60,30],[60.01,45],[100,45]]) assert.equal(preparationMinutes(amount),minutes);
  for(const amount of [-1,NaN,Infinity]) assert.throws(()=>preparationMinutes(amount),/invalide/);
  assert.deepEqual(regularSlotsForWeekday(0),['19:00','19:20','19:40','20:00','20:20','20:40']);
});
test('retrait et livraison : prochain horaire selon panier, arrondi à la grille, pas pour les tables',()=>{
  for(const method of ['pickup','delivery']) {
    for(const [amount,first] of [[24.99,'19:40'],[25,'19:40'],[60,'19:40'],[60.01,'20:00']]) {
      const slots=availabilityForDate({},date,now,method,amount);
      assert.equal(Object.keys(slots).find(s=>!slots[s].unavailable&&!slots[s].full),first);
      assert.equal(slots['19:20'].tooSoon,true);
      assert.equal(slots['19:00'].tooSoon,false);
      assert.equal(slots['19:00'].unavailable,true);
      assert.match(validateServiceSlot(date,'19:20',now,method,{},amount),/préparation/);
    }
    assert.equal(validateServiceSlot(date,'19:40',new Date('2026-09-28T17:20:00Z'),method,{},24.99),null);
    assert.match(validateServiceSlot(date,'19:40',new Date('2026-09-28T17:20:00.001Z'),method,{},24.99),/20 minutes/);
  }
  assert.equal(validateServiceSlot(date,'19:20',now,'reservation',{},100),null);
  assert.equal(validateServiceSlot('2026-09-29','12:00',now,'pickup',{},100),null);
});
test('ancienne livraison : capacité réservée sur les deux nouvelles plages chevauchées, sans déplacer la commande',()=>{
  const order={serviceDate:date,method:'delivery',slot:'19:30 – 20:00',status:'confirmed',payment:{status:'PAID'}};
  const db={orders:[order,{...order}]}, before=JSON.stringify(db);
  assert.equal(remainingDeliveryPlaces(db,date,'19:20',now).full,true);
  assert.equal(remainingDeliveryPlaces(db,date,'19:40',now).full,true);
  assert.equal(remainingDeliveryPlaces(db,date,'20:00',now).remaining,2);
  assert.equal(storedServiceSlotOpen(order,db),true);
  assert.equal(JSON.stringify(db),before);
});
test('anciennes tables : capacité conservée entre deux grilles ; nouvelles plages indépendantes',()=>{
  const db={reservations:[{slot:'19:15',serviceDate:date,status:'confirmed'},{slot:'19:20',slotDurationMinutes:20,serviceDate:date,status:'pending'}]};
  const slots=reservationAvailabilityForDate(db,date,new Date('2026-09-28T16:00:00Z'));
  assert.equal(slots['19:00'].remaining,1);assert.equal(slots['19:20'].full,true);assert.equal(slots['19:40'].remaining,2);
});
test('fermetures et ouvertures exceptionnelles anciennes conservées et changement explicite enregistré en vingt minutes',()=>{
  const db={serviceSchedule:{dates:{[date]:{revision:3,services:{delivery:{'19:30 – 20:00':false},pickup:{'19:15':false,'22:00':true,'22:15':true},reservation:{'19:30':false,'19:45':false}}}}}};
  const before=JSON.stringify(db), time=new Date('2026-09-28T08:00:00Z');
  const slots=availabilityForDate(db,date,time,'delivery');
  assert.equal(slots['19:20'].closed,true);assert.equal(slots['19:40'].closed,true);assert.equal(slots['20:00'].closed,false);
  assert.equal(availabilityForDate(db,date,time,'pickup')['22:00'].unavailable,false);
  assert.equal(availabilityForDate(db,date,time,'pickup')['22:20'].closed,true);
  const state=schedule.dashboard(db,date,time);
  assert.equal(JSON.stringify(db),before);
  const input={date,revision:3,services:Object.fromEntries(Object.entries(state.services).map(([m,rows])=>[m,Object.fromEntries(rows.map(r=>[r.slot,r.open]))]))};
  schedule.save(db,input,time);
  assert.equal(db.serviceSchedule.dates[date].slotMinutes,20);
  for(const method of ['delivery','pickup','reservation']) assert.deepEqual(schedule.dashboard(db,date,time).services[method],state.services[method]);
  assert.equal(storedServiceSlotOpen({method:'delivery',serviceDate:date,slot:'19:30 – 20:00'},db),false);
});
test('fermer une plage qui chevauche une ancienne table demande confirmation sans annuler la table',()=>{
  const db={reservations:[{id:'legacy',serviceDate:date,slot:'19:15',status:'confirmed'}]};
  const time=new Date('2026-09-28T08:00:00Z'),state=schedule.dashboard(db,date,time);
  const input={date,revision:0,services:Object.fromEntries(Object.entries(state.services).map(([m,rows])=>[m,Object.fromEntries(rows.map(r=>[r.slot,r.open]))]))};
  input.services.reservation['19:20']=false;
  assert.throws(()=>schedule.save(db,input,time),/prise en charge/);
  assert.equal(db.reservations[0].slot,'19:15');
});
test('le paiement d’un ancien retrait exceptionnel à :45 reste possible',()=>{
  const db={serviceSchedule:{dates:{[date]:{services:{pickup:{'22:45':true}}}}}};
  assert.equal(storedServiceSlotOpen({method:'pickup',serviceDate:date,slot:'22:45'},db),true);
});
