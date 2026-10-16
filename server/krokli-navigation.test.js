const { test } = require('node:test'), assert = require('node:assert/strict');
const { parseRoute, freshPosition, instruction, nearest, createIgnService } = require('../driver-app/navigation-core');
const fixture=()=>({profile:'car',distanceUnit:'meter',timeUnit:'second',distance:100,duration:60,geometry:{type:'LineString',coordinates:[[0.11,49.49],[0.12,49.49]]},portions:[{steps:[{geometry:{coordinates:[[0.11,49.49],[0.12,49.49]]},attributes:{name:{nom_1_droite:'Rue de test'}},instruction:{type:'turn',modifier:'right'}}]}]});
test('IGN adapter requires a real road polyline and explicit distance, time units and car profile',()=>{
  assert.equal(parseRoute(fixture()).steps[0].name,'Rue de test');
  for(const change of [d=>{d.profile='bicycle';},d=>{d.timeUnit='hour';},d=>{d.geometry.coordinates[0][1]=91;},d=>{d.geometry.type='Point';},d=>{d.portions=[];},d=>{d.distance=NaN;}]){const d=fixture();change(d);assert.throws(()=>parseRoute(d));}
});
test('navigation never treats an old, inaccurate or mocked fix as live',()=>{
  const p={latitude:49.49,longitude:0.11,accuracy:10,timestamp:Date.now()};assert.equal(freshPosition(p),true);
  for(const diff of [{timestamp:Date.now()-31000},{accuracy:101},{mocked:true},{latitude:91}])assert.equal(freshPosition({...p,...diff}),false);
});
test('route matching uses road segments, not a straight line to destination',()=>{
  const p={latitude:49.49,longitude:0.115};assert.ok(nearest([[0.11,49.49],[0.12,49.49]],p).distance<1);
  assert.ok(nearest([[0.11,49.50],[0.12,49.50]],p).distance>1000);
  assert.match(instruction(parseRoute(fixture()).steps[0]),/à droite/);assert.match(instruction({type:'roundabout'}),/signalisation/);
});
test('IGN requests contain no Bibou account, token or customer contact, and no automatic billed retries',async()=>{
  const calls=[],service=createIgnService({fetchImpl:async(url,options)=>{calls.push({url,options});return{ok:true,text:async()=>JSON.stringify(fixture())};}});
  const p={latitude:49.49,longitude:0.11,accuracy:10,timestamp:Date.now()};await service.route(p,[0.12,49.49]);
  assert.equal(calls.length,1);assert.equal(calls[0].url.origin,'https://data.geopf.fr');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.headers,undefined);assert.equal(calls[0].options.referrerPolicy,'no-referrer');
  await assert.rejects(service.route(p,[0.12,49.49]),/Patiente/);assert.equal(calls.length,1);
});
test('geocoding returns address candidates for explicit confirmation, never guesses one',async()=>{
  const service=createIgnService({fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({features:[{geometry:{type:'Point',coordinates:[0.12,49.49]},properties:{label:'Adresse de test'}},{geometry:{type:'Point',coordinates:[0,91]},properties:{label:'Invalide'}}]})})});
  assert.equal((await service.search('Adresse de test')).length,1);
});
