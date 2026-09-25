const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),uber=require('./uber-direct');
const now=Date.parse('2026-09-25T17:00:00Z'),config={enabled:true,mode:'test',customerId:'test-customer',clientId:'fake',clientSecret:'fake',signingKey:'test-key',pickupPhone:'+33278088498'};
const order=()=>({id:'o1',number:1,method:'delivery',status:'preparing',payment:{status:'PAID'},customerId:'c1',customerName:'Fictif',customerPhone:'0600000000',deliveryAddress:{address:'1 rue fictive',postalCode:'76600',city:'Le Havre'},serviceDate:'2026-09-25',slot:'19:00 – 19:30',items:[{name:'Burger',price:10,quantity:1}],subtotal:10,total:14});
const quote={id:'dqt_fake',fee:650,currency:'eur',expires:new Date(now+600000).toISOString(),dropoff_eta:new Date(now+25*60000).toISOString()};
function prepare(){const o=order();uber.saveQuote(o,quote,uber.quoteInput(o,0,config,now),0,now);return o;}
function reserve(o){return uber.reserve(o,{confirm:true,fee:650,quoteId:quote.id},config,now);}
test('devis : commande acceptée, identité complète, jour et créneau proches, montants serveur',()=>{
 for(const change of [{method:'pickup'},{status:'confirmed'},{status:'awaiting_customer'},{customerPhone:''},{serviceDate:'2026-09-26'}])assert.throws(()=>uber.quoteInput({...order(),...change},10,config,now));
 const o=prepare();assert.equal(o.total,14);assert.equal(JSON.parse(o.uberDirect.payload.dropoff_address).country,'FR');
 assert.throws(()=>uber.saveQuote(o,{...quote,currency:'usd'},{},0,now));assert.throws(()=>uber.saveQuote(o,{...quote,fee:-1},{},0,now));
 assert.throws(()=>uber.reserve(o,{confirm:true,fee:1,quoteId:quote.id},config,now));o.items[0].quantity=2;assert.throws(()=>reserve(o));
});
test('confirmation manuelle persistante interdit doublons et prix client inchangé',()=>{
 const o=prepare(),payload=reserve(o);assert.equal(o.uberDirect.phase,'sending');assert.equal(payload.dropoff_phone_number,'+33600000000');assert.equal(payload.undeliverable_action,'return');assert.equal(o.total,14);assert.throws(()=>reserve(o));assert.throws(()=>uber.quoteInput(o,0,config,now));assert.ok(payload.external_id.includes(o.id));
});
test('suivi : compte de test, livraison associée, ordre des événements et URL sûres',()=>{
 const o=prepare();reserve(o);
 const data={id:'del_fictive',external_id:o.uberDirect.externalId,live_mode:false,status:'dropoff',updated:new Date(now+60000).toISOString(),tracking_url:'https://www.ubereats.com/orders/fictive'};
 assert.throws(()=>uber.applyDelivery(o,{...data,live_mode:true},config));assert.throws(()=>uber.applyDelivery(o,{...data,external_id:'other'},config));
 assert.equal(uber.applyDelivery(o,data,config),true);assert.equal(o.status,'out_for_delivery');
 assert.equal(uber.applyDelivery(o,{...data,status:'pickup',updated:new Date(now+120000).toISOString()},config),false);
 uber.applyDelivery(o,{...data,status:'delivered',updated:new Date(now+180000).toISOString()},config);assert.equal(o.status,'delivered');
 assert.equal(uber.publicDelivery(o).trackingUrl,data.tracking_url);assert.equal(uber.safeTracking('https://ubereats.com.evil.example/'),null);assert.equal(uber.safeTracking('javascript:alert(1)'),null);
});
test('signature sur octets bruts, altération et absence de signature rejetées',()=>{
 const raw=Buffer.from('{"name":"\\u00e9"}'),sig=crypto.createHmac('sha256','key').update(raw).digest('hex');
 assert.equal(uber.verifyWebhook(raw,sig,'key'),true);assert.equal(uber.verifyWebhook(Buffer.from('{"name":"é"}'),sig,'key'),false);assert.equal(uber.verifyWebhook(raw,'','key'),false);
});
test('client Uber désactivé sans accès et coupure réseau identifiée comme résultat incertain',async()=>{
 let calls=0;const disabled=uber.createClient({},()=>{calls++;});await assert.rejects(()=>disabled.create({}));assert.equal(calls,0);
 const client=uber.createClient(config,async url=>{if(url.includes('auth.uber'))return {ok:true,json:async()=>({access_token:'fake-token',expires_in:100})};throw Error('offline');});
 await assert.rejects(()=>client.create({}),e=>e.uncertain===true);
});
