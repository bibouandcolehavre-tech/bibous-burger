import { StyleSheet, Text, View } from 'react-native';
const {automaticOfferMessage}=require('./automatic-offer-client');
export default function AutomaticOfferNotice(props) {
  const message=automaticOfferMessage(props);
  if (!message) return null;
  return <View style={s.panel} testID="automatic-burger-offer" accessibilityLiveRegion="polite">
    <Text style={s.title}>🎁 {message.title}</Text>
    <Text style={s.copy}>{message.text}</Text>
    {message.count>0 && <Text style={s.result}>{message.freeCount ? `${message.count} dans le panier : ${message.freeCount} offert${message.freeCount>1?'s':''}.` : 'Tu en as choisi 1 : ajoute-en un deuxième pour profiter de l’offre.'}</Text>}
  </View>;
}
const s=StyleSheet.create({panel:{backgroundColor:'#E2EFE7',borderWidth:1,borderColor:'#315B4B',borderRadius:14,padding:14,marginVertical:10},title:{color:'#315B4B',fontSize:17,fontWeight:'800',marginBottom:5},copy:{color:'#243B31',fontSize:14,lineHeight:21},result:{color:'#315B4B',fontSize:14,fontWeight:'700',marginTop:7}});
