// Local QA only. No production data, SMS credentials or payment credentials.
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');const {createCustomerSession}=require('../customer-session');const {defaultContest,joinContest}=require('../referral-contest');const {parisDateKey}=require('../availability');
if(process.env.NODE_ENV!=='test')throw Error('NODE_ENV=test required');
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bibou-marketing-preview-')),databaseFile=path.join(dir,'data.json'),secret='marketing-preview-only';
  const seed=async active=>{
    const now=new Date(),timestamp=now.toISOString();
    const database={customers:[1,2].map(i=>({id:'demo-'+i,name:i===1?'Camille Démo':'Alex Démo',firstName:i===1?'Camille':'Alex',lastName:'Démo',phone:'+3360000000'+i,verifiedPhone:'+3360000000'+i,phoneVerifiedAt:timestamp,firstPhoneVerifiedAt:timestamp,createdAt:timestamp,referralCode:'BIBOU-DEMO'+i,points:0,weeklyOrders:0,welcomeReward:{status:'used'}})),orders:[],reservations:[],nextCustomerId:3,nextOrderNumber:1,referralContest:active?{...defaultContest(),status:'published',revision:1,startDate:parisDateKey(now),endDate:parisDateKey(new Date(now.getTime()+13*86400000)),firstPrize:'24 menus sur un an (proposition)',secondPrize:'6 menus sur six mois (proposition)',thirdPrize:'2 menus à partager (proposition)',rules:'Environnement local fictif. Aucun concours réel. Test technique uniquement.'}:defaultContest()};
    if(active){
      const participation={contestId:'bibou-launch',revision:1,acceptRules:true,confirmAdult:true,confirmRegion:true};
      joinContest(database,database.customers[0],participation,secret,now);
      joinContest(database,database.customers[1],{...participation,sponsorCode:'BIBOU-DEMO1'},secret,now);
      database.referralContest.entries[0].alias='Participant AZUR';
      database.referralContest.entries[1].alias='Participant MIEL';
      database.orders=[{id:'demo-order-1',customerId:'demo-1',total:42.90,status:'confirmed',createdAt:timestamp,payment:{status:'PAID',paidAt:timestamp}},{id:'demo-order-2',customerId:'demo-2',total:15.50,status:'confirmed',createdAt:timestamp,payment:{status:'PAID',paidAt:timestamp}}];
    }
    await fs.writeFile(databaseFile,JSON.stringify(database));
  };
  await seed(false);
  const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{cwd:dir,env:{PATH:process.env.PATH,NODE_ENV:'test',PORT:'0',DATA_FILE_PATH:databaseFile,SESSION_SECRET:secret,RESTAURANT_DASHBOARD_PASSWORD:'demo-only'},stdio:['ignore','pipe','inherit']});
  const api=await new Promise((resolve,reject)=>{child.stdout.on('data',value=>{const match=String(value).match(/http:\/\/localhost:\d+/);if(match)resolve(match[0]);});child.on('error',reject);child.on('exit',code=>reject(Error('API exit '+code)));});
  const dist=path.resolve(__dirname,'../../dist'),dashboard=path.resolve(__dirname,'../../restaurant-dashboard');let origin;
  const server=http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/fixtures'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});return res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Test local Bibou</title><h1>Données fictives uniquement</h1><p>Restaurant : mot de passe demo-only</p><button data-action="draft">Réinitialiser en brouillon</button><button data-action="active">Concours fictif actif</button><button data-client="1">Connecter Camille</button><button data-client="2">Connecter Alex parrainé par Camille</button><a href="/">Application anonyme</a> · <a href="/restaurant/">Restaurant fictif</a><script>document.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{await fetch('/scenario/'+b.dataset.action,{method:'POST'});document.title='Scénario chargé';b.textContent='Scénario chargé';});document.querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>{localStorage.setItem('bibousCustomerSession',b.dataset.client==='1'?${JSON.stringify(createCustomerSession('demo-1',secret))}:${JSON.stringify(createCustomerSession('demo-2',secret))});location.href='/?contest=bibou-launch&theme=duo-equilibre'+(b.dataset.client==='2'?'&ref=BIBOU-DEMO1':'');});</script></html>`);}
    if(req.method==='POST'&&/^\/scenario\/(draft|active)$/.test(url.pathname)){await seed(url.pathname.endsWith('active'));res.writeHead(204);return res.end();}
    if(url.pathname.startsWith('/api/')){const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await fetch(api+req.url,{method:req.method,headers:{Authorization:req.headers.authorization||'','Content-Type':'application/json'},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(Buffer.from(await response.arrayBuffer()));}
    const isDashboard=url.pathname.startsWith('/restaurant/'),root=isDashboard?dashboard:dist;const relative=isDashboard?url.pathname.slice('/restaurant'.length):url.pathname;
    const file=path.resolve(root,'.'+(relative==='/'?'/index.html':decodeURIComponent(relative)));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    let content=await fs.readFile(file);const ext=path.extname(file);if(ext==='.js')content=Buffer.from(content.toString().replaceAll('https://bibous-burger.onrender.com/api',origin+'/api').replaceAll('http://localhost:3001/api',origin+'/api'));
    res.writeHead(200,{'Content-Type':({'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'})[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(content);
  }catch{res.writeHead(503);res.end('Prévisualisation indisponible');}});
  server.listen(0,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;console.log(origin+'/fixtures');});
  const stop=()=>{child.kill();server.close();process.exit(0);};process.once('SIGTERM',stop);process.once('SIGINT',stop);
})();
