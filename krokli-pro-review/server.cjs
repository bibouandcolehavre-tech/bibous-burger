'use strict';
// Dedicated service only. This file is never imported by production server.js.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {fixture}=require('./fixture.cjs'),{page}=require('./public-pages.cjs');
const root=path.resolve(__dirname,'..'),publicRoot=path.join(root,'restaurant-dashboard');
// Public example credential, NOT an access to any real restaurant or service.
const DEMO_PASSWORD='KrokliProExemple2026';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.jpg':'image/jpeg','.webp':'image/webp'};
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
async function start(){
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'krokli-pro-review-'));
 const dataPath=path.join(temporary,'data.json');
 await fs.writeFile(dataPath,JSON.stringify(fixture()),{mode:0o600});
 // Explicit allowlist: no production keys, no Render environment groups, no .env.
 const child=spawn(process.execPath,['--require',path.join(__dirname,'network-isolation.cjs'),path.join(root,'server/server.js')],{cwd:temporary,env:{PATH:process.env.PATH,PORT:'0',LISTEN_HOST:'127.0.0.1',NODE_ENV:'test',DATA_FILE_PATH:dataPath,SESSION_SECRET:crypto.randomBytes(32).toString('hex'),RESTAURANT_DASHBOARD_PASSWORD:DEMO_PASSWORD,PUSH_ENABLED:'false',KROKLI_NATIVE_PUSH_ENABLED:'false',KEYYO_CALL_SMS_ENABLED:'false',STORE_REVIEW_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let backendPort;
 const booted=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Review backend startup timed out')),20000);child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/localhost:(\d+)/);if(match){backendPort=Number(match[1]);clearTimeout(timer);resolve();}});child.on('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error('Review backend exited '+code));});});
 // Keep credentials, request bodies and future user-entered data out of logs.
 child.stderr.on('data',()=>{});
 await booted;
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://review.invalid');
   if(['GET','HEAD'].includes(req.method)&&url.pathname==='/health'){return json(res,200,{ok:true,product:'Krokli Pro',isolatedExamples:true,externalProviders:false});}
   if(['GET','HEAD'].includes(req.method)&&['/privacy','/support'].includes(url.pathname)){const html=page(url.pathname.slice(1));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});return res.end(req.method==='HEAD'?undefined:html);}
   if(url.pathname.startsWith('/api/')){
    // No customer authentication/order submission or driver/provider webhooks.
    const permitted=url.pathname.startsWith('/api/dashboard/')||req.method==='GET'&&url.pathname==='/api/catalog';
    if(!permitted)return json(res,403,{error:'Environnement isolé : route non disponible.'});
    if(!['GET','POST','PATCH','DELETE'].includes(req.method))return json(res,405,{error:'Méthode indisponible.'});
    if(Number(req.headers['content-length']||0)>131072)return json(res,413,{error:'Requête trop volumineuse.'});
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>131072)return json(res,413,{error:'Requête trop volumineuse.'});chunks.push(chunk);}
    const body=Buffer.concat(chunks);
    const upstream=http.request({hostname:'127.0.0.1',port:backendPort,path:url.pathname+url.search,method:req.method,headers:{Accept:'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{}),...(body.length?{'Content-Type':'application/json','Content-Length':body.length}:{})}},response=>{res.writeHead(response.statusCode||502,{'Content-Type':response.headers['content-type']||'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.pipe(res);});
    upstream.setTimeout(20000,()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)json(res,503,{error:'Service de vérification temporairement indisponible.'});else res.end();});upstream.end(body);return;
   }
   if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Lecture seule.'});
   let requested=decodeURIComponent(url.pathname),file;
   if(requested==='/')requested='/index.html';
   if(!/^\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(requested))return json(res,404,{error:'Fichier indisponible.'});
   const ext=path.extname(requested);if(!mime[ext])return json(res,404,{error:'Fichier indisponible.'});
   file=await fs.readFile(path.join(publicRoot,requested));
   if(requested==='/app.js')file=Buffer.from(file.toString('utf8').replace(/^const API_BASE_URL = [^\n]+;/,"const API_BASE_URL = window.location.origin + '/api';"));
   if(ext==='.html')file=Buffer.from(file.toString('utf8').replace('<body>','<body><div style="position:relative;z-index:99999;background:#bb7258;color:white;padding:12px;text-align:center;font-weight:700">VÉRIFICATION KROKLI PRO — EXEMPLES UNIQUEMENT. Aucun repas, paiement ou envoi réel. Ne saisissez aucune donnée personnelle.</div>').replace(/<link rel="manifest"[^>]+>/g,'').replace(/<script src="\.\/pwa\.js[^>]*><\/script>/g,''));
   // No service worker, printer/local-network connection or remote script allowed.
   if(requested==='/sw.js')return json(res,404,{error:'Service worker désactivé.'});
   res.writeHead(200,{'Content-Type':mime[ext],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"});res.end(req.method==='HEAD'?undefined:file);
  }catch(error){if(!res.headersSent)json(res,error.code==='ENOENT'?404:500,{error:'Ressource de vérification indisponible.'});else res.end();}
 });
 server.listen(Number(process.env.PORT||0),'0.0.0.0',()=>console.log('Krokli Pro isolated review listening on '+server.address().port));
 let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;server.close();child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(temporary,{recursive:true,force:true});process.exit(0);};
 process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());child.once('exit',()=>{if(!stopping){server.close();process.exitCode=1;}});
 return {server,child};
}
if(require.main===module)start().catch(()=>{console.error('Isolated review startup failed.');process.exitCode=1;});
module.exports={start,DEMO_PASSWORD};
