const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crm=require('./crm');
const result=(body,status=200)=>({status,ok:status===200,json:async()=>body});
function harness() {
  const node=()=>({innerHTML:'',textContent:'',value:'',disabled:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},querySelectorAll(){return [];}});
  const root=node(),settingsRoot=node(),elements=new Map();
  for(const [prefix,element] of [['root',root],['settings',settingsRoot]])element.querySelector=key=>{const id=prefix+key;if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  let auth='test-only',calls=[],unauthorized=false;
  const data=crm.dashboard({customers:[{id:'c1',name:'<img onerror="bad">',crmPreferences:{personalizedOffers:true,birthday:'09-20'}}],orders:[],crm:{settings:crm.defaults(),offers:[{id:'test',customerId:'c1',ruleId:'birthday',eventKey:'test',title:'<script>bad</script>',discountPercent:10,minSubtotal:0,createdAt:Date.now(),expiresAt:Date.now()+86400000}]}},{enabled:false,platforms:[]});
  const context=vm.createContext({window:{confirm:()=>false},AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,...options});return result(data);}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../restaurant-dashboard/crm.js'),'utf8'),context);
  const panel=context.window.BibouCrm({root,settingsRoot,api:'https://test.invalid/api',token:()=>auth,onUnauthorized:()=>{unauthorized=true;panel.clear();auth='';},onLogout:()=>{auth='';panel.clear();}});
  return {root,settingsRoot,panel,context,calls,data,get unauthorized(){return unauthorized;},setAuth(v){auth=v;}};
}
test('CRM UI: escaped customer content, readonly load, draft preview without campaign sends',async()=>{
  const h=harness();await h.panel.load();assert.match(h.root.querySelector('#crm-offers').innerHTML,/&lt;script&gt;/);assert.equal(h.root.querySelector('#crm-offers').innerHTML.includes('<img'),false);assert.equal(h.calls.length,1);assert.equal(h.calls[0].method,'GET');
  h.context.fetch=async(url,options)=>{h.calls.push({url,...options});return result({previews:h.data.previews});};
  await h.root.querySelector('#crm-preview').onclick();assert.equal(h.calls.at(-1).method,'POST');assert.match(h.calls.at(-1).url,/\/preview$/);assert.match(h.root.querySelector('.crm-feedback').textContent,/Aucun bon créé/);
});
test('CRM UI: dirty edits retained, active settings require explicit confirmation',async()=>{
  const h=harness();await h.panel.load();h.settingsRoot.handlers.input({target:{dataset:{setting:'enabled'},type:'checkbox',checked:true}});await h.panel.load();assert.equal(h.calls.length,1);assert.match(h.root.querySelector('.crm-feedback').textContent,/changements non enregistrés/);await h.settingsRoot.querySelector('#crm-settings-save').onclick();assert.equal(h.calls.length,1,'confirmation rejected, no write');
});
test('CRM UI: late responses discarded after logout and expired sessions clear private contents',async()=>{
  const h=harness();let resolve;h.context.fetch=()=>new Promise(r=>{resolve=r;});const loading=h.panel.load();h.panel.clear();h.setAuth('');resolve(result(h.data));await loading;assert.equal(h.root.querySelector('#crm-offers').innerHTML,'');
  h.setAuth('new-session');h.context.fetch=async()=>result({},401);await h.panel.load();assert.equal(h.unauthorized,true);assert.equal(h.root.querySelector('#crm-rules').innerHTML,'');
});
