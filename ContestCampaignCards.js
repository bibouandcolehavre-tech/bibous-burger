import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
const { contestPresentation } = require('./contest-presentation');
const { referralPresentation } = require('./referral-presentation');
export function InstagramContestCard({ contest, now }) {
  const [error, setError] = useState('');
  const info = contestPresentation(contest, null, now);
  if (!info?.instagramOpen) return null;
  const open = async () => {
    setError('');
    try { await Linking.openURL(info.instagramUrl); }
    catch { setError('Instagram ne s’est pas ouvert. Copie le lien ci-dessous dans ton navigateur.'); }
  };
  return <View style={s.instagram}>
    <Text style={s.eyebrow}>UN AUTRE CONCOURS · SUR INSTAGRAM</Text>
    <Text style={s.heading}>1 menu à gagner tous les 15 jours</Text>
    <Text style={s.body}>Commente la publication du concours en identifiant 3 autres comptes différents.</Text>
    <Text style={s.small}>Une chance par compte et par quinzaine. Un nouveau commentaire à chaque période. Aucun point ajouté au classement Bibou.</Text>
    <Pressable accessibilityRole="link" onPress={open} style={s.outline}><Text style={s.outlineText}>Participer sur Instagram ↗</Text></Pressable>
    <Text style={s.small}>Dates et publication de la quinzaine sur Instagram. Sans achat obligatoire. Aucun tirage du 29 au 31 décembre.</Text>
    {!!error && <><Text accessibilityRole="alert" style={s.error}>{error}</Text><Text selectable style={s.small}>{info.instagramUrl}</Text></>}
  </View>;
}
export default function ContestCampaignCards({ data, onOpenContest, onOpenReferral, compact = false }) {
  const info = contestPresentation(data?.contest, data?.participation);
  const referral = referralPresentation(data);
  if (!info) return null;
  return <View style={s.stack}>
    <View style={s.main}>
      <Text style={s.lightEyebrow}>{info.eyebrow} · DANS BIBOU</Text>
      <Text style={s.title}>{info.active && info.campaign ? 'Jusqu’à 1 an de Bibou à gagner' : info.title}</Text>
      <Text style={s.lightBody}>{info.detail}</Text>
      <Pressable accessibilityRole="button" onPress={onOpenContest} style={s.primary}><Text style={s.primaryText}>{info.action}</Text></Pressable>
      {referral && onOpenReferral && <>
        <Pressable accessibilityRole="button" onPress={onOpenReferral} style={s.referralButton}><Text style={s.referralButtonText}>Parrainer un ami →</Text></Pressable>
        <Text style={s.lightSmall}>{referral.reward}. Sans limite de nouveaux amis par jour.</Text>
      </>}
      {!compact && info.prizes.map(prize => <View key={prize.title} style={s.prize}><Text style={s.prizeTitle}>{prize.title}</Text><Text style={s.lightSmall}>{prize.detail}</Text></View>)}
      {info.active && info.referralPoints > 0 && <Text style={s.lightBody}>Gratuit : +{info.referralPoints} points par nouvel ami admissible inscrit avec ton code.</Text>}
      <Text style={s.lightSmall}>{info.active ? 'Compte avec numéro vérifié, 18 ans et plus, France métropolitaine. Inscription au concours distincte de la création du compte. Sans achat obligatoire.' : 'Consulte les dates et le règlement dans le concours.'}</Text>
    </View>
    <InstagramContestCard contest={data?.contest} />
  </View>;
}
const s = StyleSheet.create({
  stack: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 16, marginVertical: 12 },
  main: { backgroundColor: '#315B4B', borderRadius: 24, padding: 22, gap: 12 },
  lightEyebrow: { color: '#E8E6BD', fontSize: 11, letterSpacing: 1.2, fontWeight: '800' },
  title: { color: '#FFF9EF', fontSize: 29, lineHeight: 34, fontWeight: '900' },
  lightBody: { color: '#FFF9EF', fontSize: 15, lineHeight: 23 },
  lightSmall: { color: '#E4F0E9', fontSize: 12, lineHeight: 18 },
  prize: { borderTopWidth: 1, borderTopColor: '#6B8B7D', paddingTop: 10, gap: 4 },
  prizeTitle: { color: '#FFF9EF', fontSize: 17, lineHeight: 24, fontWeight: '800' },
  primary: { backgroundColor: '#FFF0C9', borderRadius: 14, padding: 16, minHeight: 52, justifyContent: 'center' },
  primaryText: { color: '#25473B', fontWeight: '900', fontSize: 17, textAlign: 'center' },
  referralButton: { backgroundColor:'#E2EDE5', borderRadius:14, padding:14, minHeight:52, justifyContent:'center' },
  referralButtonText: { color:'#25473B', fontSize:16, fontWeight:'900', textAlign:'center' },
  instagram: { backgroundColor: '#FFF9EF', borderWidth: 1.5, borderColor: '#BB7258', borderRadius: 22, padding: 20, gap: 10 },
  eyebrow: { color: '#A55439', fontSize: 11, lineHeight: 17, letterSpacing: 1, fontWeight: '800' },
  heading: { color: '#315B4B', fontSize: 22, lineHeight: 28, fontWeight: '900' },
  body: { color: '#25473B', fontSize: 15, lineHeight: 23 },
  small: { color: '#52665A', fontSize: 12, lineHeight: 19 },
  outline: { borderColor: '#A55439', borderWidth: 1.5, borderRadius: 14, padding: 16, minHeight: 52, justifyContent: 'center' },
  outlineText: { color: '#A55439', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  error: { color: '#B42B20', fontSize: 14, lineHeight: 21 },
});
