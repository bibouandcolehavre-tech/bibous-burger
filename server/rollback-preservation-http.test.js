const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCustomerSession } = require('./customer-session');
const { parisDateKey } = require('./availability');
const { validateAndPriceOrderItems } = require('./catalog');

test('repli : commandes :20 existantes encore payables, viande explicite conservée, sans client réel', {timeout:15000}, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'bibou-rollback-http-'));
  const databaseFile = path.join(directory,'data.json'), providerFile = path.join(directory,'sumup.json');
  const customer = {id:'rollback-fictional',name:'Client fictif',phone:'+33600000000',points:0};
  const priced = validateAndPriceOrderItems([{productId:'classique',quantity:1,selections:[{groupId:'protein',id:'viande'},{groupId:'meat-type',id:'halal'},{groupId:'salad',id:'sans-crudites'},{groupId:'sauces',id:'mayo'}]}]);
  const date = parisDateKey(new Date(Date.now()+86400000));
  const orders = ['pickup','delivery'].map((method,i)=>({id:'order-'+(i+1),number:i+1,customerId:customer.id,customerName:customer.name,customerPhone:customer.phone,method,serviceDate:date,slot:'19:20',slotDurationMinutes:20,preparationMinutes:20,items:priced.items,subtotal:9.9,discount:0,deliveryFee:method==='delivery'?3.99:0,total:method==='delivery'?13.89:9.9,status:'awaiting_payment',createdAt:new Date().toISOString()}));
  await fs.writeFile(databaseFile,JSON.stringify({customers:[customer],orders,nextOrderNumber:3}));
  await fs.writeFile(providerFile,JSON.stringify({checkouts:{}}));
  const child = spawn(process.execPath,['--require',path.join(__dirname,'test-fixtures/sumup-provider.cjs'),path.join(__dirname,'server.js')],{
    cwd:directory,env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',DATA_FILE_PATH:databaseFile,FAKE_SUMUP_FILE:providerFile,SESSION_SECRET:'rollback-test-only',SUMUP_API_KEY:'FAKE',SUMUP_MERCHANT_CODE:'TEST',SUMUP_RETURN_URL:'https://example.invalid/return',SUMUP_REDIRECT_URL:'https://example.invalid/app'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(directory,{recursive:true,force:true});});
  const base = await new Promise((resolve,reject)=>{
    let output='',errors='';
    child.stderr.on('data',d=>{errors+=d;});
    child.stdout.on('data',d=>{output+=d;const match=output.match(/http:\/\/localhost:\d+/);if(match)resolve(match[0]+'/api');});
    child.on('error',reject);child.on('exit',code=>reject(Error('API exit '+code+errors)));
  });
  const token = createCustomerSession(customer.id,'rollback-test-only');
  for(const order of orders){
    const opened=await fetch(base+'/payments/sumup-checkout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({orderId:order.id})});
    const checkout=await opened.json();assert.equal(opened.status,201,JSON.stringify(checkout));
    const provider=JSON.parse(await fs.readFile(providerFile,'utf8'));provider.checkouts[checkout.checkoutId].status='PAID';
    await fs.writeFile(providerFile,JSON.stringify(provider));
    const verified=await fetch(base+'/payments/sumup-checkout/'+order.id,{headers:{Authorization:'Bearer '+token}});
    const result=await verified.json();assert.equal(verified.status,200,JSON.stringify(result));
    assert.equal(result.order.payment.status,'PAID');assert.equal(result.order.slot,'19:20');
    assert.equal(result.order.slotDurationMinutes,20);assert.deepEqual(result.order.items,order.items);
  }
});
