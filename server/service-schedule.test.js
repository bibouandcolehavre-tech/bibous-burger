const test=require('node:test'),assert=require('node:assert/strict');
const schedule=require('./service-schedule');
const {availabilityForDate,validateServiceSlot,qualifiesForAdvancePickup}=require('./availability');
const {reservationAvailabilityForDate}=require('./reservations');
const now=new Date('2026-09-25T08:00:00Z'), date='2026-09-26';
const draft=(db,d=date)=>{const state=schedule.dashboard(db,d,now);return {date:d,revision:state.revision,services:Object.fromEntries(Object.entries(state.services).map(([m,rows])=>[m,Object.fromEntries(rows.map(r=>[r.slot,r.open]))]))};};
test('extra hours are authoritative for each service, persisted and isolated by date',()=>{
 const db={};const input=draft(db);input.services.pickup['22:45']=true;input.services.delivery['22:30 – 23:00']=true;input.services.reservation['22:15']=true;schedule.save(db,input,now);
 const restored=JSON.parse(JSON.stringify(db));
 for(const [m,slot] of [['pickup','22:45'],['delivery','22:30 – 23:00'],['reservation','22:15']]){
  assert.equal(validateServiceSlot(date,slot,now,m,restored),null);
  const statuses=m==='reservation'?reservationAvailabilityForDate(restored,date,now):availabilityForDate(restored,date,now,m);
  assert.equal(statuses[slot].unavailable,false);assert.match(validateServiceSlot('2026-09-27',slot,now,m,restored),/pas disponible/);
 }
 assert.equal(qualifiesForAdvancePickup({method:'pickup',serviceDate:date,slot:'22:45',createdAt:'2026-09-26T19:00:00Z'}),true);
});
test('closing one service preserves the others and warns about existing business',()=>{
 const db={orders:[{serviceDate:date,method:'pickup',slot:'19:00',status:'confirmed',payment:{status:'PAID'}}]};const input=draft(db);input.services.pickup['19:00']=false;
 assert.throws(()=>schedule.save(db,input,now),/prise en charge/);assert.equal(db.serviceSchedule,undefined);
 input.acknowledgeExisting=true;schedule.save(db,input,now);assert.equal(db.orders[0].status,'confirmed');
 assert.match(validateServiceSlot(date,'19:00',now,'pickup',db),/fermé/);assert.equal(validateServiceSlot(date,'19:00',now,'reservation',db),null);
 assert.throws(()=>schedule.save(db,input,now),/autre onglet/);
});
test('validates shape, dates, slots and preserves the September 25 closure by default',()=>{
 const db={};const closed=draft(db,'2026-09-25');assert.equal(closed.services.pickup['19:00'],false);schedule.save(db,closed,now);assert.equal(availabilityForDate(db,'2026-09-25',now,'pickup')['19:00'].closed,true);
 const input=draft(db);input.services.pickup['22:07']=true;assert.throws(()=>schedule.save(db,input,now),/invalide/);
 assert.throws(()=>schedule.dashboard(db,'2026-09-24',now),/14 prochains/);
 assert.throws(()=>schedule.dashboard(db,'2026-10-09',now),/14 prochains/);
 const reopen=draft(db,'2026-09-25');reopen.services.pickup['19:00']=true;schedule.save(db,reopen,now);assert.equal(validateServiceSlot('2026-09-25','19:00',now,'pickup',db),null);
});
