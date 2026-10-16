'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createSessionRecovery}=require('../session-recovery'),{createSessionStorage}=require('../session-storage-queue');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(options={}) {
  let token='fixture-token',cleared=0,current=true,foreground=true;
  const calls=[],timers=[];
  const storage=createSessionStorage({read:async()=>token,write:async value=>{token=value;},clear:async()=>{token=null;cleared++;}});
  const recovery=createSessionRecovery({read:storage.read,clear:storage.clearIf,verify:async()=>({ok:true,status:200,payload:{customer:{id:'fixture'}}}),
    onRestored:(...args)=>calls.push(['restored',...args]),onAbsent:reason=>calls.push(['absent',reason]),onUnavailable:()=>calls.push(['unavailable']),
    isCurrent:()=>current,canRetry:()=>foreground,schedule:(fn,ms)=>{const entry={fn,ms};timers.push(entry);return entry;},cancel:entry=>{entry.cancelled=true;},...options});
  return {recovery,storage,calls,timers,token:()=>token,cleared:()=>cleared,setToken:value=>{token=value;},setCurrent:value=>{current=value;},setForeground:value=>{foreground=value;}};
}
test('temporary network failure keeps the saved login and retries automatically',async()=>{
  let attempts=0;const h=fixture({verify:async()=>{if(++attempts===1)throw Error('offline');return {ok:true,status:200,payload:{customer:{id:'fixture'}}};}});
  await h.recovery.retry();assert.equal(h.token(),'fixture-token');assert.equal(h.cleared(),0);assert.deepEqual(h.calls,[['unavailable']]);assert.equal(h.timers[0].ms,5000);
  h.timers[0].fn();await new Promise(r=>setImmediate(r));assert.equal(h.calls[1][0],'restored');assert.equal(attempts,2);assert.equal(h.cleared(),0);
});
test('HTTP errors or malformed success are not treated as a logout',async()=>{
  for(const response of [{ok:false,status:503},{ok:false,status:429},{ok:false,status:403},{ok:true,status:200,payload:{}}]){
    const h=fixture({verify:async()=>response});await h.recovery.retry();assert.equal(h.cleared(),0);assert.deepEqual(h.calls,[['unavailable']]);h.recovery.stop();
  }
});
test('only a confirmed invalid current session is removed',async()=>{
  const h=fixture({verify:async()=>({ok:false,status:401})});await h.recovery.retry();assert.equal(h.token(),null);assert.equal(h.cleared(),1);assert.deepEqual(h.calls,[['absent','invalid']]);
  await h.recovery.retry();assert.equal(h.cleared(),1);
});
test('no stored session permits ordinary login without an API request',async()=>{
  const h=fixture({verify:async()=>assert.fail('No token must not be verified')});h.setToken(null);await h.recovery.retry();assert.deepEqual(h.calls,[['absent','absent']]);
});
test('late unauthorized response never clears a newer sign-in',async()=>{
  const wait=deferred();let count=0;const h=fixture({verify:async token=>{if(++count===1)return wait.promise;assert.equal(token,'new-fixture');return {ok:true,status:200,payload:{customer:{id:'new'}}};}});
  const running=h.recovery.retry();await new Promise(r=>setImmediate(r));await h.storage.write('new-fixture');wait.resolve({ok:false,status:401});await running;
  assert.equal(h.token(),'new-fixture');assert.equal(h.cleared(),0);assert.deepEqual(h.calls,[['restored','new-fixture',{id:'new'}]]);
});
test('late success cannot restore an account after explicit logout',async()=>{
  const wait=deferred(),h=fixture({verify:()=>wait.promise});const running=h.recovery.retry();await new Promise(r=>setImmediate(r));h.setCurrent(false);h.recovery.stop();await h.storage.clear();
  wait.resolve({ok:true,status:200,payload:{customer:{id:'old'}}});await running;assert.deepEqual(h.calls,[]);assert.equal(h.token(),null);
});
test('retry pauses in background and resumes without requesting another SMS',async()=>{
  let verifies=0;const h=fixture({verify:async()=>{verifies++;throw Error('offline');}});await h.recovery.retry();h.setForeground(false);h.timers[0].fn();await new Promise(r=>setImmediate(r));assert.equal(verifies,1);
  h.setForeground(true);await h.recovery.retry();assert.equal(verifies,2);assert.equal(h.cleared(),0);h.recovery.stop();
});
test('temporarily locked secure storage is retried without deleting it',async()=>{
  let reads=0;const h=fixture({read:async()=>{if(++reads===1)throw Error('device locked');return 'fixture-token';}});await h.recovery.retry();assert.equal(h.cleared(),0);await h.recovery.retry();assert.equal(h.calls[1][0],'restored');
});
test('concurrent focus events do not duplicate restore calls and retries back off',async()=>{
  const wait=deferred();let verifies=0;const h=fixture({verify:()=>{verifies++;return wait.promise;}});const one=h.recovery.retry();await new Promise(r=>setImmediate(r));await h.recovery.retry();assert.equal(verifies,1);wait.reject(Error('offline'));await one;
  await h.recovery.retry();await h.recovery.retry();assert.deepEqual(h.timers.map(t=>t.ms),[5000,5000,15000]);h.recovery.stop();assert.ok(h.timers.at(-1).cancelled);
});
test('conditional invalidation is serialized with a new login and respects cancellation',async()=>{
  const h=fixture();await h.storage.write('new-fixture');assert.equal(await h.storage.clearIf('fixture-token'),false);assert.equal(await h.storage.clearIf('new-fixture',()=>false),false);assert.equal(h.token(),'new-fixture');assert.equal(h.cleared(),0);
});
for(const platform of ['native','web'])test(`${platform}: a delayed session save cannot complete after logout`,async()=>{
  let token=null;const wait=deferred(),calls=[];
  const mock={getItemAsync:async key=>{assert.equal(key,'bibousCustomerSession');return token;},setItemAsync:async(key,value,options)=>{assert.equal(key,'bibousCustomerSession');assert.equal(options.keychainAccessible,'when-unlocked-device-only');calls.push('save-start');await wait.promise;token=value;calls.push('save-end');},deleteItemAsync:async()=>{token=null;calls.push('clear');},WHEN_UNLOCKED_THIS_DEVICE_ONLY:'when-unlocked-device-only'};
  const source=fs.readFileSync(path.join(__dirname,`../client-storage.${platform}.js`),'utf8').replace(/^import .*;\n/gm,'').replace(/export const /g,'const ');
  const storage={getItem:()=>token,setItem:(_,value)=>{token=value;},removeItem:()=>{token=null;}};
  const context={require:name=>{assert.equal(name,'./session-storage-queue');return {createSessionStorage};},SecureStore:mock,AsyncStorage:{},globalThis:{localStorage:storage}};
  vm.createContext(context);vm.runInContext(source+'\nglobalThis.exports={readSession,saveSession,clearSession,clearSessionIf};',context);
  const api=context.globalThis.exports,saving=api.saveSession('fixture-token'),clearing=api.clearSession(),reading=api.readSession();
  await new Promise(r=>setImmediate(r));if(platform==='native')assert.deepEqual(calls,['save-start']);wait.resolve();await Promise.all([saving,clearing]);assert.equal(await reading,null);
  await api.saveSession('new-fixture');assert.equal(await api.readSession(),'new-fixture');assert.equal(await api.clearSessionIf('fixture-token'),false);assert.equal(await api.readSession(),'new-fixture');
  if(platform==='native')assert.deepEqual(calls.slice(0,3),['save-start','save-end','clear']);
});
