'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../delivery-tracking-client');
const position={latitude:49.49,longitude:.12,accuracy:10,validForMs:30000};
test('real coordinate changes move the marker within a stable map viewport',()=>{
  const first=C.mapTiles(position),east=C.mapTiles({...position,longitude:.1208},320,280,14,position),north=C.mapTiles({...position,latitude:49.4904},320,280,14,position);
  assert.equal(first.courier.x,160);assert.equal(first.courier.y,140);assert.ok(east.courier.x>first.courier.x+5);assert.ok(north.courier.y<first.courier.y-5);
  assert.deepEqual(first.tiles,east.tiles,'the map stays put while the courier moves');
  assert.deepEqual(C.mapTiles(position).courier,first.courier,'no new coordinate means no invented movement');
});
test('map recenters only near its edge and rejects invalid viewport coordinates',()=>{
  assert.equal(C.needsRecenter({x:160,y:140},320),false);assert.equal(C.needsRecenter({x:20,y:140},320),true);assert.equal(C.needsRecenter({x:160,y:270},320),true);
  assert.throws(()=>C.mapTiles(position,320,280,14,{latitude:Infinity,longitude:0}),/Carte/);
});
test('network transit time cannot extend the lifetime of an old GPS fix',()=>{
  const result={protocol:'bibou-customer-delivery-v1',status:'out_for_delivery',position};
  assert.equal(C.receivedSnapshot(result,2300).position.validForMs,27700);
  assert.equal(C.receivedSnapshot({...result,position:{...position,validForMs:1500}},2300).position,null);
  assert.equal(C.receivedSnapshot(result,30000).position,null);assert.equal(position.validForMs,30000,'input not mutated');
});
test('GPS is not displayed before departure, after handover or with an invalid protocol',()=>{
  for(const status of ['confirmed','preparing','ready','awaiting_customer','delivered','cancelled'])assert.equal(C.receivedSnapshot({protocol:'bibou-customer-delivery-v1',status,position}).position,null);
  assert.throws(()=>C.receivedSnapshot({protocol:'unknown',status:'out_for_delivery',position}),/Suivi/);
  assert.throws(()=>C.receivedSnapshot({protocol:'bibou-customer-delivery-v1',status:'unknown',position}),/Suivi/);
});
test('mobile marker uses the exact approved logo on bag and helmet, without a generated substitute',()=>{
  const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'BibouCourierMarker.js'),'utf8');
  assert.equal(source.match(/require\('\.\/assets\/bibous-official-wordmark-preview\.png'\)/g).length,2);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/bibous-official-wordmark-preview.png'))).digest('hex'),'25172c6a730cdaf92d6bb0ecb2ceae33c6deda12c1fabf5f0aac6e29890b2717');
  assert.doesNotMatch(source,/wordmark-white|exec-94938|exec-58ad/);
  assert.ok(fs.existsSync(path.join(root,'assets/bibou-courier-character-v1.png')));
});
test('server runtime package includes the shared customer departure copy',()=>{
  const docker=fs.readFileSync(path.join(__dirname,'../Dockerfile'),'utf8');assert.match(docker,/COPY delivery-status-copy\.js \.\/delivery-status-copy\.js/);
});
