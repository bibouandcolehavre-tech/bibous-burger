const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/external-delivery.js','utf8');
function harness(request=async()=>{throw Error('No API expected');}) {
  const nodes=new Map(),handlers=new Map();let resets=0,focuses=0,scrolls=0;
  const node=key=>{
    if(!nodes.has(key))nodes.set(key,{hidden:key==='#external-delivery-form',value:'',textContent:'',disabled:false,
      addEventListener:(type,fn)=>handlers.set(key+':'+type,fn),setAttribute:(name,value)=>{node(key)[name]=value;},
      focus:()=>{focuses++;},scrollIntoView:()=>{scrolls++;}});
    return nodes.get(key);
  };
  const fields=['customerName','fullAddress','phone','reference','phoneExtension','notes'].map(node);
  fields.namedItem=name=>node(name);
  Object.assign(node('form'),{elements:fields,reset:()=>{resets++;fields.forEach(field=>field.value='');},reportValidity:()=>true});
  const root={innerHTML:'',querySelector:node,querySelectorAll:key=>key==='[data-external-close]'?[node('close')]:[]};
  const context=vm.createContext({window:{KrokliDeliveryParser:{destination:()=>({address:'12 rue Exemple',postalCode:'76600',city:'Le Havre'})}},Intl,crypto:{randomUUID:()=> 'fixture-request'}});
  vm.runInContext(source,context);
  const panel=context.window.KrokliExternalDelivery.create({root,request});
  return {node,panel,root,handlers,resets:()=>resets,focuses:()=>focuses,scrolls:()=>scrolls};
}
test('Uber entry opens inline without dialog/showModal support, keeps input on a second click, and closes without API',()=>{
  const h=harness();
  assert.doesNotMatch(h.root.innerHTML,/<dialog\b/);
  h.handlers.get('[data-external-open]:click')();
  assert.equal(h.node('#external-delivery-form').hidden,false);assert.equal(h.node('[data-external-open]')['aria-expanded'],'true');
  h.node('customerName').value='Fixture';h.handlers.get('[data-external-open]:click')();
  assert.equal(h.node('customerName').value,'Fixture');assert.equal(h.resets(),1);assert.equal(h.scrolls(),2);
  h.handlers.get('close:click')();assert.equal(h.node('#external-delivery-form').hidden,true);assert.equal(h.node('customerName').value,'');
});
test('inline Escape and logout clear private inputs and hide the form',()=>{
  const h=harness();h.handlers.get('[data-external-open]:click')();h.node('phone').value='0600000000';
  h.handlers.get('#external-delivery-form:keydown')({key:'Escape',preventDefault(){}});
  assert.equal(h.node('phone').value,'');assert.equal(h.node('#external-delivery-form').hidden,true);
  h.handlers.get('[data-external-open]:click')();h.node('phone').value='0600000000';h.panel.clear();
  assert.equal(h.node('phone').value,'');assert.equal(h.node('#external-delivery-form').hidden,true);
});
test('both real dashboard entrypoints load the parser and form before dispatch, with matching cache versions',()=>{
  for(const file of ['index.html','ancienne-interface.html']) {
    const html=fs.readFileSync(__dirname+'/'+file,'utf8');
    const parser=html.indexOf('src="./external-delivery-parser.js?'),form=html.indexOf('src="./external-delivery.js?v=inline-20261021"'),dispatch=html.indexOf('src="./dispatch.js?');
    assert.ok(parser>0&&form>parser&&dispatch>form,file);
    assert.match(html,/external-delivery\.css\?v=inline-20261021/);
  }
});
