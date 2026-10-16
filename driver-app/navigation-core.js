(function(root) {
  'use strict';
  const coordinate = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85;
  const freshPosition = (p, now = Date.now()) => p && coordinate([p.longitude,p.latitude]) && Number.isFinite(p.accuracy) && p.accuracy >= 0 && p.accuracy <= 100 && Number.isFinite(p.timestamp) && now-p.timestamp <= 30000 && p.timestamp <= now+5000 && p.mocked !== true;
  function parseRoute(data) {
    const coordinates = data?.geometry?.coordinates;
    if (data?.geometry?.type !== 'LineString' || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 50000 || !coordinates.every(coordinate) || data.distanceUnit !== 'meter' || data.timeUnit !== 'second' || !Number.isFinite(data.distance) || data.distance < 0 || !Number.isFinite(data.duration) || data.duration < 0 || data.profile !== 'car') throw Error('Itinéraire routier non confirmé.');
    const steps = (data.portions || []).flatMap(p => p.steps || []);
    if (!steps.length || steps.length > 3000 || steps.some(s => !Array.isArray(s.geometry?.coordinates) || s.geometry.coordinates.length < 1 || !s.geometry.coordinates.every(coordinate))) throw Error('Instructions routières indisponibles.');
    return { coordinates, distance: data.distance, duration: data.duration, steps: steps.map(s => ({ coordinates: s.geometry.coordinates, name: String(s.attributes?.name?.nom_1_droite || s.attributes?.name?.nom_1_gauche || '').slice(0,180), type: s.instruction?.type, modifier: s.instruction?.modifier })), attribution: 'Itinéraire IGN · BD TOPO®', profile: 'car' };
  }
  function instruction(step) {
    if (!step) return 'Suis le tracé routier et la signalisation.';
    const modifiers = { left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite', 'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'en faisant demi-tour, seulement si autorisé' };
    const where = step.name ? ` · ${step.name}` : '';
    if (step.type === 'arrive') return 'Destination indiquée par le calculateur. Vérifie l’entrée et gare-toi en sécurité.';
    if (['roundabout','rotary','roundabout turn','exit roundabout','exit rotary'].includes(step.type)) return `Rond-point : suis le tracé et la signalisation${where}`;
    if (step.type === 'depart') return `Rejoins le tracé routier${where}`;
    if (modifiers[step.modifier]) return `Continue ${modifiers[step.modifier]}${where}`;
    return `Suis le tracé routier${where}`;
  }
  function nearest(coordinates, position) {
    const lat = position.latitude * Math.PI / 180, scaleX = 111320 * Math.cos(lat), scaleY = 111320;
    let best = { distance: Infinity, segment: 0 };
    for (let i=0;i<coordinates.length-1;i++) {
      const a=coordinates[i],b=coordinates[i+1],ax=(a[0]-position.longitude)*scaleX,ay=(a[1]-position.latitude)*scaleY,bx=(b[0]-position.longitude)*scaleX,by=(b[1]-position.latitude)*scaleY;
      const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy,t=len ? Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len)) : 0;
      const distance=Math.hypot(ax+t*dx,ay+t*dy); if(distance<best.distance)best={distance,segment:i};
    }
    return best;
  }
  function createIgnService({ fetchImpl = root.fetch?.bind(root) } = {}) {
    let lastRoute = -Infinity;
    async function json(url) {
      const abort = new AbortController(), timer = setTimeout(()=>abort.abort(),12000);
      try {
        const response=await fetchImpl(url,{signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error'});
        if(!response.ok)throw Error('Service IGN indisponible. Le fonctionnement manuel reste disponible.');
        const body=await response.text();if(body.length>4000000)throw Error('Réponse IGN trop volumineuse.');return JSON.parse(body);
      } finally {clearTimeout(timer);}
    }
    return {
      async search(address) {
        if(typeof address!=='string'||address.trim().length<5||address.length>300)throw Error('Adresse à confirmer.');
        const url=new URL('https://data.geopf.fr/geocodage/search');url.search=new URLSearchParams({q:address,limit:'3'}).toString();
        const data=await json(url);return (data.features||[]).filter(f=>f.geometry?.type==='Point'&&coordinate(f.geometry.coordinates)&&typeof f.properties?.label==='string').slice(0,3).map(f=>({label:f.properties.label.slice(0,250),coordinates:f.geometry.coordinates}));
      },
      async route(position,destination) {
        if(!freshPosition(position)||!coordinate(destination))throw Error('Attends une position GPS récente et précise.');
        if(Date.now()-lastRoute<5000)throw Error('Patiente quelques secondes avant un nouveau calcul.');lastRoute=Date.now();
        const url=new URL('https://data.geopf.fr/navigation/itineraire');url.search=new URLSearchParams({resource:'bdtopo-osrm',start:`${position.longitude},${position.latitude}`,end:destination.join(','),profile:'car',optimization:'fastest',geometryFormat:'geojson',getSteps:'true',distanceUnit:'meter',timeUnit:'second',crs:'EPSG:4326',waysAttributes:'name'}).toString();
        return parseRoute(await json(url));
      }
    };
  }
  const api={coordinate,freshPosition,parseRoute,instruction,nearest,createIgnService};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.KrokliNavigationCore=api;
})(typeof window!=='undefined'?window:globalThis);
