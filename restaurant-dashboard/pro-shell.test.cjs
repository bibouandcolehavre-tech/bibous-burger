const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
function setup({wake=true}={}){
  const nodes=new Map(),events={},held=[],requests=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,checked:false,disabled:false,handlers:{},addEventListener(event,fn){this.handlers[event]=fn;}});return nodes.get(id);};
  const document={visibilityState:'visible',querySelector:node,addEventListener(event,fn){events[event]=fn;}};
  const navigator={};if(wake)navigator.wakeLock={request:async type=>{requests.push(type);const lock={released:false,release:async()=>{lock.released=true;lock.onRelease?.();},addEventListener(event,fn){lock.onRelease=fn;}};held.push(lock);return lock;}};
  const window={addEventListener(event,fn){events[event]=fn;}};
  vm.runInNewContext(read('pro-shell.js'),{window,document,navigator,Date,Boolean,String});
  return {node,document,events,api:window.KrokliProWeb,held,requests};
}
test('Pro web keeps every production operational ID and three main tabs',()=>{
  const html=read('index.html'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of ['birthday-alert','birthday-dialog','orders-list','customers-view','printer-status','order-alarm','enable-alerts-button'])assert.ok(ids.includes(id));
  const tabs=html.match(/<nav class="pro-bottom-tabs"[\s\S]*?<\/nav>/)[0];
  assert.equal((tabs.match(/data-jump=/g)||[]).length,3);
  assert.match(tabs,/Accueil/);assert.match(tabs,/Commandes/);assert.match(tabs,/Rubriques/);
  assert.match(html,/pro-rubrics-view/);assert.match(html,/pro-account-view/);
  assert.match(read('pro-shell.css'),/#a55c43/);assert.match(read('pro-shell.css'),/safe-area-inset-bottom/);
  assert.match(html,/pro-logout-dialog/);assert.match(read('app.js'),/returnValue==='logout'\)logoutDashboard\(\)/);
  assert.doesNotMatch(read('app.js'),/#pro-logout'\)\.addEventListener\('click',[^\n]*window\.confirm/);
});
test('overview uses verified feed counts, never a fake zero before first synchronization',()=>{
  const s=setup();s.api.update({waiting:0,syncedAt:0});assert.equal(s.node('#pro-pending-count').textContent,'—');
  s.api.update({waiting:2,syncedAt:Date.now()});assert.equal(s.node('#pro-pending-count').textContent,'2');assert.equal(s.node('#pro-orders-badge').hidden,false);
  s.api.update({waiting:0,syncedAt:Date.now(),error:true});assert.match(s.node('#pro-sync').textContent,/Actualisation nécessaire/);assert.equal(s.node('#pro-orders-badge').hidden,true);
  s.api.authenticated(false);assert.equal(s.node('#pro-pending-count').textContent,'—');
});
test('sound reflects existing browser audio state without a new mute or notification request',()=>{
  const s=setup();s.api.sound({supported:true,ready:false});assert.match(s.node('#pro-enable-alerts').textContent,/Activer/);
  s.api.sound({supported:true,ready:true});assert.match(s.node('#pro-enable-alerts').textContent,/activées/);
  s.api.sound({supported:false,ready:false});assert.equal(s.node('#pro-enable-alerts').disabled,true);
  assert.doesNotMatch(read('pro-shell.js'),/\bfetch\(|localStorage|sessionStorage|Notification|\.token|\.password/);
});
test('logout uses an in-page confirmation; cancellation never revokes the session',()=>{
  const handlers={};let logouts=0;
  const dialog={returnValue:'',showModal(){this.open=true;},addEventListener(event,callback){handlers['dialog:'+event]=callback;}};
  const button={addEventListener(event,callback){handlers['button:'+event]=callback;}};
  const snippet=read('app.js').split('\n').filter(line=>line.startsWith("document.querySelector('#pro-logout" )).join('\n');
  vm.runInNewContext(snippet,{document:{querySelector:selector=>selector==='#pro-logout'?button:dialog},logoutDashboard:()=>{logouts++;}});
  handlers['button:click']();assert.equal(dialog.open,true);assert.equal(dialog.returnValue,'cancel');
  handlers['dialog:close']({target:dialog});assert.equal(logouts,0);
  dialog.returnValue='logout';handlers['dialog:close']({target:dialog});assert.equal(logouts,1);
});
test('optional wake lock releases on hidden page and logout; unsupported browsers clearly disable it',async()=>{
  const s=setup();s.api.authenticated(true);s.node('#pro-keep-awake').checked=true;s.node('#pro-keep-awake').handlers.change();await new Promise(r=>setImmediate(r));
  assert.deepEqual(s.requests,['screen']);
  s.document.visibilityState='hidden';s.events.visibilitychange();await new Promise(r=>setImmediate(r));assert.equal(s.held[0].released,true);
  s.document.visibilityState='visible';s.events.visibilitychange();await new Promise(r=>setImmediate(r));assert.equal(s.requests.length,2);
  s.api.authenticated(false);await new Promise(r=>setImmediate(r));assert.equal(s.held[1].released,true);assert.equal(s.node('#pro-keep-awake').checked,false);
  assert.equal(setup({wake:false}).node('#pro-keep-awake').disabled,true);
});
