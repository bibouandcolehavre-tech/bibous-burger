'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const PUBLIC='/api/krokli/enrolment',ADMIN='/api/dashboard/krokli-enrolment';
async function body(req){return new Promise((resolve,reject)=>{const chunks=[];let size=0,failed=false;const stop=(m,s)=>{if(failed)return;failed=true;clearTimeout(timer);reject(Object.assign(Error(m),{statusCode:s}));};const timer=setTimeout(()=>stop('Envoi trop lent. Réessaie avec un fichier plus petit.',408),30000);req.on('data',b=>{size+=b.length;if(size>5800000)return stop('Fichier trop volumineux.',413);if(!failed)chunks.push(b);});req.on('end',()=>{clearTimeout(timer);if(failed)return;try{const v=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!v||typeof v!=='object'||Array.isArray(v))throw Error();resolve(v);}catch{stop('Requête invalide.',400);}});req.on('error',()=>stop('Connexion interrompue.',400));req.on('aborted',()=>stop('Connexion interrompue.',400));});}
function createEnrolmentHttp({store,authenticatedDashboard,mailReady=false,origin='https://bibous-burger.onrender.com'}){
  return async function handle(req,res,url){
    const pathname=url.pathname,admin=pathname.startsWith(ADMIN);
    const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
    if(pathname==='/inscription'||pathname.startsWith('/inscription/')){
      const files={'/inscription':'index.html','/inscription/':'index.html','/inscription/app.js':'app.js','/inscription/style.css':'style.css','/inscription/logo.png':'logo.png'};
      if(req.method!=='GET'||!files[pathname])return json(404,{error:'Page introuvable.'});
      const name=files[pathname],data=await fs.readFile(path.join(__dirname,'enrolment-public',name));
      res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(data);return true;
    }
    if(!pathname.startsWith(PUBLIC)&&!admin)return false;
    if(admin&&req.headers.origin&&(req.headers.origin==='https://bibous-burgers-restaurant.onrender.com'||/^http:\/\/localhost:\d+$/.test(req.headers.origin))){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
    try{
      if(admin&&!authenticatedDashboard(req))return json(401,{error:'Accès de gestion Krokli requis.'});
      const caller=req.headers.origin;if(!admin&&caller&&caller!==origin&&!/^http:\/\/localhost:\d+$/.test(caller))return json(403,{error:'Origine non autorisée.'});
      const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
      const route=pathname.slice((admin?ADMIN:PUBLIC).length);
      if(!admin&&req.method==='GET'&&route==='/capabilities')return json(200,{enabled:true,mailReady,maxFileBytes:4194304,formats:['application/pdf','image/jpeg','image/png']});
      if(admin&&req.method==='GET'&&route==='')return json(200,{...await store.list(),mailReady});
      const doc=admin&&/^\/([0-9a-f-]{36})\/documents\/(registration|identityFront|identityBack|bank)$/.exec(route);
      if(doc&&req.method==='GET'){const file=await store.document(doc[1],doc[2]);res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`attachment; filename="${file.filename}"`,'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});res.end(file.bytes);return true;}
      if(admin&&req.method==='PATCH'&&/^\/[0-9a-f-]{36}$/.test(route))return json(200,await store.decision(route.slice(1),await body(req)));
      if(!admin&&req.method==='GET'&&route==='')return json(200,await store.state(token));
      if(!admin&&req.method==='DELETE'&&route==='')return json(200,await store.erase(token));
      if(!admin&&req.method==='DELETE'&&route.startsWith('/documents/'))return json(200,await store.removeDocument(token,route.slice(11)));
      if(!admin&&req.method==='POST'){
        const input=await body(req),ip=req.socket.remoteAddress||'unknown';
        if(route==='/register')return json(201,await store.register(input,ip));
        if(route==='/login')return json(200,await store.login(input,ip));
        if(route==='/profile')return json(200,await store.update(token,input));
        if(route==='/documents')return json(200,await store.upload(token,input));
        if(route==='/submit')return json(200,await store.submit(token));
        if(route==='/logout')return json(200,await store.logout(token));
      }
      return json(404,{error:'Action introuvable.'});
    }catch(e){return json([400,401,403,404,408,409,413,429,503].includes(e.statusCode)?e.statusCode:503,{error:e.statusCode?e.message:'Le dossier est momentanément indisponible. Réessaie plus tard.'});}
  };
}
module.exports={createEnrolmentHttp};
