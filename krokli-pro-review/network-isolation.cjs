'use strict';
// Loaded ONLY in the disposable review backend. No network provider, production
// origin, customer notification or external payment can be contacted by it.
const http=require('node:http'),https=require('node:https'),net=require('node:net'),tls=require('node:tls');
const blocked=()=>{throw Error('Environnement de vérification : tout accès réseau sortant est désactivé.');};
globalThis.fetch=async()=>blocked();
for(const api of [http,https]){api.request=blocked;api.get=blocked;}
net.connect=blocked;net.createConnection=blocked;tls.connect=blocked;
