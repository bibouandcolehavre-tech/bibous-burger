'use strict';
const registry=require('./iban-registry.json');
const classes={n:'[0-9]',a:'[A-Z]',c:'[A-Z0-9]'};
// Offline, versioned national formats: never transmit a driver's IBAN to an
// external validation service. This does not verify account ownership/existence.
const formats=new Map(Object.entries(registry.countries).map(([country,spec])=>{
  const notation=spec.structure.slice(2),parts=[...notation.matchAll(/(\d+)!([nac])/g)];
  if(!/^[A-Z]{2}$/.test(country)||!spec.structure.startsWith(country)||parts.map(m=>m[0]).join('')!==notation||2+parts.reduce((n,m)=>n+Number(m[1]),0)!==spec.length)throw Error('Invalid bundled IBAN format registry.');
  return[country,new RegExp(`^${country}${parts.map(m=>`${classes[m[2]]}{${Number(m[1])}}`).join('')}$`)];
}));
function normalize(value){
  if(typeof value!=='string'||value.length>256)return null;
  const account=value.replace(/\s/g,'').toUpperCase();
  if(!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(account)||!formats.get(account.slice(0,2))?.test(account))return null;
  let remainder=0;for(const ch of account.slice(4)+account.slice(0,4))for(const digit of /[A-Z]/.test(ch)?String(ch.charCodeAt(0)-55):ch)remainder=(remainder*10+Number(digit))%97;
  return remainder===1?account:null;
}
module.exports={normalize};
