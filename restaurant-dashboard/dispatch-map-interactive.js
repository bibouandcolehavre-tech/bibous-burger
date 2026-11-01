/* Interactive, same-origin map. GPS fixes stay between Driver and the restaurant. */
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
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function visible(data,fresh,now=Date.now()){
  if(!fresh)return [];
  return (data?.drivers||[]).filter(d=>online(d,now)).map(d=>({driver:d,point:(data.gpsPositions||[]).find(p=>p.driverId===d.id&&position(p,now))})).filter(x=>x.point);
 }
 function create(root){
  const L=window.L;
  if(!L){root.textContent='La carte ne s’est pas chargée. Actualisez la page ; les statuts restent disponibles.';return {update(){},clear(){},destroy(){}};}
  let snapshot=null,current=false,active=true,geometry=null,selected='',following=false,fitted=false,raf=0,observer=null,epoch=0,choiceMarkup='';
  const markers=new Map();
  root.innerHTML='<section class="dispatch-map-section interactive-map-section"><div class="map-heading"><div><h2>Livreurs en ligne</h2><p data-map-count role="status">Chargement…</p></div><button type="button" data-map-fullscreen>Agrandir la carte</button></div><div class="map-toolbar"><label>Voir un livreur<select data-map-driver aria-label="Choisir le livreur à afficher"><option value="">Tous les livreurs</option></select></label><button type="button" data-map-follow aria-pressed="false" disabled>Suivre le livreur</button><button type="button" data-map-fit>Vue d’ensemble</button><button type="button" data-map-restaurant>Restaurant</button></div><div class="dispatch-map interactive-dispatch-map" role="region" aria-label="Carte interactive des livreurs, zoom et déplacement disponibles"></div><p class="map-help">Déplacez la carte au doigt · pincez pour zoomer ou utilisez + et −</p><p data-map-message role="status"></p><p data-map-detail></p><small class="map-credit"></small></section>';
  const section=root.querySelector('section'),host=root.querySelector('.interactive-dispatch-map'),count=root.querySelector('[data-map-count]'),message=root.querySelector('[data-map-message]'),detail=root.querySelector('[data-map-detail]'),choose=root.querySelector('[data-map-driver]'),follow=root.querySelector('[data-map-follow]'),full=root.querySelector('[data-map-fullscreen]');
  const map=L.map(host,{center:[pickup.latitude,pickup.longitude],zoom:16,minZoom:11,maxZoom:20,zoomSnap:.5,zoomDelta:1,scrollWheelZoom:true,touchZoom:true,dragging:true,keyboard:true,attributionControl:false,zoomControl:false,preferCanvas:true});
  L.control.zoom({position:'topright',zoomInTitle:'Zoomer',zoomOutTitle:'Dézoomer'}).addTo(map);L.control.scale({imperial:false,position:'bottomleft',maxWidth:120}).addTo(map);
  const streets=L.layerGroup().addTo(map),names=L.layerGroup().addTo(map);
  const rank=c=>({primary:0,secondary:1,tertiary:2,residential:3,unclassified:4,living_street:5}[c]??8);
  L.marker([pickup.latitude,pickup.longitude],{icon:L.divIcon({className:'map-restaurant-pin',html:'<span aria-hidden="true">⌂</span>',iconSize:[30,30],iconAnchor:[15,15]}),title:'Restaurant · Bibou’s Burgers',zIndexOffset:10}).addTo(map).bindTooltip('Bibou’s Burgers',{permanent:true,direction:'bottom',className:'restaurant-label',offset:[0,15]});
  function rows(){return visible(snapshot,current);}
  function selectedRow(){return rows().find(x=>x.driver.id===selected);}
  function setFollow(value){following=Boolean(value&&selectedRow());follow.disabled=!selectedRow();follow.setAttribute('aria-pressed',String(following));follow.textContent=following?'Suivi activé':'Suivre le livreur';}
  function centerSelected(){const row=selectedRow();if(row)map.panTo([row.point.latitude,row.point.longitude],{animate:true,duration:.35});}
  function fit(){const points=[[pickup.latitude,pickup.longitude],...rows().map(x=>[x.point.latitude,x.point.longitude])];map.fitBounds(L.latLngBounds(points),{padding:[50,55],maxZoom:16,animate:true});fitted=true;}
  root.querySelector('[data-map-fit]').onclick=()=>{setFollow(false);fit();};
  root.querySelector('[data-map-restaurant]').onclick=()=>{setFollow(false);map.setView([pickup.latitude,pickup.longitude],17,{animate:true});fitted=true;};
  follow.onclick=()=>{setFollow(!following);if(following)centerSelected();};
  choose.onchange=()=>{selected=choose.value;setFollow(false);if(selected){centerSelected();if(map.getZoom()<16)map.setZoom(16);}refreshMarkers(false);};
  full.onclick=()=>{const expanded=section.classList.toggle('map-expanded');full.textContent=expanded?'Réduire la carte':'Agrandir la carte';full.setAttribute('aria-expanded',String(expanded));map.invalidateSize({pan:false});};
  const escapeFull=e=>{if(e.key==='Escape'&&section.classList.contains('map-expanded')){section.classList.remove('map-expanded');full.textContent='Agrandir la carte';full.setAttribute('aria-expanded','false');map.invalidateSize({pan:false});full.focus();}};
  document.addEventListener('keydown',escapeFull);
  map.on('dragstart',()=>{fitted=true;setFollow(false);});
  function info(row){return row.driver.name+' · position reçue il y a '+Math.max(0,Math.floor((Date.now()-row.point.timestamp)/1000))+' s · précision GPS ±'+Math.round(row.point.accuracy)+' m';}
  function remove(id){const m=markers.get(id);if(!m)return;cancelAnimationFrame(m.animation);map.removeLayer(m.marker);map.removeLayer(m.accuracy);markers.delete(id);}
  function animate(m,point){
   cancelAnimationFrame(m.animation);const start=m.marker.getLatLng(),end=L.latLng(point.latitude,point.longitude),began=performance.now(),duration=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:850;
   const frame=t=>{if(!active||!current||!markers.has(m.id))return;const f=duration?Math.min(1,(t-began)/duration):1;const next=L.latLng(start.lat+(end.lat-start.lat)*f,start.lng+(end.lng-start.lng)*f);m.marker.setLatLng(next);m.accuracy.setLatLng(next);if(f<1)m.animation=requestAnimationFrame(frame);};
   m.animation=requestAnimationFrame(frame);
  }
  function refreshMarkers(allowAnimation=true){
   if(!active)return;const now=Date.now(),drivers=current?(snapshot?.drivers||[]).filter(d=>online(d,now)):[],live=visible(snapshot,current,now),ids=new Set(live.map(x=>x.driver.id));
   for(const id of markers.keys())if(!ids.has(id))remove(id);
   const choices=drivers.map(d=>({id:d.id,name:d.name,hasPoint:ids.has(d.id)}));const optionHtml='<option value="">Tous les livreurs</option>'+choices.map(d=>'<option value="'+esc(d.id)+'" '+(!d.hasPoint?'disabled':'')+'>'+esc(d.name)+(d.hasPoint?'':' · GPS indisponible')+'</option>').join('');
   if(choiceMarkup!==optionHtml){choose.innerHTML=optionHtml;choiceMarkup=optionHtml;}
   if(selected&&!ids.has(selected)){selected='';setFollow(false);}choose.value=selected;
   count.textContent=current?drivers.length+' en ligne · '+live.length+' position(s) GPS récente(s)':'Statuts à actualiser · positions masquées';
   let selectedMoved=false;
   for(const row of live){const {driver:d,point:p}=row;let m=markers.get(d.id);
    if(!m){const marker=L.marker([p.latitude,p.longitude],{icon:L.divIcon({className:'map-driver-pin',html:'<span>'+esc(d.name?.[0]||'L')+'</span>',iconSize:[36,36],iconAnchor:[18,18]}),title:d.name+' · en ligne',zIndexOffset:100,keyboard:true}).addTo(map);marker.bindTooltip(esc(d.name),{permanent:true,direction:'top',offset:[0,-20],className:'driver-name-label'});const accuracy=L.circle([p.latitude,p.longitude],{radius:p.accuracy,color:'#167f80',fillColor:'#168f91',fillOpacity:.1,weight:1,interactive:false}).addTo(map);m={id:d.id,marker,accuracy,point:p,animation:0};markers.set(d.id,m);marker.on('click',()=>{selected=d.id;choose.value=selected;setFollow(false);refreshMarkers(false);});}
    const changed=p.timestamp>m.point.timestamp&&(p.latitude!==m.point.latitude||p.longitude!==m.point.longitude);
    if(changed){if(allowAnimation)animate(m,p);else{m.marker.setLatLng([p.latitude,p.longitude]);m.accuracy.setLatLng([p.latitude,p.longitude]);}if(d.id===selected)selectedMoved=true;}
    m.point={...p};m.accuracy.setRadius(p.accuracy);m.marker.setTooltipContent(esc(d.name));
    const popup=document.createElement('p');popup.textContent=info(row);if(m.marker.getPopup())m.marker.setPopupContent(popup);else m.marker.bindPopup(popup,{maxWidth:270});
   }
   setFollow(following);if(following&&selectedMoved)centerSelected();
   const row=selectedRow();detail.textContent=row?info(row):'Les positions sont actualisées avec les données GPS reçues. Le cercle indique leur marge de précision.';
   const outside=geometry&&live.some(x=>x.point.longitude<geometry.bounds[0]||x.point.longitude>geometry.bounds[2]||x.point.latitude<geometry.bounds[1]||x.point.latitude>geometry.bounds[3]);
   message.textContent=!current?'Connexion à actualiser : les anciennes positions sont masquées.':outside?'Un livreur est hors de la zone cartographiée du Havre ; sa position reste affichée.':drivers.length>live.length?'Certains livreurs en ligne n’ont pas de position GPS récente.':!drivers.length?'Aucun livreur en ligne.':'';
   if(current&&live.length&&!fitted&&geometry){fit();fitted=true;}
  }
  function labelStreets(){
   if(!geometry||!active)return;names.clearLayers();const zoom=map.getZoom();if(zoom<14)return;const bounds=map.getBounds().pad(.1),size=map.getSize(),occupied=[],used=new Set();
   const features=geometry.labelFeatures.filter(f=>(zoom>=16||rank(f.class)<3)&&(zoom>=18||!['footway','path','steps','service'].includes(f.class))&&bounds.intersects([[f.bbox[1],f.bbox[0]],[f.bbox[3],f.bbox[2]]]));
   for(const f of features){if(used.has(f.name))continue;let best=null;
    for(let i=1;i<f.coordinates.length;i++){const ca=f.coordinates[i-1],cb=f.coordinates[i],mid=L.latLng((ca[1]+cb[1])/2,(ca[0]+cb[0])/2);if(!bounds.contains(mid))continue;const a=map.latLngToContainerPoint([ca[1],ca[0]]),b=map.latLngToContainerPoint([cb[1],cb[0]]),length=a.distanceTo(b);if(!best||length>best.length)best={mid,length,a,b};}
    if(!best)continue;const pt=map.latLngToContainerPoint(best.mid),width=Math.min(240,f.name.length*(zoom>=17?6.4:6)+12),height=17;
    if(best.length<Math.min(width*.62,65)&&zoom<18)continue;if(pt.x<15||pt.x>size.x-15||pt.y<30||pt.y>size.y-35)continue;
    let angle=Math.atan2(best.b.y-best.a.y,best.b.x-best.a.x)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;
    const rad=angle*Math.PI/180,bw=Math.abs(Math.cos(rad)*width)+Math.abs(Math.sin(rad)*height),bh=Math.abs(Math.sin(rad)*width)+Math.abs(Math.cos(rad)*height),box={x:pt.x-bw/2,y:pt.y-bh/2,w:bw,h:bh};
    if(occupied.some(b=>box.x<b.x+b.w+8&&box.x+box.w+8>b.x&&box.y<b.y+b.h+5&&box.y+box.h+5>b.y))continue;
    occupied.push(box);used.add(f.name);L.marker(best.mid,{icon:L.divIcon({className:'map-street-name',html:'<span style="transform:translate(-50%,-50%) rotate('+angle.toFixed(1)+'deg);font-size:'+(zoom>=17?12:11)+'px">'+esc(f.name)+'</span>',iconSize:[0,0]}),interactive:false,keyboard:false,pane:'tooltipPane'}).addTo(names);if(used.size>100)break;
   }
  }
  function scheduleNames(){cancelAnimationFrame(raf);raf=requestAnimationFrame(labelStreets);}
  map.on('zoomend moveend',scheduleNames);
  const loadEpoch=epoch;
  fetch('./le-havre-streets-0afc5c67239c.json',{cache:'force-cache',credentials:'omit',redirect:'error'}).then(r=>{if(!r.ok)throw Error('Carte indisponible');return r.json();}).then(g=>{
   if(!active||loadEpoch!==epoch)return;geometry=g;
   if(g.raster)L.imageOverlay(g.raster.uri,[[g.raster.bounds[1],g.raster.bounds[0]],[g.raster.bounds[3],g.raster.bounds[2]]],{opacity:.35,interactive:false}).addTo(streets);
   const renderer=L.canvas({padding:.3}),groups=new Map();
   geometry.labelFeatures=g.features.filter(f=>f.kind==='road'&&f.name).map(f=>({...f,bbox:[Math.min(...f.coordinates.map(p=>p[0])),Math.min(...f.coordinates.map(p=>p[1])),Math.max(...f.coordinates.map(p=>p[0])),Math.max(...f.coordinates.map(p=>p[1]))]})).sort((a,b)=>rank(a.class)-rank(b.class)||b.coordinates.length-a.coordinates.length);
   for(const f of g.features){const pts=f.coordinates.map(p=>[p[1],p[0]]);if(pts.length<2)continue;
    if(f.kind==='water'){(f.closed?L.polygon(pts,{color:'#c7dce2',fillColor:'#c7dce2',fillOpacity:1,weight:1,interactive:false,renderer}):L.polyline(pts,{color:'#b9d4df',weight:4,interactive:false,renderer})).addTo(streets);continue;}
    if(!groups.has(f.class))groups.set(f.class,[]);groups.get(f.class).push(pts);
   }
   for(const [kind,lines] of groups){const major=['primary','secondary','tertiary'].includes(kind),small=['footway','steps','path','service'].includes(kind),weight=major?7:small?2:4;L.polyline(lines,{color:major?'#c5c8bb':'#d0d6cb',weight:weight+1.5,interactive:false,renderer}).addTo(streets);L.polyline(lines,{color:major?'#fff5cf':'#fff',weight,interactive:false,renderer}).addTo(streets);}
   root.querySelector('.map-credit').innerHTML='Données © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors · ODbL</a>'+(g.raster?' · '+esc(g.raster.credit):'')+' · fond local · <a href="./le-havre-streets-0afc5c67239c.json" download>Source cartographique</a>';refreshMarkers(false);scheduleNames();
  }).catch(()=>{if(active)message.textContent='Fond de carte indisponible. Les positions et les statuts restent affichés.';});
  observer=new ResizeObserver(()=>{if(active){map.invalidateSize({pan:false});scheduleNames();}});observer.observe(host);
  const timer=setInterval(()=>{if(active)refreshMarkers(false);},1000);
  return {update(data,fresh){snapshot=data;current=fresh===true;refreshMarkers(true);},clear(){snapshot=null;current=false;selected='';setFollow(false);refreshMarkers(false);},destroy(){active=false;epoch++;clearInterval(timer);cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('keydown',escapeFull);for(const id of [...markers.keys()])remove(id);map.remove();}};
 }
 return {create,nearest,online,position,distance,visible};
})();
