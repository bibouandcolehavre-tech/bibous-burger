import {Pressable, StyleSheet, Text, View} from 'react-native';
const {referralPresentation} = require('./referral-presentation');
export default function ContestReferralPanel({contest,participation,onShare,busy,message}) {
  const info = referralPresentation({contest,participation});
  if (!info || !participation) return null;
  return <View style={s.card}>
    <Text style={s.eyebrow}>TU ES INSCRIT · À TOI D’INVITER</Text>
    <Text style={s.title}>Parrainer un ami</Text>
    <Text style={s.reward}>{info.reward}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={onShare} style={[s.button,busy&&s.disabled]}><Text style={s.buttonText}>{busy?'Ouverture de l’invitation…':'Inviter un contact'}</Text></Pressable>
    <Text style={s.body}>1. Appuie sur « Inviter un contact ».</Text>
    <Text style={s.body}>2. Choisis Messages, WhatsApp ou ton application de messagerie, puis le contact à inviter.</Text>
    <Text style={s.body}>3. Ton ami crée son compte, vérifie son numéro par SMS et s’inscrit au concours avec ton code.</Text>
    <Text style={s.body}>{info.both ? `Quand son inscription est validée : +${info.sponsorPoints} points pour toi et +${info.inviteePoints} pour lui au classement.` : `Quand son inscription est validée : +${info.sponsorPoints} points pour toi au classement.`}</Text>
    <Text style={s.note}>Tu peux inviter plusieurs nouveaux amis chaque jour. Un seul parrain par nouvel inscrit admissible ; pas d’auto-parrainage ni de bonus pour un ancien compte.</Text>
    <Text style={s.note}>Ton répertoire n’est pas importé dans Bibou. Rien n’est envoyé sans ton action dans la messagerie.</Text>
    <Text style={s.code}>Ton code : {participation.code}</Text>
    <Text selectable style={s.link}>{participation.shareUrl}</Text>
    {message ? <Text accessibilityRole="status" style={s.body}>{message}</Text> : null}
    <Text style={s.note}>{participation.sharedToday?'Ton point de partage du jour est déjà compté. Tu peux continuer à inviter.':'+1 point au premier appui sur Partager aujourd’hui, séparément du parrainage. Ce point ne prouve pas l’envoi d’un message.'}</Text>
    <Text style={s.note}>Points du concours, distincts de tes points de fidélité.</Text>
  </View>;
}
const s=StyleSheet.create({card:{backgroundColor:'#E2EDE5',borderWidth:1,borderColor:'#BAD0C2',borderRadius:20,padding:18,gap:8,marginVertical:12},eyebrow:{color:'#315B4B',fontSize:11,fontWeight:'800',letterSpacing:1,lineHeight:17},title:{color:'#243B31',fontSize:25,fontWeight:'900',lineHeight:31},reward:{color:'#315B4B',fontSize:19,fontWeight:'800',lineHeight:26},body:{color:'#343B36',fontSize:15,lineHeight:22},note:{color:'#52665A',fontSize:12,lineHeight:19},button:{backgroundColor:'#315B4B',padding:16,minHeight:52,borderRadius:14,justifyContent:'center',alignItems:'center',marginVertical:5},buttonText:{color:'#FFF9EF',fontSize:16,fontWeight:'800',textAlign:'center'},disabled:{opacity:.55},code:{fontSize:16,fontWeight:'800',color:'#315B4B',marginTop:6},link:{color:'#315B4B',fontSize:13,lineHeight:20,textDecorationLine:'underline'}});
