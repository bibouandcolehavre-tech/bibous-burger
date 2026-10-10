const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {kioskRecipeGroup,kioskRecipeChoices,vegetarianInstruction}=require('./kiosk-recipe');
const {validateAndPriceOrderItems,PRODUCT_CATALOG}=require('./catalog');
test('web protein options are neutral, real vegetarian removes meat and is recorded on the ticket',()=>{
  const group=kioskRecipeGroup({id:'protein'},{});assert.equal(group.title,'Choisis ta protéine');assert.ok(group.options.find(x=>x.id==='vegetarian'));
  const cleaned=kioskRecipeChoices({extras:['bacon','cheddar'],'meat-type':['non-halal']},'protein',['vegetarian']);assert.deepEqual(cleaned.extras,['cheddar']);assert.equal(cleaned['meat-type'],undefined);
  for(const productId of ['montagnes','montagnes-menu','gros-lard','pork','duck','dynamite']) {
    const product=PRODUCT_CATALOG[productId];
    const cart=validateAndPriceOrderItems([{productId,quantity:1,selections:[{groupId:'protein',id:'vegetarian'},{groupId:'salad',id:'sans-crudites'},{groupId:'sauces',id:product.fixedSauce || 'bleu'},...(product.menu?[{groupId:'drink',id:'coca'}]:[])]}]);
    assert.equal(cart.items[0].options.find(x=>x.groupId==='protein').label,vegetarianInstruction);
    assert.equal(cart.subtotal,product.price);
  }
});
test('new consumer protein interface is web only; Android and iOS UI stays gated off',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../App.js'),'utf8');
  assert.match(source,/const NEW_PROTEIN_CHOICES = Platform.OS === 'web';/);
  assert.match(source,/if \(NEW_PROTEIN_CHOICES\) \{ group = kioskRecipeGroup/);
  assert.match(source,/NEW_PROTEIN_CHOICES \? kioskRecipeChoices/);
  assert.match(source,/group.helper \|\|/);
});
