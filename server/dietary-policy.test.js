const test=require('node:test'),assert=require('node:assert/strict');
const {validateAndPriceOrderItems,PRODUCT_CATALOG}=require('./catalog');
const {containsPork}=require('../dietary-policy');
const item=(id='classique',meat='halal',protein='viande',extra=[])=>({productId:id,quantity:1,selections:[{groupId:'protein',id:protein},{groupId:'salad',id:'sans-crudites'},{groupId:'sauces',id:PRODUCT_CATALOG[id].fixedSauce||'mayo'},...(meat?[{groupId:'meat-type',id:meat}]:[]),...extra]});
test('choix explicite gratuit, non falsifiable et enregistré dans le ticket',()=>{
  for(const choice of ['halal','non-halal']) {
    const cart=validateAndPriceOrderItems([item('classique',choice)]);
    assert.equal(cart.subtotal,9.9);
    assert.equal(cart.items[0].options.find(o=>o.groupId==='meat-type').label,choice==='halal'?'Viande halal':'Viande non halal');
  }
  assert.throws(()=>validateAndPriceOrderItems([item('classique',null)]),/Choisis viande/);
  assert.throws(()=>validateAndPriceOrderItems([item('classique','inconnu')]),/invalide/);
  assert.throws(()=>validateAndPriceOrderItems([item('classique','halal','viande',[{groupId:'meat-type',id:'non-halal'}])]),/maximum/);
});
test('les cinq recettes avec porc sont refusées en halal, menus et burgers seuls',()=>{
  for(const id of ['taurus','hambagu','hambagu-menu','gros-lard','gros-lard-menu','montagnes','montagnes-menu','pork','pork-menu']) {
    assert.equal(containsPork(id),true);
    assert.throws(()=>validateAndPriceOrderItems([item(id)]),/contient du porc/);
    assert.doesNotThrow(()=>validateAndPriceOrderItems([item(id,'non-halal')]));
  }
});
test('pas de supplément porc avec une viande halal, pas de choix de viande sur une galette',()=>{
  for(const [groupId,id] of [['extras','bacon'],['extras','lard'],['sides','frites-cheddar']]) assert.throws(()=>validateAndPriceOrderItems([item('classique','halal','viande',[{groupId,id}])]),/porc/);
  assert.doesNotThrow(()=>validateAndPriceOrderItems([item('classique',null,'galette')]));
  assert.throws(()=>validateAndPriceOrderItems([item('classique','halal','galette')]),/végétarienne/);
});
test('ticket restaurant : choix de viande mis en évidence avant les crudités',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.join(__dirname,'../restaurant-dashboard/app.js'),'utf8');
  const code=source.slice(source.indexOf('function orderItemMarkup'),source.indexOf('function orderPricingMarkup'));
  const render=vm.runInNewContext(code+';orderItemMarkup',{escapeHtml:value=>String(value).replaceAll('<','&lt;'),euro:value=>String(value)});
  const markup=render(validateAndPriceOrderItems([item()]).items[0]);
  assert.match(markup,/<strong>Viande halal<\/strong>/);
  assert.ok(markup.indexOf('Choix de viande')<markup.indexOf('Crudités'));
});
