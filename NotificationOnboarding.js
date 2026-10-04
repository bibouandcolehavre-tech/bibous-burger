import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { pushRequest } from './push-api';
import { syncPushDevice } from './push-client';
const { isReviewToken } = require('./review-client');

export default function NotificationOnboarding({ api, authToken, onDone }) {
  const [marketing, setMarketing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  const working = useRef(false);

  useEffect(() => {
    alive.current = true;
    void pushRequest(api, authToken).then(result => {
      if (!alive.current) return;
      setMarketing(!!result.preferences.marketing);
      setLoaded(true);
    }).catch(error => { if (alive.current) setMessage(error.message || 'Impossible de charger les notifications.'); });
    return () => { alive.current = false; };
  }, [api, authToken]);

  const save = async () => {
    if (!loaded || working.current) return;
    working.current = true;
    setBusy(true);
    setMessage('');
    let preferencesSaved = false;
    try {
      await pushRequest(api, authToken, '', 'PATCH', { service: true, marketing });
      preferencesSaved = true;
      if (!isReviewToken(authToken)) {
        const device = await syncPushDevice(api, authToken, { ask: true });
        if (!device.granted) {
          if (alive.current) {
            setSaved(true);
            setMessage('Tes choix sont enregistrés, mais ce téléphone n’autorise pas encore les notifications. Tu pourras les activer dans Mon compte → Mes notifications.');
          }
          return;
        }
      }
      if (alive.current) onDone();
    } catch (error) {
      if (alive.current) {
        if (preferencesSaved) setSaved(true);
        setMessage(preferencesSaved
          ? 'Tes choix sont enregistrés, mais le téléphone n’a pas pu être associé. Tu pourras réessayer dans Mes notifications.'
          : error.message || 'Impossible d’enregistrer tes choix. Réessaie ou continue sans notifications.');
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <Text style={s.eyebrow}>TON COMPTE EST PRÊT</Text>
    <Text style={s.title}>Reste au courant de tes commandes</Text>
    <Text style={s.intro}>Reçois une alerte quand ta commande avance ou que ta table est confirmée. Tu peux changer d’avis à tout moment.</Text>
    <View style={s.card}>
      <Text style={s.cardTitle}>Commandes et réservations</Text>
      <Text style={s.copy}>Commande acceptée, prête ou en livraison ; confirmation de ta réservation.</Text>
    </View>
    <View style={s.promotion}>
      <View style={s.row}><Text style={s.promotionTitle}>Je veux aussi les promotions</Text><Switch accessibilityLabel="Recevoir aussi les promotions et actualités" disabled={!loaded || busy || saved} value={marketing} onValueChange={setMarketing} trackColor={{ false: '#CDBFB3', true: '#315B4B' }} /></View>
      <Text style={s.promotionCopy}>Facultatif et désactivé par défaut. Ton choix n’empêche pas le suivi de tes commandes.</Text>
    </View>
    <Pressable accessibilityRole="button" disabled={!loaded || busy} onPress={saved ? onDone : save} style={[s.button, (!loaded || busy) && s.dim]}><Text style={s.buttonText}>{busy ? 'Activation…' : saved ? 'Continuer' : 'Activer les notifications'}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onDone} style={s.skip}><Text style={s.skipText}>{saved ? 'Continuer vers l’application' : 'Continuer sans notifications'}</Text></Pressable>
    {!!message && <Text accessibilityLiveRegion="polite" style={s.feedback}>{message}</Text>}
    <Text style={s.footer}>L’autorisation du téléphone sera demandée seulement si tu appuies sur « Activer les notifications ». Tu peux toujours utiliser l’application sans notifications.</Text>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F3EB' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 42, maxWidth: 680, width: '100%', alignSelf: 'center' },
  eyebrow: { color: '#315B4B', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#24352D', fontSize: 30, fontWeight: '900', lineHeight: 36, marginTop: 12 },
  intro: { color: '#594D45', fontSize: 16, lineHeight: 24, marginTop: 12, marginBottom: 24 },
  card: { backgroundColor: '#FFFDFC', borderWidth: 1, borderColor: '#E4D6CB', borderRadius: 18, padding: 18, marginBottom: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { color: '#24352D', fontSize: 18, fontWeight: '800', flex: 1 },
  copy: { color: '#594D45', fontSize: 14, lineHeight: 21, marginTop: 9 },
  promotion: { paddingHorizontal: 4, paddingVertical: 12, marginBottom: 12 },
  promotionTitle: { color: '#24352D', fontSize: 15, fontWeight: '700', flex: 1 },
  promotionCopy: { color: '#76685E', fontSize: 12, lineHeight: 18, marginTop: 4 },
  button: { backgroundColor: '#315B4B', borderRadius: 16, padding: 17, marginTop: 10, alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  skip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', padding: 10 },
  skipText: { color: '#315B4B', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  feedback: { color: '#3C2922', backgroundColor: '#F7E5D9', padding: 14, borderRadius: 12, lineHeight: 21 },
  footer: { color: '#76685E', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  dim: { opacity: 0.5 },
});
