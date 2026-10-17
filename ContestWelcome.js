import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ContestCampaignCards from './ContestCampaignCards';
import useContestOverview from './useContestOverview';
import AppDownloadLinks from './AppDownloadLinks';
export default function ContestWelcome({ apiBaseUrl, token, onOpenContest, onOpenReferral, onContinue }) {
  const data = useContestOverview(apiBaseUrl, token);
  return <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
    <View style={s.content}>
      <Image accessibilityLabel="Bibou’s Burgers" source={require('./assets/bibous-official-wordmark-preview.png')} resizeMode="contain" style={s.logo} />
      <Text style={s.eyebrow}>POUR FÊTER LA SORTIE DE L’APPLICATION</Text>
      <ContestCampaignCards data={data} onOpenContest={onOpenContest} onOpenReferral={onOpenReferral} />
      {!data && <View style={s.fallback}><Text style={s.text}>Découvre les concours Bibou et leurs conditions de participation.</Text><Pressable accessibilityRole="button" onPress={onOpenContest} style={s.button}><Text style={s.buttonText}>Découvrir les concours</Text></Pressable></View>}
      <Pressable accessibilityRole="button" onPress={onContinue} style={s.continue}><Text style={s.continueText}>Entrer dans l’application</Text></Pressable>
      <Text style={s.note}>Participer reste facultatif. Tu peux commander et retrouver tous tes avantages comme avant.</Text>
      <AppDownloadLinks />
    </View>
  </ScrollView>;
}
const s = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: '#FBF3E6', padding: 20, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  logo: { width: 180, height: 88, alignSelf: 'center', tintColor: '#315B4B', marginBottom: 12 },
  eyebrow: { color: '#315B4B', textAlign: 'center', fontSize: 11, fontWeight: '800', lineHeight: 18, letterSpacing: 1 },
  continue: { padding: 17, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: '#315B4B', marginVertical: 8 },
  continueText: { color: '#315B4B', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  note: { color: '#52665A', fontSize: 12, lineHeight: 19, textAlign: 'center', marginVertical: 8 },
  fallback: { backgroundColor: '#D9EEE5', borderRadius: 20, padding: 20, marginVertical: 16, gap: 14 },
  text: { color: '#315B4B', fontSize: 17, lineHeight: 25 },
  button: { backgroundColor: '#315B4B', padding: 17, borderRadius: 14 },
  buttonText: { color: '#FFF9EF', fontSize: 16, textAlign: 'center', fontWeight: '800' },
});
