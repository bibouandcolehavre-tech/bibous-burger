// Local visual QA only. No real database, credentials, SMS, push or payment calls.
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {createCustomerSession}=require('../customer-session'),crm=require('../crm');
if(process.env.NODE_ENV!=='test')throw Error('NODE_ENV=test required');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-crm-preview-')),databaseFile=path.join(dir,'data.json'),secret='crm-preview-only',now=Date.now(),day=86400000;
  const names=['Camille Démonstration','Alex Exemple','Sam Test'];
  const db={customers:names.map((name,i)=>({id:'demo-'+i,name,phone:'+3360000000'+i,createdAt:new Date(now-90*day).toISOString(),points:0,weeklyOrders:0,welcomeReward:{status:'used'},crmPreferences:{personalizedOffers:i!==2,birthday:'09-20'}})),orders:[],nextCustomerId:4,nextOrderNumber:100,reservations:[]};
  [2,5,8,12,50].forEach((ago,i)=>db.orders.push({id:'demo-order-'+i,number:i+1,customerId:i===4?'demo-1':'demo-0',customerName:names[i===4?1:0],createdAt:new Date(now-ago*day).toISOString(),payment:{status:'PAID',paidAt:new Date(now-ago*day).toISOString()},status:'delivered',method:'pickup',subtotal:30+i,total:30+i,items:[]}));
  db.crm={settings:crm.defaults(),offers:[{id:'demo-offer',customerId:'demo-0',ruleId:'birthday',eventKey:'fictitious',title:'Offre fictive de démonstration',discountPercent:15,minSubtotal:0,createdAt:now-day,expiresAt:now+14*day}]};
  await fs.writeFile(databaseFile,JSON.stringify(db));
  const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{cwd:dir,env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',DATA_FILE_PATH:databaseFile,SESSION_SECRET:secret,RESTAURANT_DASHBOARD_PASSWORD:'demo-only',PUSH_ENABLED:'false'},stdio:['ignore','pipe','inherit']});
  const api=await new Promise((resolve,reject)=>{child.stdout.on('data',value=>{const match=String(value).match(/http:\/\/localhost:\d+/);if(match)resolve(match[0]);});child.on('error',reject);child.on('exit',code=>reject(Error('API exit '+code)));});
  const dist=path.resolve(__dirname,'../../dist'),dashboard=path.resolve(__dirname,'../../restaurant-dashboard');let origin;
  const server=http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/fixtures'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});return res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>CRM · Démonstration locale</title><h1>Données fictives uniquement</h1><p>Restaurant : mot de passe demo-only</p><a href="/restaurant/">Restaurant fictif</a><button id="client">Connecter Camille fictive</button><script>document.getElementById('client').onclick=()=>{localStorage.setItem('bibousCustomerSession',${JSON.stringify(createCustomerSession('demo-0',secret))});location.href='/';};</script></html>`);}
    if(url.pathname.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await fetch(api+req.url,{method:req.method,headers:{Authorization:req.headers.authorization||'','Content-Type':'application/json'},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(Buffer.from(await response.arrayBuffer()));}
    const isDashboard=url.pathname.startsWith('/restaurant/'),root=isDashboard?dashboard:dist,relative=isDashboard?url.pathname.slice('/restaurant'.length):url.pathname;
    const file=path.resolve(root,'.'+(relative==='/'?'/index.html':decodeURIComponent(relative)));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    let content=await fs.readFile(file);const ext=path.extname(file);
    if(ext==='.js')content=Buffer.from(content.toString().replaceAll('https://bibous-burger.onrender.com/api',origin+'/api').replaceAll('http://localhost:3001/api',origin+'/api'));
    if(ext==='.html')content=Buffer.from(content.toString().replace('<body>','<body><div style="background:#ffe68a;color:#362810;padding:10px;text-align:center;font:14px system-ui">DÉMONSTRATION LOCALE · clients et montants fictifs · aucun envoi réel</div>'));
    res.writeHead(200,{'Content-Type':({'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'})[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  }catch{res.writeHead(503);res.end('Prévisualisation indisponible');}});
  server.listen(0,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;console.log(origin+'/fixtures');});
  const stop=()=>{child.kill();server.close();process.exit(0);};process.once('SIGTERM',stop);process.once('SIGINT',stop);
})();
