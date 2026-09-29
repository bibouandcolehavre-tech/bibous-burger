// Local-only QA of the production UI against an isolated server and fictional data.
// Never reads the repository .env or server/data.json; never enables any provider.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const repo = path.resolve(__dirname, '..');
async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bibou-dashboard-qa-'));
  const now = new Date(), date = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const customers = [{id:'qa-c1',name:'Camille · test',phone:'+33600000001',points:180,referralCode:'TESTCAMILLE'}, {id:'qa-c2',name:'Alex · test',phone:'+33600000002',points:350,referralCode:'TESTALEX'}];
  const orders = ['confirmed','preparing','ready'].map((status,index) => ({
    id:'qa-order-'+index,number:1042+index,customerId:customers[index%2].id,customerName:customers[index%2].name,customerPhone:customers[index%2].phone,
    createdAt:now.toISOString(),paidAt:now.toISOString(),serviceDate:date,slot:index===0?'19:00 – 19:30':'19:30',method:index===0?'delivery':'pickup',status,
    deliveryAddress:index===0?{address:'Adresse fictive de test',postalCode:'76600',city:'Le Havre'}:null,
    subtotal:16.9,deliveryFee:index===0?2.5:0,total:index===0?19.4:16.9,comment:index===0?'Sonnez à l’arrivée — simulation locale.':'',payment:{status:'PAID'},
    items:[{productId:'classique-menu',name:'Le Classique',quantity:1,price:16.9,options:[{groupId:'protein',label:'Viande',price:0},{groupId:'salad',label:'Roquette',price:0},{groupId:'sides',label:'Frites maison',price:0},{groupId:'drink',label:'Coca-Cola',price:0}]}]
  }));
  const reservations=[{id:'qa-table',number:87,customerId:'qa-c1',customerName:'Camille · test',phone:'+33600000001',guests:2,serviceDate:date,slot:'19:30',status:'pending',createdAt:now.toISOString()}];
  await fs.writeFile(path.join(dir,'data.json'),JSON.stringify({customers,orders,reservations,rewardClaims:[],nextOrderNumber:1045,nextCustomerId:3}),{mode:0o600});
  const child=spawn(process.execPath,[path.join(repo,'server/server.js')],{
    cwd:dir,env:{PATH:process.env.PATH,PORT:'0',NODE_ENV:'test',DATA_FILE_PATH:path.join(dir,'data.json'),SESSION_SECRET:'local-qa-only',RESTAURANT_DASHBOARD_PASSWORD:'local-qa-only'},stdio:['ignore','pipe','pipe']
  });
  const backend = await new Promise((resolve,reject)=>{
    let output='';child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/localhost:\d+/);if(match)resolve(match[0]);});
    child.on('error',reject);child.on('exit',code=>reject(Error('QA backend exited: '+code)));child.stderr.on('data',data=>process.stderr.write(data));
  });
  const staticRoot=path.join(repo,'restaurant-dashboard');
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      res.setHeader('Cache-Control','no-store');
      if(url.pathname.startsWith('/api/')) {
        const parts=[];for await(const chunk of req)parts.push(chunk);
        const response=await fetch(backend+url.pathname+url.search,{method:req.method,headers:{'Content-Type':'application/json',Authorization:req.headers.authorization||''},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(parts)})});
        res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json'});res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
      if(!/^[a-z0-9.-]+$/.test(name))throw Error('Invalid path');
      let content=await fs.readFile(path.join(staticRoot,name));
      if(name==='app.js')content=Buffer.from(content.toString().replace(/^const API_BASE_URL = .*?;/,"const API_BASE_URL = '/api';"));
      if(name==='index.html')content=Buffer.from(content.toString().replace('<body>','<body><div style="padding:5px;text-align:center;background:#33251f;color:white;font-size:11px">VÉRIFICATION LOCALE · données fictives · aucun paiement, SMS ou coursier réel</div>'));
      res.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'});res.end(content);
    } catch(error) {res.writeHead(500,{'Content-Type':'text/plain'});res.end(error.message);}
  });
  server.listen(4189,'127.0.0.1',()=>console.log('QA isolated: http://127.0.0.1:4189/ — password: local-qa-only'));
  async function stop(){server.close();child.kill();if(child.exitCode===null)await once(child,'exit');await fs.rm(dir,{recursive:true,force:true});process.exit(0);}
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
main().catch(error=>{console.error(error);process.exit(1);});
