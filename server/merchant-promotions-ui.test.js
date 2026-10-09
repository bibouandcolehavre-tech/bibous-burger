const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const node = () => ({innerHTML:'',textContent:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},querySelectorAll(){return [];}});
  const root = node(), elements = new Map(), calls = [], fields = [];
  root.querySelector = key => { if(!elements.has(key)) elements.set(key,node()); return elements.get(key); };
  root.querySelector('#promo-form').querySelectorAll = () => fields;
  const data = {promotions:[],burgers:[]};
  const context = vm.createContext({window:{confirm(){throw Error('Native dialog must not be used');}},fetch:async(url,options)=>{
    calls.push({url,...options});
    if(options.method!=='GET'){const body=JSON.parse(options.body);data.promotions=[{...body,id:'fictional-offer',used:0}];}
    return {status:200,ok:true,json:async()=>data};
  }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../restaurant-dashboard/promotions.js'),'utf8'),context);
  const panel = context.window.BibouPromotions({root,api:'https://test.invalid/api',token:()=> 'test-only',onUnauthorized(){}});
  const click = (id,template) => root.handlers.click({target:{id,closest(selector){return selector==='[data-template]'&&template?{dataset:{template}}:null;}}});
  return {root,panel,calls,fields,click};
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
