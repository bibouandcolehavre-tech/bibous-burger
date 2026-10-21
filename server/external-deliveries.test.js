'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const jobs=require('./external-deliveries'),quotes=require('./external-delivery-quote'),drivers=require('./krokly-drivers');
const account=require('./krokli-driver-account'),settlements=require('./driver-settlements');
const parser=require('../restaurant-dashboard/external-delivery-parser');
const now=Date.parse('2026-10-21T17:00:00Z'),secret='test-only-secret-'.repeat(4);
const destination={address:'12 rue Exemple',postalCode:'76600',city:'Le Havre'};
function input(overrides={}) {return {requestId:crypto.randomUUID(),...destination,reference:'TEST01',customerName:'Client fictif',phone:'0600000000',phoneExtension:'12345678',notes:'Étage fictif',amountCents:2990,confirmed:true,ownCourierConfirmed:true,quoteToken:quotes.sign(destination,{distanceKm:2.1,deliveryFee:4.99},secret,now).quoteToken,...overrides};}
function database(){return{orders:[],customers:[],nextOrderNumber:42,kroklyDrivers:[{id:'d1',name:'Livreur test',active:true},{id:'d2',name:'Autre livreur',active:true}]};}
const create=(db,body=input(),time=now)=>jobs.create(db,body,time,{quoteSecret:secret});
test('single address field accepts standard complete addresses and refuses incomplete destinations',()=>{
  assert.deepEqual(parser.destination('12 rue Exemple, 76600 Le Havre'),destination);
  assert.deepEqual(parser.destination('12 rue Exemple 76600 Le Havre, France'),destination);
  assert.equal(parser.destination('12 rue Exemple'),null);assert.equal(parser.destination('76600 Le Havre'),null);
});
test('text transcription identifies a single destination, reference, relay phone and amount without guessing missing values',()=>{
  const parsed=parser.parse('Commande #TEST01\nClient : Client fictif\nAdresse de livraison\n12 rue Exemple\n76600 Le Havre\nTéléphone : 06 00 00 00 00\nCode téléphonique : 12345678\nTotal : 29,90 €');
  assert.equal(parsed.fields.address,destination.address);assert.equal(parsed.fields.city,destination.city);assert.equal(parsed.fields.postalCode,destination.postalCode);
  assert.equal(parsed.fields.reference,'TEST01');assert.equal(parsed.fields.phone,'0600000000');assert.equal(parsed.fields.phoneExtension,'12345678');assert.equal(parsed.fields.amountCents,2990);assert.equal(parsed.automaticDispatch,false);
});
test('text with multiple addresses or phone numbers is not silently resolved',()=>{
  const parsed=parser.parse('153 quai Exemple\n76600 Le Havre\n12 rue Fictive\n76600 Le Havre\n0600000000\n0700000000\nBurger 9,90 €');
  assert.equal(parsed.fields.address,'');assert.equal(parsed.fields.phone,'');assert.equal(parsed.fields.amountCents,null);assert.ok(parsed.warnings.length>=2);
});
test('explicit delivery heading selects destination instead of restaurant address',()=>{
  const parsed=parser.parse('Restaurant\n153 quai Exemple\n76600 Le Havre\nAdresse de livraison\n12 rue Fictive\n76600 Le Havre');
  assert.equal(parsed.fields.address,'12 rue Fictive');
});
test('conflicting totals remain empty and arbitrary values are not manufactured',()=>{
  assert.equal(parser.parse('Total : 29,90 €\nTotal : 25,90 €').fields.amountCents,null);
  assert.equal(parser.parse('').fields.customerName,'');assert.equal(parser.parse('').fields.phone,'');
});
test('quote binds address and approved remuneration; tampering, expiration and zone overrun fail closed',()=>{
  const signed=quotes.sign(destination,{distanceKm:2.1,deliveryFee:4.99},secret,now);
  assert.equal(quotes.verify(destination,signed.quoteToken,secret,now).driverPayCents,499);
  assert.throws(()=>quotes.verify({...destination,address:'14 rue Fictive'},signed.quoteToken,secret,now),/Adresse modifiée/);
  assert.throws(()=>quotes.verify(destination,signed.quoteToken,secret,now+600001),/expiré/);
  assert.throws(()=>quotes.verify(destination,signed.quoteToken+'x',secret,now));
  assert.throws(()=>quotes.verify(destination,signed.quoteToken,'another-secret-'.repeat(4),now));
  assert.throws(()=>quotes.sign(destination,{distanceKm:7.01,deliveryFee:null},secret,now),/hors de la zone/);
  assert.throws(()=>quotes.sign(destination,{distanceKm:2,deliveryFee:0.01},secret,now));
});
test('all four approved current tiers are signed without substituting basket total for driver pay',()=>{
  for(const [distanceKm,deliveryFee] of [[1.5,3.99],[3,4.99],[5,5.99],[7,6.99]]){
    const signed=quotes.sign(destination,{distanceKm,deliveryFee},secret,now);
    assert.equal(quotes.verify(destination,signed.quoteToken,secret,now).driverPayCents,Math.round(deliveryFee*100));
  }
});
test('creating a task does not create a sale, client, paid payment, stock reservation or automatic assignment',()=>{
  const db=database(),result=create(db);assert.equal(result.created,true);assert.equal(result.delivery.status,'preparing');
  assert.deepEqual(db.orders,[]);assert.deepEqual(db.customers,[]);assert.equal(db.nextOrderNumber,42);assert.equal(db.externalDeliveries[0].payment,undefined);
  assert.equal(db.externalDeliveries[0].kroklyDriver,undefined);assert.equal(result.delivery.driverPayCents,499);
});
test('same request is idempotent even after quote expiry; conflicting request or duplicated reference is rejected',()=>{
  const db=database(),body=input(),first=create(db,body);assert.equal(create(db,body,now+700000).created,false);assert.equal(db.externalDeliveries.length,1);
  assert.throws(()=>create(db,{...body,customerName:'Different'}),/déjà été utilisé/);
  assert.throws(()=>create(db,input()),/déjà importée/);assert.equal(first.delivery.id,db.externalDeliveries[0].id);
});
test('invalid, unsafe or unconfirmed fields are rejected before any persistent changes',()=>{
  for(const patch of [{confirmed:false},{ownCourierConfirmed:false},{address:''},{postalCode:'abcde'},{phone:'123'},{phone:'',phoneUnavailableConfirmed:false},{amountCents:-1},{amountCents:1.4},{customerName:'<script>'},{payment:{status:'PAID'}},{driverPayCents:1},{quoteToken:undefined}]){
    const db=database();assert.throws(()=>create(db,input(patch)),JSON.stringify(patch));assert.equal(db.externalDeliveries,undefined);
  }
  const db=database();assert.equal(create(db,input({phone:'',phoneExtension:'',phoneUnavailableConfirmed:true})).created,true);
});
test('meal readiness, service day, driver isolation and ordered stages are enforced',()=>{
  const db=database(),{delivery}=create(db);assert.throws(()=>drivers.assign(db,delivery.id,'d1',now),/non prêt/);
  jobs.markReady(db,delivery.id,now);assert.throws(()=>drivers.assign(db,delivery.id,'missing',now),/introuvable/);
  drivers.assign(db,delivery.id,'d1',now);assert.throws(()=>drivers.assign(db,delivery.id,'d2',now),/déjà attribuée/);
  const offer=drivers.assigned(db,'d1')[0];assert.equal(offer.customerPhone,undefined);assert.equal(offer.deliveryAddress,undefined);assert.equal(offer.courierPay,4.99);
  assert.deepEqual(drivers.assigned(db,'d2'),[]);assert.throws(()=>drivers.transition(db,delivery.id,'d2','accept',now),/non attribuée/);
  assert.throws(()=>drivers.transition(db,delivery.id,'d1','deliver',now));drivers.transition(db,delivery.id,'d1','accept',now);
  const accepted=drivers.assigned(db,'d1')[0];assert.equal(accepted.customerPhone,'0600000000');assert.equal(accepted.deliveryAddress.address,destination.address);assert.match(accepted.comment,/ne rien encaisser/);assert.match(accepted.comment,/12345678/);
  assert.throws(()=>jobs.cancel(db,delivery.id,now),/prise en charge/);drivers.transition(db,delivery.id,'d1','pickup',now);
  assert.equal(jobs.get(db,delivery.id).status,'out_for_delivery');assert.deepEqual(settlements.earnings(db,db.kroklyDrivers[0]),[]);
});
test('completed delivery credits the agreed fee once, without fake sales, retained contacts or automatic transfer',()=>{
  const db=database(),{delivery}=create(db);jobs.markReady(db,delivery.id,now);drivers.assign(db,delivery.id,'d1',now);
  for(const action of ['accept','pickup','deliver'])drivers.transition(db,delivery.id,'d1',action,now);
  assert.deepEqual(drivers.assigned(db,'d1'),[]);assert.throws(()=>drivers.transition(db,delivery.id,'d1','deliver',now));
  const earnings=settlements.earnings(db,db.kroklyDrivers[0]);assert.equal(earnings.length,1);assert.equal(earnings[0].amountCents,499);
  const history=account.account(db,db.kroklyDrivers[0],{},new Date(now));assert.equal(history.summary.knownDriverPayCents,499);assert.equal(history.history.length,1);
  assert.equal(JSON.stringify(db.externalDeliveries).includes('0600000000'),false);assert.equal(JSON.stringify(db.externalDeliveries).includes(destination.address),false);
  assert.deepEqual(db.orders,[]);assert.deepEqual(db.customers,[]);assert.equal(db.driverPaymentRequests,undefined);
});
test('declined or expired offers can be reassigned; cancelled task never reaches another driver',()=>{
  const db=database(),{delivery}=create(db);jobs.markReady(db,delivery.id,now);drivers.assign(db,delivery.id,'d1',now);
  assert.equal(jobs.expireOffers(db,now+300001),true);drivers.assign(db,delivery.id,'d2',now+300001);assert.deepEqual(drivers.assigned(db,'d1'),[]);
  jobs.cancel(db,delivery.id,now+300001);assert.deepEqual(drivers.assigned(db,'d2'),[]);assert.throws(()=>drivers.transition(db,delivery.id,'d2','accept',now+300001));
});
test('identical manual entries cannot duplicate a pending task; cancelling permits a corrected reimport',()=>{
  const db=database(),body=input({reference:''}),{delivery}=create(db,body);
  assert.throws(()=>create(db,{...body,requestId:crypto.randomUUID()}),/déjà importée/);
  jobs.cancel(db,delivery.id,now);assert.equal(create(db,{...body,requestId:crypto.randomUUID()}).created,true);
});
test('an active imported Uber course makes a courier busy for automatic Bibou dispatch',()=>{
  const db=database(),{delivery}=create(db);jobs.markReady(db,delivery.id,now);drivers.assign(db,delivery.id,'d1',now);
  const automatic=require('./krokli-auto-dispatch');assert.equal(automatic.busy(db,'d1',now),true);assert.equal(automatic.busy(db,'d2',now),false);
  for(const action of ['accept','pickup','deliver'])drivers.transition(db,delivery.id,'d1',action,now);
  assert.equal(automatic.busy(db,'d1',now),false);
});
