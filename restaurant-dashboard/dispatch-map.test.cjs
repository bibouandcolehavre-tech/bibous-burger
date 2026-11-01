const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const window={};vm.runInNewContext(fs.readFileSync(__dirname+'/dispatch-map.js','utf8'),{window});
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
