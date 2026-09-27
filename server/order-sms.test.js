const test = require('node:test');
const assert = require('node:assert/strict');
const sms = require('./order-sms');
const { createDatabaseLock } = require('./database-lock');
const env = { RESTAURANT_ORDER_SMS_ENABLED:'true', RESTAURANT_ORDER_SMS_RECIPIENTS:'0600000000,+33700000000',
  KEYYO_CALL_SMS_ENABLED:'false', KEYYO_LINE:'0212345678', KEYYO_SIP_PASSWORD:'fake-only', KEYYO_WEBHOOK_SECRET:'w'.repeat(43), KEYYO_SMS_PRIVACY_KEY:'p'.repeat(43) };
const config = sms.configFromEnv(env);
const order = (overrides={}) => ({id:'order-1',number:1,method:'pickup',serviceDate:'2026-09-28',slot:'19:15',total:25.5,
  status:'confirmed',payment:{status:'PAID'},customerName:'Private Customer',customerPhone:'+33699999999',comment:'private allergy',...overrides});
function fixture(orders=[order()], sendSms=async()=>{}, extra={}) {
  let database = { orders };
  const lock = createDatabaseLock();
  const transact = async task => {
    const release = await lock();
    try { const copy = structuredClone(database); const result = task(copy); database = copy; return result; }
    finally { release(); }
  };
  const worker = sms.createWorker({config,transact,sendSms,...extra});
  return { get database(){return database;}, worker, transact };
}
test('Order SMS: two validated staff mobiles, private configuration and independent activation',()=>{
  assert.equal(sms.configured(config),true);
  assert.equal(sms.configured(sms.configFromEnv({})),false);
  for (const value of ['', 'anonymous', '0212345678', '0600000000,wrong','0600000000,0700000000,0611111111']) {
    assert.equal(sms.configured(sms.configFromEnv({...env,RESTAURANT_ORDER_SMS_RECIPIENTS:value})),false);
  }
  assert.deepEqual(sms.configFromEnv({...env,RESTAURANT_ORDER_SMS_RECIPIENTS:'0600000000,+33600000000'}).recipients,['33600000000']);
  const text = JSON.stringify(sms.status({orders:[]},config));
  assert.ok(!text.includes('33600000000') && !text.includes('fake-only'));
});
test('Order SMS: one GSM segment with reference, mode, date, time and total, no customer data',()=>{
  for (const item of [order(), order({method:'delivery',slot:'19:00 – 19:30'}),order({number:999999999999,total:999999,method:'delivery',slot:'19:00 – 19:30'})]) {
    const text = sms.messageFor(item);
    assert.ok(text.length<=160, text.length + ': ' + text);
    assert.match(text,/^[\x20-\x7e]+$/);
    assert.doesNotMatch(text,/[\[\]{}\\^~|]|Private|allergy|699999999/);
    assert.match(text,/https:\/\/bibous-burgers-restaurant.onrender.com\//);
  }
});
test('Order SMS: paid and gifted orders only, no duplicates or old-order startup backfill',async()=>{
  const sent=[]; const f=fixture([order()],async(...args)=>sent.push(args));
  await f.worker.tick(); assert.equal(sent.length,0); // Historical confirmed order is not scanned.
  assert.equal(sms.queueOrder(f.database,f.database.orders[0],config),true);
  assert.equal(sms.queueOrder(f.database,f.database.orders[0],config),false);
  await Promise.all([f.worker.tick(),f.worker.tick()]); await f.worker.tick(); await f.worker.tick();
  assert.deepEqual(sent.map(a=>a[0]),['33600000000','33700000000']);
  assert.equal(sms.status(f.database,config).counts.accepted,2);
  const serialized = JSON.stringify(f.database.restaurantOrderSms);
  assert.doesNotMatch(serialized,/33600000000|33700000000|fake-only|Private|message/);
  for (const item of [order({status:'awaiting_payment'}),order({payment:{status:'FAILED'}}),order({status:'cancelled'}),order({id:'review-order-1'}),order({isTest:true}),order({method:'reservation'})]) {
    assert.equal(sms.queueOrder({orders:[item]},item,config),false);
  }
  const free=order({id:'order-2',payment:{provider:'promotion',status:'PAID'},total:0});
  assert.equal(sms.queueOrder({orders:[free]},free,config),true);
});
test('Order SMS: restart, uncertain response and per-recipient failure never retry billable sends',async()=>{
  let sends=0;
  const f=fixture([order()],async()=>{sends++;if(sends===1) throw Error('secret transport failure');});
  sms.queueOrder(f.database,f.database.orders[0],config);
  await f.worker.tick(); await f.worker.tick();
  const restarted=sms.createWorker({config,transact:f.transact,sendSms:async()=>assert.fail('Must not retry')});
  await restarted.tick(); assert.equal(sends,2);
  assert.deepEqual(sms.status(f.database,config).counts,{uncertain:1,accepted:1});
  f.database.restaurantOrderSms.jobs[1].status='sending';
  await restarted.tick(); assert.equal(sms.status(f.database,config).counts.uncertain,2);
});
test('Order SMS: persist reservation before sending and never hold database lock during network',async()=>{
  let releaseNetwork;
  const f=fixture([order()],async()=>{assert.equal(f.database.restaurantOrderSms.jobs[0].status,'sending');await new Promise(r=>releaseNetwork=r);});
  sms.queueOrder(f.database,f.database.orders[0],config);
  const running=f.worker.tick();
  await new Promise(resolve=>setImmediate(resolve));
  await f.transact(db=>{db.orders[0].status='preparing';});
  releaseNetwork(); await running;
  assert.equal(f.database.orders[0].status,'preparing');
  let calls=0;
  const worker=sms.createWorker({config,transact:async()=>{throw Error('disk full');},sendSms:async()=>calls++});
  await assert.rejects(worker.tick()); assert.equal(calls,0);
});
test('Order SMS: cancellation, removed recipient and stale queued jobs are suppressed',async()=>{
  let time=Date.now();const f=fixture([order()],async()=>assert.fail('No send'),{now:()=>time});
  sms.queueOrder(f.database,f.database.orders[0],config,time);
  f.database.orders[0].status='cancelled';await f.worker.tick();
  assert.equal(sms.status(f.database,config).counts.cancelled,2);
  const expired=fixture([order()],async()=>assert.fail('Expired'),{now:()=>time});
  sms.queueOrder(expired.database,expired.database.orders[0],config,time);
  time+=31*60000;await expired.worker.tick();assert.equal(sms.status(expired.database,config).counts.expired,2);
  const removed=fixture();sms.queueOrder(removed.database,removed.database.orders[0],config);
  const newConfig=sms.configFromEnv({...env,RESTAURANT_ORDER_SMS_RECIPIENTS:'0611111111'});
  await sms.createWorker({config:newConfig,transact:removed.transact,sendSms:async()=>assert.fail('Changed recipient')}).tick();
  assert.equal(sms.status(removed.database,newConfig).counts.cancelled,2);
});
test('Order SMS: bounded queue, old log pruning retains order marker, backup never replays sends',async()=>{
  const db={orders:[]};for(let n=1;n<=101;n++){const o=order({id:'order-'+n,number:n});db.orders.push(o);sms.queueOrder(db,o,config);}
  assert.equal(db.restaurantOrderSms.jobs.length,200);
  assert.equal(db.orders.at(-1).restaurantSmsQueueError,'queue_full');
  const backup=sms.backupDatabase(db);
  assert.ok(backup.restaurantOrderSms.jobs.every(j=>j.status==='uncertain'&&!j.message));
  assert.equal(db.restaurantOrderSms.jobs[0].status,'queued');
  db.restaurantOrderSms.jobs.forEach(j=>{j.status='accepted';j.createdAt=0;});
  const next=order({id:'order-102',number:102});db.orders.push(next);sms.queueOrder(db,next,config);
  assert.equal(db.restaurantOrderSms.jobs.length,2);
  assert.equal(sms.queueOrder(db,db.orders[0],config),false);
});
