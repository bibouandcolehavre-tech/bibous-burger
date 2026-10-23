const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const node = () => ({innerHTML:'',textContent:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},querySelectorAll(){return [];}});
  const root = node(), elements = new Map(), calls = [], fields = [], windowFields = [];
  root.querySelector = key => { if(!elements.has(key)) elements.set(key,node()); return elements.get(key); };
  root.querySelector('#promo-form').querySelectorAll = selector => selector === '[data-window-index]' ? windowFields : fields;
  const data = {promotions:[],burgers:[]};
  const context = vm.createContext({window:{confirm(){throw Error('Native dialog must not be used');}},fetch:async(url,options)=>{
    calls.push({url,...options});
    if(options.method!=='GET'){const body=JSON.parse(options.body);data.promotions=[{...body,id:'fictional-offer',used:0}];}
    return {status:200,ok:true,json:async()=>data};
  }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../restaurant-dashboard/promotions.js'),'utf8'),context);
  const panel = context.window.BibouPromotions({root,api:'https://test.invalid/api',token:()=> 'test-only',onUnauthorized(){}});
  const click = (id,template) => root.handlers.click({target:{id,closest(selector){return selector==='[data-template]'&&template?{dataset:{template}}:null;}}});
  return {root,panel,calls,fields,windowFields,click};
}
test('promo UI: quatrième burger non cumulable par défaut, deux appuis explicites avant activation',async()=>{
  const h=harness(); await h.panel.load(); h.click('', 'buy3_get1_burger');
  assert.match(h.root.querySelector('#promo-form').innerHTML,/Cette offre et les 10 % de bienvenue ne se cumulent pas/);
  h.click('promo-toggle'); await tick(); assert.equal(h.calls.length,1);
  assert.match(h.root.querySelector('#promo-confirmation').innerHTML,/Confirmer l’activation/);
  h.click('promo-confirm-save'); await tick();
  assert.equal(h.calls.length,2);
  const body=JSON.parse(h.calls[1].body);
  assert.equal(body.enabled,true); assert.equal(body.confirmActivation,true); assert.equal(body.combineWelcome,false);
  assert.equal(body.code,'QUATREBURGER');
});

test('promo UI: net minimum is opt-in and saved only after activation confirmation', async () => {
  const h=harness(); await h.panel.load(); h.click('', 'bogo_burger');
  assert.match(h.root.querySelector('#promo-form').innerHTML,/après toutes les remises, hors livraison/);
  assert.doesNotMatch(h.root.querySelector('#promo-form').innerHTML,/data-field="minimumAfterDiscounts" type="checkbox" checked/);
  h.fields.push({type:'number',dataset:{field:'minimum'},value:'15'},
    {type:'checkbox',dataset:{field:'minimumAfterDiscounts'},checked:true});
  h.click('promo-toggle'); await tick(); assert.equal(h.calls.length,1);
  h.click('promo-confirm-save'); await tick();
  const body=JSON.parse(h.calls[1].body);
  assert.equal(body.minimum,15); assert.equal(body.minimumAfterDiscounts,true);
  assert.equal(body.confirmActivation,true);
});
test('promo UI: annuler, modifier ou changer d’offre ne confirme jamais une activation périmée',async()=>{
  const h=harness(); await h.panel.load(); h.click('', 'buy3_get1_burger');
  h.click('promo-toggle'); h.click('promo-confirm-cancel'); h.click('promo-confirm-save'); await tick();
  assert.equal(h.calls.length,1);
  h.fields.push({type:'text',dataset:{field:'code'},value:'MODIFIE'});
  h.click('promo-confirm-save'); await tick(); assert.equal(h.calls.length,1);
  assert.match(h.root.querySelector('#promo-confirmation').innerHTML,/MODIFIE/);
  h.root.handlers.input({}); h.click('promo-confirm-save'); await tick(); assert.equal(h.calls.length,1);
  h.fields.length=0; h.click('', 'percent_order'); h.click('promo-confirm-save'); await tick(); assert.equal(h.calls.length,1);
  assert.match(h.root.querySelector('#promo-confirmation').innerHTML,/MIDI15/);
});

test('promo UI: les plages sont préparées et sauvegardées seulement après confirmation explicite', async () => {
  const h = harness(); await h.panel.load(); h.click('', 'buy3_get1_burger');
  h.click('promo-add-window');
  assert.match(h.root.querySelector('#promo-form').innerHTML, /Plage 1 · début/);
  h.windowFields.push(
    { dataset:{ windowIndex:'0', boundary:'startsAt' }, value:'2026-10-10T19:00' },
    { dataset:{ windowIndex:'0', boundary:'endsAt' }, value:'2026-10-10T22:00' }
  );
  h.click('promo-toggle'); await tick(); assert.equal(h.calls.length,1);
  h.click('promo-confirm-save'); await tick();
  const body = JSON.parse(h.calls[1].body);
  assert.deepEqual(body.activeWindows, [{ startsAt:new Date('2026-10-10T19:00').toISOString(), endsAt:new Date('2026-10-10T22:00').toISOString() }]);
  assert.equal(body.enabled,true);
  assert.equal(body.combineWelcome,false);
});

test('promo UI: un service précis et les exclusions sont conservés après confirmation', async () => {
  const h = harness(); await h.panel.load(); h.click('', 'percent_burger');
  h.root.querySelector('#promo-service-enabled').checked = true;
  h.root.querySelector('#promo-service-date').value = '2026-10-11';
  h.root.querySelector('#promo-service-start').value = '19:00';
  h.root.querySelector('#promo-service-end').value = '22:00';
  h.root.querySelector('#promo-online-only').checked = true;
  h.fields.push({ type:'text', dataset:{field:'code'}, value:'DYNAMITE10' },
    { type:'select-one', dataset:{field:'productId'}, value:'dynamite' });
  h.click('promo-toggle'); await tick();
  assert.equal(h.calls.length, 1);
  h.click('promo-confirm-save'); await tick();
  const body = JSON.parse(h.calls[1].body);
  assert.deepEqual(body.serviceConditions, { serviceDate:'2026-10-11', startSlot:'19:00', endSlot:'22:00', onlineOnly:true });
  assert.equal(body.productId, 'dynamite');
  assert.match(h.root.querySelector('#promo-form').innerHTML, /value="2026-10-11"/);
});
