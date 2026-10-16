import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,AppState,Image,Pressable,StyleSheet,Text,View} from 'react-native';
import BibouCourierMarker from './BibouCourierMarker';
const {mapTiles,needsRecenter,receivedSnapshot,delayLabel}=require('./delivery-tracking-client');
const {DEPARTURE_TITLE}=require('./delivery-status-copy');
const MAP_HEIGHT=280;

function MovingCourier({point,cameraKey}) {
  const location=useRef(new Animated.ValueXY({x:point.x-40,y:point.y-53})).current;
  const camera=useRef(cameraKey),[reduced,setReduced]=useState(true);
  useEffect(()=>{let live=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(live)setReduced(value);}).catch(()=>{});
    const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return()=>{live=false;subscription.remove();};
  },[]);
  useEffect(()=>{
    const target={x:point.x-40,y:point.y-53};location.stopAnimation();
    if(reduced||camera.current!==cameraKey)location.setValue(target);
    else Animated.timing(location,{toValue:target,duration:600,useNativeDriver:false}).start();
    camera.current=cameraKey;return()=>location.stopAnimation();
  },[point.x,point.y,cameraKey,reduced,location]);
  return <Animated.View testID="delivery-moving-courier" style={[s.courier,{transform:location.getTranslateTransform()}]}><BibouCourierMarker /></Animated.View>;
}
function MapBackground({tiles}) {
  const [loaded,setLoaded]=useState(()=>new Set()),[failed,setFailed]=useState(false);
  return <>
    {tiles.map(tile=><Image key={tile.key} accessible={false} source={{uri:tile.url}} style={[s.tile,{left:tile.left,top:tile.top}]}
      onLoad={()=>setLoaded(previous=>new Set(previous).add(tile.key))} onError={()=>setFailed(true)} />)}
    <Text style={s.attribution} testID="delivery-map-attribution">Carte © IGN · {failed?loaded.size?'Fond de carte partiellement indisponible':'Fond de carte indisponible':loaded.size?'Fond de carte chargé':'Chargement de la carte…'}</Text>
  </>;
}
export default function DeliveryTracking({api,token,orderId,status,onStatusChanged}) {
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),[width,setWidth]=useState(320),[zoom,setZoom]=useState(14),[center,setCenter]=useState(null);
  const changed=useRef(onStatusChanged);changed.current=onStatusChanged;
  useEffect(()=>{
    let live=true,busy=false,controller=null,expiry=null,lastStatus=status,generation=0,again=false,foreground=AppState.currentState!=='background'&&AppState.currentState!=='inactive';
    setSnapshot(null);setError('');setCenter(null);
    if(!token||!orderId||!api)return;
    const refresh=async()=>{
      if(!live||!foreground)return;
      if(busy){again=true;return;}
      busy=true;const epoch=generation,startedAt=Date.now();controller=new AbortController();const own=controller,timeout=setTimeout(()=>own.abort(),8000);
      try {
        const response=await fetch(`${api}/customer/orders/${encodeURIComponent(orderId)}/delivery-tracking`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:own.signal});
        const result=await response.json().catch(()=>null);
        if(!live||!foreground||epoch!==generation)return;
        if(!response.ok)throw Error('Actualisation du suivi indisponible.');
        const received=receivedSnapshot(result,Date.now()-startedAt);
        if(expiry)clearTimeout(expiry);
        setSnapshot(received);setError('');
        if(received.position)expiry=setTimeout(()=>{if(live&&generation===epoch)setSnapshot(current=>current?{...current,position:null}:current);},received.position.validForMs);
        if(received.status!==lastStatus){lastStatus=received.status;changed.current?.();}
      } catch {
        if(live&&foreground&&epoch===generation){setSnapshot(null);setError('Connexion interrompue : position et délai non actualisés.');}
      } finally {
        clearTimeout(timeout);busy=false;
        if(live&&foreground&&again){again=false;void refresh();}
      }
    };
    void refresh();const timer=setInterval(()=>void refresh(),5000);
    const appState=AppState.addEventListener('change',state=>{
      foreground=state==='active';generation++;controller?.abort();if(expiry)clearTimeout(expiry);setSnapshot(null);setCenter(null);
      if(foreground)void refresh();
    });
    return ()=>{live=false;generation++;controller?.abort();clearInterval(timer);if(expiry)clearTimeout(expiry);appState.remove();};
  },[api,token,orderId]);
  const position=snapshot?.position;
  useEffect(()=>{
    if(!position){setCenter(null);return;}
    setCenter(current=>{
      if(!current)return {latitude:position.latitude,longitude:position.longitude};
      const projected=mapTiles(position,width,MAP_HEIGHT,zoom,current);
      return needsRecenter(projected.courier,width,MAP_HEIGHT)?{latitude:position.latitude,longitude:position.longitude}:current;
    });
  },[position?.latitude,position?.longitude,Boolean(position),width,zoom]);
  if(!orderId||['delivered','cancelled'].includes(status)||['delivered','cancelled'].includes(snapshot?.status))return null;
  const layout=position?mapTiles(position,width,MAP_HEIGHT,zoom,center||position):null;
  const cameraKey=`${zoom}:${width}:${center?.latitude}:${center?.longitude}`;
  const tileKey=layout?.tiles.map(tile=>tile.key).join(':');
  const inDelivery=(snapshot?.status||status)==='out_for_delivery';
  return <View style={s.card} testID="delivery-live-tracking">
    {inDelivery&&!error?<View style={s.departure} testID="delivery-departure-banner"><Text style={s.departureTitle}>{DEPARTURE_TITLE}</Text><Text style={s.note}>Votre livreur a récupéré votre repas.</Text></View>:null}
    <Text style={s.title}>{error||delayLabel(snapshot?.timing)}</Text><Text style={s.note}>Le délai peut évoluer selon les commandes en cours et l’avancement réel de ta livraison.</Text>
    {inDelivery?<><View style={s.map} onLayout={event=>setWidth(Math.max(1,Math.min(2000,event.nativeEvent.layout.width)))} accessibilityLabel={position?'Carte : dernière position récente de ton livreur':'Position du livreur non actualisée'}>
      {layout?<>
        <MapBackground key={tileKey} tiles={layout.tiles} />
        {layout.restaurant.x>=0&&layout.restaurant.x<=width&&layout.restaurant.y>=0&&layout.restaurant.y<=MAP_HEIGHT?<View style={[s.restaurant,{left:layout.restaurant.x-13,top:layout.restaurant.y-13}]}><Text style={s.pinText}>B</Text></View>:null}
        <MovingCourier point={layout.courier} cameraKey={cameraKey} />
        <View style={s.zoom}>
          <Pressable accessibilityRole="button" accessibilityLabel="Agrandir la carte" disabled={zoom>=17} onPress={()=>setZoom(z=>Math.min(17,z+1))}><Text style={s.zoomText}>＋</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Réduire la carte" disabled={zoom<=10} onPress={()=>setZoom(z=>Math.max(10,z-1))}><Text style={s.zoomText}>−</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Recentrer sur le livreur" style={s.recenter} onPress={()=>setCenter({latitude:position.latitude,longitude:position.longitude})}><Text style={s.recenterText}>Recentrer</Text></Pressable>
      </>:<Text style={s.missing}>Position non actualisée. Le suivi reprendra quand le livreur partagera une position récente.</Text>}
    </View><Text style={s.note}>{position?`Personnage illustré · position du livreur reçue il y a ${position.ageSeconds||0} s · précision ±${Math.ceil(position.accuracy)} m. Le GPS et le réseau peuvent interrompre le suivi.`:'Aucune ancienne position n’est affichée comme une position en direct.'}</Text></>:<Text style={s.note}>La carte du livreur apparaîtra pendant ta livraison, si son partage GPS est actif.</Text>}
  </View>;
}
const s=StyleSheet.create({
  card:{padding:16,borderRadius:20,backgroundColor:'#E5EBDF',gap:10,marginVertical:12},title:{color:'#204F42',fontSize:23,fontWeight:'800'},note:{fontSize:13,lineHeight:19,color:'#526259'},
  departure:{gap:5,paddingBottom:8},departureTitle:{fontSize:18,lineHeight:24,color:'#204F42',fontWeight:'800'},
  map:{height:MAP_HEIGHT,overflow:'hidden',borderRadius:15,backgroundColor:'#F6F2E8',position:'relative'},tile:{position:'absolute',width:256,height:256},courier:{position:'absolute',left:0,top:0,width:80,height:80/1.2},
  restaurant:{position:'absolute',width:26,height:26,borderRadius:8,backgroundColor:'#A45D3E',alignItems:'center',justifyContent:'center'},pinText:{color:'#fff',fontSize:14,fontWeight:'800'},
  zoom:{position:'absolute',right:8,top:8,borderRadius:12,backgroundColor:'#fff'},zoomText:{fontSize:25,paddingVertical:6,paddingHorizontal:14,color:'#204F42'},
  recenter:{position:'absolute',left:8,top:8,paddingHorizontal:11,paddingVertical:13,borderRadius:12,backgroundColor:'#fff'},recenterText:{fontSize:12,color:'#204F42',fontWeight:'700'},
  attribution:{position:'absolute',bottom:5,right:5,backgroundColor:'#ffffffeb',color:'#344D42',fontSize:10,padding:4},missing:{margin:'auto',padding:22,lineHeight:22,color:'#526259',textAlign:'center'},
});
