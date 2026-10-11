const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
function screen(){
  const details=new Map(),nodes=new Map(),closeButtons=[];
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:false,innerHTML:''});return nodes.get(selector);};
  const list=node('#orders-list');
  let html='';
  Object.defineProperty(list,'innerHTML',{get:()=>html,set:value=>{
    html=value;details.clear();closeButtons.length=0;
    for(const match of value.matchAll(/<details\b([^>]+)>/g)){
      const id=match[1].match(/data-order-disclosure="([^"]+)"/)?.[1];
      if(id)details.set(id,{dataset:{orderDisclosure:id},open:/\sopen(?:\s|$)/.test(match[1]),querySelector:()=>({focus(){}})});
    }
    for(const match of value.matchAll(/data-close-order="([^"]+)"/g))closeButtons.push({closest:()=>details.get(`order:${match[1]}`)});
  }});
  const order=id=>({id:Number(id),apiId:String(id),customer:'Client fictif',status:'Terminée',items:[],type:'Retrait',slot:'19 h',total:12,raw:{createdAt:'2026-10-11T18:00:00Z',payment:{status:'PAID'}}});
  const context={Set,Map,Date,Number,String,orders:[order(1042)],filter:'Historique',archiveSearch:'',selectedOrderId:null,openOrderDisclosures:new Set(),pendingPrints:new Set(),uncertainPrints:new Set(),pendingOrderChanges:new Set(),printFeedback:new Map(),window:{},escapeHtml:value=>String(value??''),euro:value=>`${value} €`,active:()=>[],cashDue:()=>false,orderItemMarkup:()=>'',orderPricingMarkup:()=>'<p>Paiement fictif</p>',amendmentMarkup:()=>'',actionMarkup:()=>'',document:{querySelector:node,querySelectorAll:selector=>selector==='#orders-list details[data-order-disclosure]'?[...details.values()]:selector==='#orders-list [data-close-order]'?closeButtons:[]}};
  vm.runInNewContext(source.slice(source.indexOf('function renderOrders()'),source.indexOf('function refreshMetrics()')),context);
  return {context,details,list,closeButtons,order,render:()=>context.renderOrders()};
}
test('an opened order and its payment detail survive unlimited polling refreshes',()=>{
  const s=screen();s.render();assert.equal(s.details.get('order:1042').open,false);
  s.details.get('order:1042').open=true;s.details.get('payment:1042').open=true;
  for(let i=0;i<200;i++)s.render();
  assert.equal(s.details.get('order:1042').open,true);assert.equal(s.details.get('payment:1042').open,true);
  s.context.orders[0].customer='Contenu actualisé';s.render();assert.match(s.list.innerHTML,/Contenu actualisé/);assert.equal(s.details.get('order:1042').open,true);
});
test('closing by the responsible person stays closed after refresh',()=>{
  const s=screen();s.render();s.details.get('order:1042').open=true;s.render();s.closeButtons[0].onclick();
  assert.equal(s.details.get('order:1042').open,false);s.render();assert.equal(s.details.get('order:1042').open,false);
  s.details.get('order:1042').open=true;s.render();s.details.get('order:1042').open=false;s.render();assert.equal(s.details.get('order:1042').open,false);
});
test('open state follows stable order IDs when the list is reordered or temporarily filtered',()=>{
  const s=screen();s.render();s.details.get('order:1042').open=true;
  s.context.orders.unshift(s.order(1043));s.render();assert.equal(s.details.get('order:1042').open,true);assert.equal(s.details.get('order:1043').open,false);
  s.context.archiveSearch='1043';s.render();assert.equal(s.details.has('order:1042'),false);
  s.context.archiveSearch='';s.render();assert.equal(s.details.get('order:1042').open,true);
});
test('logout clears disclosure state and private order markup; no local persistence is added',()=>{
  const showLogin=source.slice(source.indexOf('const showLogin ='),source.indexOf('const logoutDashboard ='));
  assert.match(showLogin,/openOrderDisclosures\.clear\(\)/);assert.match(showLogin,/#orders-list'\)\.innerHTML = ''/);
  assert.doesNotMatch(source.slice(source.indexOf('function renderOrders()'),source.indexOf('function refreshMetrics()')),/localStorage|sessionStorage|setTimeout|setInterval/);
});
