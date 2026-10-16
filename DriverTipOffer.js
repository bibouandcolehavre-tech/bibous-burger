import {useEffect,useRef,useState} from 'react';
import {AppState,Linking,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {randomUUID} from 'expo-crypto';
const money=n=>`${(n/100).toFixed(2).replace('.',',')} €`;
export default function DriverTipOffer({api,token,orderId,initial}){
  const [state,setState]=useState(initial),[selected,setSelected]=useState(200),[custom,setCustom]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const epoch=useRef(0),locked=useRef(false),attempt=useRef(null),latest=useRef(state);latest.current=state;
  async function request(body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(`${api}/customer/orders/${encodeURIComponent(orderId)}/tip`,{method:body?'POST':'GET',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Error(value.error||'Pourboire indisponible.');if(typeof value.enabled!=='boolean'||value.status&&!['PENDING','PAID','FAILED','EXPIRED'].includes(value.status))throw Error('Statut du pourboire à vérifier.');return value;}finally{clearTimeout(timer);}}
  async function refresh(){if(locked.current)return;locked.current=true;setBusy(true);const id=epoch.current;try{const value=await request();if(id===epoch.current){setState(value);setMessage(value.status==='PAID'?'Merci ! Ton pourboire a bien été payé et ajouté aux gains du livreur.':value.status==='PENDING'?'Paiement encore en attente. Ne paie pas une seconde fois.':'Le statut du pourboire a été actualisé.');}}catch(e){if(id===epoch.current)setMessage(e.message);}finally{if(id===epoch.current){locked.current=false;setBusy(false);}}}
  useEffect(()=>{epoch.current++;setState(initial);setMessage('');attempt.current=null;const sub=AppState.addEventListener('change',value=>{if(value==='active'&&latest.current?.status==='PENDING')void refresh();});return()=>{epoch.current++;sub.remove();};},[api,token,orderId]);
  async function pay(){if(locked.current)return;locked.current=true;setBusy(true);setMessage('');const id=epoch.current;
    try{let value=latest.current;if(!value?.id||['EXPIRED','FAILED'].includes(value.status)){
      const amount=custom.trim()?Number(custom.trim().replace(',','.'))*100:selected,rounded=Math.round(amount);
      if(!Number.isFinite(amount)||Math.abs(amount-rounded)>.00001||rounded<50||rounded>5000)throw Error('Choisis un montant entre 0,50 € et 50 €, avec deux décimales maximum.');
      if(!attempt.current||attempt.current.amountCents!==rounded)attempt.current={amountCents:rounded,requestId:randomUUID()};value=await request(attempt.current);
    }
    if(id!==epoch.current)return;setState(value);latest.current=value;if(value.status==='PAID'){setMessage('Ton pourboire est déjà payé. Aucun second paiement nécessaire.');return;}
    const url=new URL(value.checkoutUrl);if(url.protocol!=='https:'||url.hostname!=='checkout.sumup.com'||url.username||url.password)throw Error('Le lien de paiement sécurisé n’est pas disponible. Actualise son statut.');
    await Linking.openURL(url.href);
    }catch(e){if(id===epoch.current)setMessage(`${e.message} En cas de doute, vérifie le statut ci-dessous avant de recommencer.`);}
    finally{if(id===epoch.current){locked.current=false;setBusy(false);}}
  }
  if(!state?.enabled&&!state?.id)return null;
  return <View style={s.card}><Text style={s.heading}>Un pourboire pour ton livreur ?</Text><Text style={s.copy}>C’est facultatif et indépendant de ta note. Le montant payé est ajouté aux gains du livreur. Paiement séparé du repas, sans points de fidélité ni tour de roue.</Text>
    {state.status==='PAID'?<Text style={s.label}>{state.reviewRequired?'Pourboire en vérification par le restaurant.':state.refundedCents?`Pourboire remboursé : ${money(state.refundedCents)} sur ${money(state.amountCents)}.`:`Pourboire payé : ${money(state.amountCents)} · Merci !`}</Text>:<>
      {state.status!=='PENDING'?<><View style={s.options}>{[100,200,300,500].map(n=><Pressable key={n} accessibilityRole="button" accessibilityState={{selected:!custom&&selected===n,disabled:busy}} disabled={busy} onPress={()=>{setSelected(n);setCustom('');}} style={[s.option,!custom&&selected===n&&s.chosen]}><Text style={[s.label,!custom&&selected===n&&s.white]}>{money(n)}</Text></Pressable>)}</View><TextInput accessibilityLabel="Autre montant du pourboire en euros" placeholder="Autre montant en € (0,50 à 50 €)" keyboardType="decimal-pad" maxLength={6} value={custom} onChangeText={setCustom} editable={!busy} style={s.input}/><Text style={s.copy}>Tu peux aussi fermer cet écran sans laisser de pourboire.</Text></>:<Text style={s.label}>Pourboire de {money(state.amountCents)} en attente de paiement.</Text>}
      <Pressable accessibilityRole="button" disabled={busy||!state.enabled} onPress={()=>{void pay();}} style={[s.button,(busy||!state.enabled)&&{opacity:.5}]}><Text style={s.white}>{busy?'Vérification…':state.status==='PENDING'?'Reprendre ce paiement de pourboire':'Continuer vers le paiement sécurisé'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{void refresh();}} style={s.secondary}><Text style={s.label}>Vérifier le statut du pourboire</Text></Pressable>
    </>}{message?<Text accessibilityRole="alert" style={s.copy}>{message}</Text>:null}
  </View>;
}
const s=StyleSheet.create({card:{padding:18,gap:14,backgroundColor:'#E5EBE0',borderRadius:20},heading:{fontSize:21,fontWeight:'800',color:'#274B3E'},label:{fontWeight:'800',color:'#315B4B',lineHeight:22},copy:{color:'#526D60',lineHeight:22,fontSize:14},options:{flexDirection:'row',flexWrap:'wrap',gap:8},option:{minHeight:48,padding:13,borderRadius:12,backgroundColor:'#FFFFFF',justifyContent:'center'},chosen:{backgroundColor:'#315B4B'},input:{padding:14,minHeight:48,borderRadius:12,borderWidth:1,borderColor:'#D7DED0',backgroundColor:'#FFFFFF',color:'#274B3E'},button:{backgroundColor:'#315B4B',minHeight:48,padding:15,borderRadius:14,alignItems:'center',justifyContent:'center'},white:{color:'#FFFFFF',fontWeight:'800',textAlign:'center'},secondary:{minHeight:48,padding:13,alignItems:'center',justifyContent:'center'}});
