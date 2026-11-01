const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const window={};vm.runInNewContext(fs.readFileSync(__dirname+'/dispatch-map-interactive.js','utf8'),{window});
const api=window.KrokliDispatchMap,now=Date.now();
const driver=id=>({id,active:true,availability:{available:true,expiresAt:new Date(now+60000).toISOString()}});
const point=(id,longitude)=>({driverId:id,latitude:49.490809,longitude,accuracy:10,timestamp:now,expiresAt:new Date(now+60000).toISOString()});
test('nearest dispatch excludes offline, inactive, busy, stale and imprecise drivers',()=>{
 const drivers=['offline','inactive','busy','stale','imprecise','eligible','far'].map(driver);
 drivers[0].availability.available=false;drivers[1].active=false;
 const gpsPositions=drivers.map(d=>point(d.id,.118445));
 gpsPositions[3].timestamp=now-91000;gpsPositions[4].accuracy=101;gpsPositions[5].longitude=.12;gpsPositions[6].longitude=.14;
 const orders=[{assignment:{driverId:'busy',status:'accepted'}}];
 assert.equal(api.nearest({drivers,gpsPositions,orders},now).id,'eligible');
 assert.equal(api.nearest({drivers:drivers.slice(0,5),gpsPositions,orders},now),null);
});
test('expired availability and invalid positions never become eligible',()=>{
 const d=driver('a');d.availability.expiresAt=new Date(now-1).toISOString();assert.equal(api.online(d,now),false);
 for(const bad of [{timestamp:now+6000},{timestamp:now-90001},{accuracy:-1},{accuracy:101},{latitude:91},{longitude:181},{expiresAt:new Date(now-1).toISOString()}])assert.equal(api.position({...point('a',.12),...bad},now),false);
});

test('visible GPS fixes stop at signout, offline and expiry; no previous position is returned',()=>{const d=driver('a'),p=point('a',.12);assert.equal(api.visible({drivers:[d],gpsPositions:[p]},true,now).length,1);assert.equal(api.visible({drivers:[d],gpsPositions:[p]},false,now).length,0);d.availability.available=false;assert.equal(api.visible({drivers:[d],gpsPositions:[p]},true,now).length,0);d.availability.available=true;p.expiresAt=new Date(now-1).toISOString();assert.equal(api.visible({drivers:[d],gpsPositions:[p]},true,now).length,0);});
test('served map has one Leaflet dependency and exact content-addressed source, and no live provider tiles',()=>{const html=fs.readFileSync(__dirname+'/index.html','utf8'),match=html.match(/src="\.\/([^" ]*dispatch-map-interactive-[a-f0-9]+\.js)"/);assert.ok(match);assert.equal(fs.readFileSync(__dirname+'/'+match[1],'utf8'),fs.readFileSync(__dirname+'/dispatch-map-interactive.js','utf8'));assert.equal((html.match(/src="\.\/map-leaflet-1\.9\.4\.js"/g)||[]).length,1);assert.ok(!html.includes('src="./dispatch-map.js?'));const source=fs.readFileSync(__dirname+'/dispatch-map-interactive.js','utf8');assert.doesNotMatch(source,/tileLayer|localStorage|sessionStorage|watchPosition|geolocation|getCurrentPosition/);});
