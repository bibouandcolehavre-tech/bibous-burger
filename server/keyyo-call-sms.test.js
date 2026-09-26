const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const k = require('./keyyo-call-sms');
const config = k.configFromEnv({ KEYYO_CALL_SMS_ENABLED:'true', KEYYO_LINE:'0212345678', KEYYO_WEBHOOK_SECRET:'w'.repeat(43), KEYYO_SMS_PRIVACY_KEY:'p'.repeat(43), KEYYO_SIP_PASSWORD:'test-only' });
function event(overrides={}) { return new URLSearchParams({ key:config.webhookSecret,account:config.account,callee:config.account,caller:'0600000000',type:'SETUP',callref:'test-call-0001',session:'',ts:String(Date.now()),...overrides }); }
async function fixture(t,sendSms=async()=>{}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-keyyo-test-')),file=path.join(dir,'calls.json');
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  return {file, service:k.createCallSms({config,file,sendSms})};
}
test('Keyyo disabled by default, requires three secrets, and SMS fits one GSM segment',()=>{
  assert.equal(k.configured(k.configFromEnv({})),false);
  assert.equal(k.configured({...config,sipPassword:''}),false);
  assert.equal(k.configured({...config,webhookSecret:'short'}),false);
  assert.equal(k.configured(config),true);
  assert.ok(k.smsText(config,'a'.repeat(22)).length<=160);
  assert.match(k.smsText(config,'a'.repeat(22)),/Stop SMS/);
  for(const n of ['0678 12 34 56','+33678123456','0033678123456']) assert.equal(k.phone(n),'33678123456');
  for(const n of ['anonymous','+441234567890','abc0678123456','330678123456']) assert.equal(k.phone(n),null);
});
test('Keyyo digest RFC example and unsupported/security cases',()=>{
  const challenge='Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"';
  const result=k.digestAuthorization(challenge,{account:'Mufasa',sipPassword:'Circle Of Life'},'/dir/index.html','0a4f113b');
  assert.match(result,/response="6629fae49393a05397450978507c4ef1"/);
  assert.throws(()=>k.digestAuthorization('Basic realm="test"',config,'/'));
  assert.throws(()=>k.digestAuthorization('Digest realm="x",nonce="n",qop="auth-int"',config,'/'));
  assert.throws(()=>k.digestAuthorization('Digest realm="x\r\nx",nonce="n"',config,'/'));
});
test('answered AND unanswered calls queue at initiation, no duplicate on CONNECT/RELEASE/replayed SETUP',async t=>{
  const sent=[],{service,file}=await fixture(t,async(...args)=>sent.push(args));
  assert.equal((await service.receive(event())).status,'queued');
  assert.equal((await service.receive(event({type:'CONNECT'}))).status,'ignored');
  assert.equal((await service.receive(event({type:'RELEASE'}))).status,'ignored');
  assert.equal((await service.receive(event())).status,'duplicate');
  assert.equal((await service.receive(event({callref:'test-missed-0002',caller:'0700000000'}))).status,'queued');
  await Promise.all([service.tick(),service.tick()]); await service.tick();
  assert.equal(sent.length,2);
  assert.deepEqual(sent.map(s=>s[0]),['33600000000','33700000000']);
  const persisted=await fs.readFile(file,'utf8');
  assert.ok(!persisted.includes('33600000000') && !persisted.includes('33700000000'));
  assert.equal((await service.status()).counts.accepted,2);
});
test('outbound, hidden, landlines, other account and stale/unauthenticated notifications never send',async t=>{
  const {service}=await fixture(t,async()=>assert.fail('No SMS expected'));
  for(const override of [{caller:config.account,callee:'0600000000'},{caller:'anonymous'},{caller:'0212345680'},{account:'33123456789'},{callee:'33123456789'}]) {
    assert.equal((await service.receive(event(override))).status,'ignored');
  }
  for(const override of [{key:''},{ts:'0'},{ts:String(Date.now()-11*60000)},{ts:String(Date.now()+11*60000)},{callref:'_CALLREF_'},{session:'_SESSION_ID_'}]) await assert.rejects(service.receive(event(override)));
  const duplicate=event();duplicate.append('caller','0700000000');await assert.rejects(service.receive(duplicate));
  await service.tick();assert.equal((await service.status()).counts.accepted,undefined);
});
test('parallel notifications and multiple standard legs deduplicate durably across restart',async t=>{
  const sent=[],{service,file}=await fixture(t,async()=>sent.push(true));
  const events=await Promise.all([service.receive(event({session:'session-0001'})),service.receive(event({session:'session-0001',callref:'other-leg-0001'}))]);
  assert.deepEqual(events.map(x=>x.status).sort(),['duplicate','queued']);
  const restarted=k.createCallSms({config,file,sendSms:async()=>sent.push(true)});
  await restarted.tick();
  assert.equal((await restarted.receive(event({session:'session-0001'}))).status,'duplicate');
  assert.equal(sent.length,1);
});
test('ambiguous send and interrupted send are never retried automatically',async t=>{
  let attempts=0;const {service,file}=await fixture(t,async()=>{attempts++;throw Error('provider response lost');});
  await service.receive(event());await service.tick();await service.tick();
  assert.equal(attempts,1);assert.equal((await service.status()).counts.uncertain,1);
  const state=JSON.parse(await fs.readFile(file,'utf8'));state.calls[0].status='sending';await fs.writeFile(file,JSON.stringify(state));
  const restarted=k.createCallSms({config,file,sendSms:async()=>assert.fail('No retry')});
  await restarted.tick();assert.equal((await restarted.status()).counts.uncertain,1);
});
test('opt-out cancels pending and future calls; no known account is required',async t=>{
  const {service,file}=await fixture(t,async()=>assert.fail('Opted out'));
  await service.receive(event());
  const token=JSON.parse(await fs.readFile(file,'utf8')).calls[0].token;
  await service.optOut(token);await service.optOut(token);await service.tick();
  assert.equal((await service.receive(event({callref:'future-call-0002'}))).status,'opted_out');
  assert.equal((await service.status()).optedOut,1);
  await assert.rejects(service.optOut('unknown'.padEnd(22,'x')));
  assert.ok(!(await fs.readFile(file,'utf8')).includes('33600000000'));
});
test('old queued calls expire, corrupted ledger fails closed, idle worker does not create a file',async t=>{
  const {service,file}=await fixture(t,async()=>assert.fail('Expired'));
  await service.tick();await assert.rejects(fs.access(file));
  await service.receive(event());
  const state=JSON.parse(await fs.readFile(file,'utf8'));state.calls[0].createdAt=Date.now()-11*60000;await fs.writeFile(file,JSON.stringify(state));
  await service.tick();assert.equal((await service.status()).counts.expired,1);
  await fs.writeFile(file,'broken');await assert.rejects(service.receive(event()));
  assert.equal(await fs.readFile(file,'utf8'),'broken');
});
test('backup preserves opt-outs without telephone numbers, credentials or replayable pending sends',async t=>{
  const {service}=await fixture(t);
  await service.receive(event());
  const backup=await service.backupState();assert.equal(backup.calls[0].status,'uncertain');
  assert.equal(backup.calls[0].recipient,undefined);
  await service.optOut(backup.calls[0].token);
  assert.equal((await service.backupState()).optOuts[0],backup.calls[0].token);
  assert.ok(!JSON.stringify(backup).includes('33600000000'));
  assert.ok(!JSON.stringify(backup).includes(config.sipPassword));
});
test('Keyyo sender authenticates only to HTTPS vendor endpoint and requires OK',async()=>{
  const calls=[];
  const sender=k.createSender(config,async(url,options)=>{
    calls.push({url,options});
    if(calls.length===1)return new Response('',{status:401,headers:{'www-authenticate':'Digest realm="keyyo",nonce="test-nonce",qop="auth"'}});
    return new Response('OK');
  });
  await sender('33600000000',k.smsText(config,'x'.repeat(22)));
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url.startsWith('https://ssl.keyyo.com/sendsms.html?')));
  assert.match(calls[1].options.headers.Authorization,/^Digest /);
  assert.equal(calls[1].options.redirect,'error');assert.ok(!JSON.stringify(calls).includes(config.sipPassword));
  await assert.rejects(k.createSender(config,async()=>new Response('Error'))('33600000000','test'));
  await assert.rejects(k.createSender(config,async()=>assert.fail('No network'))('33123456789','test'));
});
