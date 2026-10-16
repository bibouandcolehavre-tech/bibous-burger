// Local render/callback checks, not a physical-phone or real-payment test.
const fs=require('fs'),path=require('path'),React=require('react'),SSR=require('react-dom/server'),native=require('react-native-web'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const code=require('@babel/core').transformSync(fs.readFileSync(path.join(root,'BibouPlusAfterPayment.js'),'utf8'),{configFile:false,babelrc:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code;
const load=react=>{const m={exports:{}};new Function('require','module','exports',code)(n=>n==='react'?react:n==='react-native'?native:require(path.resolve(root,n)),m,m.exports);return m.exports.default;};
const Component=load(React),props={order:{id:'local-qa',total:16.9,payment:{status:'PAID'},status:'confirmed'},customer:{},onOpen:()=>{throw Error('No implicit action');}};
const html=SSR.renderToStaticMarkup(React.createElement(Component,props));
assert.match(html,/5,99/);assert.match(html,/2 livraisons/);assert.match(html,/Pas maintenant/);assert.match(html,/Sans renouvellement automatique/);
let dismissed=false,opened=0;
const C=load({...React,useState:()=>[dismissed,v=>dismissed=v]}),tree=C({...props,onOpen:()=>opened++}),nodes=[];
const walk=e=>{if(!e||typeof e!=='object')return;nodes.push(e);React.Children.forEach(e.props?.children,walk);};walk(tree);
assert.equal(opened,0);
nodes.find(e=>e.props?.accessibilityLabel==='Découvrir Bibou Plus à 5,99 euros pour 30 jours').props.onPress();assert.equal(opened,1);
nodes.find(e=>e.props?.children?.props?.children==='Pas maintenant').props.onPress();assert.equal(C(props),null);
console.log('Bibou Plus component: render, price, explicit optional opening and dismissal passed. No payment or external request.');
