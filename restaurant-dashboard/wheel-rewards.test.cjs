const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'wheel-rewards.js'), 'utf8');
function harness() {
  const nodes = new Map(), calls = []; let access = 'fictional-session';
  const node = () => ({ textContent:'', disabled:false, events:{}, append(){}, addEventListener(name, callback){this.events[name]=callback;} });
  const root = { innerHTML:'', querySelector(key){if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);} };
  let data = { rewardsVersion:1, winRatePercent:50, monthlyClassicAvailable:false, previewRules:'100 % gagnant', previewSegments:{small:[['points-20',88],['drink',10],['classic',1],['stb-tickets',1]]}, stb:{enabled:true,entries:33,awards:0,nextPrize:{opponent:'Orléans LBA',matchAt:'2026-11-06T19:00:00Z',entriesCloseAt:'2026-11-01T18:55:00Z'}} };
  const context = { window:{confirm(){throw Error('Unexpected duplicate confirmation');}}, document:{createElement:node}, Intl, Date, AbortSignal, Error,
    fetch:async(url,options)=>{calls.push(options);if(options.method==='PATCH')data={...data,...JSON.parse(options.body),winRatePercent:100,monthlyClassicAvailable:true};return {ok:true,status:200,json:async()=>structuredClone(data)};} };
  vm.runInNewContext(source,context);
  const ui=context.window.BibouWheelRewards({root,api:'https://fixture.invalid',token:()=>access,onUnauthorized(){}});
  return {root,calls,ui,set access(value){access=value;},async activate(){await root.querySelector('[data-wheel-activate]').events.click();}};
}
test('wheel loads read-only, then a single owner click applies 100% directly and shows STB already in play',async()=>{
  const h=harness();await h.ui.load();assert.equal(h.calls.length,1);assert.equal(h.calls[0].method,'GET');
  assert.match(h.root.querySelector('[data-wheel-stb]').textContent,/33 participation/);assert.match(h.root.querySelector('[data-wheel-stb]').textContent,/Orléans/);
  await h.activate();assert.equal(h.calls.filter(c=>c.method==='PATCH').length,1);
  assert.deepEqual(JSON.parse(h.calls[1].body),{rewardsVersion:2,monthlyClassicEnabled:true,allSpinsWin:true});
  assert.match(h.root.querySelector('[data-wheel-status]').textContent,/100 %/);
  assert.equal(h.root.querySelector('[data-wheel-activate]').disabled,true);
  await h.activate();assert.equal(h.calls.filter(c=>c.method==='PATCH').length,1);
});
test('clearing the owner session disables activation and erases the status',async()=>{
  const h=harness();await h.ui.load();h.ui.clear();h.access='';await h.activate();
  assert.equal(h.calls.filter(c=>c.method==='PATCH').length,0);assert.equal(h.root.querySelector('[data-wheel-status]').textContent,'');
});
