import React, {useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
const {BIBOU_PLUS_PRICE,BIBOU_PLUS_VALUE_MESSAGE,shouldSuggestBibouPlus}=require('./bibou-plus-offer');
export default function BibouPlusAfterPayment({order,customer,onOpen}) {
  const [dismissed,setDismissed]=useState(false);
  if(dismissed || !shouldSuggestBibouPlus(order,customer))return null;
  return <View style={s.card} testID="bibou-plus-after-payment">
    <Text style={s.eyebrow}>POUR TES PROCHAINES COMMANDES</Text>
    <Text style={s.title}>Passe à Bibou Plus</Text>
    <Text style={s.price}>{BIBOU_PLUS_PRICE.toFixed(2).replace('.',',')} € pour 30 jours</Text>
    <Text style={s.value}>{BIBOU_PLUS_VALUE_MESSAGE}</Text>
    <Text style={s.detail}>Livraison offerte dans notre zone habituelle · −5 % sur les produits · points de fidélité ×2.</Text>
    <Text style={s.detail}>Deux livraisons à 3,99 € : 7,98 € de frais évités. En retrait, selon tes achats. La commande déjà payée ne change pas.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Découvrir Bibou Plus à 5,99 euros pour 30 jours" onPress={onOpen} style={s.button}><Text style={s.buttonText}>Découvrir Bibou Plus</Text></Pressable>
    <Text style={s.terms}>Aucun débit sans ton accord. Sans renouvellement automatique : tu choisis si tu veux reprendre 30 jours.</Text>
    <Pressable accessibilityRole="button" onPress={()=>setDismissed(true)} style={s.dismiss}><Text style={s.dismissText}>Pas maintenant</Text></Pressable>
  </View>;
}
const s=StyleSheet.create({card:{width:'100%',maxWidth:560,borderRadius:22,borderWidth:1,borderColor:'#BDD0C2',backgroundColor:'#E6EDE2',padding:20,marginTop:16,marginBottom:16,gap:10},eyebrow:{color:'#526A5D',fontSize:11,fontWeight:'800',letterSpacing:1},title:{color:'#254E41',fontSize:24,fontWeight:'800'},price:{color:'#254E41',fontSize:21,fontWeight:'800'},value:{color:'#254E41',fontSize:16,fontWeight:'700'},detail:{color:'#4C6357',fontSize:14,lineHeight:20},button:{backgroundColor:'#315E4D',padding:15,borderRadius:14,alignItems:'center',marginTop:4},buttonText:{color:'#FFF8EB',fontSize:16,fontWeight:'800'},terms:{color:'#526A5D',fontSize:12,lineHeight:17},dismiss:{alignItems:'center',padding:10},dismissText:{color:'#315E4D',fontSize:14,fontWeight:'700'}});
