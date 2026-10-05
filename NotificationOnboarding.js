import { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { pushRequest } from './push-api';
import { syncPushDevice } from './push-client';
const { isReviewToken } = require('./review-client');

export default function NotificationOnboarding({ api, authToken, onDone, initialService = false, initialMarketing = false }) {
  const [service, setService] = useState(false);
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
      setService(!!result.preferences.service || initialService);
      setMarketing(!!result.preferences.marketing || initialMarketing);
      setLoaded(true);
    }).catch(error => { if (alive.current) setMessage(error.message || 'Impossible de charger les notifications.'); });
    return () => { alive.current = false; };
  }, [api, authToken, initialService, initialMarketing]);

  const save = async () => {
    if (!loaded || working.current) return;
    working.current = true;
    setBusy(true);
    setMessage('');
    let preferencesSaved = false;
    try {
      await pushRequest(api, authToken, '', 'PATCH', { service, marketing });
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
    <Text style={s.title}>Les nouvelles de Bibou sur ton téléphone</Text>
    <Text style={s.intro}>Choisis le suivi de tes commandes, les promotions, les deux ou aucun. Tu peux changer d’avis à tout moment.</Text>
    <View style={s.card}>
      <View style={s.row}><Text style={s.cardTitle}>Suivi des commandes et réservations</Text><Switch accessibilityLabel="Recevoir le suivi des commandes et réservations" disabled={!loaded || busy || saved} value={service} onValueChange={setService} trackColor={{ false: '#CDBFB3', true: '#315B4B' }} /></View>
      <Text style={s.copy}>Une alerte quand ta commande est acceptée, prête ou en livraison, ou quand ta table est confirmée.</Text>
    </View>
    <View style={s.card}>
      <View style={s.row}><Text style={s.cardTitle}>Promotions et actualités</Text><Switch accessibilityLabel="Recevoir les promotions et actualités" disabled={!loaded || busy || saved} value={marketing} onValueChange={setMarketing} trackColor={{ false: '#CDBFB3', true: '#315B4B' }} /></View>
      <Text style={s.copy}>Offres, nouveaux burgers et nouvelles de Bibou sur ton téléphone. Facultatif, même si tu actives le suivi des commandes.</Text>
    </View>
    <Pressable accessibilityRole="button" disabled={!loaded || busy || (!saved && !service && !marketing)} onPress={saved ? onDone : save} style={[s.button, (!loaded || busy || (!saved && !service && !marketing)) && s.dim]}><Text style={s.buttonText}>{busy ? 'Activation…' : saved ? 'Continuer' : 'Confirmer et autoriser les notifications'}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={onDone} style={s.skip}><Text style={s.skipText}>{saved ? 'Continuer vers l’application' : 'Continuer sans notifications'}</Text></Pressable>
    {!!message && <Text accessibilityLiveRegion="polite" style={s.feedback}>{message}</Text>}
    <Text style={s.footer}>Les deux choix sont indépendants. L’autorisation du téléphone sera demandée seulement si tu confirmes au moins un choix. Tu peux commander sans notifications et changer d’avis dans Mon compte.</Text>
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
