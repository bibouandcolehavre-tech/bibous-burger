const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const planner = require('../restaurant-dashboard/planner');
const schedule = require('./service-schedule');
const NOW = new Date('2026-09-29T08:00:00Z'), DATE='2026-09-29';
const fixture = () => schedule.dashboard({orders:[{id:'a',serviceDate:DATE,slot:'12:00',method:'pickup',status:'confirmed',payment:{status:'PAID'}}]}, DATE, NOW);
test('planning: exact server hours and occupancy preserved, changes isolated by service',()=>{
  const data=fixture(), original=JSON.stringify(data), draft=planner.makeDraft(data);
  assert.equal(planner.changes(data,draft).length,0);
  draft.pickup['12:00']=false;
  assert.equal(planner.impacts(data,draft).length,1);
  assert.equal(planner.changes(data,draft)[0].method,'pickup');
  assert.equal(draft.reservation['12:00'],true);
  assert.equal(draft.delivery['12:00'],true);
  assert.equal(JSON.stringify(data),original);
  draft.pickup['12:00']=true;assert.equal(planner.changes(data,draft).length,0);
  for(const method of ['pickup','delivery','reservation'])for(const row of data.services[method]){
    assert.equal(['lunch','evening','other'].filter(p=>planner.inPeriod(row.slot,p)).length,1,'Every candidate belongs to exactly one period');
  }
});
function harness() {
  const elements=new Map(), handlers={}, requests=[];let token='qa-only', result=fixture(), responseStatus=200;
  const el=selector=>{
    if(!elements.has(selector))elements.set(selector,{textContent:'',innerHTML:'',value:'',hidden:false,disabled:false,checked:false,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;},scrollIntoView(){},querySelectorAll(){return [...this.innerHTML.matchAll(/data-slot="([^"]+)"/g)].map(([,slot])=>{const button=el('slot:'+slot);button.dataset.slot=slot;return button;});}});
    return elements.get(selector);
  };
  const buttons=(prefix,values,field)=>values.map(value=>{const button=el(prefix+value);button.dataset[field]=value;return button;});
  const methods=buttons('method:',['pickup','delivery','reservation'],'scheduleMethod'), periods=buttons('period:',['lunch','evening','other'],'period');
  const root={innerHTML:'',querySelector:el,querySelectorAll(selector){return selector==='[data-schedule-method]'?methods:selector==='[data-period]'?periods:[...elements.values()];}};
  const window={addEventListener:(event,handler)=>{handlers[event]=handler;}};
  const context=vm.createContext({window,AbortSignal,fetch:async(url,options)=>{requests.push({url,...options});return {status:responseStatus,ok:responseStatus===200,json:async()=>result};}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../restaurant-dashboard/planner.js'),'utf8'),context);
  const panel=window.BibouSchedule({root,api:'/api',token:()=>token,onUnauthorized:()=>{token='';panel.clear();}});
  return {panel,el,handlers,requests,context,root,setToken:value=>{token=value;},response:(payload,status=200)=>{result=payload;responseStatus=status;}};
}
test('planning UI: one tap toggles a slot, existing bookings still require acknowledgement',async()=>{
  const h=harness();await h.panel.load();
  h.el('slot:12:00').onclick();assert.equal(h.requests.length,1);
  assert.match(h.el('#schedule-summary').textContent,/1 créneau/);
  await h.el('#schedule-save').onclick();assert.equal(h.requests.length,1,'No save before acknowledgement');
  assert.equal(h.el('#schedule-review-panel').hidden,false);
  await h.el('#schedule-confirm').onclick();assert.equal(h.requests.length,1,'No save without acknowledgement');
  h.el('#schedule-ack').checked=true;h.el('#schedule-ack').onchange();assert.equal(h.el('#schedule-save').disabled,false);
  await h.el('#schedule-confirm').onclick();
  const saved=JSON.parse(h.requests.at(-1).body);
  assert.equal(saved.services.pickup['12:00'],false);assert.equal(saved.services.reservation['12:00'],true);assert.equal(saved.acknowledgeExisting,true);assert.equal(saved.revision,0);
  assert.equal(h.el('#schedule-review-panel').hidden,true);
});
test('planning UI: draft survives tab/date/reload, undo clears all changes',async()=>{
  const h=harness();await h.panel.load();h.el('slot:12:00').onclick();
  h.el('method:delivery').onclick();assert.match(h.el('#schedule-summary').textContent,/1 créneau/);
  const before=h.el('#schedule-date').value;h.el('#schedule-date').value='2026-10-01';h.el('#schedule-date').onchange();assert.equal(h.el('#schedule-date').value,before);
  await h.panel.load();assert.equal(h.requests.length,1);
  let prevented=false;h.handlers.beforeunload({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  h.el('#schedule-discard').onclick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.requests.length,1);assert.equal(h.el('#schedule-save').disabled,true);
});
test('planning UI: bulk change affects selected service only, conflict retains draft',async()=>{
  const h=harness();await h.panel.load();h.el('#schedule-close-period').onclick();await h.el('#schedule-save').onclick();
  h.el('#schedule-ack').checked=true;h.el('#schedule-ack').onchange();h.response({error:'Les créneaux ont changé dans un autre onglet.'},409);await h.el('#schedule-confirm').onclick();
  const saved=JSON.parse(h.requests.at(-1).body);
  assert.equal(saved.services.delivery['12:00'],true);assert.equal(saved.services.pickup['19:00'],true);assert.equal(saved.services.pickup['12:00'],false);
  assert.match(h.el('#schedule-message').textContent,/autre onglet/);assert.equal(h.el('#schedule-review-panel').hidden,false);
});
test('planning UI: closing an unbooked slot saves directly, and tomorrow is one tap',async()=>{
  const h=harness();await h.panel.load();
  h.el('slot:12:20').onclick();
  await h.el('#schedule-save').onclick();
  assert.equal(h.requests.length,2);
  assert.equal(JSON.parse(h.requests[1].body).services.pickup['12:20'],false);
  h.el('#schedule-tomorrow').onclick();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.requests.length,3);
  assert.match(h.requests[2].url,/service-schedule\?date=/);
});
test('planning UI: expired and late sessions never restore private data or send changes',async()=>{
  const h=harness();await h.panel.load();let respond;
  h.context.fetch=()=>new Promise(resolve=>{respond=resolve;});const loading=h.panel.load();
  h.panel.clear();h.setToken('');respond({ok:true,status:200,json:async()=>fixture()});await loading;
  assert.equal(h.el('#schedule-editor').hidden,true);
  const other=harness();other.response({error:'Expired'},401);await other.panel.load();assert.equal(other.el('#schedule-editor').hidden,true);
});
