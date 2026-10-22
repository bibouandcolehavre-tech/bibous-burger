'use strict';
const PICKUP={latitude:49.490809,longitude:0.118444};
function validPosition(p) {return p&&[p.latitude,p.longitude,p.accuracy,p.validForMs].every(Number.isFinite)&&Math.abs(p.latitude)<=85&&Math.abs(p.longitude)<=180&&p.accuracy>=0&&p.accuracy<=100&&p.validForMs>0&&p.validForMs<=30000;}
function world(p,zoom) {const size=256*2**zoom,lat=Math.max(-85,Math.min(85,p.latitude))*Math.PI/180;return {x:(p.longitude+180)/360*size,y:(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*size};}
function mapTiles(position,width=320,height=280,zoom=14,viewport=position) {
  if(!validPosition(position)||![width,height,zoom].every(Number.isFinite)||width<1||width>2000||height<1||height>1000||!Number.isInteger(zoom)||zoom<10||zoom>17)throw Error('Carte indisponible.');
  if(!viewport||![viewport.latitude,viewport.longitude].every(Number.isFinite)||Math.abs(viewport.latitude)>85||Math.abs(viewport.longitude)>180)throw Error('Carte indisponible.');
  const center=world(viewport,zoom),left=center.x-width/2,top=center.y-height/2,tiles=[];
  const max=2**zoom;
  for(let x=Math.floor(left/256);x<=Math.floor((left+width)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+height)/256);y++) {
    if(x<0||y<0||x>=max||y>=max)continue;
    tiles.push({key:`${zoom}-${x}-${y}`,left:x*256-left,top:y*256-top,
      url:`https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${y}&TILECOL=${x}`});
  }
  const restaurant=world(PICKUP,zoom),courier=world(position,zoom);
  return {tiles,courier:{x:courier.x-left,y:courier.y-top},restaurant:{x:restaurant.x-left,y:restaurant.y-top}};
}
function needsRecenter(point,width,height=280,margin=60) {
  return !point||point.x<margin||point.y<margin||point.x>width-margin||point.y>height-margin;
}
function receivedSnapshot(result,elapsedMs=0) {
  if(result?.protocol!=='bibou-customer-delivery-v1'||!['confirmed','preparing','ready','out_for_delivery','delivered','cancelled','awaiting_customer'].includes(result.status))throw Error('Suivi non actualisé.');
  const remaining=result.position?.validForMs-Math.max(0,elapsedMs);
  const position=result.status==='out_for_delivery'&&validPosition(result.position)&&remaining>0?{...result.position,validForMs:remaining}:null;
  return {...result,position};
}
function delayLabel(timing) {
  if(timing?.available===true&&Number.isSafeInteger(timing.remainingMinutes)&&timing.remainingMinutes>0&&timing.remainingMinutes<=1440)return `Livraison dans environ ${timing.remainingMinutes} min`;
  return ({'waiting-for-driver':'Ton repas est prêt · un livreur est attendu','kitchen-update-needed':'La préparation prend plus de temps · délai en cours d’actualisation','journey-update-needed':'Ton livreur est en route · délai en cours d’actualisation','travel-unavailable':'Délai en cours de calcul'})[timing?.reason]||'Délai en cours d’actualisation';
}
module.exports={PICKUP,validPosition,world,mapTiles,needsRecenter,receivedSnapshot,delayLabel};
