const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');

test('codes gérés au restaurant : pause, activation et cumul avec les 10 % de bienvenue', { timeout:20000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-merchant-promos-'));
  const file = path.join(dir, 'data.json'), providerFile = path.join(dir, 'sumup.json');
  const customer = { id:'customer-1', firstName:'Camille', lastName:'Test', name:'Camille Test', phone:'+33600000000',
    points:0, welcomeReward:{ status:'available' } };
  const exclusiveCustomer = { ...customer, id:'customer-2', firstName:'Alex', name:'Alex Test' };
  await fs.writeFile(file, JSON.stringify({ customers:[customer, exclusiveCustomer], orders:[], nextOrderNumber:1 }));
  await fs.writeFile(providerFile, JSON.stringify({ checkouts:{} }));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-fixtures/sumup-provider.cjs'), path.join(__dirname, 'server.js')], {
    cwd:dir, env:{ PATH:process.env.PATH, NODE_ENV:'test', PORT:'0', DATA_FILE_PATH:file,
      FAKE_SUMUP_FILE:providerFile, RESTAURANT_DASHBOARD_PASSWORD:'dashboard-test', SESSION_SECRET:'test-secret',
      SUMUP_API_KEY:'FAKE', SUMUP_MERCHANT_CODE:'TEST', SUMUP_RETURN_URL:'https://example.invalid/return', SUMUP_REDIRECT_URL:'https://example.invalid/app' }, stdio:['ignore','pipe','pipe']
  });
  t.after(async () => { child.kill(); if (child.exitCode === null) await once(child,'exit'); await fs.rm(dir,{ recursive:true, force:true }); });
  const base = await new Promise((resolve,reject) => {
    let output = '', errors = '';
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/localhost:\d+/); if (match) resolve(match[0] + '/api'); });
    child.on('error',reject); child.on('exit',() => reject(new Error(errors)));
  });
  const customerToken = createCustomerSession(customer.id,'test-secret');
  const request = async (route, method='GET', body, token=customerToken) => {
    const response = await fetch(base + route, { method, headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
      ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
    return { status:response.status, data:await response.json() };
  };
  const admin = (await request('/dashboard/auth/login','POST',{ password:'dashboard-test' },'')).data.token;
  assert.equal((await request('/dashboard/promotions')).status, 401);
  assert.deepEqual((await request('/dashboard/promotions','GET',undefined,admin)).data.promotions, []);
  const input = { code:'DUOBURGER', type:'bogo_burger', percent:0, productId:null, minimum:0, startsAt:null, endsAt:null,
    usageLimit:3, oncePerCustomer:true, enabled:false, message:'Deux burgers seuls : le moins cher offert.' };
  const saved = await request('/dashboard/promotions','POST',input,admin);
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  const draft = saved.data.promotions[0];
  const cart = { method:'pickup', items:[{ productId:'classique', quantity:2,
    selections:[{ groupId:'protein', id:'viande' },{ groupId:'salad', id:'roquette' },{ groupId:'sauces', id:'mayo' }] }] };
  assert.equal((await request('/promotions/validate','POST',{ code:'DUOBURGER', ...cart })).status,400);
  assert.equal((await request('/dashboard/promotions','PATCH',{ ...draft, enabled:true },admin)).status,409);
  assert.equal((await request('/dashboard/promotions','PATCH',{ ...draft, enabled:true, confirmActivation:true },admin)).status,200);
  const validated = await request('/promotions/validate','POST',{ code:'DUOBURGER', ...cart });
  assert.equal(validated.status,200,JSON.stringify(validated.data));
  assert.equal(validated.data.promotion.previewProductDiscount,9.9);
  const order = await request('/orders','POST',{ customerId:customer.id, serviceDate:parisDateKey(new Date(Date.now()+86400000)), slot:'19:00',
    promoCode:'DUOBURGER', requestId:'merchant-promo-test-0001', ...cart });
  assert.equal(order.status,201,JSON.stringify(order.data));
  assert.equal(order.data.order.subtotal,19.8);
  assert.equal(order.data.order.promotionDiscount,9.9);
  assert.equal(order.data.order.baseDiscount,.99);
  assert.equal(order.data.order.total,8.91);
  assert.equal(order.data.order.welcomeRewardApplied,true);
  assert.equal(order.data.order.payment,undefined);
  assert.equal((await request('/promotions/validate','POST',{ code:'DUOBURGER', ...cart })).status,409);
  const checkout = await request('/payments/sumup-checkout','POST',{ orderId:order.data.order.id });
  assert.equal(checkout.status,201,JSON.stringify(checkout.data));
  const provider = JSON.parse(await fs.readFile(providerFile,'utf8'));
  assert.equal(provider.checkouts[checkout.data.checkoutId].amount,8.91);
  assert.equal((JSON.parse(await fs.readFile(file,'utf8'))).customers[0].welcomeReward.status,'available');
  provider.checkouts[checkout.data.checkoutId].status = 'PAID';
  await fs.writeFile(providerFile, JSON.stringify(provider));
  assert.equal((await request(`/payments/sumup-checkout/${order.data.order.id}`)).status,200);
  assert.equal((JSON.parse(await fs.readFile(file,'utf8'))).customers[0].welcomeReward.status,'used');

  // The same server response is consumed by already-installed Android clients.
  const exclusiveToken = createCustomerSession(exclusiveCustomer.id,'test-secret');
  const exclusive = await request('/dashboard/promotions','POST',{ ...input, code:'QUATREBURGER', type:'buy3_get1_burger',
    combineWelcome:false, oncePerCustomer:false, usageLimit:null, enabled:true, confirmActivation:true,
    activeWindows:[{ startsAt:new Date(Date.now()-60000).toISOString(), endsAt:new Date(Date.now()+600000).toISOString() }] },admin);
  assert.equal(exclusive.status,200,JSON.stringify(exclusive.data));
  const fourBurgers = { ...cart, items:[{ ...cart.items[0], quantity:4 }] };
  const preview = await request('/promotions/validate','POST',{ code:'QUATREBURGER', ...fourBurgers },exclusiveToken);
  assert.equal(preview.status,200,JSON.stringify(preview.data));
  assert.equal(preview.data.promotion.combineWelcome,false);
  assert.equal(preview.data.promotion.previewBaseRate,0);
  assert.equal(preview.data.promotion.previewProductDiscount,9.9);
  const singleChoice = await request('/orders','POST',{ customerId:exclusiveCustomer.id,
    serviceDate:parisDateKey(new Date(Date.now()+86400000)), slot:'19:00', promoCode:'QUATREBURGER',
    requestId:'exclusive-promo-test-0001', welcomeRewardApplied:true, discountRate:.1,
    promotion:{ combineWelcome:true }, ...fourBurgers },exclusiveToken);
  assert.equal(singleChoice.status,201,JSON.stringify(singleChoice.data));
  assert.equal(singleChoice.data.order.subtotal,39.6);
  assert.equal(singleChoice.data.order.baseDiscount,0);
  assert.equal(singleChoice.data.order.total,29.7);
  assert.equal(singleChoice.data.order.welcomeRewardApplied,false);
  assert.doesNotMatch(singleChoice.data.order.discountLabel,/bienvenue/);
  const exclusiveCheckout = await request('/payments/sumup-checkout','POST',{ orderId:singleChoice.data.order.id },exclusiveToken);
  assert.equal(exclusiveCheckout.status,201,JSON.stringify(exclusiveCheckout.data));
  const exclusiveProvider = JSON.parse(await fs.readFile(providerFile,'utf8'));
  assert.equal(exclusiveProvider.checkouts[exclusiveCheckout.data.checkoutId].amount,29.7);
  exclusiveProvider.checkouts[exclusiveCheckout.data.checkoutId].status = 'PAID';
  await fs.writeFile(providerFile,JSON.stringify(exclusiveProvider));
  assert.equal((await request(`/payments/sumup-checkout/${singleChoice.data.order.id}`,'GET',undefined,exclusiveToken)).status,200);
  assert.equal((JSON.parse(await fs.readFile(file,'utf8'))).customers[1].welcomeReward.status,'available');
  const welcomeChoice = await request('/orders','POST',{ customerId:exclusiveCustomer.id,
    serviceDate:parisDateKey(new Date(Date.now()+86400000)), slot:'19:00',
    requestId:'exclusive-promo-test-0002', ...fourBurgers },exclusiveToken);
  assert.equal(welcomeChoice.status,201,JSON.stringify(welcomeChoice.data));
  assert.equal(welcomeChoice.data.order.welcomeRewardApplied,true);
  assert.equal(welcomeChoice.data.order.total,35.64);

  const existing = exclusive.data.promotions.find(item => item.code === 'QUATREBURGER');
  const futureWindow = await request('/dashboard/promotions','PATCH',{ ...existing, confirmActivation:true,
    activeWindows:[{ startsAt:new Date(Date.now()+600000).toISOString(), endsAt:new Date(Date.now()+1200000).toISOString() }] },admin);
  assert.equal(futureWindow.status,200,JSON.stringify(futureWindow.data));
  const before = await fs.readFile(file,'utf8');
  const unavailable = await request('/promotions/validate','POST',{ code:'QUATREBURGER', ...fourBurgers },exclusiveToken);
  assert.equal(unavailable.status,400);
  assert.match(unavailable.data.error,/pas actif sur cet horaire/);
  const refusedOrder = await request('/orders','POST',{ customerId:exclusiveCustomer.id,
    serviceDate:parisDateKey(new Date(Date.now()+86400000)), slot:'19:00', promoCode:'QUATREBURGER',
    requestId:'exclusive-promo-test-0003', ...fourBurgers },exclusiveToken);
  assert.equal(refusedOrder.status,400);
  assert.match(refusedOrder.data.error,/pas actif sur cet horaire/);
  assert.equal((JSON.parse(await fs.readFile(file,'utf8'))).orders.length,JSON.parse(before).orders.length);
});
