const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const service=require('./service-orders.js');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const make=(id,date,slot,status='Nouvelle')=>({id,apiId:'test-'+id,customer:'Exemple '+id,phone:'',type:'Retrait',status,items:[{name:'Burger <fictif>',quantity:1,options:[]}],total:12,raw:{serviceDate:date,slot,payment:{status:'PAID'}}});
test('today retains overdue, unknown dates and refunds; future dates are separate and sorted without mutating data',()=>{
  const rows=[make(1,'2026-10-29','12:30'),make(2,'2026-10-28','20:00'),make(3,'2026-10-28','19:00'),make(4,null,'19:10'),make(5,'2026-10-27','21:00'),make(6,'2026-10-30','18:00')];
  rows[5].refund={status:'due',amount:3};const before=JSON.stringify(rows);
  assert.deepEqual(service.select(rows,'today','2026-10-28').map(o=>o.id),[4,5,6,3,2]);
  assert.deepEqual(service.select(rows,'future','2026-10-28').map(o=>o.id),[1]);
  assert.equal(JSON.stringify(rows),before);assert.equal(service.validDay('2026-02-31'),false);
});
test('multiple active cards expose products, remarks and next actions without selecting an order',()=>{
  const rows=[make(1,'2026-10-28','20:00'),make(2,'2026-10-28','19:00','Acceptée'),make(3,'2026-10-29','12:00')];
  rows[0].comment='Sans oignon <script>bad</script>';
  const nodes=new Map();const node=s=>{if(!nodes.has(s))nodes.set(s,{hidden:false,innerHTML:'',textContent:''});return nodes.get(s);};
  const context={Set,Map,Date,Number,String,orders:rows,filter:'all',servicePeriod:'today',archiveSearch:'',selectedOrderId:null,openOrderDisclosures:new Set(),pendingPrints:new Set(),uncertainPrints:new Set(),pendingOrderChanges:new Set(),printFeedback:new Map(),
    window:{KrokliServiceOrders:service,KrokliPhoneContact:{markup:()=>'<a>Appeler</a>'}},feedHealth:{orders:{lastSuccess:Date.now(),error:false}},todayDateKey:()=> '2026-10-28',active:()=>rows,cashDue:()=>false,
    escapeHtml:s=>String(s??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])),euro:n=>n+' €',serviceDateLabel:s=>s,
    orderItemMarkup:item=>'<p>'+String(item.name).replaceAll('<','&lt;').replaceAll('>','&gt;')+'</p>',orderPricingMarkup:()=>'',amendmentMarkup:()=>'',actionMarkup:o=>'<button>'+ (o.status==='Nouvelle'?'Accepter':'Marquer prête') +'</button>',
    document:{querySelector:node,querySelectorAll:()=>[]}};
  vm.runInNewContext(source.slice(source.indexOf('function renderOrders()'),source.indexOf('function refreshMetrics()')),context);context.renderOrders();
  let html=node('#orders-list').innerHTML;
  assert.equal((html.match(/data-service-order=/g)||[]).length,2);assert.ok(html.indexOf('test-2')<html.indexOf('test-1'));
  assert.match(html,/Accepter/);assert.match(html,/Marquer prête/);assert.match(html,/Sans oignon &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.equal(node('#order-queue').innerHTML,'');assert.equal(node('#service-future-count').textContent,1);
  context.servicePeriod='future';context.renderOrders();html=node('#orders-list').innerHTML;assert.match(html,/test-3/);assert.doesNotMatch(html,/test-1|test-2/);
});
function changes({future=false,type='Retrait',confirmation=true}={}) {
  const order=make(42,future?'2026-10-29':'2026-10-28','19:00');order.type=type;
  const requests=[],prompts=[];
  const context={orders:[order],pendingOrderChanges:new Set(),window:{KrokliServiceOrders:service},dashboardToken:'fake-local-session',todayDateKey:()=> '2026-10-28',serviceDateLabel:s=>s,
    confirmServiceAction:async text=>{prompts.push(text);return typeof confirmation==='function'?confirmation(context):confirmation;},
    renderOrders(){},refreshMetrics(){},setOrderFilter(){},showToast(){},filter:'all',API_BASE_URL:'/fake',dashboardHeaders:headers=>headers,statusForLabel:{'Acceptée':'preparing','Prête':'ready','Terminée':'delivered'},orderAlarm:{resolve(){}},
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true};},AbortSignal};
  vm.runInNewContext(source.slice(source.indexOf('async function changeOrder('),source.indexOf('async function changeReservation(')),context);
  return {context,order,requests,prompts};
}
test('today acceptance is one request without a redundant confirmation',async()=>{
  const f=changes();await f.context.changeOrder(42,'Acceptée');assert.equal(f.prompts.length,0);assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.status,'preparing');
});
test('delivery readiness and a future acceptance require confirmation; cancelling writes nothing',async()=>{
  for(const args of [{type:'Livraison',target:'Prête'},{future:true,target:'Acceptée'}]){
    const f=changes({...args,confirmation:false});await f.context.changeOrder(42,args.target);assert.equal(f.prompts.length,1);assert.equal(f.requests.length,0);assert.equal(f.order.status,'Nouvelle');
  }
});
test('changing the signed-in session while confirmation is open prevents the order update',async()=>{
  const f=changes({type:'Livraison',confirmation:context=>{context.dashboardToken='other-fake-session';return true;}});await f.context.changeOrder(42,'Prête');assert.equal(f.requests.length,0);
});
