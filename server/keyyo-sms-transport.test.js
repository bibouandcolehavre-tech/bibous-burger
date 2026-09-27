const test = require('node:test');
const assert = require('node:assert/strict');
const k = require('./keyyo-call-sms');
const sms = require('./order-sms');
const config = k.configFromEnv({ KEYYO_CALL_SMS_ENABLED:'true', KEYYO_LINE:'0212345678',
  KEYYO_WEBHOOK_SECRET:'w'.repeat(43), KEYYO_SMS_PRIVACY_KEY:'p'.repeat(43), KEYYO_SIP_PASSWORD:'secret-test-only' });
const challenge = () => new Response('', {status:401,headers:{'www-authenticate':'Digest realm="keyyo",nonce="test",qop="auth"'}});
const refusal = () => new Response('Comeback later...', {status:500,statusText:'Comeback later...'});
function virtualClock(onWait = () => {}) {
  let time = 1000;
  const waits = [];
  return { waits, now:()=>time, scheduler:k.createSmsScheduler({now:()=>time, wait:async ms=>{waits.push(ms);time+=ms;await onWait(ms);}}) };
}
test('Staff sender retries only explicit provider refusal and spaces both mobiles and Digest requests', async () => {
  const clock = virtualClock(), calls = [], accepted = [];
  let refuseSecond = true;
  const sender = k.createSender(config, async (url, options) => {
    const parsed = new URL(url), to = parsed.searchParams.get('CALLEE');
    calls.push({at:clock.now(),url,options});
    if (!options.headers.Authorization) return challenge();
    if (to === '33700000000' && refuseSecond) {refuseSecond=false;return refusal();}
    accepted.push(to);return new Response('OK');
  }, {scheduler:clock.scheduler,retryDelays:[30000,60000]});
  const results = await Promise.all([sender('33600000000','TEST'),sender('33700000000','TEST')]);
  assert.deepEqual(results.map(r=>r.attempts),[1,2]);
  assert.deepEqual(accepted,['33600000000','33700000000']);
  assert.equal(calls.length,6);assert.ok(clock.waits.includes(30000));
  assert.ok(calls.slice(1).every((c,i)=>c.at-calls[i].at>=1500));
  assert.ok(calls.every(c=>c.url.startsWith('https://ssl.keyyo.com/sendsms.html?')&&c.options.redirect==='error'));
  assert.ok(!JSON.stringify(calls).includes(config.sipPassword));
});
test('Temporary refusals stop after three attempts and retain only safe diagnostics', async () => {
  const clock = virtualClock();let calls=0;
  const sender=k.createSender(config,async()=>{calls++;return refusal();},{scheduler:clock.scheduler,retryDelays:[30000,60000]});
  await assert.rejects(sender('33600000000','private message'),e=>{
    assert.equal(e.keyyoReason,'temporary_refusal');assert.equal(e.providerStatus,500);assert.equal(e.attempts,3);
    assert.doesNotMatch(JSON.stringify(e),/33600000000|private message|secret-test-only/);return true;
  });
  assert.equal(calls,3);assert.deepEqual(clock.waits,[30000,60000]);
});
test('Generic errors, false refusal text, lost responses and successful sends are never retried',async()=>{
  for(const response of [()=>new Response('Error',{status:500}),()=>new Response('Comeback later...', {status:503}),
    ()=>new Response('Comeback later...', {status:200}),()=>new Response('Comeback later... accepted',{status:500}),
    ()=>new Response('Comeback later...', {status:429}),()=>{throw Error('secret network data');},
    ()=>({status:200,ok:true,text:async()=>{throw Error('response lost');}})]) {
    const clock=virtualClock();let calls=0;
    const sender=k.createSender(config,async()=>{calls++;return response();},{scheduler:clock.scheduler,retryDelays:[30000,60000]});
    await assert.rejects(sender('33600000000','test'));assert.equal(calls,1);assert.deepEqual(clock.waits,[]);
  }
  const clock=virtualClock();let calls=0;
  const sender=k.createSender(config,async()=>{calls++;return new Response('OK');},{scheduler:clock.scheduler,retryDelays:[30000,60000]});
  assert.deepEqual(await sender('33600000000','test'),{accepted:true,attempts:1});assert.equal(calls,1);
});
test('Cancellation during backoff prevents a second provider attempt',async()=>{
  let allowed=true,calls=0;const clock=virtualClock(ms=>{if(ms>=30000)allowed=false;});
  const sender=k.createSender(config,async()=>{calls++;return refusal();},{scheduler:clock.scheduler,retryDelays:[30000,60000]});
  await assert.rejects(sender('33600000000','test',{canSend:async()=>allowed}),e=>e.keyyoReason==='cancelled');
  assert.equal(calls,1);
});
test('Independent sender instances share pacing and a failure does not poison the next send',async()=>{
  const clock=virtualClock(), times=[];
  const failed=k.createSender(config,async()=>{times.push(clock.now());return refusal();},{scheduler:clock.scheduler});
  const good=k.createSender(config,async()=>{times.push(clock.now());return new Response('OK');},{scheduler:clock.scheduler});
  const result=await Promise.allSettled([failed('33600000000','test'),good('33700000000','test')]);
  assert.deepEqual(result.map(r=>r.status),['rejected','fulfilled']);assert.deepEqual(times,[1000,2500]);
  // Call-triggered messages retain their non-retry policy by default.
  assert.equal(result[0].reason.attempts,1);
});
test('Order worker observes cancellation during refusal backoff and records no sensitive provider text',async()=>{
  const cfg={enabled:true,recipients:['33600000000','33700000000'],sender:config};
  const order={id:'order-1',number:1,method:'pickup',total:12,status:'confirmed',payment:{status:'PAID'}};
  const db={orders:[order]};sms.queueOrder(db,order,cfg);
  let calls=0;const clock=virtualClock(ms=>{if(ms>=30000)order.status='cancelled';});
  const sendSms=k.createSender(config,async()=>{calls++;return refusal();},{scheduler:clock.scheduler,retryDelays:[30000,60000]});
  const worker=sms.createWorker({config:cfg,transact:async fn=>fn(db),sendSms});
  await worker.tick();await worker.tick();
  assert.equal(calls,1);assert.equal(sms.status(db,cfg).counts.cancelled,2);
  assert.equal(db.restaurantOrderSms.jobs[0].reason,'cancelled');
  assert.doesNotMatch(JSON.stringify(db.restaurantOrderSms),/Comeback|secret-test-only|33600000000|33700000000/);
});
test('Order worker records an exhausted refusal as rejected and never replays it on later ticks',async()=>{
  const cfg={enabled:true,recipients:['33600000000'],sender:config};
  const order={id:'order-1',number:1,method:'pickup',total:12,status:'confirmed',payment:{status:'PAID'}};
  const db={orders:[order]};sms.queueOrder(db,order,cfg);const clock=virtualClock();let calls=0;
  const sendSms=k.createSender(config,async()=>{calls++;return refusal();},{scheduler:clock.scheduler,retryDelays:[30000,60000]});
  const worker=sms.createWorker({config:cfg,transact:async fn=>fn(db),sendSms});await worker.tick();await worker.tick();
  assert.equal(calls,3);assert.equal(db.restaurantOrderSms.jobs[0].status,'rejected');
  assert.equal(db.restaurantOrderSms.jobs[0].reason,'temporary_refusal');assert.equal(db.restaurantOrderSms.jobs[0].providerStatus,500);
  assert.equal(db.restaurantOrderSms.jobs[0].attempts,3);
});
