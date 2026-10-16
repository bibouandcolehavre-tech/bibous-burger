(function(root) {
  'use strict';
  let position=null,view=null,epoch=0,map=null,line=null,dot=null,destinationDot=null,route=null,target=null,lastFix=0,wake=null;
  const core=root.KrokliNavigationCore,service=core.createIgnService();
  const status = text => {const el=document.querySelector('#nav-status');if(el)el.textContent=text;};
  function close() {
    epoch++;route=null;target=null;position=null;lastFix=0;
    if(map)map.remove();map=null;line=dot=destinationDot=null;
    if(view)view.hidden=true;
    if(wake){void wake.release().catch(()=>{});wake=null;}
  }
  function panel() {
    if(view)return view;
    view=document.querySelector('#navigation-panel');
    document.querySelector('#nav-close').addEventListener('click',()=>{close();status('Navigation fermée. Le partage GPS reste contrôlé séparément.');});
    document.querySelector('#nav-calculate').addEventListener('click',()=>{void calculate();});
    document.querySelector('#nav-center').addEventListener('click',()=>{if(core.freshPosition(position))map?.setView([position.latitude,position.longitude],16);});
    return view;
  }
  function updatePosition(p) {
    if(!core.freshPosition(p))return;
    position={...p};lastFix=Date.now();
    if(!target||!map)return;
    if(dot)dot.setLatLng([p.latitude,p.longitude]);else dot=root.L.circleMarker([p.latitude,p.longitude],{radius:9,color:'#fff',weight:3,fillColor:'#315b4b',fillOpacity:1}).addTo(map);
    if(route){
      const match=core.nearest(route.coordinates,p);
      if(match.distance>Math.max(70,p.accuracy*2)){status('Tu es en dehors du tracé. Arrête-toi en sécurité pour recalculer.');return;}
      let best=Infinity,step=null;
      for(const s of route.steps){if(s.coordinates.length<2)continue;const d=core.nearest(s.coordinates,p).distance;if(d<best){best=d;step=s;}}
      status(`GPS reçu à ${new Date(p.timestamp).toLocaleTimeString('fr-FR')} · ±${Math.ceil(p.accuracy)} m. ${core.instruction(step)}`);
    }
  }
  async function open(next) {
    const previous=position;close();position=core.freshPosition(previous)?previous:null;target=next;panel().hidden=false;
    document.querySelector('#nav-title').textContent=next.title;
    document.querySelector('#nav-address').textContent=next.address;
    document.querySelector('#nav-consent').checked=false;
    document.querySelector('#nav-calculate').disabled=false;
    document.querySelector('#nav-candidates').replaceChildren();
    document.querySelector('#nav-summary').textContent='';
    status('À l’arrêt : vérifie la destination puis autorise le calcul IGN. Démarre aussi le partage GPS avec Bibou.');
    view.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function calculate() {
    if(!target||!document.querySelector('#nav-consent').checked){status('Confirme les informations de navigation avant le calcul.');return;}
    if(!core.freshPosition(position)){status('Démarre le partage GPS avec Bibou, puis attends une position précise.');return;}
    const own=++epoch,current=target,button=document.querySelector('#nav-calculate');button.disabled=true;
    try {
      if(!current.coordinates){
        const candidates=await service.search(current.address);if(own!==epoch)return;
        const choices=document.querySelector('#nav-candidates');choices.replaceChildren();
        if(!candidates.length)throw Error('Adresse introuvable. Contacte le restaurant.');
        for(const candidate of candidates){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=`Confirmer : ${candidate.label}`;b.addEventListener('click',()=>{current.coordinates=candidate.coordinates;document.querySelector('#nav-address').textContent=candidate.label;choices.replaceChildren();void calculate();});choices.append(b);}
        status('Choisis l’adresse exacte ci-dessus avant de calculer.');return;
      }
      status('Calcul de l’itinéraire routier IGN…');
      const result=await service.route(position,current.coordinates);if(own!==epoch)return;
      route=result;
      if(!map){
        map=root.L.map('nav-map',{zoomControl:true,attributionControl:true}).setView([position.latitude,position.longitude],15);
        root.L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',{maxZoom:18,attribution:'© IGN · <a href="https://www.ign.fr/institut/conditions-generales-dutilisation" target="_blank" rel="noopener noreferrer">Géoplateforme</a>'}).addTo(map);
      }
      if(line)line.remove();if(destinationDot)destinationDot.remove();
      line=root.L.polyline(result.coordinates.map(p=>[p[1],p[0]]),{color:'#315b4b',weight:6}).addTo(map);
      destinationDot=root.L.circleMarker([current.coordinates[1],current.coordinates[0]],{radius:8,color:'#a35c43',fillOpacity:1}).addTo(map);
      map.invalidateSize();map.fitBounds(line.getBounds(),{padding:[20,20],maxZoom:16});
      document.querySelector('#nav-summary').textContent=`Voiture · ${(result.distance/1000).toFixed(1).replace('.',',')} km · environ ${Math.max(1,Math.ceil(result.duration/60))} min au calcul, sans trafic en temps réel. Itinéraire IGN · BD TOPO®.`;
      updatePosition(position);
      if(navigator.wakeLock&&!document.hidden){try{wake=await navigator.wakeLock.request('screen');if(own!==epoch){await wake.release();wake=null;}}catch{/* Not supported/allowed by every iPhone. */}}
    }catch(e){if(own===epoch)status(e.name==='AbortError'?'Calcul interrompu. Réessaie à l’arrêt.':e.message||'Navigation indisponible. Utilise le secours manuel.');}
    finally{if(own===epoch)button.disabled=false;}
  }
  setInterval(()=>{if(target&&lastFix&&Date.now()-lastFix>30000)status('Position GPS non récente : ne te fie pas au point sur la carte. Le restaurant ne reçoit peut-être plus ta position.');},5000);
  root.KrokliNavigation={open,close,updatePosition,activeKey:()=>target?.key||null};
})(window);
