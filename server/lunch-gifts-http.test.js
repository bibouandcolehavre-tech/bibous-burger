const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events'),{createCustomerSession}=require('./customer-session');
test('verified concurrent bank confirmations award five gifts, preserve all purchase points, and replays never add gifts',{timeout:30000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-lunch-http-')),file=path.join(dir,'data.json'),provider=path.join(dir,'provider.json');
  const secret='fictional-lunch-http-only',customers=Array.from({length:8},(_,i)=>({id:'c'+i,name:'Client fictif '+i,phone:'+336000000'+String(i).padStart(2,'0'),points:150}));
  const orders=customers.map((c,i)=>({id:'lunch-'+i,number:i+1,customerId:c.id,customerName:c.name,createdAt:'2026-11-03T10:55:00Z',
    serviceDate:'2026-11-03',slot:'12:30',method:'pickup',status:'awaiting_payment',subtotal:16.9,total:16.9,discount:0,deliveryFee:0,
    loyaltyBasePoints:15,wheelEurosPerTurn:15,items:[{productId:'taurus',name:'Taurus',quantity:1,price:16.9,options:[]}],
    payment:{provider:'sumup',status:'PENDING',checkoutId:'checkout-'+i,checkoutReference:'ref-'+i,merchantCode:'TEST'}}));
  const checkouts=Object.fromEntries(orders.map((o,i)=>['checkout-'+i,{id:'checkout-'+i,checkout_reference:'ref-'+i,amount:16.9,currency:'EUR',merchant_code:'TEST',status:'PAID'}]));
  await fs.writeFile(file,JSON.stringify({customers,orders,reservations:[],nextCustomerId:9,nextOrderNumber:9}));await fs.writeFile(provider,JSON.stringify({checkouts}));
  const child=spawn(process.execPath,['--require',path.join(__dirname,'test-fixtures/lunch-clock.cjs'),'--require',path.join(__dirname,'test-fixtures/sumup-provider.cjs'),path.join(__dirname,'server.js')],{
    cwd:dir,env:{PATH:process.env.PATH,NODE_ENV:'test',FICTITIOUS_LUNCH_CLOCK:'true',FAKE_SUMUP_FILE:provider,PORT:'0',DATA_FILE_PATH:file,
      SESSION_SECRET:secret,RESTAURANT_DASHBOARD_PASSWORD:'fictional-lunch-owner',SUMUP_API_KEY:'FAKE',SUMUP_MERCHANT_CODE:'TEST'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{let out='',err='';child.stdout.on('data',d=>{out+=d;const m=out.match(/http:\/\/localhost:(\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});child.stderr.on('data',d=>err+=d);child.once('error',reject);child.once('exit',()=>reject(Error(err)));});
  const request=async(route,token='',body,method=body?'POST':'GET')=>{const r=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:r.status===204?null:await r.json()};};
  const tokens=customers.map(c=>createCustomerSession(c.id,secret));
  assert.equal((await request('/api/lunch-gifts')).body.remaining,5);
  assert.ok((await request('/api/news')).body.items.some(i=>i.id==='lunch-gifts'));
  const replies=await Promise.all(orders.map((o,i)=>request('/api/payments/sumup-checkout/'+o.id,tokens[i])));
  for(const reply of replies)assert.equal(reply.status,200,JSON.stringify(reply));
  assert.equal(replies.filter(r=>r.body.order.lunchGift).length,5);
  for(const reply of replies)assert.equal(reply.body.pointsAdded,15);
  const stored=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(stored.lunchGiftCampaigns['first-five-lunch-20261103'].awards.length,5);
  assert.deepEqual(stored.customers.map(c=>c.points),Array(8).fill(165));
  assert.ok(stored.orders.every(o=>o.total===16.9&&o.items.length===1));
  assert.equal((await request('/api/lunch-gifts')).body.remaining,0);
  assert.ok(!(await request('/api/news')).body.items.some(i=>i.id==='lunch-gifts'));
  const replay=await Promise.all(orders.map((o,i)=>request('/api/payments/sumup-checkout/'+o.id,tokens[i])));
  assert.ok(replay.every(r=>r.body.pointsAdded===0));
  const after=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(after.lunchGiftCampaigns['first-five-lunch-20261103'].awards.length,5);assert.deepEqual(after.customers.map(c=>c.points),Array(8).fill(165));
  assert.equal((await request('/api/dashboard/orders/lunch-0/lunch-gift',tokens[0],{productId:'frites-maison'},'PATCH')).status,401);
  const own=await request('/api/customer/orders',tokens[0]);assert.ok(own.body.orders.every(o=>o.customerId==='c0'));
  const publicPage=await fetch(base+'/cadeaux-midi');assert.equal(publicPage.status,200);assert.match(await publicPage.text(),/points de classement/);
});

test('competing lunch carts reserve one discounted order and SumUp only opens for its acknowledged total', { timeout: 30000 }, async t => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-lunch-http-')),file=path.join(dir,'data.json'),provider=path.join(dir,'provider.json');
  const secret='fictional-lunch-http-only',customers=Array.from({length:8},(_,i)=>({id:'c'+i,name:'Client fictif '+i,phone:'+336000000'+String(i).padStart(2,'0'),points:150}));
  const campaign = { awards: [], discountDraws: { '2026-11-03': { afterPhysicalAwards: 0 } } };
  await fs.writeFile(file, JSON.stringify({ customers, orders: [], reservations: [], nextOrderNumber: 1,
    lunchGiftCampaigns: { 'first-five-lunch-20261103': campaign } }));
  await fs.writeFile(provider, JSON.stringify({ checkouts: {} }));
  const child=spawn(process.execPath,['--require',path.join(__dirname,'test-fixtures/lunch-clock.cjs'),'--require',path.join(__dirname,'test-fixtures/sumup-provider.cjs'),path.join(__dirname,'server.js')],{
    cwd:dir,env:{PATH:process.env.PATH,NODE_ENV:'test',FICTITIOUS_LUNCH_CLOCK:'true',FAKE_SUMUP_FILE:provider,PORT:'0',DATA_FILE_PATH:file,
      SESSION_SECRET:secret,RESTAURANT_DASHBOARD_PASSWORD:'fictional-lunch-owner',SUMUP_API_KEY:'FAKE',SUMUP_MERCHANT_CODE:'TEST', LUNCH_DISCOUNT_START_DATE:'2026-11-03', SUMUP_RETURN_URL:'https://example.invalid/return', SUMUP_REDIRECT_URL:'https://example.invalid/app'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{let out='',err='';child.stdout.on('data',d=>{out+=d;const m=out.match(/http:\/\/localhost:(\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});child.stderr.on('data',d=>err+=d);child.once('error',reject);child.once('exit',()=>reject(Error(err)));});
  const request=async(route,token='',body,method=body?'POST':'GET')=>{const r=await fetch(base+route,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:r.status===204?null:await r.json()};};
  const tokens=customers.map(c=>createCustomerSession(c.id,secret));
  const inputs = customers.slice(0, 2).map((c, i) => ({
    customerId: c.id, requestId: 'lunch-discount-attempt-' + i, method: 'pickup', serviceDate: '2026-11-03',
    slot: '12:30', lunchDiscountPreview: true, expectedTotalCents: 180,
    items: [{ productId: 'drink-coca', quantity: 1, selections: [] }],
  }));
  const created = await Promise.all(inputs.map((input, i) => request('/api/orders', tokens[i], input)));
  assert.ok(created.every(r => r.status === 201), JSON.stringify(created));
  const winners = created.filter(r => r.body.order.lunchDiscount);
  assert.equal(winners.length, 1);
  const order = winners[0].body.order;
  const i = customers.findIndex(c => c.id === order.customerId);
  assert.equal(order.total, 1.44);
  const recovered = await request('/api/customer/payment-attempts/' + inputs[i].requestId, tokens[i]);
  assert.equal(recovered.body.record.lunchDiscount.amountCents, 36);
  const open = amount => request('/api/payments/sumup-checkout', tokens[i], { orderId: order.id, acceptedTotalCents: amount });
  assert.equal((await open(180)).body.code, 'LUNCH_TOTAL_CONFIRMATION_REQUIRED');
  assert.deepEqual(JSON.parse(await fs.readFile(provider, 'utf8')).checkouts, {});
  const paidLink = await open(144);
  assert.equal(paidLink.status, 201, JSON.stringify(paidLink));
  const bank = JSON.parse(await fs.readFile(provider, 'utf8'));
  assert.equal(Object.values(bank.checkouts)[0].amount, 1.44);
  bank.checkouts[paidLink.body.checkoutId].status = 'PAID';
  await fs.writeFile(provider, JSON.stringify(bank));
  const verify = () => request('/api/payments/sumup-checkout/' + order.id, tokens[i]);
  assert.equal((await verify()).body.order.payment.status, 'PAID');
  assert.equal((await verify()).body.order.payment.status, 'PAID');
  const db = JSON.parse(await fs.readFile(file, 'utf8'));
  const awards = db.lunchGiftCampaigns['first-five-lunch-20261103'].awards;
  assert.equal(awards.length, 1);
  assert.equal(awards[0].kind, 'discount');
  assert.equal(db.orders.find(o => o.id === order.id).lunchGift, undefined);
});
