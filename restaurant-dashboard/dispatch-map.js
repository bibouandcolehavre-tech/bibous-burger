/* Same-origin offline map. No courier coordinates go to a map provider. */
window.KrokliDispatchMap=(()=>{
 const pickup={latitude:49.490809,longitude:.118444};
 function position(p,now=Date.now()){
  return p&&[p.latitude,p.longitude,p.accuracy,p.timestamp].every(Number.isFinite)&&Math.abs(p.latitude)<=85&&Math.abs(p.longitude)<=180&&p.accuracy>=0&&p.accuracy<=100&&p.timestamp<=now+5000&&p.timestamp>=now-90000&&Date.parse(p.expiresAt)>now;
 }
 function distance(p){const r=n=>n*Math.PI/180,a=r(p.latitude-pickup.latitude),b=r(p.longitude-pickup.longitude),h=Math.sin(a/2)**2+Math.cos(r(pickup.latitude))*Math.cos(r(p.latitude))*Math.sin(b/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));}
 function online(d,now=Date.now()){return d.active===true&&d.availability?.available===true&&Date.parse(d.availability.expiresAt)>now;}
 function nearest(data,now=Date.now()){
  const busy=new Set((data.orders||[]).filter(o=>['offered','accepted','picked_up','issue'].includes(o.assignment?.status)).map(o=>o.assignment.driverId));
  return (data.drivers||[]).filter(d=>online(d,now)&&!busy.has(d.id)).map(d=>({driver:d,position:(data.gpsPositions||[]).find(p=>p.driverId===d.id&&position(p,now))})).filter(x=>x.position).sort((a,b)=>distance(a.position)-distance(b.position))[0]?.driver||null;
 }
 function create(root){
  let geometry=null,snapshot=null,current=false,active=true,observer=null;
  root.innerHTML='<section class="dispatch-map-section"><h2>Livreurs en ligne</h2><p data-map-count>Chargement…</p><svg class="dispatch-map" role="img" aria-label="Positions des livreurs en ligne"></svg><p data-map-message role="status"></p><small>© OpenStreetMap contributors · ODbL · fond de carte hors ligne · aucune position transmise à un service cartographique</small></section>';
  const svg=root.querySelector('svg'),count=root.querySelector('[data-map-count]'),message=root.querySelector('[data-map-message]');
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function draw(){
   if(!active)return;
   const now=Date.now(),drivers=current?(snapshot?.drivers||[]).filter(d=>online(d,now)):[],positions=drivers.map(d=>({d,p:(snapshot.gpsPositions||[]).find(p=>p.driverId===d.id&&position(p,now))})).filter(x=>x.p);
   count.textContent=current?drivers.length+' en ligne · '+positions.length+' position(s) GPS récente(s)':'Statuts à actualiser · positions masquées';
   message.textContent=!current?'Aucune ancienne position n’est présentée comme actuelle.':!drivers.length?'Aucun livreur en ligne.':positions.length<drivers.length?'Certains livreurs en ligne n’ont pas de position GPS récente.':'';
   if(!geometry){svg.innerHTML='';if(current)message.textContent='Chargement du fond de carte. Les statuts restent visibles ci-dessous.';return;}
   const width=root.clientWidth||500,height=width<500?330:400;svg.setAttribute('viewBox','0 0 '+width+' '+height);
   const points=[[pickup.longitude,pickup.latitude],...positions.map(x=>[x.p.longitude,x.p.latitude])];
   const minX=Math.min(...points.map(p=>p[0]))-.003,maxX=Math.max(...points.map(p=>p[0]))+.003,minY=Math.min(...points.map(p=>p[1]))-.002,maxY=Math.max(...points.map(p=>p[1]))+.002;
   const merc=p=>[p[0]*Math.PI/180,Math.log(Math.tan(Math.PI/4+p[1]*Math.PI/360))],a=merc([minX,minY]),b=merc([maxX,maxY]),scale=Math.min((width-44)/(b[0]-a[0]),(height-44)/(b[1]-a[1]));
   const project=p=>{const c=merc(p);return [width/2+(c[0]-(a[0]+b[0])/2)*scale,height/2-(c[1]-(a[1]+b[1])/2)*scale];};
   const path=coords=>coords.map((p,i)=>{const q=project(p);return(i?'L':'M')+q[0].toFixed(1)+','+q[1].toFixed(1);}).join(' ');
   let html='<title>Position des livreurs en ligne, même sans commande</title>';
   if(geometry.raster){const rb=geometry.raster.bounds,a=project([rb[0],rb[3]]),b=project([rb[2],rb[1]]);html+='<image href="'+geometry.raster.uri+'" x="'+a[0]+'" y="'+a[1]+'" width="'+(b[0]-a[0])+'" height="'+(b[1]-a[1])+'" preserveAspectRatio="none"/>';root.querySelector('small').textContent=geometry.raster.credit+' · carte hors ligne · aucune position transmise au fournisseur';}
   for(const f of (geometry.raster?[]:geometry.features)){if(f.kind==='water')html+='<path fill="#c8dddd" stroke="#c8dddd" stroke-width="3" d="'+path(f.coordinates)+(f.closed?'Z':'')+'"/>';}
   for(const f of (geometry.raster?[]:geometry.features)){if(f.kind!=='road')continue;const major=['primary','secondary','tertiary'].includes(f.class),d=path(f.coordinates);html+='<path fill="none" stroke="#d4dcd5" stroke-width="'+(major?7:4)+'" d="'+d+'"/><path fill="none" stroke="#fff" stroke-width="'+(major?5:2)+'" d="'+d+'"/>';}
   const r=project([pickup.longitude,pickup.latitude]);html+='<circle cx="'+r[0]+'" cy="'+r[1]+'" r="9" fill="#fff" stroke="#104a4b" stroke-width="3"><title>Restaurant</title></circle>';
   for(const {d,p} of positions){const q=project([p.longitude,p.latitude]);html+='<g><title>'+esc(d.name)+' · en ligne · position reçue '+esc(new Date(p.timestamp).toLocaleTimeString('fr-FR'))+'</title><circle cx="'+q[0]+'" cy="'+q[1]+'" r="15" fill="#104a4b" stroke="#fff" stroke-width="3"/><text x="'+q[0]+'" y="'+(q[1]+4)+'" text-anchor="middle" fill="#fff" font-size="12" font-family="Arial">'+esc(d.name?.[0]||'L')+'</text></g>';}
   svg.innerHTML=html;
  }
  fetch('./le-havre-map.json',{cache:'force-cache',credentials:'omit'}).then(r=>{if(!r.ok)throw Error('Carte indisponible');return r.json();}).then(g=>{if(active){geometry=g;draw();}}).catch(()=>{if(active)message.textContent='Fond de carte indisponible. Les statuts et coordonnées restent disponibles.';});
  observer=new ResizeObserver(draw);observer.observe(root);
  return {update(data,fresh){snapshot=data;current=fresh===true;active=true;draw();},clear(){snapshot=null;current=false;draw();},destroy(){active=false;observer.disconnect();svg.innerHTML='';}};
 }
 return {create,nearest,online,position,distance};
})();
