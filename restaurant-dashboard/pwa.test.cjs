const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname,name),'utf8');
function shell({hash='',standalone=false,online=true}={}) {
  const nodes = new Map(), handlers = {}, pushes = [], installs = [], navigations = [];
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector,{hidden:false,dataset:{},textContent:'',listeners:{},setAttribute(){},focus(){},addEventListener(name,fn){this.listeners[name]=fn;},showModal(){this.open=true;},close(){this.open=false;}});
    return nodes.get(selector);
  };
  const installButtons = [node('install-login'),node('install-dashboard')];
  const context = {Set, document:{querySelector:node,querySelectorAll:()=>installButtons},location:{hash},history:{pushState(data,title,url){pushes.push(url);context.location.hash=url;}},navigator:{onLine:online,standalone,serviceWorker:{register(...args){installs.push(args);return Promise.resolve();}}}};
  context.window={matchMedia:()=>({matches:standalone}),isSecureContext:true,scrollTo(){},addEventListener(name,fn){handlers[name]=fn;}};
  vm.runInNewContext(read('pwa.js'),context);
  const app = context.window.BibouRestaurantApp;
  const navigate = view => {navigations.push(view);app.changed(view);};
  return {context,app,node,handlers,pushes,installs,installButtons,navigations,navigate};
}
test('all original operational node IDs remain; no duplicated IDs; 9 rubric entry points',()=>{
  const ids = html => Array.from(html.matchAll(/\bid="([^"]+)"/g),match=>match[1]);
  const original = ids(read('ancienne-interface.html')), current = ids(read('index.html'));
  assert.equal(new Set(current).size,current.length);
  for (const id of original) assert.ok(current.includes(id),`Missing operational node ${id}`);
  const navigation = read('index.html').match(/<nav class="app-rubrics"[\s\S]*?<\/nav>/)[0];
  assert.equal((navigation.match(/data-jump=/g)||[]).length,9);
  assert.match(navigation,/Répartition des livreurs/);
  assert.match(read('index.html'),/data-order-filter="Historique"/);
  assert.match(read('index.html'),/ancienne-interface.html/);
});
test('shell navigates valid routes, changes presentation only and rejects unknown routes',()=>{
  const s = shell();s.app.changed('home');s.app.start(s.navigate);s.navigate('customers');
  assert.equal(s.node('#app-current').textContent,'Clients & fidélité');
  assert.equal(s.node('#dashboard-app').dataset.page,'customers');
  s.app.changed('unknown');assert.equal(s.node('#dashboard-app').dataset.page,'customers');
  assert.equal(s.installs[0][0],'./sw.js');
  assert.equal(s.installs[0][1].updateViaCache,'none');
});
test('deep links and browser Back retain valid screens without creating history loops',()=>{
  const s = shell({hash:'#dispatch'});s.app.changed('home');s.app.start(s.navigate);
  assert.equal(s.navigations[0],'dispatch');s.navigate('orders');
  const count = s.pushes.length;s.context.location.hash='#dispatch';s.handlers.popstate();s.handlers.hashchange();
  assert.equal(s.node('#dashboard-app').dataset.page,'dispatch');assert.equal(s.pushes.length,count);
});
test('history shortcut is labelled; no API, storage or session mutation in the shell',()=>{
  const s = shell();s.app.changed('orders','Historique');assert.equal(s.node('#app-current').textContent,'Historique');
  assert.doesNotMatch(read('pwa.js'),/\bfetch\(|localStorage|sessionStorage|\.token|\.password/);
});
test('standalone hides install controls; offline warning follows connection changes',()=>{
  const s=shell({standalone:true,online:false});assert.ok(s.installButtons.every(button=>button.hidden));assert.equal(s.node('#app-offline').hidden,false);
  s.context.navigator.onLine=true;s.handlers.online();assert.equal(s.node('#app-offline').hidden,true);
});
test('manifest starts same-origin and keeps scope and original logo',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./?app=restaurant');
  for(const icon of manifest.icons) assert.ok(fs.existsSync(path.join(__dirname,icon.src)));
  assert.match(read('index.html'),/apple-mobile-web-app-capable/);assert.match(read('index.html'),/apple-touch-icon/);
});
function worker({offline=false}={}) {
  const handlers={},adds=[],deleted=[],fetches=[],fallback={generic:true};
  const context={URL,Response,self:{location:{origin:'https://restaurant.example'},addEventListener(name,fn){handlers[name]=fn;}},caches:{open:async()=>({add:async url=>adds.push(url)}),keys:async()=>['bibou-restaurant-offline-old','unrelated-app'],delete:async key=>deleted.push(key),match:async()=>fallback},fetch:async(request,options)=>{fetches.push([request,options]);if(offline)throw Error('offline');return {live:true};}};
  vm.runInNewContext(read('sw.js'),context);
  return {handlers,adds,deleted,fetches,fallback};
}
test('service worker caches ONLY generic offline warning; preserves other caches',async()=>{
  const w=worker();let pending;w.handlers.install({waitUntil:p=>pending=p});await pending;assert.deepEqual(w.adds,['./offline.html']);
  w.handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(w.deleted,['bibou-restaurant-offline-old']);
  assert.doesNotMatch(read('sw.js'),/cache\.put|skipWaiting|clients\.claim/);
});
test('service worker never intercepts API, images, external requests or mutations',()=>{
  const w=worker();
  const requests=[['GET','cors','https://api.example/api/dashboard/customers'],['GET','navigate','https://restaurant.example/api/dashboard/orders'],['POST','navigate','https://restaurant.example/'],['GET','no-cors','https://restaurant.example/restaurant-icon.png']];
  for(const [method,mode,url] of requests) w.handlers.fetch({request:{method,mode,url},respondWith(){throw Error('Unexpected interception');}});
});
test('navigation goes to network with no-store and generic fallback only when offline',async()=>{
  for(const offline of [false,true]){const w=worker({offline});let pending;w.handlers.fetch({request:{method:'GET',mode:'navigate',url:'https://restaurant.example/'},respondWith:p=>pending=p});assert.deepEqual(await pending,offline?w.fallback:{live:true});assert.equal(w.fetches[0][1].cache,'no-store');}
});
