'use strict';
// Only the dedicated, disposable Pro review service imports this module.
// It has no production DB, provider, secret, pass-signing or customer-login access.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const DEMO_SERIAL='decafdecafdecafdecafdecafdecaf0001';
const DEMO_BARCODE='BIBOU:1:'+DEMO_SERIAL;
const CUSTOMER='pro-review-camille';
function internalGet(port,route,authorization){return new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port,path:route,headers:{Accept:'application/json',...(authorization?{Authorization:authorization}:{})}},res=>{let data='';res.on('data',chunk=>{data+=chunk;if(data.length>131072)req.destroy(Error('Review response too large'));});res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(data)});}catch{reject(Error('Review response unreadable'));}});});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('Review response timed out')));});}
async function handleDemoLookup({req,url,body,backendPort}){
 if(!['/api/dashboard/wallet/identify','/api/dashboard/ambassador-pickup'].includes(url.pathname))return null;
 if(req.method!=='POST')return {status:405,data:{error:'Démonstration : lecture de la carte uniquement.'}};
 // Authenticate against this service's own isolated backend, never production.
 const state=await internalGet(backendPort,'/api/dashboard/summary',req.headers.authorization);
 if(state.status!==200)return {status:401,data:{error:'Connectez-vous au restaurant de vérification.'}};
 let input;try{input=JSON.parse(body.toString('utf8'));}catch{return {status:400,data:{error:'Lecture de démonstration invalide.'}};}
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>k!=='barcode'))return {status:400,data:{error:'Démonstration : aucun retrait ou crédit n’est autorisé par ce scanner.'}};
 if(input.barcode!==DEMO_BARCODE)return {status:404,data:{error:'Carte absente de cette démonstration. Utilisez uniquement le QR fictif fourni.'}};
 if(url.pathname.endsWith('/ambassador-pickup'))return {status:200,data:{ballot:null,fries:null,reviewMode:true}};
 const profile=await internalGet(backendPort,'/api/dashboard/customers/'+CUSTOMER,req.headers.authorization);
 if(profile.status!==200||profile.data.customer?.id!==CUSTOMER)return {status:503,data:{error:'Fiche fictive temporairement indisponible.'}};
 const customer=profile.data.customer;
 return {status:200,data:{member:{firstName:'Camille · exemple',points:Math.max(0,Math.trunc(Number(customer.points)||0)),memberId:DEMO_SERIAL,barcode:DEMO_BARCODE,customerId:CUSTOMER},reviewMode:true}};
}
const launcher='<div class="wallet-scan-launch"><div><strong>Carte Club Bibou · démonstration</strong><p>Utilisez le QR fictif fourni aux boutiques. Aucun compte client réel.</p></div><button type="button" id="wallet-scan-open" class="primary-button">Scanner une carte fidélité</button></div>';
const dialog='<dialog id="wallet-scanner" class="wallet-scanner" aria-labelledby="wallet-scanner-title"><header><h2 id="wallet-scanner-title">Scanner une carte · démo</h2><button type="button" data-wallet-close class="secondary-button" aria-label="Fermer le lecteur">Fermer ✕</button></header><p data-wallet-status role="status" aria-live="polite"></p><video data-wallet-video playsinline muted autoplay hidden aria-label="Caméra de lecture du QR code"></video><section data-wallet-result hidden aria-label="Client retrouvé"><strong data-wallet-name></strong><p data-wallet-points></p><button type="button" data-wallet-profile class="primary-button">Ouvrir sa fiche</button></section><button type="button" data-wallet-start class="primary-button">Activer la caméra</button><p>Mode de démonstration : les images restent sur cet appareil. Aucun point ni cadeau réel.</p></dialog>';
function decorate(html){
 if(!html.includes('id="customers-view"'))throw Error('Review customer section absent; inspect source before release');
 if(html.includes('id="wallet-scanner"'))throw Error('Existing review scanner requires manual reconciliation');
 return html.replace('</head>','<link rel="stylesheet" href="./wallet-scanner.css?v=demo-20261105"></head>')
  .replace(/(<section id="customers-view"[^>]*>)/,'$1'+launcher)
  .replace('</body>',dialog+'<script src="./wallet-qr-decoder-1.4.0.js"></script><script src="./wallet-scanner.js?v=demo-camera-20261105"></script><script src="./wallet-demo-init.js?v=20261105"></script></body>');
}
function demoPage(){return fs.readFileSync(path.join(__dirname,'wallet-demo.html'),'utf8');}
module.exports={DEMO_SERIAL,DEMO_BARCODE,handleDemoLookup,decorate,demoPage};
