'use strict';
// Independent encrypted applicant store. Never place identity files in a public
// directory, the order database, an email, or a response to another applicant.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt),{KDF,validatePassword}=require('./driver-password');
const {createAuthRateLimiter}=require('./auth-rate-limit');
const DAY=86400000,MAX_FILE=4*1024*1024;
const SLOTS=['registration','identityFront','identityBack','bank'];
const LABELS={draft:'À compléter',submitted:'En cours de vérification',needs_information:'Pièces à compléter',approved:'Validé',rejected:'Non retenu'};
const fail=(m,s=400)=>{throw Object.assign(Error(m),{statusCode:s});};
const clean=(v,n=150)=>typeof v==='string'?v.trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,n):'';
function email(v){const s=clean(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail('Vérifie ton adresse email.');return s;}
function fields(kind,input,complete=false){
  const p={firstName:clean(input.firstName,60),lastName:clean(input.lastName,60),phone:clean(input.phone,30),city:clean(input.city,100)};
  if(kind==='driver')p.transport=clean(input.transport,20);
  else Object.assign(p,{restaurantName:clean(input.restaurantName,120),address:clean(input.address,200),siret:clean(input.siret,14),needs:Array.isArray(input.needs)?[...new Set(input.needs.filter(x=>['app','orders','delivery','kiosk'].includes(x)))]:[],project:clean(input.project,1500)});
  if(complete){
    if(p.firstName.length<2||p.lastName.length<2||p.city.length<2||!/^\+?[0-9 ()-]{9,25}$/.test(p.phone))fail('Complète ton prénom, ton nom, ta ville et ton téléphone.');
    if(kind==='driver'&&!['bike','ebike','scooter','motorbike','car'].includes(p.transport))fail('Choisis ton moyen de transport.');
    if(kind==='restaurant'&&(p.restaurantName.length<2||p.address.length<5||!/^\d{14}$/.test(p.siret)||!p.needs.length))fail('Complète le restaurant, son adresse, son SIRET et au moins un besoin.');
  }
  return p;
}
function fileContent(input){
  if(!SLOTS.includes(input?.slot))fail('Type de justificatif invalide.');
  if(typeof input.base64!=='string'||input.base64.length>Math.ceil(MAX_FILE/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64))fail('Fichier invalide ou trop volumineux (4 Mo maximum).',413);
  const b=Buffer.from(input.base64,'base64');if(!b.length||b.length>MAX_FILE)fail('Fichier vide ou trop volumineux.',413);
  const mime=b.subarray(0,5).equals(Buffer.from('%PDF-'))?'application/pdf':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':null;
  if(!mime||mime!==input.mime)fail('Utilise un vrai PDF, JPEG ou PNG.');
  return{b,mime,sha256:crypto.createHash('sha256').update(b).digest('hex')};
}
function createEnrolmentStore({directory,secret,clock=Date.now,approveDriver=async()=>{throw Error('Driver activation unavailable');}}){
  if(typeof secret!=='string'||secret.length<24)fail('Protection des dossiers indisponible.',503);
  const key=crypto.createHmac('sha256',secret).update('krokli-enrolment-aes-v1').digest();
  const hash=v=>crypto.createHmac('sha256',key).update(v).digest('hex');
  const seal=(bytes,aad)=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(aad));return Buffer.from(JSON.stringify({v:1,iv:iv.toString('base64'),tag:null,body:null,...(()=>{const b=Buffer.concat([c.update(bytes),c.final()]);return{tag:c.getAuthTag().toString('base64'),body:b.toString('base64')};})()}));};
  const open=(bytes,aad)=>{const v=JSON.parse(bytes.toString());if(v.v!==1)throw Error('Invalid encrypted record');const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64'));d.setAAD(Buffer.from(aad));d.setAuthTag(Buffer.from(v.tag,'base64'));return Buffer.concat([d.update(Buffer.from(v.body,'base64')),d.final()]);};
  let tail=Promise.resolve();
  const limiter=createAuthRateLimiter({limit:8,windowMs:15*60000,now:clock});
  const uploadLimiter=createAuthRateLimiter({limit:24,windowMs:3600000,now:clock});
  async function read(){try{return JSON.parse(open(await fs.readFile(path.join(directory,'records.enc')),'records').toString());}catch(e){if(e.code==='ENOENT')return{version:1,applications:[],sessions:[],mail:[]};fail('Les dossiers sont momentanément indisponibles.',503);}}
  async function write(db){await fs.mkdir(directory,{recursive:true,mode:0o700});const temp=path.join(directory,crypto.randomUUID()+'.tmp');await fs.writeFile(temp,seal(Buffer.from(JSON.stringify(db)),'records'),{mode:0o600});await fs.rename(temp,path.join(directory,'records.enc'));}
  function transact(fn){const task=tail.catch(()=>{}).then(async()=>{const db=await read();const result=await fn(db);await write(db);return result;});tail=task.catch(()=>{});return task;}
  const own=(db,token)=>{if(typeof token!=='string'||token.length!==43)fail('Reconnecte-toi à ton dossier.',401);const session=db.sessions.find(s=>s.hash===hash(token)&&s.expiresAt>clock());const a=session&&db.applications.find(a=>a.id===session.applicationId);if(!a)fail('Reconnecte-toi à ton dossier.',401);return a;};
  const view=a=>({id:a.id,kind:a.kind,email:a.email,profile:a.profile,status:a.status,statusLabel:LABELS[a.status],message:a.message||'',createdAt:a.createdAt,updatedAt:a.updatedAt,submittedAt:a.submittedAt||null,emailVerified:Boolean(a.emailVerified),documents:Object.entries(a.documents).map(([slot,v])=>({slot,mime:v.mime,bytes:v.bytes,uploadedAt:v.uploadedAt})),canEdit:['draft','needs_information'].includes(a.status)});
  function queue(db,a,event){const id=a.id+':'+event+':'+a.revision;if(db.mail.some(q=>q.id===id))return;db.mail.push({id,applicationId:a.id,to:a.email,event,status:'queued',createdAt:clock(),attempts:0});}
  function session(db,a){db.sessions=db.sessions.filter(s=>s.expiresAt>clock());const token=crypto.randomBytes(32).toString('base64url');db.sessions.push({hash:hash(token),applicationId:a.id,expiresAt:clock()+7*DAY});if(db.sessions.length>2000)db.sessions.splice(0,db.sessions.length-2000);return token;}
  const limited=(key,l=limiter)=>{const r=l.consume(hash(String(key)));if(!r.allowed)fail('Trop de tentatives. Réessaie plus tard.',429);};
  async function register(input,ip){
    limited('register:'+ip);const address=email(input.email);if(!['driver','restaurant'].includes(input.kind))fail('Choisis le type d’inscription.');validatePassword(input.password,input.confirmation);
    if(input.privacyAccepted!==true)fail('Confirme avoir lu les informations sur tes données.');
    const salt=crypto.randomBytes(16).toString('hex'),passwordHash=(await scrypt(input.password,salt,64,KDF)).toString('hex');
    return transact(async db=>{if(db.applications.some(a=>a.email===address&&a.kind===input.kind))fail('Un dossier existe déjà avec ces informations. Utilise « Retrouver mon dossier ».',409);if(db.applications.length>=500)fail('Les inscriptions sont momentanément suspendues.',503);
      const a={id:crypto.randomUUID(),kind:input.kind,email:address,salt,passwordHash,passwordKdf:'scrypt-v2',profile:fields(input.kind,input),documents:{},status:'draft',revision:1,createdAt:clock(),updatedAt:clock(),privacyVersion:'2026-10-25',privacyAcceptedAt:clock(),emailVerified:false};db.applications.push(a);queue(db,a,'created');return{application:view(a),token:session(db,a)};});
  }
  async function login(input,ip){limited('login-ip:'+ip);const address=email(input.email);limited('login-email:'+address);if(typeof input.password!=='string'||input.password.length>128)fail('Email ou mot de passe incorrect.',401);
    const db=await read(),a=db.applications.find(a=>a.email===address&&a.kind===input.kind),salt=a?.salt||'00000000000000000000000000000000';
    const value=(await scrypt(input.password,salt,64,KDF)).toString('hex');if(!a||!crypto.timingSafeEqual(Buffer.from(value),Buffer.from(a.passwordHash)))fail('Email ou mot de passe incorrect.',401);
    return transact(d=>{const current=d.applications.find(x=>x.id===a.id);return{application:view(current),token:session(d,current)};});
  }
  async function state(token){return view(own(await read(),token));}
  async function update(token,input){return transact(db=>{const a=own(db,token);if(!['draft','needs_information'].includes(a.status))fail('Ce dossier a déjà été envoyé.',409);a.profile=fields(a.kind,input);a.updatedAt=clock();a.revision++;return view(a);});}
  async function upload(token,input){const f=fileContent(input);return transact(async db=>{const a=own(db,token);limited(a.id,uploadLimiter);if(a.kind!=='driver'||!['draft','needs_information'].includes(a.status))fail('Ajout de justificatif indisponible.',409);const used=db.applications.reduce((n,x)=>n+Object.values(x.documents).reduce((m,d)=>m+d.bytes,0),0);if(used-(a.documents[input.slot]?.bytes||0)+f.b.length>200*1024*1024)fail('Les justificatifs sont momentanément suspendus. Ton dossier est conservé.',503);await fs.mkdir(directory,{recursive:true,mode:0o700});const blob=crypto.randomUUID()+'.enc';await fs.writeFile(path.join(directory,blob),seal(f.b,a.id+':'+input.slot),{mode:0o600});const previous=a.documents[input.slot];a.documents[input.slot]={blob,mime:f.mime,bytes:f.b.length,sha256:f.sha256,uploadedAt:clock()};a.updatedAt=clock();a.revision++;if(previous?.blob)await fs.unlink(path.join(directory,previous.blob)).catch(()=>{});return view(a);});}
  async function removeDocument(token,slot){if(!SLOTS.includes(slot))fail('Justificatif introuvable.',404);return transact(async db=>{const a=own(db,token);if(!['draft','needs_information'].includes(a.status))fail('Le dossier est en cours de vérification.',409);const previous=a.documents[slot];delete a.documents[slot];a.updatedAt=clock();a.revision++;if(previous?.blob)await fs.unlink(path.join(directory,previous.blob)).catch(()=>{});return view(a);});}
  async function submit(token){return transact(db=>{const a=own(db,token);if(!['draft','needs_information'].includes(a.status))return view(a);fields(a.kind,a.profile,true);if(a.kind==='driver'&&SLOTS.some(slot=>!a.documents[slot]))fail('Ajoute les quatre justificatifs avant d’envoyer ton dossier.');a.status='submitted';a.submittedAt=clock();a.updatedAt=clock();a.revision++;a.message='';queue(db,a,'submitted');return view(a);});}
  async function list(){const db=await read();return{applications:db.applications.map(view).sort((a,b)=>b.updatedAt-a.updatedAt),mail:{queued:db.mail.filter(q=>q.status==='queued').length,uncertain:db.mail.filter(q=>q.status==='uncertain').length}};}
  async function decision(id,input){return transact(async db=>{const a=db.applications.find(a=>a.id===id);if(!a)fail('Dossier introuvable.',404);if(input.confirm!==true||!['submitted','needs_information'].includes(a.status)||!['approved','needs_information','rejected'].includes(input.status))fail('Cette décision n’est pas disponible.',409);const message=clean(input.message,1000);if(input.status!=='approved'&&message.length<5)fail('Précise le motif ou les pièces attendues.');if(input.status==='approved'&&a.kind==='driver'){fields(a.kind,a.profile,true);if(SLOTS.some(s=>!a.documents[s]))fail('Dossier incomplet.',409);const result=await approveDriver(a);a.driverId=result.id;a.driverUsername=result.username;}a.status=input.status;a.message=message;a.updatedAt=clock();a.revision++;queue(db,a,input.status);return view(a);});}
  async function document(id,slot){if(!SLOTS.includes(slot))fail('Justificatif introuvable.',404);const db=await read(),a=db.applications.find(a=>a.id===id),f=a?.documents[slot];if(!f)fail('Justificatif introuvable.',404);const bytes=open(await fs.readFile(path.join(directory,f.blob)),a.id+':'+slot);return{bytes,mime:f.mime,filename:`justificatif-${slot}.${f.mime==='application/pdf'?'pdf':f.mime==='image/png'?'png':'jpg'}`};}
  async function activeUsername(address){if(typeof address!=='string'||!address.includes('@'))return address;const db=await read();return db.applications.find(a=>a.kind==='driver'&&a.status==='approved'&&a.email===address.toLowerCase().trim())?.driverUsername||address;}
  async function logout(token){return transact(db=>{db.sessions=db.sessions.filter(s=>s.hash!==hash(token||''));return{signedOut:true};});}
  async function erase(token){return transact(async db=>{const a=own(db,token);if(a.status==='approved')fail('Contacte Krokli pour supprimer un compte déjà activé et traiter les obligations liées aux courses.',409);for(const f of Object.values(a.documents))await fs.unlink(path.join(directory,f.blob)).catch(()=>{});db.applications=db.applications.filter(x=>x.id!==a.id);db.sessions=db.sessions.filter(x=>x.applicationId!==a.id);db.mail=db.mail.filter(x=>x.applicationId!==a.id);return{deleted:true};});}
  // Transactional mail only. A delivery with an ambiguous provider outcome is
  // retained for review, never blindly resent or reported as delivered.
  async function drainMail(sendMail){let job;await transact(db=>{job=db.mail.find(q=>q.status==='queued');if(job){job={...job};const q=db.mail.find(q=>q.id===job.id);q.status='sending';q.attemptedAt=clock();q.attempts++;}});if(!job)return false;let result;try{result=await sendMail(job);}catch{result={status:'uncertain'};}await transact(db=>{const q=db.mail.find(q=>q.id===job.id);if(!q)return;q.status=result?.status==='sent'?'sent':result?.status==='not_configured'?'queued':'uncertain';if(result?.providerId)q.providerId=result.providerId;q.updatedAt=clock();});return true;}
  async function purge(){return transact(async db=>{const now=clock(),removed=[];for(const a of db.applications){if(a.status==='approved'){if(a.updatedAt+30*DAY<now){for(const f of Object.values(a.documents))await fs.unlink(path.join(directory,f.blob)).catch(()=>{});a.documents={};}continue;}if(a.updatedAt+90*DAY<now){for(const f of Object.values(a.documents))await fs.unlink(path.join(directory,f.blob)).catch(()=>{});removed.push(a.id);}}db.applications=db.applications.filter(a=>!removed.includes(a.id));db.sessions=db.sessions.filter(s=>!removed.includes(s.applicationId)&&s.expiresAt>now);db.mail=db.mail.filter(q=>!removed.includes(q.applicationId)&&(q.status==='queued'||q.createdAt+90*DAY>now));return{removed:removed.length};});}
  return{register,login,state,update,upload,removeDocument,submit,list,decision,document,activeUsername,logout,erase,drainMail,purge};
}
module.exports={createEnrolmentStore,MAX_FILE,SLOTS,LABELS,fileContent,fields};
